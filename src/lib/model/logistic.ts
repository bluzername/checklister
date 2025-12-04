/**
 * Logistic Regression Model
 * Simple interpretable model for trade success prediction
 */

import { FeatureVector } from '../backtest/types';

/**
 * Model coefficients learned from training
 * These would be updated after training on historical data
 */
export interface ModelCoefficients {
  intercept: number;
  weights: Record<keyof FeatureVector, number>;
  featureMeans: Record<keyof FeatureVector, number>;
  featureStds: Record<keyof FeatureVector, number>;
  version: string;
  trainedAt: string;
  trainingSamples: number;
  validationAccuracy: number;
}

/**
 * Default model coefficients (baseline heuristic)
 * These approximate the current 10-criterion scoring system
 */
export const DEFAULT_COEFFICIENTS: ModelCoefficients = {
  intercept: -4.0,
  weights: {
    // Criterion scores (most important)
    score_market_condition: 0.30,
    score_sector_condition: 0.25,
    score_company_condition: 0.20,
    score_catalyst: 0.35,
    score_patterns_gaps: 0.30,
    score_support_resistance: 0.35,
    score_price_movement: 0.25,
    score_volume: 0.30,
    score_ma_fibonacci: 0.25,
    score_rsi: 0.20,
    
    // Market context
    regime: 0.50, // BULL=2, CHOPPY=1, CRASH=0
    regime_confidence: 0.02,
    vix_level: -0.05, // Higher VIX = lower probability
    spy_above_50sma: 0.30,
    spy_above_200sma: 0.40,
    golden_cross: 0.20,
    
    // Technical indicators
    rsi_value: 0.01,
    atr_percent: -0.10, // Higher volatility = more risk
    price_vs_200sma: 0.02,
    price_vs_50sma: 0.02,
    price_vs_20ema: 0.01,
    
    // Volume metrics
    rvol: 0.15,
    obv_trend: 0.20,
    cmf_value: 0.50,
    
    // Sector
    sector_rs_20d: 0.15,
    sector_rs_60d: 0.10,
    
    // Support/Resistance
    rr_ratio: 0.20,
    near_support: 0.25,
    
    // Multi-timeframe
    mtf_daily_score: 0.10,
    mtf_4h_score: 0.10,
    mtf_combined_score: 0.15,
    mtf_alignment: 0.30,
    
    // Divergence
    divergence_type: 0.15,
    divergence_strength: 0.10,
    
    // Pattern
    pattern_type: 0.20,
    gap_percent: 0.05,
    bull_flag_detected: 0.25,
    hammer_detected: 0.20,
    
    // Trend
    higher_highs: 0.20,
    higher_lows: 0.25,
    trend_status: 0.25,
  },
  // Mean/std for normalization (initialized to defaults)
  featureMeans: {} as Record<keyof FeatureVector, number>,
  featureStds: {} as Record<keyof FeatureVector, number>,
  version: 'v1.0-baseline',
  trainedAt: new Date().toISOString(),
  trainingSamples: 0,
  validationAccuracy: 0,
};

// Initialize means and stds with reasonable defaults
Object.keys(DEFAULT_COEFFICIENTS.weights).forEach(key => {
  DEFAULT_COEFFICIENTS.featureMeans[key as keyof FeatureVector] = 5;
  DEFAULT_COEFFICIENTS.featureStds[key as keyof FeatureVector] = 3;
});

/**
 * Sigmoid function
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Predict probability using logistic regression
 */
export function predictProbability(
  features: FeatureVector,
  coefficients: ModelCoefficients = DEFAULT_COEFFICIENTS
): number {
  let logit = coefficients.intercept;

  // Sum weighted normalized features
  for (const [key, value] of Object.entries(features)) {
    const featureKey = key as keyof FeatureVector;
    const weight = coefficients.weights[featureKey] || 0;
    const mean = coefficients.featureMeans[featureKey] || 0;
    const std = coefficients.featureStds[featureKey] || 1;

    // Normalize feature
    const normalizedValue = std > 0 ? (value - mean) / std : value - mean;
    
    logit += weight * normalizedValue;
  }

  // Convert to probability
  const probability = sigmoid(logit) * 100;
  
  // Clamp to reasonable range
  return Math.max(0, Math.min(100, probability));
}

/**
 * Get feature importance from coefficients
 */
