/**
 * Attribution Engine
 * Performance breakdown by multiple dimensions (regime, sector, entry quality, etc.)
 */

import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import {
    CompletedTrade,
    AttributionBreakdown,
    AttributionBucket,
    AttributionDimension,
    TradeSummaryStats,
} from './types';

// ============================================
// ATTRIBUTION BY DIMENSION
// ============================================

/**
 * Calculate attribution breakdown by a specific dimension
 */
export async function getAttributionByDimension(
    dimension: AttributionDimension,
    filters?: {
        dateRange?: { start: string; end: string };
        status?: string[];
    }
): Promise<{ success: boolean; data?: AttributionBreakdown; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Build query
        let query = supabase
            .from('completed_trades')
            .select('*')
            .eq('user_id', user.id);

        if (filters?.dateRange) {
            query = query
                .gte('entry_date', filters.dateRange.start)
                .lte('entry_date', filters.dateRange.end);
        }

        if (filters?.status && filters.status.length > 0) {
            query = query.in('status', filters.status);
        }

        const { data: trades, error } = await query;

        if (error) {
            return { success: false, error: error.message };
        }

        const completedTrades = (trades || []) as CompletedTrade[];

        // Group trades by dimension
        const buckets = groupByDimension(completedTrades, dimension);

        // Calculate total P/L for contribution percentages
        const totalPnl = completedTrades.reduce(
            (sum, t) => sum + (t.total_realized_pnl || 0),
            0
        );

        // Calculate metrics for each bucket
        const attributionBuckets: AttributionBucket[] = [];

        for (const [name, bucketTrades] of Object.entries(buckets)) {
            if (bucketTrades.length === 0) continue;

            const wins = bucketTrades.filter(t => (t.total_realized_pnl || 0) > 0);
            const losses = bucketTrades.filter(t => (t.total_realized_pnl || 0) <= 0);

            const bucketPnl = bucketTrades.reduce(
                (sum, t) => sum + (t.total_realized_pnl || 0),
                0
            );
            const avgPnl = bucketPnl / bucketTrades.length;

            const avgR = bucketTrades.reduce(
                (sum, t) => sum + (t.realized_r || 0),
                0
            ) / bucketTrades.length;

            const avgHoldingDays = bucketTrades.reduce(
                (sum, t) => sum + (t.holding_days || 0),
                0
            ) / bucketTrades.length;

            attributionBuckets.push({
                name,
                trade_count: bucketTrades.length,
                win_count: wins.length,
                loss_count: losses.length,
                win_rate: bucketTrades.length > 0 ? wins.length / bucketTrades.length : 0,
                avg_r: avgR,
                total_pnl: bucketPnl,
                avg_pnl: avgPnl,
                contribution_percent: totalPnl !== 0 ? (bucketPnl / Math.abs(totalPnl)) * 100 : 0,
                avg_holding_days: avgHoldingDays,
            });
        }

        // Sort by contribution (highest absolute contribution first)
        attributionBuckets.sort((a, b) => Math.abs(b.contribution_percent) - Math.abs(a.contribution_percent));

        return {
            success: true,
            data: {
                dimension,
                buckets: attributionBuckets,
                total_trades: completedTrades.length,
                total_pnl: totalPnl,
            },
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Group trades by a specific dimension
 */
function groupByDimension(
    trades: CompletedTrade[],
    dimension: AttributionDimension
): Record<string, CompletedTrade[]> {
    const buckets: Record<string, CompletedTrade[]> = {};

    for (const trade of trades) {
        let key: string;

        switch (dimension) {
            case 'regime':
                key = trade.entry_regime || 'Unknown';
                break;

            case 'sector':
                key = trade.entry_sector || 'Unknown';
                break;

            case 'entry_quality':
                key = getProbabilityBucket(trade.entry_probability);
                break;

            case 'exit_quality':
                key = getExitQualityBucket(trade);
                break;

            case 'timing':
                key = getTimingBucket(trade.entry_date);
                break;

            case 'holding_period':
                key = getHoldingPeriodBucket(trade.holding_days);
                break;

            case 'position_size':
                key = getPositionSizeBucket(trade.entry_value);
                break;

            case 'r_target_hit':
                key = getRTargetBucket(trade);
                break;

            case 'tags':
                // For tags, a trade can belong to multiple buckets
                if (trade.tags && trade.tags.length > 0) {
                    for (const tag of trade.tags) {
                        if (!buckets[tag]) buckets[tag] = [];
                        buckets[tag].push(trade);
                    }
                    continue; // Skip the normal assignment
                }
                key = 'Untagged';
                break;

            default:
                key = 'Other';
        }

        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(trade);
    }

    return buckets;
}

// ============================================
// BUCKET CLASSIFICATION HELPERS
// ============================================

function getProbabilityBucket(probability?: number): string {
    if (!probability) return 'Unknown';
    if (probability >= 80) return '80-100%';
    if (probability >= 70) return '70-80%';
    if (probability >= 60) return '60-70%';
    if (probability >= 50) return '50-60%';
    return '<50%';
}

function getExitQualityBucket(trade: CompletedTrade): string {
    if (trade.status !== 'CLOSED' || !trade.mfe || !trade.blended_exit_price) {
        return 'N/A';
    }

    const mfeMove = trade.mfe - trade.entry_price;
    if (mfeMove <= 0) return 'No Gain';

    const capturedMove = trade.blended_exit_price - trade.entry_price;
    const capturePercent = (capturedMove / mfeMove) * 100;

    if (capturePercent >= 75) return 'Excellent (75%+)';
    if (capturePercent >= 50) return 'Good (50-75%)';
    if (capturePercent >= 25) return 'Fair (25-50%)';
    return 'Poor (<25%)';
}

function getTimingBucket(entryDate?: string): string {
    if (!entryDate) return 'Unknown';

    const date = new Date(entryDate);
    const dayOfWeek = date.getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return dayNames[dayOfWeek];
}

function getHoldingPeriodBucket(holdingDays?: number): string {
    if (!holdingDays) return 'Unknown';
    if (holdingDays <= 1) return 'Intraday';
    if (holdingDays <= 5) return '2-5 Days';
    if (holdingDays <= 10) return '6-10 Days';
    if (holdingDays <= 20) return '11-20 Days';
    if (holdingDays <= 40) return '21-40 Days';
    return '40+ Days';
}

function getPositionSizeBucket(entryValue?: number): string {
    if (!entryValue) return 'Unknown';
    if (entryValue < 1000) return '<$1K';
    if (entryValue < 5000) return '$1K-$5K';
    if (entryValue < 10000) return '$5K-$10K';
    if (entryValue < 25000) return '$10K-$25K';
    if (entryValue < 50000) return '$25K-$50K';
    return '$50K+';
}

function getRTargetBucket(trade: CompletedTrade): string {
    if (!trade.realized_r) return 'Unknown';

    const r = trade.realized_r;
    if (r < -1) return 'Loss > 1R';
    if (r < 0) return 'Loss < 1R';
    if (r < 1) return 'Gain < 1R';
    if (r < 2) return '1R-2R';
    if (r < 3) return '2R-3R';
    return '3R+';
}

// ============================================
// MULTI-DIMENSIONAL ANALYSIS
// ============================================

/**
 * Get attribution across all dimensions
 */
export async function getFullAttribution(filters?: {
    dateRange?: { start: string; end: string };
    status?: string[];
}): Promise<{ success: boolean; data?: Record<AttributionDimension, AttributionBreakdown>; error?: string }> {
    const dimensions: AttributionDimension[] = [
        'regime',
        'sector',
        'entry_quality',
        'exit_quality',
        'timing',
        'holding_period',
        'position_size',
        'r_target_hit',
        'tags',
    ];

    const results: Partial<Record<AttributionDimension, AttributionBreakdown>> = {};

    for (const dimension of dimensions) {
        const result = await getAttributionByDimension(dimension, filters);
        if (result.success && result.data) {
            results[dimension] = result.data;
        }
    }

    return {
        success: true,
        data: results as Record<AttributionDimension, AttributionBreakdown>,
    };
}

// ============================================
// SUMMARY STATISTICS
// ============================================

/**
 * Calculate comprehensive summary statistics for trades
 */
export async function getTradeSummaryStats(filters?: {
    dateRange?: { start: string; end: string };
    status?: string[];
    tickers?: string[];
    tags?: string[];
}): Promise<{ success: boolean; data?: TradeSummaryStats; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Build query
        let query = supabase
            .from('completed_trades')
            .select('*')
            .eq('user_id', user.id);

        if (filters?.dateRange) {
            query = query
                .gte('entry_date', filters.dateRange.start)
                .lte('entry_date', filters.dateRange.end);
        }

        if (filters?.status && filters.status.length > 0) {
            query = query.in('status', filters.status);
        }

        if (filters?.tickers && filters.tickers.length > 0) {
            query = query.in('ticker', filters.tickers);
        }

        const { data: trades, error } = await query;

        if (error) {
            return { success: false, error: error.message };
        }

        const completedTrades = (trades || []) as CompletedTrade[];

        if (completedTrades.length === 0) {
            return {
                success: true,
                data: {
                    total_trades: 0,
                    open_trades: 0,
                    closed_trades: 0,
                    winning_trades: 0,
                    losing_trades: 0,
                    win_rate: 0,
                    total_pnl: 0,
                    avg_pnl: 0,
                    avg_win: 0,
                    avg_loss: 0,
                    avg_r: 0,
                    best_r: 0,
                    worst_r: 0,
                    profit_factor: undefined,
                    expectancy: undefined,
                    avg_holding_days: 0,
                    max_holding_days: 0,
                    min_holding_days: 0,
                    avg_mfe_capture: 0,
                    avg_mae_experienced: 0,
                    by_status: { open: 0, partially_closed: 0, closed: 0 },
                },
            };
        }

        // Filter for tags if specified
        let filteredTrades = completedTrades;
        if (filters?.tags && filters.tags.length > 0) {
            filteredTrades = completedTrades.filter(t =>
                t.tags && t.tags.some(tag => filters.tags!.includes(tag))
            );
        }

        // Calculate stats
        const openTrades = filteredTrades.filter(t => t.status === 'OPEN');
        const partialTrades = filteredTrades.filter(t => t.status === 'PARTIALLY_CLOSED');
        const closedTrades = filteredTrades.filter(t => t.status === 'CLOSED');

        const winningTrades = filteredTrades.filter(t => (t.total_realized_pnl || 0) > 0);
        const losingTrades = filteredTrades.filter(t => (t.total_realized_pnl || 0) < 0);

        const totalPnl = filteredTrades.reduce((sum, t) => sum + (t.total_realized_pnl || 0), 0);
        const avgPnl = filteredTrades.length > 0 ? totalPnl / filteredTrades.length : 0;

        const totalWins = winningTrades.reduce((sum, t) => sum + (t.total_realized_pnl || 0), 0);
        const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.total_realized_pnl || 0), 0));
        const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;

        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : undefined;

        const rValues = filteredTrades.map(t => t.realized_r || 0).filter(r => r !== 0);
        const avgR = rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0;
        const bestR = rValues.length > 0 ? Math.max(...rValues) : 0;
        const worstR = rValues.length > 0 ? Math.min(...rValues) : 0;

        const holdingDays = filteredTrades.map(t => t.holding_days || 0).filter(d => d > 0);
        const avgHoldingDays = holdingDays.length > 0 ? holdingDays.reduce((a, b) => a + b, 0) / holdingDays.length : 0;
        const maxHoldingDays = holdingDays.length > 0 ? Math.max(...holdingDays) : 0;
        const minHoldingDays = holdingDays.length > 0 ? Math.min(...holdingDays) : 0;

        const winRate = filteredTrades.length > 0 ? winningTrades.length / filteredTrades.length : 0;
        const expectancy = avgWin * winRate - avgLoss * (1 - winRate);

        // MFE/MAE stats
        let avgMfeCapture = 0;
        let avgMaeExperienced = 0;
        const tradesWithMfe = filteredTrades.filter(t => t.mfe && t.blended_exit_price && t.status === 'CLOSED');

        if (tradesWithMfe.length > 0) {
            const mfeCaptures = tradesWithMfe.map(t => {
                const maxMove = t.mfe! - t.entry_price;
                if (maxMove <= 0) return 0;
                const capturedMove = t.blended_exit_price! - t.entry_price;
                return (capturedMove / maxMove) * 100;
            });
            avgMfeCapture = mfeCaptures.reduce((a, b) => a + b, 0) / mfeCaptures.length;
        }

        const tradesWithMae = filteredTrades.filter(t => t.mae);
        if (tradesWithMae.length > 0) {
            const maePercents = tradesWithMae.map(t =>
                ((t.entry_price - t.mae!) / t.entry_price) * 100
            );
            avgMaeExperienced = maePercents.reduce((a, b) => a + b, 0) / maePercents.length;
        }

        return {
            success: true,
            data: {
                total_trades: filteredTrades.length,
                open_trades: openTrades.length,
                closed_trades: closedTrades.length,
                winning_trades: winningTrades.length,
                losing_trades: losingTrades.length,
                win_rate: winRate,
                total_pnl: totalPnl,
                avg_pnl: avgPnl,
                avg_win: avgWin,
                avg_loss: avgLoss,
                avg_r: avgR,
                best_r: bestR,
                worst_r: worstR,
                profit_factor: profitFactor,
                expectancy,
                avg_holding_days: avgHoldingDays,
                max_holding_days: maxHoldingDays,
                min_holding_days: minHoldingDays,
                avg_mfe_capture: avgMfeCapture,
                avg_mae_experienced: avgMaeExperienced,
                by_status: {
                    open: openTrades.length,
                    partially_closed: partialTrades.length,
                    closed: closedTrades.length,
                },
            },
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Get period-over-period stats (monthly, quarterly, yearly)
 */
export async function getPeriodicStats(
    periodType: 'month' | 'quarter' | 'year'
): Promise<{ success: boolean; data?: Array<{ period: string; stats: TradeSummaryStats }>; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Get all trades
        const { data: trades, error } = await supabase
            .from('completed_trades')
            .select('*')
            .eq('user_id', user.id)
            .order('entry_date', { ascending: true });

        if (error) {
            return { success: false, error: error.message };
        }

        const completedTrades = (trades || []) as CompletedTrade[];

        // Group by period
        const periodMap = new Map<string, CompletedTrade[]>();

        for (const trade of completedTrades) {
            const date = new Date(trade.entry_date);
            let periodKey: string;

            switch (periodType) {
                case 'month':
                    periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    break;
                case 'quarter':
                    const quarter = Math.floor(date.getMonth() / 3) + 1;
                    periodKey = `${date.getFullYear()}-Q${quarter}`;
                    break;
                case 'year':
                    periodKey = String(date.getFullYear());
                    break;
            }

            if (!periodMap.has(periodKey)) {
                periodMap.set(periodKey, []);
            }
            periodMap.get(periodKey)!.push(trade);
        }

        // Calculate stats for each period
        const results: Array<{ period: string; stats: TradeSummaryStats }> = [];

        for (const [period, periodTrades] of periodMap) {
            // Reuse the stats calculation (simplified inline version)
            const openTrades = periodTrades.filter(t => t.status === 'OPEN');
            const partialTrades = periodTrades.filter(t => t.status === 'PARTIALLY_CLOSED');
            const closedTrades = periodTrades.filter(t => t.status === 'CLOSED');
            const winningTrades = periodTrades.filter(t => (t.total_realized_pnl || 0) > 0);
            const losingTrades = periodTrades.filter(t => (t.total_realized_pnl || 0) < 0);

            const totalPnl = periodTrades.reduce((sum, t) => sum + (t.total_realized_pnl || 0), 0);
            const totalWins = winningTrades.reduce((sum, t) => sum + (t.total_realized_pnl || 0), 0);
            const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.total_realized_pnl || 0), 0));

            const avgR = periodTrades.reduce((sum, t) => sum + (t.realized_r || 0), 0) / periodTrades.length || 0;
            const winRate = periodTrades.length > 0 ? winningTrades.length / periodTrades.length : 0;

            results.push({
                period,
                stats: {
                    total_trades: periodTrades.length,
                    open_trades: openTrades.length,
                    closed_trades: closedTrades.length,
                    winning_trades: winningTrades.length,
                    losing_trades: losingTrades.length,
                    win_rate: winRate,
                    total_pnl: totalPnl,
                    avg_pnl: periodTrades.length > 0 ? totalPnl / periodTrades.length : 0,
                    avg_win: winningTrades.length > 0 ? totalWins / winningTrades.length : 0,
                    avg_loss: losingTrades.length > 0 ? totalLosses / losingTrades.length : 0,
                    avg_r: avgR,
                    best_r: Math.max(...periodTrades.map(t => t.realized_r || 0), 0),
                    worst_r: Math.min(...periodTrades.map(t => t.realized_r || 0), 0),
                    profit_factor: totalLosses > 0 ? totalWins / totalLosses : undefined,
                    expectancy: undefined,
                    avg_holding_days: periodTrades.reduce((sum, t) => sum + (t.holding_days || 0), 0) / periodTrades.length || 0,
                    max_holding_days: Math.max(...periodTrades.map(t => t.holding_days || 0), 0),
                    min_holding_days: Math.min(...periodTrades.filter(t => t.holding_days).map(t => t.holding_days!), 0),
                    avg_mfe_capture: 0,
                    avg_mae_experienced: 0,
                    by_status: {
                        open: openTrades.length,
                        partially_closed: partialTrades.length,
                        closed: closedTrades.length,
                    },
                },
            });
        }

        // Sort by period
        results.sort((a, b) => a.period.localeCompare(b.period));

        return { success: true, data: results };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
