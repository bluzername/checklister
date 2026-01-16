/**
 * Politician Exit Model
 * Predicts optimal exit timing for politician trading signals
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// TYPES
// ============================================

export interface ExitFeatureVector {
  holding_days: number;
  unrealized_r: number;
  unrealized_pct: number;
  return_from_entry: number;
  return_from_high: number;
  return_last_5d: number;
  return_last_3d: number;
  return_last_1d: number;
  atr_percent: number;
  daily_range_percent: number;
  rsi_14: number;
  price_vs_20sma: number;
  price_vs_50sma: number;
  volume_vs_avg: number;
  spy_return_5d: number;
  spy_return_10d: number;
  day_of_week: number;
  is_month_end: number;
  in_profit: number;
  above_1r: number;
  above_15r: number;
  above_2r: number;
}

export interface ExitModelCoefficients {
  intercept: number;
  weights: Record<string, number>;
  featureMeans: Record<string, number>;
  featureStds: Record<string, number>;
  version: string;
  trainedAt: string;
  trainingSamples: number;
  validationAccuracy: number;
  metrics: {
    precision: number;
    recall: number;
    f1: number;
    auc: number;
  };
}

export interface ExitSignal {
  shouldExit: boolean;
  exitProbability: number;
  confidence: 'low' | 'medium' | 'high' | 'very_high';
  reasons: string[];
  features: ExitFeatureVector;
}

// ============================================
// MODEL LOADING
// ============================================

let cachedModel: ExitModelCoefficients | null = null;

export function loadPoliticianExitModel(): ExitModelCoefficients {
  if (cachedModel) return cachedModel;

  const modelPath = path.join(process.cwd(), 'data', 'politician-exit-model.json');

  if (!fs.existsSync(modelPath)) {
    throw new Error(`Politician exit model not found: ${modelPath}. Run: npx tsx scripts/train-politician-exit-model.ts`);
  }

  cachedModel = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
  return cachedModel!;
}

// ============================================
// PREDICTION
// ============================================

function sigmoid(x: number): number {
  if (x < -500) return 0;
  if (x > 500) return 1;
  return 1 / (1 + Math.exp(-x));
}

/**
 * Predict exit probability (0-1)
 * Higher = more likely should exit
 */
export function predictExitProbability(
  features: ExitFeatureVector,
  model?: ExitModelCoefficients
): number {
  const m = model || loadPoliticianExitModel();
  const { intercept, weights, featureMeans, featureStds } = m;

  let z = intercept;
  for (const [key, weight] of Object.entries(weights)) {
    const value = features[key as keyof ExitFeatureVector] ?? 0;
    const mean = featureMeans[key] ?? 0;
    const std = featureStds[key] ?? 1;
    const normalized = std > 0.0001 ? (value - mean) / std : 0;
    z += weight * normalized;
  }

  return sigmoid(z);
}

/**
 * Generate exit signal with reasoning
 */
export function generateExitSignal(
  features: ExitFeatureVector,
  exitThreshold: number = 0.50
): ExitSignal {
  const model = loadPoliticianExitModel();
  const exitProbability = predictExitProbability(features, model);

  // Determine confidence
  let confidence: ExitSignal['confidence'];
  if (exitProbability > 0.70) {
    confidence = 'very_high';
  } else if (exitProbability > 0.60) {
    confidence = 'high';
  } else if (exitProbability > 0.50) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Determine if should exit
  const shouldExit = exitProbability >= exitThreshold;

  // Generate reasons
  const reasons = generateExitReasons(features, exitProbability, model, shouldExit);

  return {
    shouldExit,
    exitProbability,
    confidence,
    reasons,
    features,
  };
}

function generateExitReasons(
  features: ExitFeatureVector,
  exitProbability: number,
  model: ExitModelCoefficients,
  shouldExit: boolean
): string[] {
  const reasons: string[] = [];
  const { weights, featureMeans, featureStds } = model;

  // Calculate feature contributions
  const contributions: Array<{ feature: string; contribution: number; value: number }> = [];

  for (const [key, weight] of Object.entries(weights)) {
    const value = features[key as keyof ExitFeatureVector] ?? 0;
    const mean = featureMeans[key] ?? 0;
    const std = featureStds[key] ?? 1;
    const normalized = std > 0.0001 ? (value - mean) / std : 0;
    contributions.push({ feature: key, contribution: weight * normalized, value });
  }

  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  // Add main verdict
  if (shouldExit) {
    reasons.push(`Exit probability: ${(exitProbability * 100).toFixed(1)}% (above threshold)`);
  } else {
    reasons.push(`Exit probability: ${(exitProbability * 100).toFixed(1)}% (below threshold - HOLD)`);
  }

  // Add top contributing factors
  for (const { feature, contribution, value } of contributions.slice(0, 3)) {
    if (Math.abs(contribution) > 0.05) {
      const direction = contribution > 0 ? 'signals EXIT' : 'signals HOLD';
      const featureName = feature.replace(/_/g, ' ');
      reasons.push(`${featureName}: ${value.toFixed(2)} (${direction})`);
    }
  }

  // Add context-specific warnings
  if (features.holding_days >= 20) {
    reasons.push(`Holding ${features.holding_days} days - alpha typically decays`);
  }

  if (features.unrealized_r >= 2) {
    reasons.push(`At ${features.unrealized_r.toFixed(1)}R profit - consider locking gains`);
  }

  if (features.return_from_high < -5) {
    reasons.push(`Down ${Math.abs(features.return_from_high).toFixed(1)}% from high - momentum fading`);
  }

  if (features.rsi_14 > 70) {
    reasons.push('RSI overbought (>70) - potential reversal');
  }

  return reasons;
}

