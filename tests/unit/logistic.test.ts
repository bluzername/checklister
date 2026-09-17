import { describe, expect, it } from 'vitest';
import { computeClassWeights, predictProbability, type ModelCoefficients } from '@/lib/model/logistic';

type Features = Parameters<typeof predictProbability>[0];
type Examples = Parameters<typeof computeClassWeights>[0];

function coefficients(overrides: Partial<ModelCoefficients>): ModelCoefficients {
  return {
    intercept: 0,
    weights: {},
    featureMeans: {},
    featureStds: {},
    version: 'test',
    trainedAt: '2024-01-01',
    trainingSamples: 0,
    validationAccuracy: 0,
    ...overrides,
  } as unknown as ModelCoefficients;
}

describe('predictProbability', () => {
  it('returns 50 percent when the logit is zero', () => {
    const features = { rsi_value: 40 } as unknown as Features;
    expect(predictProbability(features, coefficients({}))).toBeCloseTo(50, 9);
  });

  it('applies sigmoid(intercept) when no feature has weight', () => {
    // sigmoid(-4) = 0.01798621
    expect(predictProbability({} as Features, coefficients({ intercept: -4 }))).toBeCloseTo(1.798621, 5);
  });

  it('normalises a feature before weighting it', () => {
    // (value 6 - mean 2) / std 2 = 2, weight 1 -> sigmoid(2) = 0.880797
    const model = coefficients({
      weights: { rvol: 1 } as ModelCoefficients['weights'],
      featureMeans: { rvol: 2 } as ModelCoefficients['featureMeans'],
      featureStds: { rvol: 2 } as ModelCoefficients['featureStds'],
    });
    expect(predictProbability({ rvol: 6 } as unknown as Features, model)).toBeCloseTo(88.0797, 3);
  });
});

describe('computeClassWeights', () => {
  const examples = [{ label: 1 }, { label: 1 }, { label: 1 }, { label: 0 }] as unknown as Examples;

  it('returns unit weights for none', () => {
    expect(computeClassWeights(examples, 'none')).toEqual({ positive: 1, negative: 1 });
  });

  it('uses inverse class frequency for balanced', () => {
    // total 4, positives 3, negatives 1: 4 / (2 * 3) and 4 / (2 * 1)
    const weights = computeClassWeights(examples, 'balanced');
    expect(weights.positive).toBeCloseTo(2 / 3, 9);
    expect(weights.negative).toBeCloseTo(2, 9);
  });

  it('passes explicit weights through unchanged', () => {
    expect(computeClassWeights(examples, { positive: 3, negative: 0.5 })).toEqual({ positive: 3, negative: 0.5 });
  });
});
