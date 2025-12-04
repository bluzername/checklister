/**
 * Backtest Types
 * Type definitions for backtesting, historical storage, and model training
 */

import { AnalysisResult, AnalysisParameters } from '../types';
import { MarketRegime } from '../market-regime/types';

// ============================================
// FEATURE VECTOR TYPES
// ============================================

/**
 * Flattened feature vector for ML model training
 * Extracted from AnalysisResult for consistent model input
 */
export interface FeatureVector {
  // Criterion scores (10 features)
  score_market_condition: number;
  score_sector_condition: number;
  score_company_condition: number;
  score_catalyst: number;
  score_patterns_gaps: number;
  score_support_resistance: number;
  score_price_movement: number;
  score_volume: number;
  score_ma_fibonacci: number;
  score_rsi: number;
  
  // Market context
  regime: number; // Encoded: BULL=2, CHOPPY=1, CRASH=0
  regime_confidence: number;
  vix_level: number;
  spy_above_50sma: number; // 1 or 0
  spy_above_200sma: number; // 1 or 0
  golden_cross: number; // 1 or 0
  
  // Technical indicators
  rsi_value: number;
  atr_percent: number;
  price_vs_200sma: number; // Percentage
  price_vs_50sma: number;
  price_vs_20ema: number;
  
  // Volume metrics
  rvol: number;
  obv_trend: number; // UP=1, FLAT=0, DOWN=-1
  cmf_value: number;
  
  // Sector
  sector_rs_20d: number;
  sector_rs_60d: number;
  
  // Support/Resistance
  rr_ratio: number;
  near_support: number; // 1 or 0
  
  // Multi-timeframe
  mtf_daily_score: number;
  mtf_4h_score: number;
  mtf_combined_score: number;
  mtf_alignment: number; // STRONG_BUY=3, BUY=2, CONSIDER=1, SKIP=0
  
  // Divergence
  divergence_type: number; // Encoded
  divergence_strength: number;
  
  // Pattern
  pattern_type: number; // Encoded: BREAKOUT=3, GAP_UP=2, BULL_FLAG=1, NONE=0
  gap_percent: number;
  bull_flag_detected: number; // 1 or 0
  hammer_detected: number; // 1 or 0
  
  // Trend
  higher_highs: number; // 1 or 0
  higher_lows: number; // 1 or 0
  trend_status: number; // UPTREND=2, CONSOLIDATION=1, DOWNTREND=0
}

// ============================================
// HISTORICAL STORAGE TYPES
// ============================================

/**
 * Analysis snapshot stored in database
 */
export interface AnalysisSnapshot {
  id?: string;
  ticker: string;
  analysis_date: string; // ISO date string (YYYY-MM-DD)
  analysis_result: AnalysisResult;
  feature_vector: FeatureVector;
  success_probability: number;
  regime: MarketRegime;
  trade_type: string;
  recommendation: string;
  current_price: number;
  rsi_value: number;
  atr_percent: number;
  rvol: number;
  model_version: string;
  created_at?: string;
}

/**
 * Trade outcome for model training
 */
export interface TradeOutcome {
  id?: string;
  snapshot_id: string;
  ticker: string;
  
  // Entry
  entry_date: string;
  entry_price: number;
  stop_loss: number;
  position_size_shares?: number;
  position_size_dollars?: number;
  
  // Exit
  exit_date?: string;
  exit_price?: number;
  exit_reason?: ExitReason;
  
  // Performance
  realized_r?: number;
  realized_pnl?: number;
  realized_pnl_percent?: number;
  holding_days?: number;
  
  // Excursion
  max_favorable_excursion?: number;
  max_adverse_excursion?: number;
  mfe_r?: number;
  mae_r?: number;
  
  // Label
  label?: 0 | 1;
  target_r_threshold: number;
  
  // Context
  regime_at_entry: MarketRegime;
  sector?: string;
  market_cap_bucket?: MarketCapBucket;
  
