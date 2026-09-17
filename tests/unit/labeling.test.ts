import { describe, expect, it } from 'vitest';
import { analyzeOptimalExit, calculateLabelStats, type TradeLabelResult } from '@/lib/model/labeling';

function label(overrides: Partial<TradeLabelResult>): TradeLabelResult {
  return {
    label: 1,
    realizedR: 1,
    exitPrice: 110,
    exitDate: '2024-02-01',
    exitReason: 'TP1',
    maxFavorableExcursion: 12,
    maxAdverseExcursion: 2,
    mfeR: 1.2,
    maeR: 0.2,
    holdingDays: 10,
    ...overrides,
  };
}

const sample: TradeLabelResult[] = [
  label({ label: 1, realizedR: 2, mfeR: 2, maeR: 0.2, holdingDays: 10, exitReason: 'TP1' }),
  label({ label: 1, realizedR: 1, mfeR: 1.5, maeR: 0.5, holdingDays: 20, exitReason: 'TP2' }),
  label({ label: 0, realizedR: -1, mfeR: 0.5, maeR: 1, holdingDays: 30, exitReason: 'STOP_LOSS' }),
];

describe('calculateLabelStats', () => {
  it('returns zeroed stats for no labels', () => {
    const stats = calculateLabelStats([]);
    expect(stats.totalTrades).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.exitReasonDistribution).toEqual({});
  });

  it('aggregates wins, losses and averages', () => {
    const stats = calculateLabelStats(sample);
    expect(stats.totalTrades).toBe(3);
    expect(stats.winCount).toBe(2);
    expect(stats.lossCount).toBe(1);
    expect(stats.winRate).toBeCloseTo(66.6667, 3);
    expect(stats.avgR).toBeCloseTo(2 / 3, 9);
    expect(stats.avgWinR).toBeCloseTo(1.5, 9);
    expect(stats.avgLossR).toBeCloseTo(1, 9);
    expect(stats.avgMFE).toBeCloseTo(4 / 3, 9);
    expect(stats.avgMAE).toBeCloseTo(1.7 / 3, 9);
    expect(stats.avgHoldingDays).toBe(20);
    expect(stats.exitReasonDistribution).toEqual({ TP1: 1, TP2: 1, STOP_LOSS: 1 });
  });

  it('does not mutate its input', () => {
    const copy = sample.map((l) => ({ ...l }));
    calculateLabelStats(sample);
    expect(sample).toEqual(copy);
  });
});

describe('analyzeOptimalExit', () => {
  it('falls back to the default take-profit ladder without data', () => {
    const result = analyzeOptimalExit([]);
    expect(result).toMatchObject({ optimalTP1: 1.5, optimalTP2: 2.5, optimalTP3: 4.0 });
    expect(result.mfeDistribution).toEqual([]);
  });

  it('reports the share of trades whose MFE reached each R level', () => {
    const { mfeDistribution } = analyzeOptimalExit(sample);
    const at = (r: number) => mfeDistribution.find((d) => d.r === r)?.percentReached;
    expect(at(0.5)).toBeCloseTo(100, 9);
    expect(at(1.0)).toBeCloseTo(66.6667, 3);
    expect(at(2.0)).toBeCloseTo(33.3333, 3);
    expect(at(6.0)).toBe(0);
  });
});
