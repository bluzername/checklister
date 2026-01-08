'use server';

/**
 * Calibration Server Actions
 * Server-side wrappers for reconciliation and calibration functions
 */

import {
    getCalibrationMetrics as getMetrics,
    detectDrift as detectDriftFn,
    getThresholdRecommendations as getRecommendations,
    getReconciliationSummary as getSummary,
    matchTradesToPredictions as matchTrades,
} from '@/lib/benchmarking/reconciliation';
import { CalibrationMetrics, DriftDetection } from '@/lib/benchmarking/types';

interface ThresholdRecommendation {
    current_threshold: number;
    recommended_threshold: number;
    expected_win_rate_change: number;
    expected_trade_count_change: number;
    confidence: 'high' | 'medium' | 'low';
    rationale: string;
}

interface ReconciliationSummary {
    total_trades: number;
    matched_trades: number;
    match_rate: number;
    calibration: CalibrationMetrics[];
    drift: DriftDetection | null;
    threshold_recommendation: ThresholdRecommendation | null;
}

export async function getCalibrationMetrics(
    dateRange?: { start: string; end: string }
): Promise<{ success: boolean; data?: CalibrationMetrics[]; error?: string }> {
    return getMetrics(dateRange);
}

export async function detectDrift(
    recentDays?: number
): Promise<{ success: boolean; data?: DriftDetection; error?: string }> {
    return detectDriftFn(recentDays);
}

export async function getThresholdRecommendations(
    currentThreshold?: number
): Promise<{ success: boolean; data?: ThresholdRecommendation; error?: string }> {
    return getRecommendations(currentThreshold);
}

export async function getReconciliationSummary(): Promise<{
    success: boolean;
    data?: ReconciliationSummary;
    error?: string;
}> {
    return getSummary();
}

export async function matchTradesToPredictions(
    dateRange?: { start: string; end: string }
) {
    return matchTrades(dateRange);
}
