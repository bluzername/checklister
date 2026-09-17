import { describe, expect, it } from 'vitest';
import {
  applyCalibration,
  deserializeCalibrationParams,
  evaluateCalibration,
  isotonicCalibrate,
  plattCalibrate,
  serializeCalibrationParams,
  temperatureScale,
  type CalibrationParams,
} from '@/lib/model/calibration';

describe('plattCalibrate', () => {
  it('returns 50 for the identity parameters a=0, b=0', () => {
    expect(plattCalibrate(50, { a: 0, b: 0 })).toBeCloseTo(50, 6);
    expect(plattCalibrate(90, { a: 0, b: 0 })).toBeCloseTo(50, 6);
  });

  it('maps a 100 percent input through 1 / (1 + exp(a * 1 + b))', () => {
    // a = -1, b = 0: 1 / (1 + e^-1) = 0.7310585786
    expect(plattCalibrate(100, { a: -1, b: 0 })).toBeCloseTo(73.10585786, 6);
  });
});

describe('isotonicCalibrate', () => {
  const model = { x: [0, 50, 100], y: [0, 40, 100] };

  it('returns the input unchanged for an empty model', () => {
    expect(isotonicCalibrate(37, { x: [], y: [] })).toBe(37);
  });

  it('clamps to the first and last calibrated values', () => {
    expect(isotonicCalibrate(-5, model)).toBe(0);
    expect(isotonicCalibrate(150, model)).toBe(100);
  });

  it('interpolates linearly inside a segment', () => {
    expect(isotonicCalibrate(25, model)).toBeCloseTo(20, 9);
    expect(isotonicCalibrate(75, model)).toBeCloseTo(70, 9);
  });
});

describe('temperatureScale', () => {
  it('is (numerically) the identity at temperature 1', () => {
    expect(temperatureScale(50, 1)).toBeCloseTo(50, 6);
    expect(temperatureScale(80, 1)).toBeCloseTo(80, 6);
  });

  it('pulls probabilities toward 50 when temperature is above 1', () => {
    const scaled = temperatureScale(80, 2);
    expect(scaled).toBeGreaterThan(50);
    expect(scaled).toBeLessThan(80);
  });
});

describe('evaluateCalibration', () => {
  it('returns zero errors for an empty input', () => {
    expect(evaluateCalibration([])).toEqual({
      expectedCalibrationError: 0,
      maxCalibrationError: 0,
      brierScore: 0,
      reliabilityDiagram: [],
    });
  });

  it('scores perfectly calibrated predictions with zero error', () => {
    const result = evaluateCalibration([
      { probability: 100, label: 1 },
      { probability: 0, label: 0 },
    ]);
    expect(result.brierScore).toBe(0);
    expect(result.expectedCalibrationError).toBe(0);
    expect(result.maxCalibrationError).toBe(0);
    expect(result.reliabilityDiagram).toHaveLength(2);
  });

  it('computes the Brier score as the mean squared error in probability space', () => {
    // (0.7 - 1)^2 = 0.09 and (0.3 - 0)^2 = 0.09, mean 0.09
    const result = evaluateCalibration([
      { probability: 70, label: 1 },
      { probability: 30, label: 0 },
    ]);
    expect(result.brierScore).toBeCloseTo(0.09, 9);
  });
});

describe('applyCalibration', () => {
  it('passes through with method none or missing parameters', () => {
    expect(applyCalibration(63, { method: 'none' } as CalibrationParams)).toBe(63);
    expect(applyCalibration(63, { method: 'platt' } as CalibrationParams)).toBe(63);
  });

  it('delegates to the platt calibrator', () => {
    const params = { method: 'platt', platt: { a: -1, b: 0 } } as CalibrationParams;
    expect(applyCalibration(100, params)).toBeCloseTo(plattCalibrate(100, { a: -1, b: 0 }), 9);
  });

  it('round-trips parameters through serialization', () => {
    const params = { method: 'temperature', temperature: 1.7 } as CalibrationParams;
    expect(deserializeCalibrationParams(serializeCalibrationParams(params))).toEqual(params);
  });
});