export function getFeatureImportance(
  coefficients: ModelCoefficients = DEFAULT_COEFFICIENTS
): { feature: string; importance: number }[] {
  return Object.entries(coefficients.weights)
    .map(([feature, weight]) => ({
      feature,
      importance: Math.abs(weight),
    }))
    .sort((a, b) => b.importance - a.importance);
}

/**
 * Training data point
 */
export interface TrainingExample {
  features: FeatureVector;
  label: 0 | 1;
}

/**
 * Train logistic regression model using gradient descent
 * 
 * This is a simple implementation - for production, consider using
 * a proper ML library like TensorFlow.js or ml.js
 */
export function trainModel(
  trainingData: TrainingExample[],
  learningRate: number = 0.01,
  iterations: number = 1000,
  regularization: number = 0.01 // L2 regularization
): ModelCoefficients {
  if (trainingData.length === 0) {
    return DEFAULT_COEFFICIENTS;
  }

  // Initialize weights from default
  const coefficients: ModelCoefficients = JSON.parse(JSON.stringify(DEFAULT_COEFFICIENTS));

  // Calculate feature statistics for normalization
  const featureKeys = Object.keys(coefficients.weights) as (keyof FeatureVector)[];
  
  for (const key of featureKeys) {
    const values = trainingData.map(d => d.features[key]);
    coefficients.featureMeans[key] = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - coefficients.featureMeans[key], 2), 0) / values.length;
    coefficients.featureStds[key] = Math.sqrt(variance) || 1;
  }

  // Normalize features
  const normalizedData = trainingData.map(d => ({
    features: {} as FeatureVector,
    label: d.label,
  }));

  for (let i = 0; i < trainingData.length; i++) {
    for (const key of featureKeys) {
      const value = trainingData[i].features[key];
      const mean = coefficients.featureMeans[key];
      const std = coefficients.featureStds[key];
      normalizedData[i].features[key] = std > 0 ? (value - mean) / std : 0;
    }
  }

  // Gradient descent
  for (let iter = 0; iter < iterations; iter++) {
    // Calculate gradients
    let interceptGradient = 0;
    const weightGradients: Record<string, number> = {};
    
    for (const key of featureKeys) {
      weightGradients[key] = 0;
    }

    for (const example of normalizedData) {
      // Forward pass
      let logit = coefficients.intercept;
      for (const key of featureKeys) {
        logit += coefficients.weights[key] * example.features[key];
      }
      const prediction = sigmoid(logit);
      const error = prediction - example.label;

      // Accumulate gradients
      interceptGradient += error;
      for (const key of featureKeys) {
        weightGradients[key] += error * example.features[key];
      }
    }

    // Update weights
    const n = normalizedData.length;
    coefficients.intercept -= learningRate * (interceptGradient / n);
    
    for (const key of featureKeys) {
      // Add L2 regularization
      const regularizationTerm = regularization * coefficients.weights[key];
      coefficients.weights[key] -= learningRate * ((weightGradients[key] / n) + regularizationTerm);
    }

    // Log progress periodically
    if (iter % 100 === 0) {
      const loss = calculateLoss(normalizedData, coefficients);
      console.log(`Iteration ${iter}: Loss = ${loss.toFixed(4)}`);
    }
  }

  // Calculate validation accuracy
  let correct = 0;
  for (const example of normalizedData) {
    const prob = predictProbabilityNormalized(example.features, coefficients);
    const predicted = prob >= 50 ? 1 : 0;
    if (predicted === example.label) correct++;
  }

  coefficients.validationAccuracy = (correct / normalizedData.length) * 100;
  coefficients.trainingSamples = trainingData.length;
  coefficients.trainedAt = new Date().toISOString();
  coefficients.version = 'v1.0-trained';

  return coefficients;
}

/**
 * Calculate cross-entropy loss
 */
function calculateLoss(
  data: { features: FeatureVector; label: 0 | 1 }[],
  coefficients: ModelCoefficients
): number {
  let loss = 0;
  
  for (const example of data) {
    const prob = predictProbabilityNormalized(example.features, coefficients) / 100;
    const clampedProb = Math.max(1e-10, Math.min(1 - 1e-10, prob));
    
    if (example.label === 1) {
      loss -= Math.log(clampedProb);
    } else {
      loss -= Math.log(1 - clampedProb);
    }
  }
  
  return loss / data.length;
}

/**
 * Predict probability for already-normalized features
 */
