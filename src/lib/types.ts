export type TradeType = 'SWING_LONG' | 'SWING_SHORT' | 'HOLD' | 'AVOID';
export type MarketStatus = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type FundamentalStatus = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type TrendStatus = 'UPTREND' | 'DOWNTREND' | 'CONSOLIDATION';
export type MomentumStatus = 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';

export interface ParameterScore {
  score: number;
  rationale: string;
}

export interface MarketCondition extends ParameterScore {
  status: MarketStatus;
  spx_trend: string;
}

export interface SectorCondition extends ParameterScore {
  sector: string;
  status: string;
}

export interface CompanyCondition extends ParameterScore {
  status: FundamentalStatus;
  earnings_status: string;
  guidance: string;
}

export interface Catalyst extends ParameterScore {
  present: boolean;
  catalyst_type: string;
  strength: string;
  timeframe: string;
}

export interface PatternsGaps extends ParameterScore {
  pattern: string;
  gap_status: string;
}

export interface SupportResistance extends ParameterScore {
  support_zones: number[];
  resistance_zones: number[];
}

export interface PriceMovement extends ParameterScore {
  trend: TrendStatus;
  recent_higher_lows: boolean;
  recent_higher_highs: boolean;
}

export interface Volume extends ParameterScore {
  status: string;
  volume_trend: string;
}

export interface MAFibonacci extends ParameterScore {
  ma_20: number;
  ma_50: number;
  ma_100: number;
  ma_200: number;
  ema_8: number;
  alignment: string;
  fib_level_current: string;
}

export interface RSI extends ParameterScore {
  value: number;
  status: MomentumStatus;
}

export interface AnalysisParameters {
  "1_market_condition": MarketCondition;
  "2_sector_condition": SectorCondition;
  "3_company_condition": CompanyCondition;
  "4_catalyst": Catalyst;
  "5_patterns_gaps": PatternsGaps;
  "6_support_resistance": SupportResistance;
  "7_price_movement": PriceMovement;
  "8_volume": Volume;
  "9_ma_fibonacci": MAFibonacci;
  "10_rsi": RSI;
}

export interface TakeProfitLevel {
  batch: number;
  quantity_percent: number;
  target_price: number;
  rationale: string;
}

export interface TradingPlan {
  signal: string;
  entry: {
    method: string;
    primary_price: number;
    secondary_price?: number;
    rationale: string;
  };
  stop_loss: {
    price: number;
    rationale: string;
    position_above_sl_percentage: number;
  };
  risk_reward_ratio: string; // e.g. "1.0 / 2.2"
  take_profit_levels: TakeProfitLevel[];
  total_tp_average: number;
  profit_if_hits_average_tp: number;
  profit_percentage: number;
}

export interface RiskAnalysis {
  downside_risk: string;
  risk_per_unit: number;
  max_loss_percentage: number;
  volatility_assessment: string;
  key_risk_factors: string[];
}

export interface QualitativeAssessment {
  setup_quality: string;
  setup_description: string;
  follow_through_probability: string;
  next_catalyst: string;
  monitoring_points: string[];
}

export interface AnalysisResult {
  ticker: string;
  timestamp: string;
  current_price: number;
  timeframe: string;
  trade_type: TradeType;
  parameters: AnalysisParameters;
  success_probability: number;
  confidence_rating: string;
  recommendation: string;
  trading_plan: TradingPlan;
  risk_analysis: RiskAnalysis;
  qualitative_assessment: QualitativeAssessment;
  disclaimers: string[];
  chart_data: {
    date: string;
    price: number;
    sma20?: number;
    sma50?: number;
    ema8?: number;
  }[];
}

// Portfolio & Watchlist Types
export type PortfolioAction = 
  | 'HOLD'
  | 'SELL_PARTIAL'
  | 'SELL_ALL'
  | 'ADD_MORE'
  | 'STOP_LOSS_HIT';

export interface PortfolioPosition {
  id: string;
  user_id: string;
  ticker: string;
  buy_price: number;
  quantity: number;
  date_added: string;
  notes?: string;
  // Computed fields (not stored in DB)
  current_price?: number;
  action?: PortfolioAction;
  profit_loss?: number;
  profit_loss_percent?: number;
  analysis?: AnalysisResult;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  ticker: string;
  date_added: string;
  notes?: string;
  // Computed fields
  current_price?: number;
  score?: number;
  is_good_entry?: boolean;
  analysis?: AnalysisResult;
}
