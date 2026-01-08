/**
 * Benchmarking System Types
 * Types for trade tracking, journaling, analysis, and performance measurement
 */

import { FeatureVector, ExitReason } from '../backtest/types';
import { AnalysisResult } from '../types';

// ============================================
// TRADE TYPES
// ============================================

export type TradeType = 'SWING_LONG' | 'SWING_SHORT' | 'DAY_TRADE';
export type TradeStatus = 'OPEN' | 'PARTIALLY_CLOSED' | 'CLOSED';

/**
 * Complete trade record with full lifecycle data
 */
export interface CompletedTrade {
    id: string;
    user_id: string;
    portfolio_id?: string;

    // Trade Identity
    ticker: string;
    trade_type: TradeType;

    // Entry Details
    entry_date: string;
    entry_price: number;
    entry_shares: number;
    entry_value: number;

    // Entry Context (snapshot at entry time)
    entry_probability?: number;
    entry_regime?: string;
    entry_sector?: string;
    entry_rr_ratio?: number;
    entry_stop_loss?: number;
    entry_tp1?: number;
    entry_tp2?: number;
    entry_tp3?: number;
    entry_feature_vector?: Partial<FeatureVector>;
    entry_notes?: string;
    entry_analysis_id?: string;

    // Exit Details
    exit_date?: string;
    final_exit_price?: number;
    remaining_shares: number;
    status: TradeStatus;
    partial_exits: PartialExit[];
    exit_reason?: ExitReason | string;
    exit_notes?: string;

    // Performance Metrics (calculated when trade closes)
    total_realized_pnl?: number;
    total_realized_pnl_percent?: number;
    blended_exit_price?: number;
    realized_r?: number;
    holding_days?: number;

    // Excursion Tracking
    mfe?: number;
    mae?: number;
    mfe_r?: number;
    mae_r?: number;
    mfe_date?: string;
    mae_date?: string;

    // Attribution
    tags?: string[];
    is_paper_trade: boolean;
    backtest_trade_id?: string;

    // Metadata
    created_at?: string;
    updated_at?: string;
}

/**
 * Individual partial exit record
 */
export interface PartialExit {
    date: string;
    price: number;
    shares: number;
    reason: ExitReason | string;
    pnl: number;
    pnl_percent?: number;
    r_multiple?: number;
}

/**
 * Data required to create a new trade
 */
export interface CreateTradeInput {
    portfolio_id?: string;
    ticker: string;
    trade_type?: TradeType;
    entry_date: string;
    entry_price: number;
    entry_shares: number;
    entry_stop_loss?: number;
    entry_tp1?: number;
    entry_tp2?: number;
    entry_tp3?: number;
    entry_notes?: string;
    tags?: string[];
    is_paper_trade?: boolean;
    analysis?: AnalysisResult;
}

/**
 * Data for recording a partial exit
 */
export interface RecordExitInput {
    trade_id: string;
    date: string;
    price: number;
    shares: number;
    reason: ExitReason | string;
    notes?: string;
}

// ============================================
// JOURNAL TYPES
// ============================================

export type JournalEntryType =
    | 'ENTRY_THESIS'     // Why you took the trade
    | 'EXIT_REVIEW'      // Post-exit reflection
    | 'MID_TRADE_NOTE'   // Notes while in position
    | 'LESSON_LEARNED';  // Key takeaways

/**
 * Trade journal entry
 */
export interface TradeJournalEntry {
    id: string;
    trade_id: string;
    user_id: string;
    entry_type: JournalEntryType;
    entry_date: string;
    content: string;
    what_went_well?: string;
    what_went_wrong?: string;
    lesson_learned?: string;
    would_take_again?: boolean;
    confidence_before?: number; // 1-10
    confidence_after?: number;  // 1-10
    chart_screenshot_url?: string;
    created_at?: string;
}

/**
 * Input for creating a journal entry
 */
export interface CreateJournalEntryInput {
    trade_id: string;
    entry_type: JournalEntryType;
    entry_date?: string; // Defaults to today
    content: string;
    what_went_well?: string;
    what_went_wrong?: string;
    lesson_learned?: string;
    would_take_again?: boolean;
    confidence_before?: number;
    confidence_after?: number;
    chart_screenshot_url?: string;
}

// ============================================
// PRICE HISTORY TYPES
// ============================================

/**
 * Daily price point for a trade
 */
export interface TradePricePoint {
    id?: string;
    trade_id: string;
    price_date: string;
    open_price: number;
    high_price: number;
    low_price: number;
    close_price: number;
    volume: number;
    unrealized_pnl: number;
    unrealized_pnl_percent: number;
    unrealized_r: number;
}

// ============================================
// COUNTERFACTUAL ANALYSIS TYPES
// ============================================

/**
 * A what-if scenario to test against a trade
 */
export interface CounterfactualScenario {
    name: string;
    description?: string;
    stop_loss?: number;           // Override stop loss
    tp1?: number;                 // Override TP1
    tp2?: number;                 // Override TP2
    tp3?: number;                 // Override TP3
    max_holding_days?: number;    // Force exit after N days
    trailing_stop_percent?: number; // Use trailing stop instead
    trailing_stop_activation?: number; // Activate trailing after N% gain
}

/**
 * Result of running a counterfactual scenario
 */
export interface CounterfactualResult {
    scenario: CounterfactualScenario;
    exit_date: string;
    exit_price: number;
    exit_reason: string;
    realized_pnl: number;
    realized_pnl_percent: number;
    realized_r: number;
    holding_days: number;
    improvement_vs_actual: number; // Positive = better than actual, negative = worse
    improvement_r_vs_actual: number;
}

