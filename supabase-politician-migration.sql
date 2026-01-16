-- Politician Trading Module - Database Migration
-- Run this migration in your Supabase SQL Editor

-- ============================================
-- 1. Politician Signals (incoming signals)
-- ============================================
CREATE TABLE IF NOT EXISTS politician_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker VARCHAR(10) NOT NULL,
  signal_date DATE NOT NULL,
  politician_name VARCHAR(100),
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('BUY', 'SELL')),
  amount_range VARCHAR(50),
  source VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
  raw_message TEXT,
  strength VARCHAR(20) CHECK (strength IN ('STRONG', 'MODERATE', 'WEAK')),
  created_at TIMESTAMPTZ DEFAULT now(),
  processed BOOLEAN DEFAULT false,
  UNIQUE(user_id, ticker, signal_date, politician_name)
);

-- Index for querying unprocessed signals
CREATE INDEX IF NOT EXISTS idx_politician_signals_user_pending
  ON politician_signals(user_id, processed)
  WHERE processed = false;

CREATE INDEX IF NOT EXISTS idx_politician_signals_date
  ON politician_signals(signal_date DESC);

-- ============================================
-- 2. Politician Positions (open trades)
-- ============================================
CREATE TABLE IF NOT EXISTS politician_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES politician_signals(id) ON DELETE SET NULL,
  ticker VARCHAR(10) NOT NULL,
  entry_date DATE NOT NULL,
  entry_price DECIMAL(12,4) NOT NULL,
  shares INTEGER NOT NULL CHECK (shares > 0),
  stop_loss DECIMAL(12,4),
  initial_risk DECIMAL(12,4),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'PARTIAL')),

  -- Exit tracking
  exit_date DATE,
  exit_price DECIMAL(12,4),
  exit_reason VARCHAR(30) CHECK (exit_reason IN ('SIGNAL_EXIT', 'STOP_LOSS', 'TIME_EXIT', 'MANUAL', 'PARTIAL')),
  realized_pnl DECIMAL(12,2),
  realized_r DECIMAL(6,2),

  -- Daily tracking (updated by cron)
  current_price DECIMAL(12,4),
  unrealized_pnl DECIMAL(12,2),
  unrealized_r DECIMAL(6,2),
  holding_days INTEGER DEFAULT 0,
  high_water_mark DECIMAL(12,4),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying open positions
CREATE INDEX IF NOT EXISTS idx_politician_positions_user_status
  ON politician_positions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_politician_positions_open
  ON politician_positions(user_id)
  WHERE status = 'OPEN';

-- ============================================
-- 3. Exit Evaluations (ML model output - daily)
-- ============================================
CREATE TABLE IF NOT EXISTS politician_exit_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID REFERENCES politician_positions(id) ON DELETE CASCADE,
  evaluation_date DATE NOT NULL,

  -- Model output
  exit_probability DECIMAL(5,4) CHECK (exit_probability >= 0 AND exit_probability <= 1),
  confidence VARCHAR(20) CHECK (confidence IN ('low', 'medium', 'high', 'very_high')),
  should_exit BOOLEAN NOT NULL DEFAULT false,
  reasons JSONB,

  -- Feature snapshot (for analysis)
  features JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(position_id, evaluation_date)
);

-- Index for latest evaluations
CREATE INDEX IF NOT EXISTS idx_politician_exit_evaluations_position_date
  ON politician_exit_evaluations(position_id, evaluation_date DESC);

-- ============================================
-- 4. Trade Event Log (comprehensive audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS politician_trade_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  position_id UUID REFERENCES politician_positions(id) ON DELETE SET NULL,
  signal_id UUID REFERENCES politician_signals(id) ON DELETE SET NULL,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
    'SIGNAL_RECEIVED',
    'SIGNAL_SKIPPED',
    'POSITION_OPENED',
    'PRICE_UPDATE',
    'EXIT_RECOMMENDED',
    'EXIT_IGNORED',
    'POSITION_CLOSED'
  )),
  event_date TIMESTAMPTZ DEFAULT now(),
  event_data JSONB,
  notes TEXT
);

