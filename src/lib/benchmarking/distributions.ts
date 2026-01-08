/**
 * Distribution Calculator
 * Statistical analysis of trade outcomes (R distribution, P/L distribution, etc.)
 */

import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { CompletedTrade, DistributionData, DistributionBucket } from './types';

// ============================================
// DISTRIBUTION CALCULATIONS
// ============================================

/**
 * Calculate R-multiple distribution
 */
export async function getRDistribution(filters?: {
    dateRange?: { start: string; end: string };
    status?: string[];
}): Promise<{ success: boolean; data?: DistributionData; error?: string }> {
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
            .not('realized_r', 'is', null);

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

        const rValues = (trades || [])
            .map(t => (t as CompletedTrade).realized_r)
            .filter((r): r is number => r !== null && r !== undefined);

        if (rValues.length === 0) {
            return { success: false, error: 'No trades with R values found' };
        }

        // Define buckets for R distribution
        const bucketRanges = [
            { label: '< -2R', min: -Infinity, max: -2 },
            { label: '-2R to -1R', min: -2, max: -1 },
            { label: '-1R to 0', min: -1, max: 0 },
            { label: '0 to 1R', min: 0, max: 1 },
            { label: '1R to 2R', min: 1, max: 2 },
            { label: '2R to 3R', min: 2, max: 3 },
            { label: '3R to 5R', min: 3, max: 5 },
            { label: '> 5R', min: 5, max: Infinity },
        ];

        return {
            success: true,
            data: calculateDistribution(rValues, bucketRanges),
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Calculate P/L percentage distribution
 */
export async function getPnLPercentDistribution(filters?: {
    dateRange?: { start: string; end: string };
    status?: string[];
}): Promise<{ success: boolean; data?: DistributionData; error?: string }> {
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
            .not('total_realized_pnl_percent', 'is', null);

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

        const pnlValues = (trades || [])
            .map(t => (t as CompletedTrade).total_realized_pnl_percent)
            .filter((p): p is number => p !== null && p !== undefined);

        if (pnlValues.length === 0) {
            return { success: false, error: 'No trades with P/L data found' };
        }

        // Define buckets for P/L percent distribution
        const bucketRanges = [
            { label: '< -20%', min: -Infinity, max: -20 },
            { label: '-20% to -10%', min: -20, max: -10 },
            { label: '-10% to -5%', min: -10, max: -5 },
            { label: '-5% to 0', min: -5, max: 0 },
            { label: '0 to 5%', min: 0, max: 5 },
            { label: '5% to 10%', min: 5, max: 10 },
            { label: '10% to 20%', min: 10, max: 20 },
            { label: '20% to 50%', min: 20, max: 50 },
            { label: '> 50%', min: 50, max: Infinity },
        ];

        return {
            success: true,
            data: calculateDistribution(pnlValues, bucketRanges),
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Calculate holding period distribution
 */
export async function getHoldingPeriodDistribution(filters?: {
    dateRange?: { start: string; end: string };
    status?: string[];
}): Promise<{ success: boolean; data?: DistributionData; error?: string }> {
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
            .not('holding_days', 'is', null);

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

        const holdingDays = (trades || [])
            .map(t => (t as CompletedTrade).holding_days)
            .filter((d): d is number => d !== null && d !== undefined && d > 0);

        if (holdingDays.length === 0) {
            return { success: false, error: 'No trades with holding period data found' };
        }

        // Define buckets for holding period distribution
        const bucketRanges = [
            { label: '1 Day', min: 0, max: 1 },
            { label: '2-3 Days', min: 1, max: 3 },
            { label: '4-5 Days', min: 3, max: 5 },
            { label: '1-2 Weeks', min: 5, max: 10 },
            { label: '2-3 Weeks', min: 10, max: 15 },
            { label: '3-4 Weeks', min: 15, max: 20 },
            { label: '1-2 Months', min: 20, max: 40 },
            { label: '> 2 Months', min: 40, max: Infinity },
        ];

        return {
            success: true,
            data: calculateDistribution(holdingDays, bucketRanges),
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Calculate MFE utilization distribution
 * How much of the maximum favorable excursion was captured
 */
export async function getMFEUtilizationDistribution(filters?: {
    dateRange?: { start: string; end: string };
}): Promise<{ success: boolean; data?: DistributionData; error?: string }> {
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
            .eq('status', 'CLOSED')
            .not('mfe', 'is', null)
            .not('blended_exit_price', 'is', null);

        if (filters?.dateRange) {
            query = query
                .gte('entry_date', filters.dateRange.start)
                .lte('entry_date', filters.dateRange.end);
        }

        const { data: trades, error } = await query;

        if (error) {
            return { success: false, error: error.message };
        }

        const mfeCaptures: number[] = [];
        for (const trade of (trades || []) as CompletedTrade[]) {
            if (!trade.mfe || !trade.blended_exit_price) continue;

            const maxMove = trade.mfe - trade.entry_price;
            if (maxMove <= 0) continue;

            const capturedMove = trade.blended_exit_price - trade.entry_price;
            const capturePercent = (capturedMove / maxMove) * 100;
            mfeCaptures.push(capturePercent);
        }

        if (mfeCaptures.length === 0) {
            return { success: false, error: 'No trades with MFE data found' };
        }

        // Define buckets for MFE utilization
        const bucketRanges = [
            { label: '< 0% (Loss)', min: -Infinity, max: 0 },
            { label: '0-25%', min: 0, max: 25 },
            { label: '25-50%', min: 25, max: 50 },
            { label: '50-75%', min: 50, max: 75 },
            { label: '75-100%', min: 75, max: 100 },
            { label: '> 100%', min: 100, max: Infinity },
        ];

        return {
            success: true,
            data: calculateDistribution(mfeCaptures, bucketRanges),
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Calculate MAE (Maximum Adverse Excursion) distribution
 * How much drawdown was experienced during trades
 */
export async function getMAEDistribution(filters?: {
    dateRange?: { start: string; end: string };
    status?: string[];
}): Promise<{ success: boolean; data?: DistributionData; error?: string }> {
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
            .not('mae', 'is', null);

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

        const maePercents: number[] = [];
        for (const trade of (trades || []) as CompletedTrade[]) {
            if (!trade.mae) continue;

            const drawdownPercent = ((trade.entry_price - trade.mae) / trade.entry_price) * 100;
            maePercents.push(drawdownPercent);
        }

        if (maePercents.length === 0) {
            return { success: false, error: 'No trades with MAE data found' };
        }

        // Define buckets for MAE distribution (positive values = drawdown)
        const bucketRanges = [
            { label: '0-2%', min: -Infinity, max: 2 },
            { label: '2-5%', min: 2, max: 5 },
            { label: '5-8%', min: 5, max: 8 },
            { label: '8-10%', min: 8, max: 10 },
            { label: '10-15%', min: 10, max: 15 },
            { label: '15-20%', min: 15, max: 20 },
            { label: '> 20%', min: 20, max: Infinity },
        ];

        return {
            success: true,
            data: calculateDistribution(maePercents, bucketRanges),
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// STATISTICAL HELPERS
// ============================================

/**
 * Calculate distribution statistics for a set of values
 */
function calculateDistribution(
    values: number[],
    bucketRanges: Array<{ label: string; min: number; max: number }>
): DistributionData {
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;

    // Basic stats
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    const median = count % 2 === 0
        ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
        : sorted[Math.floor(count / 2)];

    // Standard deviation
    const squaredDiffs = sorted.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / count;
    const stdDev = Math.sqrt(variance);

    // Skewness
    const cubedDiffs = sorted.map(v => Math.pow((v - mean) / stdDev, 3));
    const skewness = stdDev > 0 ? cubedDiffs.reduce((a, b) => a + b, 0) / count : 0;

    // Percentiles
    const getPercentile = (p: number) => {
        const idx = Math.floor((p / 100) * count);
        return sorted[Math.min(idx, count - 1)];
    };

    // Build buckets
    const buckets: DistributionBucket[] = bucketRanges.map(range => {
        const bucketValues = values.filter(v => v > range.min && v <= range.max);
        return {
            label: range.label,
            range_start: range.min === -Infinity ? sorted[0] : range.min,
            range_end: range.max === Infinity ? sorted[count - 1] : range.max,
            count: bucketValues.length,
            percent: (bucketValues.length / count) * 100,
        };
    });

    return {
        buckets,
        count,
        mean,
        median,
        std_dev: stdDev,
        skewness,
        min: sorted[0],
        max: sorted[count - 1],
        percentiles: {
            p5: getPercentile(5),
            p10: getPercentile(10),
            p25: getPercentile(25),
            p50: median,
            p75: getPercentile(75),
            p90: getPercentile(90),
            p95: getPercentile(95),
        },
    };
}

/**
 * Get all distributions at once
 */
export async function getAllDistributions(filters?: {
    dateRange?: { start: string; end: string };
    status?: string[];
}): Promise<{
    success: boolean;
    data?: {
        r: DistributionData | null;
        pnl: DistributionData | null;
        holdingPeriod: DistributionData | null;
        mfeUtilization: DistributionData | null;
        mae: DistributionData | null;
    };
    error?: string;
}> {
    const [rResult, pnlResult, holdingResult, mfeResult, maeResult] = await Promise.all([
        getRDistribution(filters),
        getPnLPercentDistribution(filters),
        getHoldingPeriodDistribution(filters),
        getMFEUtilizationDistribution(filters),
        getMAEDistribution(filters),
    ]);

    return {
        success: true,
        data: {
            r: rResult.success ? rResult.data! : null,
            pnl: pnlResult.success ? pnlResult.data! : null,
            holdingPeriod: holdingResult.success ? holdingResult.data! : null,
            mfeUtilization: mfeResult.success ? mfeResult.data! : null,
            mae: maeResult.success ? maeResult.data! : null,
        },
    };
}