/**
 * Optimal exit analysis result
 */
export interface OptimalExitResult {
    optimal_exit_date: string;
    optimal_exit_price: number;
    max_possible_pnl: number;
    max_possible_pnl_percent: number;
    max_possible_r: number;
    mfe_capture_percent: number; // How much of MFE was captured
    actual_vs_optimal_gap: number; // Difference in R
}

// ============================================
// ATTRIBUTION TYPES
// ============================================

export type AttributionDimension =
    | 'regime'          // BULL, CHOPPY, CRASH
    | 'sector'          // Technology, Healthcare, etc.
    | 'entry_quality'   // Probability buckets
    | 'exit_quality'    // MFE utilization
    | 'timing'          // Day of week, month
    | 'holding_period'  // Duration buckets
    | 'position_size'   // Size buckets
    | 'r_target_hit'    // Which TP was hit
    | 'tags';           // User-defined tags

/**
 * Performance breakdown by a single dimension
 */
export interface AttributionBreakdown {
    dimension: AttributionDimension;
    buckets: AttributionBucket[];
    total_trades: number;
    total_pnl: number;
}

/**
 * Single bucket in an attribution breakdown
 */
export interface AttributionBucket {
    name: string;
    trade_count: number;
    win_count: number;
    loss_count: number;
    win_rate: number;
    avg_r: number;
    total_pnl: number;
    avg_pnl: number;
    contribution_percent: number; // % of total P/L from this bucket
    avg_holding_days?: number;
}

// ============================================
// DISTRIBUTION TYPES
// ============================================

/**
 * Statistical distribution data
 */
export interface DistributionData {
    buckets: DistributionBucket[];
    count: number;
    mean: number;
    median: number;
    std_dev: number;
    skewness: number;
    min: number;
    max: number;
    percentiles: {
        p5: number;
        p10: number;
        p25: number;
        p50: number;
        p75: number;
        p90: number;
        p95: number;
    };
}

/**
 * Single bucket in a distribution
 */
export interface DistributionBucket {
    label: string;
    range_start: number;
    range_end: number;
    count: number;
    percent: number;
}

// ============================================
// BENCHMARK COMPARISON TYPES
// ============================================

/**
 * Performance metrics for comparison
 */
export interface PerformanceSnapshot {
    total_return: number;
    total_return_percent: number;
    sharpe_ratio?: number;
    sortino_ratio?: number;
    max_drawdown_percent: number;
    win_rate: number;
    profit_factor?: number;
    avg_r: number;
    trade_count: number;
}

/**
 * Comparison of actual vs benchmark performance
 */
export interface BenchmarkComparison {
    period: {
        start: string;
        end: string;
        trading_days: number;
    };

    actual: PerformanceSnapshot;

    benchmarks: {
        buy_and_hold_spy?: PerformanceSnapshot;
        backtest_predictions?: PerformanceSnapshot;
        random_baseline?: PerformanceSnapshot;
    };

    alpha?: number; // Return above SPY
    information_ratio?: number;
    correlation_to_spy?: number;
}

// ============================================
// SUMMARY STATS TYPES
// ============================================

/**
 * Aggregated statistics for a set of trades
 */
export interface TradeSummaryStats {
    total_trades: number;
    open_trades: number;
    closed_trades: number;
    winning_trades: number;
    losing_trades: number;
    win_rate: number;

    total_pnl: number;
    avg_pnl: number;
    avg_win: number;
    avg_loss: number;

    avg_r: number;
    best_r: number;
    worst_r: number;

    profit_factor?: number;
    expectancy?: number; // avg_win * win_rate - avg_loss * (1 - win_rate)

    avg_holding_days: number;
    max_holding_days: number;
    min_holding_days: number;

    // Excursion stats
    avg_mfe_capture: number; // How much of MFE was captured on average
    avg_mae_experienced: number; // How much drawdown was experienced

    // By status breakdown
    by_status: {
        open: number;
        partially_closed: number;
        closed: number;
    };
}

/**
 * Stats grouped by time period
 */
export interface PeriodStats {
    period: string; // e.g., "2024-01", "2024-Q1", "2024"
    period_type: 'day' | 'week' | 'month' | 'quarter' | 'year';
    stats: TradeSummaryStats;
}

// ============================================
// FILTER & QUERY TYPES
// ============================================

/**
 * Filters for querying trades
 */
export interface TradeFilters {
    status?: TradeStatus[];
    tickers?: string[];
    regimes?: string[];
    sectors?: string[];
    tags?: string[];
    date_range?: {
        start: string;
        end: string;
    };
    pnl_range?: {
        min?: number;
        max?: number;
    };
    r_range?: {
        min?: number;
        max?: number;
    };
    is_paper_trade?: boolean;
}

/**
 * Sort options for trade queries
 */
export interface TradeSort {
    field: 'entry_date' | 'exit_date' | 'ticker' | 'total_realized_pnl' | 'realized_r' | 'holding_days';
    direction: 'asc' | 'desc';
}

// ============================================
// LEARNING LOOP TYPES
// ============================================

/**
 * Calibration metrics for model performance
 */
export interface CalibrationMetrics {
    bucket: string; // e.g., "50-60%", "60-70%"
    predicted_probability_range: { min: number; max: number };
    trade_count: number;
    actual_win_rate: number;
    expected_win_rate: number; // Midpoint of range
    calibration_error: number; // actual - expected
    is_overconfident: boolean;
    is_underconfident: boolean;
}

/**
 * Model drift detection result
 */
export interface DriftDetection {
    period: string;
    overall_calibration_error: number;
    max_bucket_error: number;
    brier_score: number;
    has_significant_drift: boolean;
    recommendation: string;
}
