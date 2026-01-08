/**
 * Reconciliation Engine
 * Links completed trades to prediction logs for calibration analysis
 * Detects model drift and provides threshold tuning recommendations
 */

import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { CompletedTrade, CalibrationMetrics, DriftDetection } from './types';
import { PredictionLog } from '../backtest/types';

// ============================================
// CALIBRATION BUCKETS
// ============================================

const CALIBRATION_BUCKETS = [
    { label: '50-55%', min: 0.50, max: 0.55 },
    { label: '55-60%', min: 0.55, max: 0.60 },
    { label: '60-65%', min: 0.60, max: 0.65 },
    { label: '65-70%', min: 0.65, max: 0.70 },
    { label: '70-75%', min: 0.70, max: 0.75 },
    { label: '75-80%', min: 0.75, max: 0.80 },
    { label: '80-85%', min: 0.80, max: 0.85 },
    { label: '85-90%', min: 0.85, max: 0.90 },
    { label: '90-100%', min: 0.90, max: 1.00 },
];

// ============================================
// MATCH TRADES TO PREDICTIONS
// ============================================

interface MatchedTrade {
    trade: CompletedTrade;
    prediction?: PredictionLog;
    matchConfidence: 'exact' | 'close' | 'none';
}

/**
 * Match completed trades to their prediction logs
 */
