/**
 * Price Tracker Service
 * Tracks daily prices for open trades to enable MFE/MAE and counterfactual analysis
 */

import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getHistoricalPrices, ChartData } from '@/lib/data-services/price-provider';
import { updateMFEMAE, recordPricePoint, getTrades } from './trade-lifecycle';
import { CompletedTrade } from './types';

// ============================================
// PRICE TRACKING FOR OPEN TRADES
// ============================================

/**
 * Update price data for all open trades
 * Call this daily (via cron or manual trigger)
 */
export async function updateOpenTradesPrices(): Promise<{
    success: boolean;
    updated: number;
    errors: string[];
}> {
    const result = {
        success: true,
        updated: 0,
        errors: [] as string[],
    };

    try {
        // Get all open trades
        const tradesResult = await getTrades({ status: ['OPEN', 'PARTIALLY_CLOSED'] });

        if (!tradesResult.success || !tradesResult.data) {
            return { ...result, success: false, errors: [tradesResult.error || 'Failed to fetch trades'] };
        }

        const trades = tradesResult.data;

        if (trades.length === 0) {
            return result;
        }

        // Group trades by ticker to minimize API calls
        const tradesByTicker = new Map<string, CompletedTrade[]>();
        for (const trade of trades) {
            const existing = tradesByTicker.get(trade.ticker) || [];
            existing.push(trade);
            tradesByTicker.set(trade.ticker, existing);
        }

        // Process each ticker
        for (const [ticker, tickerTrades] of tradesByTicker) {
            try {
                // Get latest price data
                const today = new Date();
                const fiveDaysAgo = new Date(today);
                fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5); // Get a few days to ensure we have data

                const chartData = await getHistoricalPrices(
                    ticker,
                    fiveDaysAgo,
                    today
                );

                if (!chartData || chartData.dates.length === 0) {
                    result.errors.push(`No price data for ${ticker}`);
                    continue;
                }

                // Get the most recent price (last index in the arrays)
                const lastIdx = chartData.dates.length - 1;
                const priceDate = chartData.dates[lastIdx];
                const highPrice = chartData.highs[lastIdx];
                const lowPrice = chartData.lows[lastIdx];
                const closePrice = chartData.prices[lastIdx];
                const openPrice = chartData.opens[lastIdx];
                const volume = chartData.volumes[lastIdx];

                // Update each trade for this ticker
                for (const trade of tickerTrades) {
                    try {
                        // Update MFE/MAE
                        await updateMFEMAE(
                            trade.id,
                            priceDate,
                            highPrice,
                            lowPrice
                        );

                        // Calculate unrealized P/L
                        const unrealizedPnl = (closePrice - trade.entry_price) * trade.remaining_shares;
                        const unrealizedPnlPercent = ((closePrice - trade.entry_price) / trade.entry_price) * 100;
                        let unrealizedR: number | undefined;
                        if (trade.entry_stop_loss) {
                            const riskPerShare = trade.entry_price - trade.entry_stop_loss;
                            if (riskPerShare > 0) {
                                unrealizedR = (closePrice - trade.entry_price) / riskPerShare;
                            }
                        }

                        // Record price point
                        await recordPricePoint(trade.id, {
                            price_date: priceDate,
                            open_price: openPrice,
                            high_price: highPrice,
                            low_price: lowPrice,
                            close_price: closePrice,
                            volume: volume || 0,
                            unrealized_pnl: unrealizedPnl,
                            unrealized_pnl_percent: unrealizedPnlPercent,
                            unrealized_r: unrealizedR || 0,
                        });

                        result.updated++;
                    } catch (err) {
                        result.errors.push(`Failed to update ${ticker} trade ${trade.id}: ${err}`);
                    }
                }
            } catch (err) {
                result.errors.push(`Failed to fetch prices for ${ticker}: ${err}`);
            }
        }

        return result;
    } catch (error) {
        return {
            ...result,
            success: false,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
        };
    }
}

// ============================================
// BACKFILL PRICE HISTORY
// ============================================

/**
 * Backfill price history for a specific trade
 * Useful for trades created before price tracking was enabled
 */
