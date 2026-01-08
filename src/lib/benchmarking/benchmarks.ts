/**
 * Benchmark Comparisons
 * Compare actual performance vs benchmarks (SPY, backtest predictions, etc.)
 */

import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getHistoricalPrices } from '@/lib/data-services/price-provider';
import { CompletedTrade, BenchmarkComparison, PerformanceSnapshot } from './types';

// ============================================
// BENCHMARK COMPARISON
// ============================================

/**
 * Compare actual trading performance vs benchmarks
 */
export async function getBenchmarkComparison(
    dateRange: { start: string; end: string }
): Promise<{ success: boolean; data?: BenchmarkComparison; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Get trades in the date range
        const { data: trades, error: tradesError } = await supabase
            .from('completed_trades')
            .select('*')
            .eq('user_id', user.id)
            .gte('entry_date', dateRange.start)
            .lte('entry_date', dateRange.end);

        if (tradesError) {
            return { success: false, error: tradesError.message };
        }

        const completedTrades = (trades || []) as CompletedTrade[];

        // Calculate actual performance
        const actualPerformance = calculatePerformanceSnapshot(completedTrades);

        // Calculate SPY buy-and-hold performance
        const spyPerformance = await calculateBuyAndHoldPerformance(
            'SPY',
            dateRange.start,
            dateRange.end
        );

        // Calculate trading days
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        const tradingDays = Math.floor(
            (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Calculate alpha (excess return over SPY)
        let alpha: number | undefined;
        if (spyPerformance && actualPerformance.total_return_percent !== undefined) {
            alpha = actualPerformance.total_return_percent - spyPerformance.total_return_percent;
        }

        return {
            success: true,
            data: {
                period: {
                    start: dateRange.start,
                    end: dateRange.end,
                    trading_days: tradingDays,
                },
                actual: actualPerformance,
                benchmarks: {
                    buy_and_hold_spy: spyPerformance || undefined,
                },
                alpha,
            },
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Calculate performance snapshot from trades
 */
function calculatePerformanceSnapshot(trades: CompletedTrade[]): PerformanceSnapshot {
    if (trades.length === 0) {
        return {
            total_return: 0,
            total_return_percent: 0,
            max_drawdown_percent: 0,
            win_rate: 0,
            avg_r: 0,
            trade_count: 0,
        };
    }

    // Total return
    const totalReturn = trades.reduce((sum, t) => sum + (t.total_realized_pnl || 0), 0);

    // Total invested (for return %)
    const totalInvested = trades.reduce((sum, t) => sum + t.entry_value, 0);
    const totalReturnPercent = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

    // Win rate
    const winners = trades.filter(t => (t.total_realized_pnl || 0) > 0);
    const losers = trades.filter(t => (t.total_realized_pnl || 0) < 0);
    const winRate = trades.length > 0 ? winners.length / trades.length : 0;

    // Average R
    const rValues = trades.map(t => t.realized_r || 0);
    const avgR = rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0;

    // Profit factor
    const totalWins = winners.reduce((sum, t) => sum + (t.total_realized_pnl || 0), 0);
    const totalLosses = Math.abs(losers.reduce((sum, t) => sum + (t.total_realized_pnl || 0), 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : undefined;

    // Calculate max drawdown from cumulative P/L
    const sortedTrades = [...trades].sort((a, b) =>
        (a.exit_date || a.entry_date).localeCompare(b.exit_date || b.entry_date)
    );

    let cumulativePnl = 0;
    let peak = 0;
    let maxDrawdown = 0;
    const returns: number[] = [];

    for (const trade of sortedTrades) {
        const pnl = trade.total_realized_pnl || 0;
        cumulativePnl += pnl;
        returns.push(pnl);

        if (cumulativePnl > peak) {
            peak = cumulativePnl;
        }

        const drawdown = peak - cumulativePnl;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    }

    // Max drawdown as percentage of peak
    const maxDrawdownPercent = peak > 0 ? (maxDrawdown / peak) * 100 : 0;

    // Sharpe ratio (simplified - using daily returns approximation)
    let sharpeRatio: number | undefined;
    if (returns.length > 1) {
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev > 0) {
            // Annualized (assuming ~250 trading days)
            sharpeRatio = (avgReturn / stdDev) * Math.sqrt(250);
        }
    }

    // Sortino ratio (only considers downside volatility)
    let sortinoRatio: number | undefined;
    if (returns.length > 1) {
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const downsideReturns = returns.filter(r => r < 0);
        if (downsideReturns.length > 0) {
            const downsideVariance = downsideReturns.reduce(
                (sum, r) => sum + Math.pow(r, 2),
                0
            ) / downsideReturns.length;
            const downsideStdDev = Math.sqrt(downsideVariance);
            if (downsideStdDev > 0) {
                sortinoRatio = (avgReturn / downsideStdDev) * Math.sqrt(250);
            }
        }
    }

    return {
        total_return: totalReturn,
        total_return_percent: totalReturnPercent,
        sharpe_ratio: sharpeRatio,
        sortino_ratio: sortinoRatio,
        max_drawdown_percent: maxDrawdownPercent,
        win_rate: winRate,
        profit_factor: profitFactor,
        avg_r: avgR,
        trade_count: trades.length,
    };
}

/**
 * Calculate buy-and-hold performance for a ticker
 */
async function calculateBuyAndHoldPerformance(
    ticker: string,
    startDate: string,
    endDate: string
): Promise<PerformanceSnapshot | null> {
    try {
        const chartData = await getHistoricalPrices(
            ticker,
            new Date(startDate),
            new Date(endDate)
        );

        if (!chartData || chartData.dates.length < 2) {
            return null;
        }

        const startPrice = chartData.prices[0];
        const endPrice = chartData.prices[chartData.prices.length - 1];

        const totalReturnPercent = ((endPrice - startPrice) / startPrice) * 100;

        // Calculate max drawdown
        let peak = startPrice;
        let maxDrawdownPercent = 0;

        for (const price of chartData.prices) {
            if (price > peak) {
                peak = price;
            }
            const drawdownPercent = ((peak - price) / peak) * 100;
            if (drawdownPercent > maxDrawdownPercent) {
                maxDrawdownPercent = drawdownPercent;
            }
        }

        // Calculate daily returns for Sharpe
        const dailyReturns: number[] = [];
        for (let i = 1; i < chartData.prices.length; i++) {
            const dailyReturn = (chartData.prices[i] - chartData.prices[i - 1]) / chartData.prices[i - 1];
            dailyReturns.push(dailyReturn);
        }

        let sharpeRatio: number | undefined;
        if (dailyReturns.length > 1) {
            const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
            const variance = dailyReturns.reduce(
                (sum, r) => sum + Math.pow(r - avgReturn, 2),
                0
            ) / dailyReturns.length;
            const stdDev = Math.sqrt(variance);
            if (stdDev > 0) {
                sharpeRatio = (avgReturn / stdDev) * Math.sqrt(250);
            }
        }

        return {
            total_return: 0, // Not applicable for buy-and-hold benchmark
            total_return_percent: totalReturnPercent,
            sharpe_ratio: sharpeRatio,
            max_drawdown_percent: maxDrawdownPercent,
            win_rate: totalReturnPercent > 0 ? 1 : 0,
            avg_r: 0, // Not applicable
            trade_count: 1, // Single "trade"
        };
    } catch (error) {
        console.error(`Failed to get ${ticker} performance:`, error);
        return null;
    }
}

// ============================================
// EQUITY CURVE
// ============================================

/**
 * Generate equity curve data (cumulative P/L over time)
 */
export async function getEquityCurve(filters?: {
    dateRange?: { start: string; end: string };
}): Promise<{
    success: boolean;
    data?: Array<{
        date: string;
        cumulative_pnl: number;
        cumulative_pnl_percent: number;
        trade_count: number;
    }>;
    error?: string;
}> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        let query = supabase
            .from('completed_trades')
            .select('*')
            .eq('user_id', user.id)
            .order('exit_date', { ascending: true });

        if (filters?.dateRange) {
            query = query
                .gte('entry_date', filters.dateRange.start)
                .lte('entry_date', filters.dateRange.end);
        }

        const { data: trades, error } = await query;

        if (error) {
            return { success: false, error: error.message };
        }

        const completedTrades = (trades || []) as CompletedTrade[];

        if (completedTrades.length === 0) {
            return { success: true, data: [] };
        }

        // Calculate initial capital (sum of all entry values)
        const initialCapital = completedTrades.reduce((sum, t) => sum + t.entry_value, 0);

        // Build equity curve
        let cumulativePnl = 0;
        let tradeCount = 0;
        const curve: Array<{
            date: string;
            cumulative_pnl: number;
            cumulative_pnl_percent: number;
            trade_count: number;
        }> = [];

        // Group by exit date
        const tradesByDate = new Map<string, CompletedTrade[]>();
        for (const trade of completedTrades) {
            const exitDate = trade.exit_date || trade.entry_date;
            if (!tradesByDate.has(exitDate)) {
                tradesByDate.set(exitDate, []);
            }
            tradesByDate.get(exitDate)!.push(trade);
        }

        // Sort dates and build curve
        const sortedDates = [...tradesByDate.keys()].sort();
        for (const date of sortedDates) {
            const dateTrades = tradesByDate.get(date)!;
            const dayPnl = dateTrades.reduce((sum, t) => sum + (t.total_realized_pnl || 0), 0);
            cumulativePnl += dayPnl;
            tradeCount += dateTrades.length;

            curve.push({
                date,
                cumulative_pnl: cumulativePnl,
                cumulative_pnl_percent: initialCapital > 0 ? (cumulativePnl / initialCapital) * 100 : 0,
                trade_count: tradeCount,
            });
        }

        return { success: true, data: curve };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// DRAWDOWN ANALYSIS
// ============================================

/**
 * Get drawdown periods
 */
export async function getDrawdownPeriods(filters?: {
    dateRange?: { start: string; end: string };
}): Promise<{
    success: boolean;
    data?: {
        current_drawdown_percent: number;
        max_drawdown_percent: number;
        max_drawdown_duration_days: number;
        drawdown_periods: Array<{
            start_date: string;
            end_date: string | null;
            peak_value: number;
            trough_value: number;
            drawdown_percent: number;
            duration_days: number;
            recovered: boolean;
        }>;
    };
    error?: string;
}> {
    try {
        const equityCurveResult = await getEquityCurve(filters);
        if (!equityCurveResult.success || !equityCurveResult.data) {
            return { success: false, error: equityCurveResult.error || 'Failed to get equity curve' };
        }

        const curve = equityCurveResult.data;
        if (curve.length === 0) {
            return {
                success: true,
                data: {
                    current_drawdown_percent: 0,
                    max_drawdown_percent: 0,
                    max_drawdown_duration_days: 0,
                    drawdown_periods: [],
                },
            };
        }

        // Track drawdown periods
        const drawdownPeriods: Array<{
            start_date: string;
            end_date: string | null;
            peak_value: number;
            trough_value: number;
            drawdown_percent: number;
            duration_days: number;
            recovered: boolean;
        }> = [];

        let peak = curve[0].cumulative_pnl;
        let peakDate = curve[0].date;
        let currentDrawdownStart: string | null = null;
        let currentTrough = peak;
        let currentTroughDate = curve[0].date;
        let maxDrawdownPercent = 0;
        let maxDrawdownDuration = 0;

        for (const point of curve) {
            if (point.cumulative_pnl > peak) {
                // New peak reached
                if (currentDrawdownStart) {
                    // End previous drawdown period
                    const durationDays = Math.floor(
                        (new Date(point.date).getTime() - new Date(currentDrawdownStart).getTime()) /
                        (1000 * 60 * 60 * 24)
                    );

                    const drawdownPercent = peak !== 0 ? ((peak - currentTrough) / Math.abs(peak)) * 100 : 0;

                    drawdownPeriods.push({
                        start_date: currentDrawdownStart,
                        end_date: point.date,
                        peak_value: peak,
                        trough_value: currentTrough,
                        drawdown_percent: drawdownPercent,
                        duration_days: durationDays,
                        recovered: true,
                    });

                    if (durationDays > maxDrawdownDuration) {
                        maxDrawdownDuration = durationDays;
                    }

                    currentDrawdownStart = null;
                }

                peak = point.cumulative_pnl;
                peakDate = point.date;
                currentTrough = peak;
            } else if (point.cumulative_pnl < peak) {
                // In drawdown
                if (!currentDrawdownStart) {
                    currentDrawdownStart = peakDate;
                    currentTrough = point.cumulative_pnl;
                    currentTroughDate = point.date;
                } else if (point.cumulative_pnl < currentTrough) {
                    currentTrough = point.cumulative_pnl;
                    currentTroughDate = point.date;
                }

                const currentDrawdownPercent = peak !== 0 ? ((peak - point.cumulative_pnl) / Math.abs(peak)) * 100 : 0;
                if (currentDrawdownPercent > maxDrawdownPercent) {
                    maxDrawdownPercent = currentDrawdownPercent;
                }
            }
        }

        // Handle ongoing drawdown
        let currentDrawdownPercent = 0;
        if (currentDrawdownStart) {
            const lastPoint = curve[curve.length - 1];
            const durationDays = Math.floor(
                (new Date(lastPoint.date).getTime() - new Date(currentDrawdownStart).getTime()) /
                (1000 * 60 * 60 * 24)
            );

            currentDrawdownPercent = peak !== 0 ? ((peak - lastPoint.cumulative_pnl) / Math.abs(peak)) * 100 : 0;

            drawdownPeriods.push({
                start_date: currentDrawdownStart,
                end_date: null,
                peak_value: peak,
                trough_value: currentTrough,
                drawdown_percent: currentDrawdownPercent,
                duration_days: durationDays,
                recovered: false,
            });

            if (durationDays > maxDrawdownDuration) {
                maxDrawdownDuration = durationDays;
            }
        }

        return {
            success: true,
            data: {
                current_drawdown_percent: currentDrawdownPercent,
                max_drawdown_percent: maxDrawdownPercent,
                max_drawdown_duration_days: maxDrawdownDuration,
                drawdown_periods: drawdownPeriods.sort((a, b) => b.drawdown_percent - a.drawdown_percent),
            },
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// ROLLING PERFORMANCE
// ============================================

/**
 * Get rolling performance metrics (e.g., rolling 30-day Sharpe)
 */
export async function getRollingPerformance(
    windowDays: number = 30
): Promise<{
    success: boolean;
    data?: Array<{
        date: string;
        rolling_return_percent: number;
        rolling_win_rate: number;
        rolling_avg_r: number;
        trade_count_in_window: number;
    }>;
    error?: string;
}> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data: trades, error } = await supabase
            .from('completed_trades')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'CLOSED')
            .not('exit_date', 'is', null)
            .order('exit_date', { ascending: true });

        if (error) {
            return { success: false, error: error.message };
        }

        const completedTrades = (trades || []) as CompletedTrade[];

        if (completedTrades.length === 0) {
            return { success: true, data: [] };
        }

        // Build rolling metrics
        const results: Array<{
            date: string;
            rolling_return_percent: number;
            rolling_win_rate: number;
            rolling_avg_r: number;
            trade_count_in_window: number;
        }> = [];

        // Get unique dates
        const uniqueDates = [...new Set(completedTrades.map(t => t.exit_date!))].sort();

        for (const endDate of uniqueDates) {
            const windowStart = new Date(endDate);
            windowStart.setDate(windowStart.getDate() - windowDays);
            const windowStartStr = windowStart.toISOString().split('T')[0];

            // Get trades in window
            const windowTrades = completedTrades.filter(t =>
                t.exit_date! >= windowStartStr && t.exit_date! <= endDate
            );

            if (windowTrades.length === 0) continue;

            const totalPnl = windowTrades.reduce((sum, t) => sum + (t.total_realized_pnl || 0), 0);
            const totalInvested = windowTrades.reduce((sum, t) => sum + t.entry_value, 0);
            const returnPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

            const winners = windowTrades.filter(t => (t.total_realized_pnl || 0) > 0);
            const winRate = windowTrades.length > 0 ? winners.length / windowTrades.length : 0;

            const avgR = windowTrades.reduce((sum, t) => sum + (t.realized_r || 0), 0) / windowTrades.length;

            results.push({
                date: endDate,
                rolling_return_percent: returnPercent,
                rolling_win_rate: winRate,
                rolling_avg_r: avgR,
                trade_count_in_window: windowTrades.length,
            });
        }

        return { success: true, data: results };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
