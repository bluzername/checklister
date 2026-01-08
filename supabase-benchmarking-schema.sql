-- Benchmarking System Schema
-- Run this migration in Supabase SQL Editor

-- ============================================
-- Table: completed_trades
-- Core trade tracking with full lifecycle data
-- ============================================
CREATE TABLE IF NOT EXISTS completed_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL,

  -- Trade Identity
  ticker VARCHAR(10) NOT NULL,
  trade_type VARCHAR(20) DEFAULT 'SWING_LONG', -- SWING_LONG, SWING_SHORT, DAY_TRADE

  -- Entry Details
  entry_date DATE NOT NULL,
  entry_price DECIMAL(10,4) NOT NULL,
  entry_shares INT NOT NULL,
  entry_value DECIMAL(14,2) NOT NULL, -- entry_price * entry_shares

  -- Entry Context (snapshot at entry time)
  entry_probability DECIMAL(5,2),
  entry_regime VARCHAR(20), -- BULL, CHOPPY, CRASH
  entry_sector VARCHAR(50),
  entry_rr_ratio DECIMAL(5,2),
  entry_stop_loss DECIMAL(10,4),
  entry_tp1 DECIMAL(10,4),
  entry_tp2 DECIMAL(10,4),
  entry_tp3 DECIMAL(10,4),
  entry_feature_vector JSONB, -- Full feature snapshot for ML
  entry_notes TEXT,
  entry_analysis_id UUID, -- Reference to analysis_snapshots if available

  -- Exit Details (filled progressively as trade closes)
  exit_date DATE,
  final_exit_price DECIMAL(10,4),
  remaining_shares INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'OPEN', -- OPEN, PARTIALLY_CLOSED, CLOSED

  -- Partial Exits Array: [{date, price, shares, reason, pnl, r_multiple}]
  partial_exits JSONB DEFAULT '[]',

  -- Final Exit Context
  exit_reason VARCHAR(50), -- TP1, TP2, TP3, STOP_LOSS, TRAILING_STOP, MANUAL, TIME_EXIT
  exit_notes TEXT,

  -- Performance Metrics (calculated when trade closes)
  total_realized_pnl DECIMAL(14,2),
  total_realized_pnl_percent DECIMAL(8,4),
  blended_exit_price DECIMAL(10,4), -- Weighted avg of all exits
  realized_r DECIMAL(8,4), -- Risk multiple achieved
  holding_days INT,

  -- Excursion Tracking (updated daily while open)
  mfe DECIMAL(10,4), -- Max Favorable Excursion (highest price reached)
  mae DECIMAL(10,4), -- Max Adverse Excursion (lowest price reached)
  mfe_r DECIMAL(8,4), -- MFE in R multiples
  mae_r DECIMAL(8,4), -- MAE in R multiples
  mfe_date DATE,
  mae_date DATE,

  -- Attribution Tags (for filtering/grouping)
  tags TEXT[], -- e.g., ['earnings_play', 'breakout', 'momentum']

  -- Metadata
  is_paper_trade BOOLEAN DEFAULT false,
  backtest_trade_id UUID, -- Link to backtest trade_outcomes if applicable

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: trade_journal
-- Journal entries linked to trades
-- ============================================
CREATE TABLE IF NOT EXISTS trade_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES completed_trades(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Journal Entry
  entry_type VARCHAR(20) NOT NULL, -- ENTRY_THESIS, EXIT_REVIEW, MID_TRADE_NOTE, LESSON_LEARNED
  entry_date DATE NOT NULL,
  content TEXT NOT NULL,

  -- Structured Reflection (optional)
  what_went_well TEXT,
  what_went_wrong TEXT,
  lesson_learned TEXT,
  would_take_again BOOLEAN,
  confidence_before INT CHECK (confidence_before >= 1 AND confidence_before <= 10),
  confidence_after INT CHECK (confidence_after >= 1 AND confidence_after <= 10),

  -- Attachments
  chart_screenshot_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: trade_price_history
-- Daily price data for counterfactual analysis
-- ============================================
CREATE TABLE IF NOT EXISTS trade_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES completed_trades(id) ON DELETE CASCADE NOT NULL,
  price_date DATE NOT NULL,

  -- OHLCV
  open_price DECIMAL(10,4),
  high_price DECIMAL(10,4),
  low_price DECIMAL(10,4),
  close_price DECIMAL(10,4),
  volume BIGINT,

  -- Calculated at each point
  unrealized_pnl DECIMAL(14,2),
  unrealized_pnl_percent DECIMAL(8,4),
  unrealized_r DECIMAL(8,4),

  UNIQUE(trade_id, price_date)
);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_completed_trades_user ON completed_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_completed_trades_ticker ON completed_trades(ticker);
CREATE INDEX IF NOT EXISTS idx_completed_trades_entry_date ON completed_trades(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_completed_trades_status ON completed_trades(status);
CREATE INDEX IF NOT EXISTS idx_completed_trades_regime ON completed_trades(entry_regime);
CREATE INDEX IF NOT EXISTS idx_completed_trades_sector ON completed_trades(entry_sector);

CREATE INDEX IF NOT EXISTS idx_trade_journal_trade ON trade_journal(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_journal_user ON trade_journal(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_journal_type ON trade_journal(entry_type);

CREATE INDEX IF NOT EXISTS idx_trade_price_history_trade ON trade_price_history(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_price_history_date ON trade_price_history(price_date);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE completed_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_price_history ENABLE ROW LEVEL SECURITY;

-- completed_trades policies
CREATE POLICY "Users can view own trades"
  ON completed_trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trades"
  ON completed_trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trades"
  ON completed_trades FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trades"
  ON completed_trades FOR DELETE
  USING (auth.uid() = user_id);

-- trade_journal policies
CREATE POLICY "Users can view own journal entries"
  ON trade_journal FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own journal entries"
  ON trade_journal FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own journal entries"
  ON trade_journal FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own journal entries"
  ON trade_journal FOR DELETE
  USING (auth.uid() = user_id);

-- trade_price_history policies (based on trade ownership)
CREATE POLICY "Users can view price history for own trades"
  ON trade_price_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM completed_trades
      WHERE completed_trades.id = trade_price_history.trade_id
      AND completed_trades.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert price history for own trades"
  ON trade_price_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM completed_trades
      WHERE completed_trades.id = trade_price_history.trade_id
      AND completed_trades.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete price history for own trades"
  ON trade_price_history FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM completed_trades
      WHERE completed_trades.id = trade_price_history.trade_id
      AND completed_trades.user_id = auth.uid()
    )
  );

-- ============================================
-- Updated_at trigger for completed_trades
-- ============================================
CREATE OR REPLACE FUNCTION update_completed_trades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER completed_trades_updated_at
  BEFORE UPDATE ON completed_trades
  FOR EACH ROW
  EXECUTE FUNCTION update_completed_trades_updated_at();

-- ============================================
-- Helper view for trade summary stats
-- ============================================
CREATE OR REPLACE VIEW trade_summary_stats AS
SELECT
  user_id,
  COUNT(*) FILTER (WHERE status = 'CLOSED') as total_trades,
  COUNT(*) FILTER (WHERE status = 'OPEN') as open_trades,
  COUNT(*) FILTER (WHERE total_realized_pnl > 0) as winning_trades,
  COUNT(*) FILTER (WHERE total_realized_pnl < 0) as losing_trades,
  ROUND(
    COUNT(*) FILTER (WHERE total_realized_pnl > 0)::DECIMAL /
    NULLIF(COUNT(*) FILTER (WHERE status = 'CLOSED'), 0) * 100,
    2
  ) as win_rate,
  SUM(total_realized_pnl) FILTER (WHERE status = 'CLOSED') as total_pnl,
  AVG(total_realized_pnl) FILTER (WHERE status = 'CLOSED') as avg_pnl,
  AVG(realized_r) FILTER (WHERE status = 'CLOSED') as avg_r,
  AVG(total_realized_pnl) FILTER (WHERE total_realized_pnl > 0) as avg_win,
  AVG(total_realized_pnl) FILTER (WHERE total_realized_pnl < 0) as avg_loss,
  AVG(holding_days) FILTER (WHERE status = 'CLOSED') as avg_holding_days
FROM completed_trades
GROUP BY user_id;
