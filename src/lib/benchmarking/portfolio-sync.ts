/**
 * Portfolio Sync Service
 * Synchronizes portfolio positions with completed_trades for benchmarking
 */

import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { PortfolioPosition, AnalysisResult, PositionSells } from '@/lib/types';
import { createTrade, recordPartialExit, getTradeByPortfolioId } from './trade-lifecycle';
import { CompletedTrade, PartialExit } from './types';
import { ExitReason } from '@/lib/backtest/types';

// ============================================
// SYNC ON POSITION CREATE
// ============================================

/**
 * Create a completed_trade when a new position is added
 * Call this from addPosition() in portfolio-actions.ts
 */
export async function syncPositionToTrade(
    position: PortfolioPosition,
    analysis?: AnalysisResult
): Promise<{ success: boolean; tradeId?: string; error?: string }> {
    try {
        const result = await createTrade({
            portfolio_id: position.id,
            ticker: position.ticker,
            trade_type: 'SWING_LONG',
            entry_date: position.date_added.split('T')[0], // ISO date
            entry_price: position.buy_price,
            entry_shares: position.quantity,
            entry_notes: position.notes,
            analysis,
        });

        if (!result.success) {
            console.error('[Portfolio Sync] Failed to create trade:', result.error);
            return { success: false, error: result.error };
        }

        return { success: true, tradeId: result.data?.id };
    } catch (error) {
        console.error('[Portfolio Sync] Error creating trade:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// SYNC ON SELL
// ============================================

/**
 * Map portfolio sell price level to exit reason
 */
function mapPriceLevelToExitReason(level: string): ExitReason {
    switch (level) {
        case 'stop_loss': return 'STOP_LOSS';
        case 'pt1': return 'TP1';
        case 'pt2': return 'TP2';
        case 'pt3': return 'TP3';
        default: return 'MANUAL';
    }
}

/**
 * Sync a sell action to the completed_trade
 * Call this from recordSellAtPrice() in portfolio-actions.ts
 */
export async function syncSellToTrade(
    portfolioId: string,
    priceLevel: string,
    sharesSold: number,
    sellPrice: number,
    sellDate?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Find the corresponding trade
        const tradeResult = await getTradeByPortfolioId(portfolioId);

        if (!tradeResult.success || !tradeResult.data) {
            // Trade doesn't exist yet - this can happen for positions created before benchmarking
            console.warn('[Portfolio Sync] No trade found for portfolio:', portfolioId);
            return { success: true }; // Not an error, just no trade to update
        }

        const trade = tradeResult.data;

        // Record the partial exit
        const result = await recordPartialExit({
            trade_id: trade.id,
            date: sellDate || new Date().toISOString().split('T')[0],
            price: sellPrice,
            shares: sharesSold,
            reason: mapPriceLevelToExitReason(priceLevel),
        });

        if (!result.success) {
            console.error('[Portfolio Sync] Failed to record exit:', result.error);
            return { success: false, error: result.error };
        }

        return { success: true };
    } catch (error) {
        console.error('[Portfolio Sync] Error syncing sell:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// BACKFILL EXISTING POSITIONS
// ============================================

/**
 * Backfill completed_trades from existing portfolio positions
 * Run this once to migrate historical data
 */
export async function backfillExistingPositions(): Promise<{
    success: boolean;
    created: number;
    skipped: number;
    errors: string[];
}> {
    const result = {
        success: true,
        created: 0,
        skipped: 0,
        errors: [] as string[],
    };

    try {
        if (!isSupabaseConfigured()) {
            return { ...result, success: false, errors: ['Database not configured'] };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { ...result, success: false, errors: ['Not authenticated'] };
        }

        // Get all portfolio positions
        const { data: positions, error } = await supabase
            .from('portfolios')
            .select('*')
            .eq('user_id', user.id);

        if (error) {
            return { ...result, success: false, errors: [error.message] };
        }

        if (!positions || positions.length === 0) {
            return result;
        }

        // Process each position
        for (const position of positions) {
            // Check if trade already exists
            const existingTrade = await getTradeByPortfolioId(position.id);
            if (existingTrade.data) {
                result.skipped++;
                continue;
            }

            // Create the trade
            const createResult = await createTrade({
                portfolio_id: position.id,
                ticker: position.ticker,
                trade_type: 'SWING_LONG',
                entry_date: position.date_added.split('T')[0],
                entry_price: position.buy_price,
                entry_shares: position.quantity,
                entry_notes: position.notes,
            });

            if (!createResult.success || !createResult.data) {
                result.errors.push(`Failed to create trade for ${position.ticker}: ${createResult.error}`);
                continue;
            }

            result.created++;

            // If there are sells, sync them too
            const sells: PositionSells = position.sells || {};
            const sellLevels = ['stop_loss', 'pt1', 'pt2', 'pt3'] as const;

            for (const level of sellLevels) {
                const sell = sells[level];
                if (sell && sell.shares_sold > 0) {
                    const exitResult = await recordPartialExit({
                        trade_id: createResult.data.id,
                        date: sell.sell_date?.split('T')[0] || position.date_added.split('T')[0],
                        price: sell.sell_price,
                        shares: sell.shares_sold,
                        reason: mapPriceLevelToExitReason(level),
                    });

                    if (!exitResult.success) {
                        result.errors.push(
                            `Failed to sync ${level} for ${position.ticker}: ${exitResult.error}`
                        );
                    }
                }
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
// SYNC STATUS CHECK
// ============================================

/**
 * Check sync status between portfolios and completed_trades
 */
export async function checkSyncStatus(): Promise<{
    success: boolean;
    portfolioCount: number;
    tradeCount: number;
    syncedCount: number;
    unsyncedPositions: string[];
    error?: string;
}> {
    try {
        if (!isSupabaseConfigured()) {
            return {
                success: false,
                portfolioCount: 0,
                tradeCount: 0,
                syncedCount: 0,
                unsyncedPositions: [],
                error: 'Database not configured',
            };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return {
                success: false,
                portfolioCount: 0,
                tradeCount: 0,
                syncedCount: 0,
                unsyncedPositions: [],
                error: 'Not authenticated',
            };
        }

        // Count portfolios
        const { count: portfolioCount } = await supabase
            .from('portfolios')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        // Count trades
        const { count: tradeCount } = await supabase
            .from('completed_trades')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        // Count synced (trades with portfolio_id)
        const { count: syncedCount } = await supabase
            .from('completed_trades')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .not('portfolio_id', 'is', null);

        // Find unsynced positions
        const { data: positions } = await supabase
            .from('portfolios')
            .select('id, ticker')
            .eq('user_id', user.id);

        const { data: trades } = await supabase
            .from('completed_trades')
            .select('portfolio_id')
            .eq('user_id', user.id)
            .not('portfolio_id', 'is', null);

        const syncedPortfolioIds = new Set(trades?.map(t => t.portfolio_id) || []);
        const unsyncedPositions = positions
            ?.filter(p => !syncedPortfolioIds.has(p.id))
            .map(p => `${p.ticker} (${p.id})`) || [];

        return {
            success: true,
            portfolioCount: portfolioCount || 0,
            tradeCount: tradeCount || 0,
            syncedCount: syncedCount || 0,
            unsyncedPositions,
        };
    } catch (error) {
        return {
            success: false,
            portfolioCount: 0,
            tradeCount: 0,
            syncedCount: 0,
            unsyncedPositions: [],
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