export async function matchTradesToPredictions(
    dateRange?: { start: string; end: string }
): Promise<{ success: boolean; data?: MatchedTrade[]; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Get completed trades
        let tradesQuery = supabase
            .from('completed_trades')
            .select('*')
            .eq('user_id', user.id)
            .in('status', ['CLOSED', 'PARTIALLY_CLOSED']);

        if (dateRange) {
            tradesQuery = tradesQuery
                .gte('entry_date', dateRange.start)
                .lte('entry_date', dateRange.end);
        }

        const { data: trades, error: tradesError } = await tradesQuery;

        if (tradesError) {
            return { success: false, error: tradesError.message };
        }

        // Get prediction logs
        let predictionsQuery = supabase
            .from('prediction_logs')
            .select('*')
            .eq('user_id', user.id);

        if (dateRange) {
            predictionsQuery = predictionsQuery
                .gte('prediction_date', dateRange.start)
                .lte('prediction_date', dateRange.end);
        }

        const { data: predictions, error: predictionsError } = await predictionsQuery;

        if (predictionsError) {
            // If prediction_logs table doesn't exist, return trades without predictions
            console.log('[Reconciliation] Prediction logs not available:', predictionsError.message);
            return {
                success: true,
                data: (trades || []).map(t => ({
                    trade: t as CompletedTrade,
                    prediction: undefined,
                    matchConfidence: 'none' as const,
                })),
            };
        }

        // Match trades to predictions
        const completedTrades = (trades || []) as CompletedTrade[];
        const predictionLogs = (predictions || []) as PredictionLog[];

        const matched: MatchedTrade[] = completedTrades.map(trade => {
            // Try exact match: same ticker, prediction date = entry date
            const exactMatch = predictionLogs.find(
                p => p.ticker === trade.ticker && p.prediction_date === trade.entry_date
            );

            if (exactMatch) {
                return { trade, prediction: exactMatch, matchConfidence: 'exact' };
            }

            // Try close match: same ticker, prediction within 3 days of entry
            const entryDate = new Date(trade.entry_date);
            const closeMatch = predictionLogs.find(p => {
                if (p.ticker !== trade.ticker) return false;
                const predDate = new Date(p.prediction_date);
                const daysDiff = Math.abs((entryDate.getTime() - predDate.getTime()) / (1000 * 60 * 60 * 24));
                return daysDiff <= 3;
            });

            if (closeMatch) {
                return { trade, prediction: closeMatch, matchConfidence: 'close' };
            }

            // No match found
            return { trade, prediction: undefined, matchConfidence: 'none' };
        });

        return { success: true, data: matched };
    } catch (error) {
        console.error('[Reconciliation] Match error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// CALIBRATION ANALYSIS
// ============================================

/**
 * Calculate calibration metrics across probability buckets
 */
export async function getCalibrationMetrics(
    dateRange?: { start: string; end: string }
): Promise<{ success: boolean; data?: CalibrationMetrics[]; error?: string }> {
    try {
        const matchResult = await matchTradesToPredictions(dateRange);

        if (!matchResult.success || !matchResult.data) {
            return { success: false, error: matchResult.error || 'Failed to match trades' };
        }

        // Filter to trades with predictions that have probability
        const tradesWithPredictions = matchResult.data.filter(
            m => m.prediction && m.prediction.predicted_probability != null
        );

        if (tradesWithPredictions.length === 0) {
            return {
                success: true,
                data: [],
            };
        }

        // Group by calibration bucket
        const bucketMetrics: CalibrationMetrics[] = [];

        for (const bucket of CALIBRATION_BUCKETS) {
            const bucketTrades = tradesWithPredictions.filter(m => {
                const prob = m.prediction!.predicted_probability;
                return prob >= bucket.min && prob < bucket.max;
            });

            if (bucketTrades.length === 0) continue;

            // Calculate actual win rate
            const wins = bucketTrades.filter(m => (m.trade.total_realized_pnl || 0) > 0);
            const actualWinRate = wins.length / bucketTrades.length;

            // Expected is midpoint of bucket
            const expectedWinRate = (bucket.min + bucket.max) / 2;
            const calibrationError = actualWinRate - expectedWinRate;

            bucketMetrics.push({
                bucket: bucket.label,
                predicted_probability_range: { min: bucket.min, max: bucket.max },
                trade_count: bucketTrades.length,
                actual_win_rate: actualWinRate,
                expected_win_rate: expectedWinRate,
                calibration_error: calibrationError,
                is_overconfident: calibrationError < -0.05, // Actual < Expected
                is_underconfident: calibrationError > 0.05, // Actual > Expected
            });
        }

        return { success: true, data: bucketMetrics };
    } catch (error) {
        console.error('[Reconciliation] Calibration error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// DRIFT DETECTION
// ============================================

/**
 * Detect model drift by comparing recent vs historical performance
 */
export async function detectDrift(
    recentDays: number = 30
): Promise<{ success: boolean; data?: DriftDetection; error?: string }> {
    try {
        const now = new Date();
        const recentStart = new Date(now.getTime() - recentDays * 24 * 60 * 60 * 1000);
        const historicalStart = new Date(recentStart.getTime() - 90 * 24 * 60 * 60 * 1000);

        // Get recent calibration
        const recentResult = await getCalibrationMetrics({
            start: recentStart.toISOString().split('T')[0],
            end: now.toISOString().split('T')[0],
        });

        // Get historical calibration
        const historicalResult = await getCalibrationMetrics({
            start: historicalStart.toISOString().split('T')[0],
            end: recentStart.toISOString().split('T')[0],
        });

        if (!recentResult.success || !historicalResult.success) {
            return { success: false, error: 'Failed to calculate calibration metrics' };
        }

        const recentMetrics = recentResult.data || [];
        const historicalMetrics = historicalResult.data || [];

        if (recentMetrics.length === 0) {
            return {
                success: true,
                data: {
                    period: `Last ${recentDays} days`,
                    overall_calibration_error: 0,
                    max_bucket_error: 0,
                    brier_score: 0,
                    has_significant_drift: false,
                    recommendation: 'Insufficient recent data for drift detection',
                },
            };
        }

        // Calculate overall metrics
        const totalTrades = recentMetrics.reduce((sum, m) => sum + m.trade_count, 0);
        const weightedError = recentMetrics.reduce(
            (sum, m) => sum + m.calibration_error * m.trade_count,
            0
        ) / totalTrades;

        const maxBucketError = Math.max(...recentMetrics.map(m => Math.abs(m.calibration_error)));

        // Simple Brier score approximation
        const brierScore = recentMetrics.reduce((sum, m) => {
            const expected = m.expected_win_rate;
            const actual = m.actual_win_rate;
            return sum + Math.pow(expected - actual, 2) * m.trade_count;
        }, 0) / totalTrades;

        // Compare to historical
        let historicalError = 0;
        if (historicalMetrics.length > 0) {
            const histTotalTrades = historicalMetrics.reduce((sum, m) => sum + m.trade_count, 0);
            historicalError = historicalMetrics.reduce(
                (sum, m) => sum + m.calibration_error * m.trade_count,
                0
            ) / histTotalTrades;
        }

        const driftAmount = Math.abs(weightedError - historicalError);
        const hasSignificantDrift = driftAmount > 0.10 || maxBucketError > 0.15;

        // Generate recommendation
        let recommendation = 'Model calibration is within acceptable limits.';

        if (hasSignificantDrift) {
            const overconfidentBuckets = recentMetrics.filter(m => m.is_overconfident);
            const underconfidentBuckets = recentMetrics.filter(m => m.is_underconfident);

            if (overconfidentBuckets.length > underconfidentBuckets.length) {
                recommendation = `Model appears overconfident. Consider raising entry threshold by ${(maxBucketError * 100).toFixed(0)}% or retraining with recent data.`;
            } else if (underconfidentBuckets.length > overconfidentBuckets.length) {
                recommendation = `Model appears underconfident. Consider lowering entry threshold or expanding universe criteria.`;
            } else {
                recommendation = `Mixed calibration issues detected. Review model features and consider retraining.`;
            }
        }

        return {
            success: true,
            data: {
                period: `Last ${recentDays} days`,
                overall_calibration_error: weightedError,
                max_bucket_error: maxBucketError,
                brier_score: brierScore,
                has_significant_drift: hasSignificantDrift,
                recommendation,
            },
        };
    } catch (error) {
        console.error('[Reconciliation] Drift detection error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// THRESHOLD RECOMMENDATIONS
// ============================================

interface ThresholdRecommendation {
    current_threshold: number;
    recommended_threshold: number;
    expected_win_rate_change: number;
    expected_trade_count_change: number;
    confidence: 'high' | 'medium' | 'low';
    rationale: string;
}

/**
 * Suggest threshold adjustments based on calibration analysis
 */
export async function getThresholdRecommendations(
    currentThreshold: number = 0.50
): Promise<{ success: boolean; data?: ThresholdRecommendation; error?: string }> {
    try {
        const calibrationResult = await getCalibrationMetrics();

        if (!calibrationResult.success || !calibrationResult.data) {
            return { success: false, error: calibrationResult.error || 'Failed to get calibration' };
        }

        const metrics = calibrationResult.data;
        const totalTrades = metrics.reduce((sum, m) => sum + m.trade_count, 0);

        if (totalTrades < 20) {
            return {
                success: true,
                data: {
                    current_threshold: currentThreshold,
                    recommended_threshold: currentThreshold,
                    expected_win_rate_change: 0,
                    expected_trade_count_change: 0,
                    confidence: 'low',
                    rationale: 'Insufficient trade history. Need at least 20 completed trades for reliable recommendations.',
                },
            };
        }

        // Find the optimal threshold based on actual performance
        const wellCalibratedBuckets = metrics.filter(
            m => Math.abs(m.calibration_error) <= 0.05 && m.trade_count >= 5
        );

        if (wellCalibratedBuckets.length === 0) {
            // All buckets have calibration issues
            const avgError = metrics.reduce(
                (sum, m) => sum + m.calibration_error * m.trade_count,
                0
            ) / totalTrades;

            const adjustedThreshold = Math.min(0.90, Math.max(0.50, currentThreshold - avgError));

            return {
                success: true,
                data: {
                    current_threshold: currentThreshold,
                    recommended_threshold: adjustedThreshold,
                    expected_win_rate_change: avgError,
                    expected_trade_count_change: avgError < 0 ? -10 : 10, // Rough estimate
                    confidence: 'medium',
                    rationale: `Calibration error of ${(avgError * 100).toFixed(1)}% suggests ${avgError < 0 ? 'raising' : 'lowering'} threshold.`,
                },
            };
        }

        // Find the lowest well-calibrated bucket
        wellCalibratedBuckets.sort((a, b) => a.predicted_probability_range.min - b.predicted_probability_range.min);
        const lowestGoodBucket = wellCalibratedBuckets[0];

        const recommendedThreshold = lowestGoodBucket.predicted_probability_range.min;

        // Estimate impact
        const tradesAboveRecommended = metrics
            .filter(m => m.predicted_probability_range.min >= recommendedThreshold)
            .reduce((sum, m) => sum + m.trade_count, 0);

        const tradesAboveCurrent = metrics
            .filter(m => m.predicted_probability_range.min >= currentThreshold)
            .reduce((sum, m) => sum + m.trade_count, 0);

        const tradeCountChange = ((tradesAboveRecommended - tradesAboveCurrent) / tradesAboveCurrent) * 100;

        // Calculate expected win rate at new threshold
        const aboveRecommendedBuckets = metrics.filter(
            m => m.predicted_probability_range.min >= recommendedThreshold
        );
        const expectedWinRate = aboveRecommendedBuckets.reduce(
            (sum, m) => sum + m.actual_win_rate * m.trade_count,
            0
        ) / tradesAboveRecommended;

        const aboveCurrentBuckets = metrics.filter(
            m => m.predicted_probability_range.min >= currentThreshold
        );
        const currentWinRate = aboveCurrentBuckets.length > 0
            ? aboveCurrentBuckets.reduce(
                (sum, m) => sum + m.actual_win_rate * m.trade_count,
                0
            ) / tradesAboveCurrent
            : 0.5;

        const winRateChange = expectedWinRate - currentWinRate;

        return {
            success: true,
            data: {
                current_threshold: currentThreshold,
                recommended_threshold: recommendedThreshold,
                expected_win_rate_change: winRateChange,
                expected_trade_count_change: tradeCountChange,
                confidence: totalTrades >= 50 ? 'high' : 'medium',
                rationale: `Based on ${totalTrades} trades, bucket ${lowestGoodBucket.bucket} shows reliable calibration with ${(lowestGoodBucket.actual_win_rate * 100).toFixed(0)}% actual win rate.`,
            },
        };
    } catch (error) {
        console.error('[Reconciliation] Threshold recommendation error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// RECONCILIATION SUMMARY
// ============================================

interface ReconciliationSummary {
    total_trades: number;
    matched_trades: number;
    match_rate: number;
    calibration: CalibrationMetrics[];
    drift: DriftDetection | null;
    threshold_recommendation: ThresholdRecommendation | null;
}

/**
 * Get full reconciliation summary
 */
export async function getReconciliationSummary(): Promise<{
    success: boolean;
    data?: ReconciliationSummary;
    error?: string;
}> {
    try {
        const [matchResult, calibrationResult, driftResult, thresholdResult] = await Promise.all([
            matchTradesToPredictions(),
            getCalibrationMetrics(),
            detectDrift(),
            getThresholdRecommendations(),
        ]);

        if (!matchResult.success) {
            return { success: false, error: matchResult.error };
        }

        const matched = matchResult.data || [];
        const matchedCount = matched.filter(m => m.matchConfidence !== 'none').length;

        return {
            success: true,
            data: {
                total_trades: matched.length,
                matched_trades: matchedCount,
                match_rate: matched.length > 0 ? matchedCount / matched.length : 0,
                calibration: calibrationResult.data || [],
                drift: driftResult.data || null,
                threshold_recommendation: thresholdResult.data || null,
            },
        };
    } catch (error) {
        console.error('[Reconciliation] Summary error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