  // Metadata
  is_paper_trade: boolean;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export type ExitReason = 
  | 'TP1' 
  | 'TP2' 
  | 'TP3' 
  | 'STOP_LOSS' 
  | 'TIME_EXIT' 
  | 'MANUAL' 
  | 'SIGNAL_EXIT'
  | 'TRAILING_STOP';

export type MarketCapBucket = 'MEGA' | 'LARGE' | 'MID' | 'SMALL' | 'MICRO';

/**
 * Prediction log for calibration monitoring
 */
export interface PredictionLog {
  id?: string;
  ticker: string;
  prediction_date: string;
  predicted_probability: number;
  predicted_r?: number;
  confidence_rating: string;
  feature_vector: FeatureVector;
  regime: MarketRegime;
  model_version: string;
  actual_outcome?: 0 | 1;
  actual_r?: number;
  outcome_date?: string;
  created_at?: string;
}

// ============================================
// UNIVERSE TYPES
// ============================================

/**
 * Universe filter configuration
 */
export interface UniverseFilter {
  minAvgDollarVolume: number; // Minimum average daily dollar volume (e.g., 5000000 for $5M)
  minPrice: number; // Minimum stock price (e.g., 5)
  maxPrice: number; // Maximum stock price (e.g., 500)
  minMarketCap: number; // Minimum market cap in billions (e.g., 1 for $1B)
  maxMarketCap?: number; // Optional maximum market cap
  excludeSectors?: string[]; // Sectors to exclude
  excludeTickers?: string[]; // Specific tickers to exclude
  includeOnlyTickers?: string[]; // If set, only include these tickers
  excludeADRs?: boolean; // Exclude ADRs
  excludeETFs?: boolean; // Exclude ETFs
  requireOptions?: boolean; // Only stocks with options
}

/**
 * Universe definition stored in database
 */
export interface UniverseDefinition {
  id?: string;
  name: string;
  description?: string;
  filters: UniverseFilter;
  tickers?: string[];
  ticker_count?: number;
  last_refresh?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================
// BACKTEST CONFIGURATION TYPES
// ============================================

/**
 * Backtest configuration
 */
export interface BacktestConfig {
  name: string;
  description?: string;
  
  // Universe
  universe: string[] | UniverseFilter;
  universeId?: string;
  
  // Time range
  startDate: string; // YYYY-MM-DD
  endDate: string;
  
  // Capital and risk
  initialCapital: number;
  riskPerTrade: number; // As decimal (e.g., 0.01 for 1%)
  maxTotalRisk: number; // Maximum total portfolio risk
  maxOpenPositions: number;
  maxPerSector?: number; // Max positions per sector
  
  // Entry criteria
  entryThreshold: number; // Min probability to enter (e.g., 60)
  minRRRatio: number; // Minimum R:R ratio
  requireVolumeConfirm?: boolean;
  requireMTFAlign?: boolean;
  
  // Exit rules
  tpRatios: [number, number, number]; // TP1, TP2, TP3 as R multiples
  tpSizes: [number, number, number]; // Percentage to sell at each TP
  maxHoldingDays?: number; // Force exit after N days
  useTrailingStop?: boolean;
  trailingStopActivation?: number; // R multiple to activate trailing
  trailingStopDistance?: number; // ATR multiple or percentage
  
  // Execution model
  slippagePercent: number; // e.g., 0.1 for 0.1%
  commissionPerShare: number; // e.g., 0.005
  gapHandling: 'SKIP' | 'MARKET' | 'LIMIT'; // What to do if price gaps
  
  // Regime adjustments
  adjustForRegime: boolean;
  regimeOverrides?: Partial<Record<MarketRegime, Partial<BacktestConfig>>>;
}

/**
 * Individual trade in backtest
 */
export interface BacktestTrade {
  tradeId: string;
  ticker: string;
  
  // Entry
  signalDate: string;
  entryDate: string;
  entryPrice: number;
  entryProbability: number;
  shares: number;
  positionValue: number;
  stopLoss: number;
  
  // Targets
  tp1: number;
  tp2: number;
  tp3: number;
  
  // Exit
  exitDate?: string;
  exitPrice?: number;
  exitReason?: ExitReason;
  
  // Performance
  realizedR?: number;
  realizedPnl?: number;
  realizedPnlPercent?: number;
  holdingDays?: number;
  
  // Excursion
  mfe?: number;
  mae?: number;
  mfeR?: number;
  maeR?: number;
  
  // Partial exits
  partialExits?: {
    date: string;
    price: number;
    shares: number;
    reason: string;
    pnl: number;
  }[];
  
  // Context
  regime: MarketRegime;
  sector?: string;
  
  // Status
  status: 'OPEN' | 'CLOSED';
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  
  totalPnl: number;
  totalPnlPercent: number;
  avgPnlPerTrade: number;
  avgWin: number;
  avgLoss: number;
  