// ============================================
// FEATURE EXTRACTION HELPERS
// ============================================

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Calculate SMA from closing prices
 */
export function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate RSI
 */
export function calculateRSI(prices: PriceBar[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i].close - prices[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate ATR
 */
export function calculateATR(prices: PriceBar[], period: number = 14): number {
  if (prices.length < period + 1) return 0;

  let atrSum = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const tr = Math.max(
      prices[i].high - prices[i].low,
      Math.abs(prices[i].high - prices[i - 1].close),
      Math.abs(prices[i].low - prices[i - 1].close)
    );
    atrSum += tr;
  }
  return atrSum / period;
}

/**
 * Extract exit features from price data
 */
export function extractExitFeatures(
  prices: PriceBar[],
  entryPrice: number,
  stopLoss: number,
  currentIdx: number,
  entryIdx: number,
  spyPrices?: PriceBar[],
  spyCurrentIdx?: number
): ExitFeatureVector {
  const currentPrice = prices[currentIdx].close;
  const holdingDays = currentIdx - entryIdx;
  const risk = entryPrice - stopLoss;
  const unrealizedR = risk > 0 ? (currentPrice - entryPrice) / risk : 0;
  const unrealizedPct = ((currentPrice - entryPrice) / entryPrice) * 100;

  // Find max high since entry
  let maxHigh = entryPrice;
  for (let i = entryIdx; i <= currentIdx; i++) {
    if (prices[i].high > maxHigh) maxHigh = prices[i].high;
  }
  const returnFromHigh = ((currentPrice - maxHigh) / maxHigh) * 100;

  // Recent returns
  const return1d = currentIdx > 0
    ? ((currentPrice - prices[currentIdx - 1].close) / prices[currentIdx - 1].close) * 100
    : 0;
  const return3d = currentIdx >= 3
    ? ((currentPrice - prices[currentIdx - 3].close) / prices[currentIdx - 3].close) * 100
    : 0;
  const return5d = currentIdx >= 5
    ? ((currentPrice - prices[currentIdx - 5].close) / prices[currentIdx - 5].close) * 100
    : 0;

  // Technical indicators
  const closePrices = prices.slice(0, currentIdx + 1).map(p => p.close);
  const sma20 = calculateSMA(closePrices, 20);
  const sma50 = calculateSMA(closePrices, 50);
  const priceVs20SMA = ((currentPrice - sma20) / sma20) * 100;
  const priceVs50SMA = ((currentPrice - sma50) / sma50) * 100;

  const pricesForRSI = prices.slice(0, currentIdx + 1);
  const rsi = calculateRSI(pricesForRSI, 14);

  const atr = calculateATR(pricesForRSI, 14);
  const atrPercent = (atr / currentPrice) * 100;

  const dailyRange = ((prices[currentIdx].high - prices[currentIdx].low) / prices[currentIdx].low) * 100;

  // Volume (use 1.0 as placeholder if not available)
  const volumeVsAvg = 1.0;

  // SPY context
  let spyReturn5d = 0;
  let spyReturn10d = 0;
  if (spyPrices && spyCurrentIdx !== undefined && spyCurrentIdx >= 5) {
    spyReturn5d = ((spyPrices[spyCurrentIdx].close - spyPrices[spyCurrentIdx - 5].close) / spyPrices[spyCurrentIdx - 5].close) * 100;
  }
  if (spyPrices && spyCurrentIdx !== undefined && spyCurrentIdx >= 10) {
    spyReturn10d = ((spyPrices[spyCurrentIdx].close - spyPrices[spyCurrentIdx - 10].close) / spyPrices[spyCurrentIdx - 10].close) * 100;
  }

  // Time features
  const currentDate = new Date(prices[currentIdx].date);
  const dayOfWeek = currentDate.getDay();
  const isMonthEnd = currentDate.getDate() >= 25 ? 1 : 0;

  return {
    holding_days: holdingDays,
    unrealized_r: unrealizedR,
    unrealized_pct: unrealizedPct,
    return_from_entry: unrealizedPct,
    return_from_high: returnFromHigh,
    return_last_5d: return5d,
    return_last_3d: return3d,
    return_last_1d: return1d,
    atr_percent: atrPercent,
    daily_range_percent: dailyRange,
    rsi_14: rsi,
    price_vs_20sma: priceVs20SMA,
    price_vs_50sma: priceVs50SMA,
    volume_vs_avg: volumeVsAvg,
    spy_return_5d: spyReturn5d,
    spy_return_10d: spyReturn10d,
    day_of_week: dayOfWeek,
    is_month_end: isMonthEnd,
    in_profit: unrealizedR > 0 ? 1 : 0,
    above_1r: unrealizedR > 1 ? 1 : 0,
    above_15r: unrealizedR > 1.5 ? 1 : 0,
    above_2r: unrealizedR > 2 ? 1 : 0,
  };
}