-- Index for querying logs by position or user
CREATE INDEX IF NOT EXISTS idx_politician_trade_log_user_date
  ON politician_trade_log(user_id, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_politician_trade_log_position
  ON politician_trade_log(position_id, event_date DESC);

-- ============================================
-- 5. Row Level Security Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE politician_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE politician_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE politician_exit_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE politician_trade_log ENABLE ROW LEVEL SECURITY;

-- Politician Signals: Users see only their own
DROP POLICY IF EXISTS "Users see own signals" ON politician_signals;
CREATE POLICY "Users see own signals" ON politician_signals
  FOR ALL USING (auth.uid() = user_id);

-- Politician Positions: Users see only their own
DROP POLICY IF EXISTS "Users see own positions" ON politician_positions;
CREATE POLICY "Users see own positions" ON politician_positions
  FOR ALL USING (auth.uid() = user_id);

-- Exit Evaluations: Users see evaluations for their positions
DROP POLICY IF EXISTS "Users see own evaluations" ON politician_exit_evaluations;
CREATE POLICY "Users see own evaluations" ON politician_exit_evaluations
  FOR ALL USING (
    position_id IN (
      SELECT id FROM politician_positions WHERE user_id = auth.uid()
    )
  );

-- Trade Log: Users see only their own logs
DROP POLICY IF EXISTS "Users see own logs" ON politician_trade_log;
CREATE POLICY "Users see own logs" ON politician_trade_log
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 6. Helper Functions
-- ============================================

-- Function to update position updated_at timestamp
CREATE OR REPLACE FUNCTION update_politician_position_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS update_politician_position_timestamp ON politician_positions;
CREATE TRIGGER update_politician_position_timestamp
  BEFORE UPDATE ON politician_positions
  FOR EACH ROW
  EXECUTE FUNCTION update_politician_position_timestamp();

-- Function to calculate holding days
CREATE OR REPLACE FUNCTION calculate_holding_days(entry_date DATE)
RETURNS INTEGER AS $$
BEGIN
  RETURN CURRENT_DATE - entry_date;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Views for Performance Summary
-- ============================================

-- Performance summary view (not materialized for simplicity)
CREATE OR REPLACE VIEW politician_performance_summary AS
SELECT
  user_id,
  COUNT(*) FILTER (WHERE status = 'CLOSED') as total_trades,
  COUNT(*) FILTER (WHERE status = 'CLOSED' AND realized_r > 0) as winners,
  COUNT(*) FILTER (WHERE status = 'CLOSED' AND realized_r <= 0) as losers,
  ROUND(AVG(realized_r) FILTER (WHERE status = 'CLOSED')::numeric, 2) as avg_r,
  ROUND(SUM(realized_pnl) FILTER (WHERE status = 'CLOSED')::numeric, 2) as total_pnl,
  ROUND(AVG(holding_days) FILTER (WHERE status = 'CLOSED')::numeric, 1) as avg_holding_days,

  -- By exit reason
  COUNT(*) FILTER (WHERE exit_reason = 'SIGNAL_EXIT') as signal_exits,
  ROUND(AVG(realized_r) FILTER (WHERE exit_reason = 'SIGNAL_EXIT')::numeric, 2) as signal_exit_avg_r,
  COUNT(*) FILTER (WHERE exit_reason = 'STOP_LOSS') as stop_losses,
  ROUND(AVG(realized_r) FILTER (WHERE exit_reason = 'STOP_LOSS')::numeric, 2) as stop_loss_avg_r,
  COUNT(*) FILTER (WHERE exit_reason = 'TIME_EXIT') as time_exits,
  ROUND(AVG(realized_r) FILTER (WHERE exit_reason = 'TIME_EXIT')::numeric, 2) as time_exit_avg_r,
  COUNT(*) FILTER (WHERE exit_reason = 'MANUAL') as manual_exits,

  -- Open positions
  COUNT(*) FILTER (WHERE status = 'OPEN') as open_positions,
  ROUND(SUM(unrealized_pnl) FILTER (WHERE status = 'OPEN')::numeric, 2) as open_unrealized_pnl

FROM politician_positions
GROUP BY user_id;

-- Latest exit evaluation for each open position
CREATE OR REPLACE VIEW politician_positions_with_exit_signal AS
SELECT
  p.*,
  e.exit_probability,
  e.confidence,
  e.should_exit,
  e.reasons as exit_reasons,
  e.evaluation_date as last_evaluation_date
FROM politician_positions p
LEFT JOIN LATERAL (
  SELECT *
  FROM politician_exit_evaluations
  WHERE position_id = p.id
  ORDER BY evaluation_date DESC
  LIMIT 1
) e ON true
WHERE p.status = 'OPEN';

-- ============================================
-- 8. Grant Access for Service Role (cron jobs)
-- ============================================

-- Service role needs to update all users' positions during price updates
-- This is handled automatically by Supabase's service role

COMMENT ON TABLE politician_signals IS 'Incoming politician trading signals from various sources';
COMMENT ON TABLE politician_positions IS 'Open and closed trades based on politician signals';
COMMENT ON TABLE politician_exit_evaluations IS 'Daily ML model evaluations for exit timing';
COMMENT ON TABLE politician_trade_log IS 'Comprehensive audit trail of all trading events';
