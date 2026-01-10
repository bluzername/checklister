-- SwingTrade Pro - Recommendations Table Migration
-- Run this SQL in your Supabase SQL Editor
-- This table stores proactive stock recommendations based on insider activity

-- ============================================
-- RECOMMENDATIONS TABLE
-- Stores stocks with strong insider/congress activity for the Recommendations tab
-- Updated daily by cron job, UI reads from here (no API calls)
-- ============================================
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL,
  company_name VARCHAR(255),

  -- Soft signal data (from FMP insider trading API)
  insider_buys INT DEFAULT 0,
  insider_sells INT DEFAULT 0,
  insider_buy_ratio DECIMAL(5,2),
  top_buyer VARCHAR(255),          -- Name and title of largest buyer

  -- Congress data (when available)
  congress_buys INT DEFAULT 0,
  congress_sells INT DEFAULT 0,

  -- Scoring
  soft_signal_score DECIMAL(4,1),   -- 0-10 combined score
  signal_strength VARCHAR(20),       -- STRONG, MODERATE, WEAK, NONE

  -- Technical timing (computed on-demand when user views)
  timing_verdict VARCHAR(20),        -- PROCEED, CAUTION, VETO
  success_probability DECIMAL(5,1),

  -- Trade details from most recent activity
  last_trade_date DATE,
  last_trade_value DECIMAL(15,2),    -- Dollar value of most recent trade

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one recommendation per ticker
  UNIQUE(ticker)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_recommendations_signal ON recommendations(signal_strength);
CREATE INDEX IF NOT EXISTS idx_recommendations_score ON recommendations(soft_signal_score DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_updated ON recommendations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_ticker ON recommendations(ticker);

-- ============================================
-- UPDATE TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_recommendations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_recommendations_updated_at ON recommendations;
CREATE TRIGGER update_recommendations_updated_at
  BEFORE UPDATE ON recommendations
  FOR EACH ROW
  EXECUTE FUNCTION update_recommendations_updated_at();

-- ============================================
-- RLS POLICY (public read, service role write)
-- ============================================
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- Anyone can read recommendations
CREATE POLICY "Recommendations are publicly readable" ON recommendations
  FOR SELECT USING (true);

-- Only service role can insert/update (via cron job)
CREATE POLICY "Service role can manage recommendations" ON recommendations
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- SAMPLE DATA (for testing - optional)
-- ============================================
-- INSERT INTO recommendations (ticker, company_name, insider_buys, insider_sells, insider_buy_ratio, soft_signal_score, signal_strength)
-- VALUES
--   ('CEG', 'Constellation Energy Corp', 3, 1, 0.75, 8.5, 'STRONG'),
--   ('ZBIO', 'Zenas BioPharma', 5, 0, 1.00, 9.0, 'STRONG'),
--   ('JEF', 'Jefferies Financial Group', 2, 1, 0.67, 7.0, 'MODERATE')
-- ON CONFLICT (ticker) DO UPDATE SET
--   company_name = EXCLUDED.company_name,
--   insider_buys = EXCLUDED.insider_buys,
--   insider_sells = EXCLUDED.insider_sells,
--   insider_buy_ratio = EXCLUDED.insider_buy_ratio,
--   soft_signal_score = EXCLUDED.soft_signal_score,
--   signal_strength = EXCLUDED.signal_strength;

-- Grant permissions (for edge functions/cron)
-- GRANT SELECT ON recommendations TO anon;
-- GRANT ALL ON recommendations TO service_role;

COMMENT ON TABLE recommendations IS 'Proactive stock recommendations based on insider trading activity. Updated daily by cron job.';
