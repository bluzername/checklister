-- API Logs Migration for Admin Dashboard
-- Run this SQL in your Supabase SQL Editor to enable persistent API logging
-- 
-- This creates the api_logs table that stores API call logs
-- for the admin dashboard to display usage statistics.

-- API Logs table for admin dashboard tracking
CREATE TABLE IF NOT EXISTS api_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  service VARCHAR(20) NOT NULL, -- 'yahoo', 'fmp', 'eodhd', 'claude', 'cache'
  operation VARCHAR(50) NOT NULL,
  ticker VARCHAR(20) NOT NULL,
  latency_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  cached BOOLEAN NOT NULL DEFAULT false,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL -- optional, for tracking per-user usage
);

-- Enable RLS
ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations (logs are system-level, not user-specific data)
-- In production, you might want to restrict this to service role only
CREATE POLICY "Allow all api_logs operations" ON api_logs
  FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_api_logs_timestamp ON api_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_service ON api_logs(service);
CREATE INDEX IF NOT EXISTS idx_api_logs_user_id ON api_logs(user_id);

-- Optional: Function to clean up old logs (keeps last 30 days)
-- You can call this periodically or set up a cron job
CREATE OR REPLACE FUNCTION cleanup_old_api_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM api_logs WHERE timestamp < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Verify table was created
SELECT 'api_logs table created successfully!' as status;

