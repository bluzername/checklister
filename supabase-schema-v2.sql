-- SwingTrade Pro V2 Database Schema - Historical Data & Backtesting
-- Run this SQL in your Supabase SQL Editor AFTER the base schema

-- ============================================
-- ANALYSIS SNAPSHOTS TABLE
-- Stores point-in-time analysis results for backtesting and model training
-- ============================================
CREATE TABLE analysis_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL,
  analysis_date DATE NOT NULL,
  
  -- Core analysis result (stored as JSONB for flexibility)
  analysis_result JSONB NOT NULL,
  
  -- Extracted features for ML model (flattened for easier querying)
  feature_vector JSONB NOT NULL,
  
  -- Key metrics (denormalized for fast filtering)
  success_probability FLOAT,
  regime VARCHAR(20),
  trade_type VARCHAR(20),
  recommendation VARCHAR(50),
  
  -- Technical indicators (denormalized)
  current_price FLOAT,
  rsi_value FLOAT,
  atr_percent FLOAT,
  rvol FLOAT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  model_version VARCHAR(20) DEFAULT 'v1.0',
  
  -- Ensure one snapshot per ticker per day
  UNIQUE(ticker, analysis_date)
);

-- ============================================
-- TRADE OUTCOMES TABLE
-- Tracks actual trade results for model training
-- ============================================
CREATE TABLE trade_outcomes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_id UUID REFERENCES analysis_snapshots(id) ON DELETE CASCADE,
  ticker VARCHAR(10) NOT NULL,
  
  -- Entry details
  entry_date DATE NOT NULL,
  entry_price FLOAT NOT NULL,
  stop_loss FLOAT NOT NULL,
  position_size_shares INT,
  position_size_dollars FLOAT,
  
  -- Exit details (filled when trade closes)
  exit_date DATE,
  exit_price FLOAT,
  exit_reason VARCHAR(50), -- 'TP1', 'TP2', 'TP3', 'STOP_LOSS', 'TIME_EXIT', 'MANUAL', 'SIGNAL_EXIT'
  
  -- Performance metrics
  realized_r FLOAT, -- (exit - entry) / (entry - stop)
  realized_pnl FLOAT,
  realized_pnl_percent FLOAT,
  holding_days INT,
  
  -- Excursion tracking (for exit optimization)
  max_favorable_excursion FLOAT, -- Highest price reached
  max_adverse_excursion FLOAT, -- Lowest price reached
  mfe_r FLOAT, -- MFE in R terms
  mae_r FLOAT, -- MAE in R terms
  
  -- Binary label for classification model
  label INT, -- 1 if hit target R (e.g., >= 1.5R), 0 otherwise
  target_r_threshold FLOAT DEFAULT 1.5,
  
  -- Context at entry
  regime_at_entry VARCHAR(20),
  sector VARCHAR(50),
  market_cap_bucket VARCHAR(20), -- 'MEGA', 'LARGE', 'MID', 'SMALL', 'MICRO'
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_paper_trade BOOLEAN DEFAULT true,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL -- Optional: link to user who took trade
);

-- ============================================
-- PREDICTION LOG TABLE
-- Logs every prediction for calibration monitoring
-- ============================================
CREATE TABLE prediction_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL,
  prediction_date DATE NOT NULL,
  
  -- Prediction details
  predicted_probability FLOAT NOT NULL,
  predicted_r FLOAT,
  confidence_rating VARCHAR(20),
  
  -- Feature snapshot (for drift detection)
  feature_vector JSONB NOT NULL,
  
  -- Context
  regime VARCHAR(20),
  model_version VARCHAR(20) DEFAULT 'v1.0',
  
  -- Outcome (filled later)
  actual_outcome INT, -- 1 = success, 0 = failure
  actual_r FLOAT,
  outcome_date DATE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- UNIVERSE DEFINITIONS TABLE
-- Stores universe filter configurations
-- ============================================
CREATE TABLE universe_definitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  
  -- Filter criteria (stored as JSONB)
  filters JSONB NOT NULL,
  
  -- Cached ticker list (refreshed periodically)
  tickers TEXT[], -- Array of tickers in this universe
  ticker_count INT,
  last_refresh TIMESTAMPTZ,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BACKTEST RUNS TABLE
-- Stores backtest configurations and results
-- ============================================
CREATE TABLE backtest_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Configuration
  config JSONB NOT NULL, -- Full backtest config
  universe_id UUID REFERENCES universe_definitions(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Results summary
  total_trades INT,
  win_rate FLOAT,
  profit_factor FLOAT,
  sharpe_ratio FLOAT,
  sortino_ratio FLOAT,
  max_drawdown_percent FLOAT,
  total_return_percent FLOAT,
  avg_r_per_trade FLOAT,
  
  -- Detailed results (stored as JSONB)
  results JSONB, -- Full backtest results including equity curve
  trade_log JSONB, -- Array of all trades
  
  -- Performance breakdowns
  performance_by_regime JSONB,
  performance_by_sector JSONB,
  performance_by_month JSONB,
  
  -- Metadata
  status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Analysis snapshots
CREATE INDEX idx_snapshots_ticker ON analysis_snapshots(ticker);
CREATE INDEX idx_snapshots_date ON analysis_snapshots(analysis_date DESC);
CREATE INDEX idx_snapshots_ticker_date ON analysis_snapshots(ticker, analysis_date DESC);
CREATE INDEX idx_snapshots_regime ON analysis_snapshots(regime);
CREATE INDEX idx_snapshots_probability ON analysis_snapshots(success_probability DESC);

-- Trade outcomes
CREATE INDEX idx_outcomes_ticker ON trade_outcomes(ticker);
CREATE INDEX idx_outcomes_entry_date ON trade_outcomes(entry_date DESC);
CREATE INDEX idx_outcomes_snapshot ON trade_outcomes(snapshot_id);
CREATE INDEX idx_outcomes_label ON trade_outcomes(label);
CREATE INDEX idx_outcomes_regime ON trade_outcomes(regime_at_entry);

-- Prediction logs
CREATE INDEX idx_predictions_ticker ON prediction_logs(ticker);
CREATE INDEX idx_predictions_date ON prediction_logs(prediction_date DESC);
CREATE INDEX idx_predictions_outcome ON prediction_logs(actual_outcome);

-- Backtest runs
CREATE INDEX idx_backtests_status ON backtest_runs(status);
CREATE INDEX idx_backtests_created ON backtest_runs(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (Optional - for multi-tenant)
-- ============================================

-- Backtest runs - users can only see their own
ALTER TABLE backtest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backtests" ON backtest_runs
  FOR SELECT USING (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Users can insert own backtests" ON backtest_runs
  FOR INSERT WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

-- Analysis snapshots and outcomes are shared (for model training)
-- No RLS needed - these are system-level data

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for trade_outcomes
CREATE TRIGGER update_trade_outcomes_updated_at
  BEFORE UPDATE ON trade_outcomes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for universe_definitions
CREATE TRIGGER update_universe_definitions_updated_at
  BEFORE UPDATE ON universe_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ADD SELLS COLUMN TO PORTFOLIOS (if not exists)
-- For tracking partial profit-taking
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'portfolios' AND column_name = 'sells'
  ) THEN
    ALTER TABLE portfolios ADD COLUMN sells JSONB DEFAULT '{}';
  END IF;
END $$;




