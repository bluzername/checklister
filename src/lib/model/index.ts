/**
 * Model Module
 * Exports ML model components for trade prediction
 */

// Labeling
export {
  labelTrade,
  batchLabelTrades,
  calculateLabelStats,
  analyzeOptimalExit,
} from './labeling';
export type { TradeLabelResult } from './labeling';

// Logistic Regression
export {
  predictProbability,
  getFeatureImportance,
  trainModel,
  evaluateModel,
  serializeCoefficients,
  deserializeCoefficients,
  DEFAULT_COEFFICIENTS,
} from './logistic';
export type { ModelCoefficients, TrainingExample } from './logistic';

// Calibration
export {
  plattCalibrate,
  fitPlattScaling,
  isotonicCalibrate,
  fitIsotonicRegression,
  ensembleCalibrate,
  fitEnsembleCalibrator,
  evaluateCalibration,
  temperatureScale,
  findOptimalTemperature,
} from './calibration';
export type { PlattParameters, IsotonicModel, EnsembleCalibrator } from './calibration';