  avgR: number;
  avgWinR: number;
  avgLossR: number;
  expectancy: number; // winRate * avgWin - lossRate * avgLoss
  
  profitFactor: number; // Gross profit / Gross loss
  
  maxDrawdown: number;
  maxDrawdownPercent: number;
  maxDrawdownDuration: number; // Days
  
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number; // CAGR / MaxDD
  
  avgHoldingDays: number;
  
  // R distribution
  rDistribution: {
    bucket: string; // e.g., "-2R to -1R"
    count: number;
    percent: number;
  }[];
}

/**
 * Equity curve point
 */
export interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
  drawdownPercent: number;
  openPositions: number;
  dailyPnl: number;
  dailyReturn: number;
}

/**
 * Backtest result
 */
export interface BacktestResult {
  id?: string;
  config: BacktestConfig;
  
  // Summary metrics
  metrics: PerformanceMetrics;
  
  // Equity curve
  equityCurve: EquityPoint[];
  
  // All trades
  trades: BacktestTrade[];
  
  // Performance breakdowns
  performanceByRegime: Record<MarketRegime, PerformanceMetrics>;
  performanceBySector: Record<string, PerformanceMetrics>;
  performanceByMonth: Record<string, PerformanceMetrics>;
  performanceByYear: Record<string, PerformanceMetrics>;
  
  // Calibration data
  calibrationByBucket: {
    bucket: string; // e.g., "60-70%"
    predictedAvg: number;
    actualWinRate: number;
    count: number;
  }[];
  
