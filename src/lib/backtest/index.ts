/**
 * Backtest Module
 * Exports all backtest-related types and functions
 */

// Types
export * from './types';

// Historical storage
export {
  storeAnalysisSnapshot,
  getAnalysisSnapshot,
  getSnapshotsInRange,
  getEntrySignals,
  createTradeOutcome,
  closeTradeOutcome,
  getTradeOutcomes,
  getTrainingData,
  logPrediction,
  updatePredictionOutcome,
  getCalibrationData,
  getSnapshotStats,
  getOutcomeStats,
} from './historical-store';

// Simulator
export {
  BacktestSimulator,
  runBacktest,
  createDefaultConfig,
} from './simulator';

// Trade Manager
export {
  TradeManager,
  calculateRMultiple,
  getExitReasonDescription,
} from './trade-manager';

// Metrics
export {
  calculateMetrics,
  calculateEquityCurve,
  calculateMonthlyReturns,
  calculateStreaks,
} from './metrics';

// Walk-Forward Optimization
export {
  runWalkForward,
  createStandardWalkForward,
  createRollingWalkForward,
} from './walk-forward';