function predictProbabilityNormalized(
  features: FeatureVector,
  coefficients: ModelCoefficients
): number {
  let logit = coefficients.intercept;

  for (const [key, value] of Object.entries(features)) {
    const featureKey = key as keyof FeatureVector;
    const weight = coefficients.weights[featureKey] || 0;
    logit += weight * value;
  }

  return sigmoid(logit) * 100;
}

/**
 * Save coefficients to JSON
 */
export function serializeCoefficients(coefficients: ModelCoefficients): string {
  return JSON.stringify(coefficients, null, 2);
}

/**
 * Load coefficients from JSON
 */
export function deserializeCoefficients(json: string): ModelCoefficients {
  return JSON.parse(json) as ModelCoefficients;
}

/**
 * Evaluate model on test data
 */
export function evaluateModel(
  testData: TrainingExample[],
  coefficients: ModelCoefficients
): {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  auc: number;
  calibrationError: number;
} {
  if (testData.length === 0) {
    return { accuracy: 0, precision: 0, recall: 0, f1Score: 0, auc: 0, calibrationError: 0 };
  }

  let tp = 0, fp = 0, tn = 0, fn = 0;
  const predictions: { prob: number; label: 0 | 1 }[] = [];

  for (const example of testData) {
    const prob = predictProbability(example.features, coefficients);
    const predicted = prob >= 50 ? 1 : 0;
    
    predictions.push({ prob, label: example.label });

    if (predicted === 1 && example.label === 1) tp++;
    else if (predicted === 1 && example.label === 0) fp++;
    else if (predicted === 0 && example.label === 0) tn++;
    else fn++;
  }

  const accuracy = (tp + tn) / testData.length;
  const precision = tp > 0 ? tp / (tp + fp) : 0;
  const recall = tp > 0 ? tp / (tp + fn) : 0;
  const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

  // Simple AUC approximation
  const auc = calculateAUC(predictions);

  // Calibration error (mean absolute error between predicted prob and actual rate)
  const calibrationError = calculateCalibrationError(predictions);

  return {
    accuracy: accuracy * 100,
    precision: precision * 100,
    recall: recall * 100,
    f1Score: f1Score * 100,
    auc: auc * 100,
    calibrationError,
  };
}

/**
 * Calculate AUC using trapezoidal rule
 */
function calculateAUC(predictions: { prob: number; label: 0 | 1 }[]): number {
  // Sort by probability descending
  const sorted = [...predictions].sort((a, b) => b.prob - a.prob);
  
  const totalPositive = sorted.filter(p => p.label === 1).length;
  const totalNegative = sorted.filter(p => p.label === 0).length;
  
  if (totalPositive === 0 || totalNegative === 0) return 0.5;

  let auc = 0;
  let tpCount = 0;
  let fpCount = 0;
  let prevFPR = 0;
  let prevTPR = 0;

  for (const pred of sorted) {
    if (pred.label === 1) {
      tpCount++;
    } else {
      fpCount++;
    }

    const tpr = tpCount / totalPositive;
    const fpr = fpCount / totalNegative;

    // Trapezoidal area
    auc += (fpr - prevFPR) * (tpr + prevTPR) / 2;

    prevTPR = tpr;
    prevFPR = fpr;
  }

  return auc;
}

/**
 * Calculate calibration error
 */
function calculateCalibrationError(predictions: { prob: number; label: 0 | 1 }[]): number {
  // Group into deciles
  const buckets: { probSum: number; labelSum: number; count: number }[] = [];
  for (let i = 0; i < 10; i++) {
    buckets.push({ probSum: 0, labelSum: 0, count: 0 });
  }

  for (const pred of predictions) {
    const bucketIdx = Math.min(9, Math.floor(pred.prob / 10));
    buckets[bucketIdx].probSum += pred.prob;
    buckets[bucketIdx].labelSum += pred.label;
    buckets[bucketIdx].count++;
  }

  let totalError = 0;
  let totalCount = 0;

  for (const bucket of buckets) {
    if (bucket.count > 0) {
      const avgProb = bucket.probSum / bucket.count;
      const actualRate = (bucket.labelSum / bucket.count) * 100;
      totalError += Math.abs(avgProb - actualRate) * bucket.count;
      totalCount += bucket.count;
    }
  }

  return totalCount > 0 ? totalError / totalCount : 0;
}