  // Metadata
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
}

// ============================================
// WALK-FORWARD TYPES
// ============================================

/**
 * Walk-forward period
 */
export interface WalkForwardPeriod {
  name: string;
  type: 'TRAIN' | 'VALIDATE' | 'TEST';
  startDate: string;
  endDate: string;
}

/**
 * Walk-forward configuration
 */
export interface WalkForwardConfig {
  periods: WalkForwardPeriod[];
  parameterRanges: {
    entryThreshold: number[];
    minRRRatio: number[];
    maxHoldingDays: number[];
    // Add more tunable parameters
  };
  optimizationMetric: 'sharpe' | 'sortino' | 'profitFactor' | 'expectancy';
}

/**
 * Walk-forward result
 */
export interface WalkForwardResult {
  config: WalkForwardConfig;
  periods: {
    period: WalkForwardPeriod;
    result: BacktestResult;
    bestParams?: Partial<BacktestConfig>;
  }[];
  optimalParams: Partial<BacktestConfig>;
  outOfSampleMetrics: PerformanceMetrics;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Encode regime to number for ML
 */
export function encodeRegime(regime: MarketRegime): number {
  switch (regime) {
    case 'BULL': return 2;
    case 'CHOPPY': return 1;
    case 'CRASH': return 0;
    default: return 1;
  }
}

/**
 * Encode MTF alignment to number
 */
export function encodeMTFAlignment(alignment: string): number {
  switch (alignment) {
    case 'STRONG_BUY': return 3;
    case 'BUY': return 2;
    case 'CONSIDER': return 1;
    case 'SKIP': return 0;
    default: return 0;
  }
}

/**
 * Encode pattern type to number
 */
export function encodePatternType(pattern: string): number {
  switch (pattern) {
    case 'BREAKOUT': return 3;
    case 'GAP_UP': return 2;
    case 'BULL_FLAG': return 1;
    case 'NONE': return 0;
    default: return 0;
  }
}

/**
 * Encode trend status to number
 */
export function encodeTrendStatus(trend: string): number {
  switch (trend) {
    case 'UPTREND': return 2;
    case 'CONSOLIDATION': return 1;
    case 'DOWNTREND': return 0;
    default: return 1;
  }
}

/**
 * Encode OBV trend to number
 */
export function encodeOBVTrend(trend: string): number {
  switch (trend) {
    case 'UP': return 1;
    case 'FLAT': return 0;
    case 'DOWN': return -1;
    default: return 0;
  }
}

/**
 * Encode divergence type to number
 */
export function encodeDivergenceType(type: string): number {
  switch (type) {
    case 'REGULAR_BULLISH': return 2;
    case 'HIDDEN_BULLISH': return 1;
    case 'NONE': return 0;
    case 'HIDDEN_BEARISH': return -1;
    case 'REGULAR_BEARISH': return -2;
    default: return 0;
  }
}

/**
 * Get market cap bucket from market cap value
 */
export function getMarketCapBucket(marketCapBillions: number): MarketCapBucket {
  if (marketCapBillions >= 200) return 'MEGA';
  if (marketCapBillions >= 10) return 'LARGE';
  if (marketCapBillions >= 2) return 'MID';
  if (marketCapBillions >= 0.3) return 'SMALL';
  return 'MICRO';
}

/**
 * Extract feature vector from AnalysisResult
 */
export function extractFeatureVector(result: AnalysisResult): FeatureVector {
  const params = result.parameters;
  
  return {
    // Criterion scores
    score_market_condition: params['1_market_condition'].score,
    score_sector_condition: params['2_sector_condition'].score,
    score_company_condition: params['3_company_condition'].score,
    score_catalyst: params['4_catalyst'].score,
    score_patterns_gaps: params['5_patterns_gaps'].score,
    score_support_resistance: params['6_support_resistance'].score,
    score_price_movement: params['7_price_movement'].score,
    score_volume: params['8_volume'].score,
    score_ma_fibonacci: params['9_ma_fibonacci'].score,
    score_rsi: params['10_rsi'].score,
    
    // Market context
    regime: result.market_regime ? encodeRegime(result.market_regime.regime) : 1,
    regime_confidence: result.market_regime?.confidence ?? 50,
    vix_level: params['1_market_condition'].vix_level ?? 20,
    spy_above_50sma: params['1_market_condition'].spx_price > params['1_market_condition'].spx_sma50 ? 1 : 0,
    spy_above_200sma: params['1_market_condition'].spx_price > params['1_market_condition'].spx_sma200 ? 1 : 0,
    golden_cross: params['1_market_condition'].golden_cross ? 1 : 0,
    
    // Technical indicators
    rsi_value: params['10_rsi'].value,
    atr_percent: (params['6_support_resistance'].atr / result.current_price) * 100,
    price_vs_200sma: params['9_ma_fibonacci'].ma_200 > 0 
      ? ((result.current_price - params['9_ma_fibonacci'].ma_200) / params['9_ma_fibonacci'].ma_200) * 100 
      : 0,
    price_vs_50sma: params['9_ma_fibonacci'].ma_50 > 0
      ? ((result.current_price - params['9_ma_fibonacci'].ma_50) / params['9_ma_fibonacci'].ma_50) * 100
      : 0,
    price_vs_20ema: params['9_ma_fibonacci'].ema_20 > 0
      ? ((result.current_price - params['9_ma_fibonacci'].ema_20) / params['9_ma_fibonacci'].ema_20) * 100
      : 0,
    
    // Volume metrics
    rvol: params['4_catalyst'].rvol,
    obv_trend: result.volume_profile?.obv_trending ? 1 : (result.volume_profile?.obv_value ?? 0) < 0 ? -1 : 0,
    cmf_value: result.volume_profile?.cmf_value ?? 0,
    
    // Sector
    sector_rs_20d: params['2_sector_condition'].rs_score_20d,
    sector_rs_60d: params['2_sector_condition'].rs_score_60d,
    
    // Support/Resistance
    rr_ratio: params['6_support_resistance'].risk_reward_ratio,
    near_support: (params['6_support_resistance'].near_ema20 || params['6_support_resistance'].near_ema50) ? 1 : 0,
    
    // Multi-timeframe
    mtf_daily_score: result.multi_timeframe?.daily_score ?? 5,
    mtf_4h_score: result.multi_timeframe?.hour4_score ?? 5,
    mtf_combined_score: result.multi_timeframe?.combined_score ?? 5,
    mtf_alignment: encodeMTFAlignment(result.multi_timeframe?.alignment ?? 'SKIP'),
    
    // Divergence
    divergence_type: encodeDivergenceType(result.divergence?.type ?? 'NONE'),
    divergence_strength: result.divergence?.strength ?? 0,
    
    // Pattern
    pattern_type: encodePatternType(params['5_patterns_gaps'].pattern as string),
    gap_percent: params['5_patterns_gaps'].gap_percent,
    bull_flag_detected: params['5_patterns_gaps'].bull_flag_detected ? 1 : 0,
    hammer_detected: params['7_price_movement'].hammer_detected ? 1 : 0,
    
    // Trend
    higher_highs: params['7_price_movement'].recent_higher_highs ? 1 : 0,
    higher_lows: params['7_price_movement'].recent_higher_lows ? 1 : 0,
    trend_status: encodeTrendStatus(params['7_price_movement'].trend),
  };
}