export async function backfillTradePriceHistory(
    tradeId: string
): Promise<{ success: boolean; days: number; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, days: 0, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, days: 0, error: 'Not authenticated' };
        }

        // Get the trade
        const { data: trade, error: fetchError } = await supabase
            .from('completed_trades')
            .select('*')
            .eq('id', tradeId)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !trade) {
            return { success: false, days: 0, error: fetchError?.message || 'Trade not found' };
        }

        // Determine date range
        const entryDate = new Date(trade.entry_date);
        const endDate = trade.exit_date ? new Date(trade.exit_date) : new Date();

        // Fetch historical prices
        const chartData = await getHistoricalPrices(
            trade.ticker,
            entryDate,
            endDate
        );

        if (!chartData || chartData.dates.length === 0) {
            return { success: false, days: 0, error: 'No price data available' };
        }

        // Track MFE/MAE
        let mfe = trade.entry_price;
        let mae = trade.entry_price;
        let mfeDate = trade.entry_date;
        let maeDate = trade.entry_date;

        // Process each day
        let daysProcessed = 0;
        for (let i = 0; i < chartData.dates.length; i++) {
            const priceDate = chartData.dates[i];
            const openPrice = chartData.opens[i];
            const highPrice = chartData.highs[i];
            const lowPrice = chartData.lows[i];
            const closePrice = chartData.prices[i];
            const volume = chartData.volumes[i];

            // Skip if before entry
            if (priceDate < trade.entry_date) continue;

            // Skip if after exit (for closed trades)
            if (trade.exit_date && priceDate > trade.exit_date) continue;

            // Update MFE/MAE
            if (highPrice > mfe) {
                mfe = highPrice;
                mfeDate = priceDate;
            }
            if (lowPrice < mae) {
                mae = lowPrice;
                maeDate = priceDate;
            }

            // Calculate unrealized P/L at this point
            const unrealizedPnl = (closePrice - trade.entry_price) * trade.entry_shares;
            const unrealizedPnlPercent = ((closePrice - trade.entry_price) / trade.entry_price) * 100;
            let unrealizedR = 0;
            if (trade.entry_stop_loss) {
                const riskPerShare = trade.entry_price - trade.entry_stop_loss;
                if (riskPerShare > 0) {
                    unrealizedR = (closePrice - trade.entry_price) / riskPerShare;
                }
            }

            // Record price point (upsert)
            await recordPricePoint(tradeId, {
                price_date: priceDate,
                open_price: openPrice,
                high_price: highPrice,
                low_price: lowPrice,
                close_price: closePrice,
                volume: volume || 0,
                unrealized_pnl: unrealizedPnl,
                unrealized_pnl_percent: unrealizedPnlPercent,
                unrealized_r: unrealizedR,
            });

            daysProcessed++;
        }

        // Update trade with final MFE/MAE
        let mfeR: number | undefined;
        let maeR: number | undefined;
        if (trade.entry_stop_loss) {
            const riskPerShare = trade.entry_price - trade.entry_stop_loss;
            if (riskPerShare > 0) {
                mfeR = (mfe - trade.entry_price) / riskPerShare;
                maeR = (mae - trade.entry_price) / riskPerShare;
            }
        }

        await supabase
            .from('completed_trades')
            .update({
                mfe,
                mae,
                mfe_date: mfeDate,
                mae_date: maeDate,
                mfe_r: mfeR,
                mae_r: maeR,
            })
            .eq('id', tradeId)
            .eq('user_id', user.id);

        return { success: true, days: daysProcessed };
    } catch (error) {
        return { success: false, days: 0, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Backfill price history for all trades
 */
export async function backfillAllTradesPriceHistory(): Promise<{
    success: boolean;
    processed: number;
    totalDays: number;
    errors: string[];
}> {
    const result = {
        success: true,
        processed: 0,
        totalDays: 0,
        errors: [] as string[],
    };

    try {
        // Get all trades
        const tradesResult = await getTrades();

        if (!tradesResult.success || !tradesResult.data) {
            return { ...result, success: false, errors: [tradesResult.error || 'Failed to fetch trades'] };
        }

        for (const trade of tradesResult.data) {
            const backfillResult = await backfillTradePriceHistory(trade.id);

            if (backfillResult.success) {
                result.processed++;
                result.totalDays += backfillResult.days;
            } else {
                result.errors.push(`Trade ${trade.ticker} (${trade.id}): ${backfillResult.error}`);
            }

            // Rate limiting - wait a bit between trades
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return result;
    } catch (error) {
        return {
            ...result,
            success: false,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
        };
    }
}

// ============================================
// PRICE ANALYSIS
// ============================================

/**
 * Calculate MFE capture percentage
 * How much of the maximum favorable move was captured
 */
export function calculateMFECapture(trade: CompletedTrade): number | null {
    if (!trade.mfe || !trade.blended_exit_price || trade.status !== 'CLOSED') {
        return null;
    }

    const maxMove = trade.mfe - trade.entry_price;
    const capturedMove = trade.blended_exit_price - trade.entry_price;

    if (maxMove <= 0) return 0;

    return (capturedMove / maxMove) * 100;
}

/**
 * Calculate MAE experienced as percentage of entry
 */
export function calculateMAEPercent(trade: CompletedTrade): number | null {
    if (!trade.mae) return null;

    return ((trade.entry_price - trade.mae) / trade.entry_price) * 100;
}

/**
 * Analyze exit efficiency
 * How close to MFE vs how far from MAE
 */
export function analyzeExitEfficiency(trade: CompletedTrade): {
    mfeCapture: number | null;
    maeAvoidance: number | null;
    exitQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | null;
} | null {
    if (trade.status !== 'CLOSED' || !trade.blended_exit_price) {
        return null;
    }

    const mfeCapture = calculateMFECapture(trade);

    // MAE avoidance: how much of the drawdown was avoided
    // If exit price is above MAE, we avoided some of the drawdown
    let maeAvoidance: number | null = null;
    if (trade.mae && trade.mae < trade.entry_price) {
        const totalDrawdown = trade.entry_price - trade.mae;
        const recoveredFromDrawdown = trade.blended_exit_price - trade.mae;
        maeAvoidance = totalDrawdown > 0 ? (recoveredFromDrawdown / totalDrawdown) * 100 : 100;
    }

    // Determine exit quality
    let exitQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | null = null;
    if (mfeCapture !== null) {
        if (mfeCapture >= 75) exitQuality = 'EXCELLENT';
        else if (mfeCapture >= 50) exitQuality = 'GOOD';
        else if (mfeCapture >= 25) exitQuality = 'FAIR';
        else exitQuality = 'POOR';
    }

    return { mfeCapture, maeAvoidance, exitQuality };
}
