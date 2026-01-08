'use server';

/**
 * Benchmarking Server Actions
 * Server-side data fetching for benchmarking dashboard
 */

import {
    getTradeSummaryStats as getStats,
    getPeriodicStats as getPeriodStats,
    getAttributionByDimension,
} from '@/lib/benchmarking/attribution';
import { getTrades as fetchTrades } from '@/lib/benchmarking/trade-lifecycle';
import { getAllDistributions } from '@/lib/benchmarking/distributions';
import { getEquityCurve, getDrawdownPeriods, getBenchmarkComparison } from '@/lib/benchmarking/benchmarks';
import {
    runCounterfactual as runCF,
    findOptimalExit as findOptimal,
    runAllPresetScenarios as runPresets,
    compareScenarios as compareSC,
} from '@/lib/benchmarking/counterfactual';
import {
    TradeSummaryStats,
    AttributionDimension,
    CompletedTrade,
    TradeStatus,
    DistributionData,
    CounterfactualScenario,
    CounterfactualResult,
    OptimalExitResult,
} from '@/lib/benchmarking/types';

// Re-export functions as server actions

export async function getTradeSummaryStats(filters?: {
    dateRange?: { start: string; end: string };
    status?: string[];
    tickers?: string[];
    tags?: string[];
}): Promise<{ success: boolean; data?: TradeSummaryStats; error?: string }> {
    return getStats(filters);
}

export async function getPeriodicStats(
    periodType: 'month' | 'quarter' | 'year'
): Promise<{ success: boolean; data?: Array<{ period: string; stats: TradeSummaryStats }>; error?: string }> {
    return getPeriodStats(periodType);
}

export async function getAttribution(
    dimension: AttributionDimension,
    filters?: {
        dateRange?: { start: string; end: string };
        status?: string[];
    }
) {
    return getAttributionByDimension(dimension, filters);
}

export async function getTrades(filters?: {
    status?: TradeStatus[];
    tickers?: string[];
    limit?: number;
}): Promise<{ success: boolean; data?: CompletedTrade[]; error?: string }> {
    return fetchTrades(filters);
}

export async function getDistributions(filters?: {
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
    return getAllDistributions(filters);
}

export async function getEquityCurveData(filters?: {
    dateRange?: { start: string; end: string };
}) {
    return getEquityCurve(filters);
}

export async function getDrawdowns(filters?: {
    dateRange?: { start: string; end: string };
}) {
    return getDrawdownPeriods(filters);
}

export async function getBenchmarks(dateRange: { start: string; end: string }) {
    return getBenchmarkComparison(dateRange);
}

// Counterfactual analysis

export async function runCounterfactual(
    tradeId: string,
    scenario: CounterfactualScenario
): Promise<{ success: boolean; data?: CounterfactualResult; error?: string }> {
    return runCF(tradeId, scenario);
}

export async function findOptimalExit(
    tradeId: string
): Promise<{ success: boolean; data?: OptimalExitResult; error?: string }> {
    return findOptimal(tradeId);
}

export async function runAllPresetScenarios(
    tradeId: string
): Promise<{ success: boolean; data?: CounterfactualResult[]; bestScenario?: CounterfactualResult; error?: string }> {
    return runPresets(tradeId);
}

export async function compareScenarios(
    tradeId: string,
    scenarios: CounterfactualScenario[]
): Promise<{ success: boolean; data?: CounterfactualResult[]; error?: string }> {
    return compareSC(tradeId, scenarios);
}
