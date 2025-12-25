-- Migration: Add 'sells' column to portfolios table
-- Purpose: Track partial profit-taking at different price levels (stop_loss, pt1, pt2, pt3)
--
-- INSTRUCTIONS:
-- 1. Go to your Supabase Dashboard
-- 2. Navigate to SQL Editor
-- 3. Run this entire script
--
-- The script is idempotent - safe to run multiple times

-- Add the 'sells' column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'portfolios' AND column_name = 'sells'
  ) THEN
    ALTER TABLE portfolios ADD COLUMN sells JSONB DEFAULT '{}';
    RAISE NOTICE 'Added sells column to portfolios table';
  ELSE
    RAISE NOTICE 'sells column already exists - no changes made';
  END IF;
END $$;

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'portfolios' AND column_name = 'sells';
