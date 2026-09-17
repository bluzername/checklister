import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '@/lib/backtest/simulator';

describe('createDefaultConfig', () => {
  const config = createDefaultConfig(['AAPL', 'MSFT'], '2024-01-01', '2024-06-30');

  it('names the run after its date range and keeps the universe', () => {
    expect(config.name).toBe('Backtest 2024-01-01 to 2024-06-30');
    expect(config.universe).toEqual(['AAPL', 'MSFT']);
    expect(config.startDate).toBe('2024-01-01');
    expect(config.endDate).toBe('2024-06-30');
  });

  it('uses a take-profit ladder whose sizes sum to the full position', () => {
    const totalSize = config.tpSizes.reduce((sum, size) => sum + size, 0);
    expect(totalSize).toBeCloseTo(1, 9);
    expect(config.tpSizes).toHaveLength(config.tpRatios.length);
    const ascending = [...config.tpRatios].sort((a, b) => a - b);
    expect(config.tpRatios).toEqual(ascending);
  });

  it('keeps per-trade risk below total portfolio risk', () => {
    expect(config.riskPerTrade).toBeGreaterThan(0);
    expect(config.riskPerTrade).toBeLessThan(config.maxTotalRisk);
    expect(config.maxOpenPositions).toBeGreaterThan(0);
    expect(config.minRRRatio).toBeGreaterThanOrEqual(1);
  });

  it('returns a fresh object on every call', () => {
    const other = createDefaultConfig(['AAPL', 'MSFT'], '2024-01-01', '2024-06-30');
    expect(other).toEqual(config);
    expect(other).not.toBe(config);
    expect(other.tpRatios).not.toBe(config.tpRatios);
  });
});
