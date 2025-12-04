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
  TradeLabelResult,
} from './labeling';

// Logistic Regression
export {
  predictProbability,
  getFeatureImportance,
  trainModel,
  evaluateModel,
  serializeCoefficients,
  deserializeCoefficients,
  DEFAULT_COEFFICIENTS,
  ModelCoefficients,
  TrainingExample,
} from './logistic';

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
  PlattParameters,
  IsotonicModel,
  EnsembleCalibrator,
} from './calibration';




