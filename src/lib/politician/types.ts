/**
 * Politician Trading Module - TypeScript Types
 */

// ============================================
// Signal Types
// ============================================

export type TransactionType = 'BUY' | 'SELL';
export type SignalStrength = 'STRONG' | 'MODERATE' | 'WEAK';
export type SignalSource = 'MANUAL' | 'DISCORD_BOT' | 'QUIVER_API' | 'WEBHOOK';

export interface PoliticianSignal {
  id: string;
  user_id: string;
  ticker: string;
  signal_date: string; // ISO date string
  politician_name: string | null;
  transaction_type: TransactionType;
  amount_range: string | null;
  source: SignalSource;
  raw_message: string | null;
  strength: SignalStrength | null;
  created_at: string;
  processed: boolean;
}

export interface NewSignalInput {
  ticker: string;
  signal_date: string;
  politician_name?: string;
  transaction_type: TransactionType;
  amount_range?: string;
  source?: SignalSource;
  raw_message?: string;
  strength?: SignalStrength;
}

// ============================================
// Position Types
// ============================================

export type PositionStatus = 'OPEN' | 'CLOSED' | 'PARTIAL';
export type ExitReason = 'SIGNAL_EXIT' | 'STOP_LOSS' | 'TIME_EXIT' | 'MANUAL' | 'PARTIAL';

export interface PoliticianPosition {
  id: string;
  user_id: string;
  signal_id: string | null;
  ticker: string;
  entry_date: string;
  entry_price: number;
  shares: number;
  stop_loss: number | null;
  initial_risk: number | null;
  status: PositionStatus;

  // Exit tracking
  exit_date: string | null;
  exit_price: number | null;
  exit_reason: ExitReason | null;
  realized_pnl: number | null;
  realized_r: number | null;

  // Daily tracking
  current_price: number | null;
  unrealized_pnl: number | null;
  unrealized_r: number | null;
  holding_days: number;
  high_water_mark: number | null;

  created_at: string;
  updated_at: string;
}

export interface PositionWithExitSignal extends PoliticianPosition {
  exit_probability: number | null;
  confidence: ExitConfidence | null;
  should_exit: boolean | null;
  exit_reasons: string[] | null;
  last_evaluation_date: string | null;
}

export interface OpenPositionInput {
  signal_id?: string;
  ticker: string;
  entry_date: string;
  entry_price: number;
  shares: number;
  stop_loss?: number;
}

export interface ClosePositionInput {
  exit_price: number;
  exit_reason: ExitReason;
  exit_date?: string;
  notes?: string;
}

// ============================================
// Exit Evaluation Types
// ============================================

export type ExitConfidence = 'low' | 'medium' | 'high' | 'very_high';

export interface ExitEvaluation {
  id: string;
  position_id: string;
  evaluation_date: string;
  exit_probability: number;
  confidence: ExitConfidence;
  should_exit: boolean;
  reasons: string[];
  features: ExitFeatureSnapshot;
  created_at: string;
}

export interface ExitFeatureSnapshot {
  holding_days: number;
  unrealized_r: number;
  unrealized_pct: number;
  return_from_entry: number;
  return_from_high: number;
  return_last_5d: number;
  return_last_3d: number;
  return_last_1d: number;
  atr_percent: number;
  daily_range_percent: number;
  rsi_14: number;
  price_vs_20sma: number;
  price_vs_50sma: number;
  volume_vs_avg: number;
  spy_return_5d: number;
  spy_return_10d: number;
  day_of_week: number;
  is_month_end: number;
  in_profit: number;
  above_1r: number;
  above_15r: number;
  above_2r: number;
}

// ============================================
// Trade Log Types
// ============================================

export type TradeEventType =
  | 'SIGNAL_RECEIVED'
  | 'SIGNAL_SKIPPED'
  | 'POSITION_OPENED'
  | 'PRICE_UPDATE'
  | 'EXIT_RECOMMENDED'
  | 'EXIT_IGNORED'
  | 'POSITION_CLOSED';

export interface TradeLogEntry {
  id: string;
  user_id: string;
  position_id: string | null;
  signal_id: string | null;
  event_type: TradeEventType;
  event_date: string;
  event_data: Record<string, unknown>;
  notes: string | null;
}

export interface LogEventInput {
  position_id?: string;
  signal_id?: string;
  event_type: TradeEventType;
  event_data: Record<string, unknown>;
  notes?: string;
}

// Event-specific data types
export interface SignalReceivedEventData {
  ticker: string;
  politician_name: string | null;
  transaction_type: TransactionType;
  amount_range: string | null;
  source: SignalSource;
}

export interface PositionOpenedEventData {
  ticker: string;
  entry_price: number;
  shares: number;
  stop_loss: number | null;
  initial_risk: number | null;
  position_value: number;
}

export interface PriceUpdateEventData {
  current_price: number;
  unrealized_pnl: number;
  unrealized_r: number;
  holding_days: number;
  high_water_mark: number;
}

export interface ExitRecommendedEventData {
  exit_probability: number;
  confidence: ExitConfidence;
  reasons: string[];
  current_price: number;
  unrealized_r: number;
}

export interface PositionClosedEventData {
  exit_price: number;
  exit_reason: ExitReason;
  realized_pnl: number;
  realized_r: number;
  holding_days: number;
}

// ============================================
// Performance Summary Types
// ============================================

export interface PerformanceSummary {
  user_id: string;
  total_trades: number;
  winners: number;
  losers: number;
  avg_r: number | null;
  total_pnl: number | null;
  avg_holding_days: number | null;

  // By exit reason
  signal_exits: number;
  signal_exit_avg_r: number | null;
  stop_losses: number;
  stop_loss_avg_r: number | null;
  time_exits: number;
  time_exit_avg_r: number | null;
  manual_exits: number;

  // Open positions
  open_positions: number;
  open_unrealized_pnl: number | null;
}

export interface PerformanceMetrics {
  winRate: number;
  profitFactor: number;
  avgWinR: number;
  avgLossR: number;
  expectancy: number;
  signalExitWinRate: number;
}

// ============================================
// API / Webhook Types
// ============================================

export interface WebhookSignalPayload {
  api_key: string;
  ticker: string;
  politician_name: string;
  transaction_type: TransactionType;
  amount_range?: string;
  signal_date: string;
  source: string;
  raw_message?: string;
}

export interface WebhookResponse {
  success: boolean;
  signal_id?: string;
  error?: string;
}

// ============================================
// UI State Types
// ============================================

export interface PoliticianTabState {
  signals: PoliticianSignal[];
  positions: PositionWithExitSignal[];
  performance: PerformanceSummary | null;
  isLoading: boolean;
  error: string | null;
}

export type SignalQueueFilter = 'pending' | 'processed' | 'all';
export type PositionFilter = 'OPEN' | 'CLOSED' | 'all';
export type SortField = 'ticker' | 'entry_date' | 'unrealized_r' | 'holding_days' | 'exit_probability';
export type SortDirection = 'asc' | 'desc';

export interface PositionListSortConfig {
  field: SortField;
  direction: SortDirection;
}

// ============================================
// Action Result Types
// ============================================

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type SignalActionResult = ActionResult<PoliticianSignal>;
export type PositionActionResult = ActionResult<PoliticianPosition>;
export type EvaluationActionResult = ActionResult<ExitEvaluation[]>;
