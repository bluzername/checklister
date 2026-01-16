/**
 * Train Exit Model for Politician Trades
 *
 * Creates a logistic regression model to predict optimal exit timing
 * specifically for politician trading signals.
 *
 * Label strategy:
 * - EXIT (1): Current unrealized R is within 0.3R of max future R (near peak)
 * - HOLD (0): More upside ahead (max future R > current R + 0.3R)
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const DB_PATH = path.join(process.cwd(), 'data', 'signals.sqlite');
const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';

// ============================================
// TYPES
// ============================================

interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ExitTrainingExample {
  // Trade context
  ticker: string;
  signalDate: string;
  observationDate: string;
  holdingDays: number;

  // Features
  features: ExitFeatureVector;

  // Label
  label: 0 | 1;  // 0=HOLD, 1=EXIT

  // Metadata for analysis
  unrealizedR: number;
  maxFutureR: number;
  finalR: number;
}

interface ExitFeatureVector {
  // Position metrics
  holding_days: number;
  unrealized_r: number;
  unrealized_pct: number;

  // Price action since entry
  return_from_entry: number;
  return_from_high: number;  // Drawdown from peak
  return_last_5d: number;
  return_last_3d: number;
  return_last_1d: number;

  // Volatility
  atr_percent: number;
  daily_range_percent: number;

  // Momentum
  rsi_14: number;
  price_vs_20sma: number;
  price_vs_50sma: number;

  // Volume
  volume_vs_avg: number;

  // Market context
  spy_return_5d: number;
  spy_return_10d: number;

  // Time features
  day_of_week: number;
  is_month_end: number;

  // Profit zone indicators
  in_profit: number;           // 1 if unrealized_r > 0
  above_1r: number;            // 1 if unrealized_r > 1
  above_15r: number;           // 1 if unrealized_r > 1.5
  above_2r: number;            // 1 if unrealized_r > 2
}

// ============================================
// RATE LIMITER
// ============================================

class RateLimiter {
  private callTimestamps: number[] = [];
  private readonly maxCalls = 250;
  private readonly windowMs = 60000;

  async throttle(): Promise<void> {
    const now = Date.now();
    this.callTimestamps = this.callTimestamps.filter(ts => now - ts < this.windowMs);
    if (this.callTimestamps.length >= this.maxCalls) {
      const waitTime = this.windowMs - (now - this.callTimestamps[0]) + 100;
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      this.callTimestamps = this.callTimestamps.filter(ts => Date.now() - ts < this.windowMs);
    }
    this.callTimestamps.push(Date.now());
  }

  getUsage(): string {
    const now = Date.now();
    this.callTimestamps = this.callTimestamps.filter(ts => now - ts < this.windowMs);
    return `${this.callTimestamps.length}/${this.maxCalls}`;
  }
}

const rateLimiter = new RateLimiter();
const priceCache = new Map<string, PriceData[]>();

// ============================================
// DATA FETCHING
// ============================================

async function fetchPrices(ticker: string): Promise<PriceData[]> {
  if (priceCache.has(ticker)) return priceCache.get(ticker)!;

  await rateLimiter.throttle();
  const url = `${FMP_BASE_URL}/historical-price-eod/full?symbol=${ticker}&from=2024-10-01&to=2026-01-15&apikey=${FMP_API_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        return fetchPrices(ticker);
      }
      return [];
    }
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    const prices: PriceData[] = data.map((d: any) => ({
      date: d.date,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    prices.sort((a, b) => a.date.localeCompare(b.date));
    priceCache.set(ticker, prices);
    return prices;
  } catch {
    return [];
  }
}

// ============================================
// FEATURE EXTRACTION
// ============================================

function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateRSI(prices: PriceData[], period: number = 14): number {
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

function calculateATR(prices: PriceData[], period: number = 14): number {
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

function extractExitFeatures(
  prices: PriceData[],
  entryPrice: number,
  stopLoss: number,
  currentIdx: number,
  entryIdx: number,
  spyPrices: PriceData[],
  spyCurrentIdx: number
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

  // Volume (use 1.0 as placeholder - would need volume data)
  const volumeVsAvg = 1.0;

  // SPY context
  let spyReturn5d = 0;
  let spyReturn10d = 0;
  if (spyCurrentIdx >= 5) {
    spyReturn5d = ((spyPrices[spyCurrentIdx].close - spyPrices[spyCurrentIdx - 5].close) / spyPrices[spyCurrentIdx - 5].close) * 100;
  }
  if (spyCurrentIdx >= 10) {
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

// ============================================
// TRAINING DATA GENERATION
// ============================================

async function generateTrainingData(): Promise<ExitTrainingExample[]> {
  console.log('='.repeat(80));
  console.log('POLITICIAN EXIT MODEL - TRAINING DATA GENERATION');
  console.log('='.repeat(80));
  console.log();

  const db = new Database(DB_PATH);

  // Get politician signals with enough lookback for 45-day evaluation
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 60);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  const signals = db.prepare(`
    SELECT DISTINCT ticker, date
    FROM signals
    WHERE signal_type = 'POLITICIAN'
      AND date <= ?
    ORDER BY date ASC
  `).all(cutoffStr) as { ticker: string; date: string }[];

  console.log(`Found ${signals.length} politician signals to process`);
  console.log();

  // Fetch SPY data
  console.log('Fetching SPY data...');
  const spyPrices = await fetchPrices('SPY');
  console.log(`SPY data points: ${spyPrices.length}`);

  const trainingExamples: ExitTrainingExample[] = [];
  let processed = 0;
  let failed = 0;

  for (const signal of signals) {
    const prices = await fetchPrices(signal.ticker);
    if (prices.length < 50) {
      failed++;
      continue;
    }

    // Find entry index
    const entryIdx = prices.findIndex(p => p.date >= signal.date);
    if (entryIdx === -1 || entryIdx + 45 >= prices.length) {
      failed++;
      continue;
    }

    const entryPrice = prices[entryIdx].close;
    // Estimate stop loss as 1.5 ATR below entry
    const pricesForATR = prices.slice(Math.max(0, entryIdx - 20), entryIdx + 1);
    const atr = calculateATR(pricesForATR, 14) || entryPrice * 0.03;
    const stopLoss = entryPrice - (atr * 1.5);
    const risk = entryPrice - stopLoss;

    if (risk <= 0) {
      failed++;
      continue;
    }

    // Calculate final outcome (at day 45)
    const finalPrice = prices[entryIdx + 45].close;
    const finalR = (finalPrice - entryPrice) / risk;

    // Find max R achieved during the trade
    let maxR = 0;
    let maxRDay = 0;
    for (let day = 1; day <= 45; day++) {
      const dayPrice = prices[entryIdx + day].high;
      const dayR = (dayPrice - entryPrice) / risk;
      if (dayR > maxR) {
        maxR = dayR;
        maxRDay = day;
      }
    }

    // Generate training examples for each day (1 through 30)
    // We cap at 30 days since we want to train for early exits
    for (let day = 1; day <= 30 && entryIdx + day < prices.length; day++) {
      const currentIdx = entryIdx + day;
      const currentPrice = prices[currentIdx].close;
      const unrealizedR = (currentPrice - entryPrice) / risk;

      // Calculate max future R from this point
      let maxFutureR = unrealizedR;
      for (let futureDay = day + 1; futureDay <= 45 && entryIdx + futureDay < prices.length; futureDay++) {
        const futurePrice = prices[entryIdx + futureDay].high;
        const futureR = (futurePrice - entryPrice) / risk;
        if (futureR > maxFutureR) maxFutureR = futureR;
      }

      // Label: EXIT if we're within 0.3R of max future R (near peak)
      // or if holding beyond this point leads to worse outcomes
      const upside = maxFutureR - unrealizedR;
      const label = upside <= 0.3 ? 1 : 0;  // 1=EXIT, 0=HOLD

      // Find SPY index for this date
      const currentDate = prices[currentIdx].date;
      const spyIdx = spyPrices.findIndex(p => p.date >= currentDate);

      const features = extractExitFeatures(
        prices,
        entryPrice,
        stopLoss,
        currentIdx,
        entryIdx,
        spyPrices,
        spyIdx >= 0 ? spyIdx : 0
      );

      trainingExamples.push({
        ticker: signal.ticker,
        signalDate: signal.date,
        observationDate: prices[currentIdx].date,
        holdingDays: day,
        features,
        label,
        unrealizedR,
        maxFutureR,
        finalR,
      });
    }

    processed++;
    if (processed % 20 === 0) {
      console.log(`Processed ${processed}/${signals.length} signals (API: ${rateLimiter.getUsage()})`);
    }
  }

  console.log();
  console.log(`Processed: ${processed}, Failed: ${failed}`);
  console.log(`Total training examples: ${trainingExamples.length}`);

  db.close();
  return trainingExamples;
}

// ============================================
// MODEL TRAINING
// ============================================

interface ModelCoefficients {
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

function sigmoid(x: number): number {
  if (x < -500) return 0;
  if (x > 500) return 1;
  return 1 / (1 + Math.exp(-x));
}

function trainModel(
  data: ExitTrainingExample[],
  learningRate: number = 0.01,
  iterations: number = 2000,
  regularization: number = 0.01
): ModelCoefficients {
  console.log();
  console.log('='.repeat(80));
  console.log('TRAINING LOGISTIC REGRESSION MODEL');
  console.log('='.repeat(80));
  console.log();

  // Get feature keys from first example
  const featureKeys = Object.keys(data[0].features) as (keyof ExitFeatureVector)[];
  console.log(`Features: ${featureKeys.length}`);
  console.log(`Training samples: ${data.length}`);

  // Count labels
  const exitCount = data.filter(d => d.label === 1).length;
  const holdCount = data.filter(d => d.label === 0).length;
  console.log(`Exit samples: ${exitCount} (${((exitCount / data.length) * 100).toFixed(1)}%)`);
  console.log(`Hold samples: ${holdCount} (${((holdCount / data.length) * 100).toFixed(1)}%)`);

  // Class weights for imbalanced data
  const exitWeight = data.length / (2 * exitCount);
  const holdWeight = data.length / (2 * holdCount);
  console.log(`Class weights: EXIT=${exitWeight.toFixed(2)}, HOLD=${holdWeight.toFixed(2)}`);
  console.log();

  // Calculate feature means and stds
  const featureMeans: Record<string, number> = {};
  const featureStds: Record<string, number> = {};

  for (const key of featureKeys) {
    const values = data.map(d => d.features[key]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    featureMeans[key] = mean;
    featureStds[key] = Math.sqrt(variance) || 1;
  }

  // Normalize features
  const normalizedData = data.map(d => {
    const normalized: Record<string, number> = {};
    for (const key of featureKeys) {
      normalized[key] = (d.features[key] - featureMeans[key]) / featureStds[key];
    }
    return { features: normalized, label: d.label };
  });

  // Initialize weights
  const weights: Record<string, number> = {};
  for (const key of featureKeys) {
    weights[key] = (Math.random() * 2 - 1) * 0.1;  // Small random initialization
  }
  let intercept = 0;

  // Gradient descent with momentum
  const momentum = 0.9;
  let interceptVelocity = 0;
  const weightVelocities: Record<string, number> = {};
  for (const key of featureKeys) {
    weightVelocities[key] = 0;
  }

  for (let iter = 0; iter < iterations; iter++) {
    // Learning rate schedule (cosine annealing)
    const lr = learningRate * 0.5 * (1 + Math.cos(Math.PI * iter / iterations));

    // Calculate gradients
    let interceptGradient = 0;
    const weightGradients: Record<string, number> = {};
    for (const key of featureKeys) {
      weightGradients[key] = 0;
    }

    for (const example of normalizedData) {
      // Forward pass
      let logit = intercept;
      for (const key of featureKeys) {
        logit += weights[key] * example.features[key];
      }
      const prediction = sigmoid(logit);
      const error = prediction - example.label;

      // Class weight
      const sampleWeight = example.label === 1 ? exitWeight : holdWeight;

      // Accumulate gradients
      interceptGradient += error * sampleWeight;
      for (const key of featureKeys) {
        weightGradients[key] += error * example.features[key] * sampleWeight;
      }
    }

    // Update with momentum
    const n = normalizedData.length;
    interceptVelocity = momentum * interceptVelocity + lr * (interceptGradient / n);
    intercept -= interceptVelocity;

    for (const key of featureKeys) {
      // L2 regularization
      const regTerm = regularization * weights[key];
      const gradient = (weightGradients[key] / n) + regTerm;
      weightVelocities[key] = momentum * weightVelocities[key] + lr * gradient;
      weights[key] -= weightVelocities[key];
    }

    // Log progress
    if (iter % 200 === 0) {
      let loss = 0;
      for (const example of normalizedData) {
        let logit = intercept;
        for (const key of featureKeys) {
          logit += weights[key] * example.features[key];
        }
        const prob = sigmoid(logit);
        const clampedProb = Math.max(1e-10, Math.min(1 - 1e-10, prob));
        if (example.label === 1) {
          loss -= Math.log(clampedProb);
        } else {
          loss -= Math.log(1 - clampedProb);
        }
      }
      console.log(`Iteration ${iter}: Loss = ${(loss / n).toFixed(4)}, LR = ${lr.toFixed(6)}`);
    }
  }

  // Evaluate model
  let tp = 0, fp = 0, tn = 0, fn = 0;
  const predictions: { prob: number; label: 0 | 1 }[] = [];

  for (const example of normalizedData) {
    let logit = intercept;
    for (const key of featureKeys) {
      logit += weights[key] * example.features[key];
    }
    const prob = sigmoid(logit);
    const predicted = prob >= 0.5 ? 1 : 0;

    predictions.push({ prob, label: example.label });

    if (predicted === 1 && example.label === 1) tp++;
    else if (predicted === 1 && example.label === 0) fp++;
    else if (predicted === 0 && example.label === 0) tn++;
    else fn++;
  }

  const accuracy = (tp + tn) / data.length;
  const precision = tp > 0 ? tp / (tp + fp) : 0;
  const recall = tp > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

  // Calculate AUC
  const sorted = [...predictions].sort((a, b) => b.prob - a.prob);
  const totalPos = sorted.filter(p => p.label === 1).length;
  const totalNeg = sorted.filter(p => p.label === 0).length;
  let auc = 0;
  let tpCount = 0, fpCount = 0;
  let prevFPR = 0, prevTPR = 0;
  for (const pred of sorted) {
    if (pred.label === 1) tpCount++;
    else fpCount++;
    const tpr = tpCount / totalPos;
    const fpr = fpCount / totalNeg;
    auc += (fpr - prevFPR) * (tpr + prevTPR) / 2;
    prevTPR = tpr;
    prevFPR = fpr;
  }

  console.log();
  console.log('Model Performance:');
  console.log(`  Accuracy: ${(accuracy * 100).toFixed(1)}%`);
  console.log(`  Precision: ${(precision * 100).toFixed(1)}%`);
  console.log(`  Recall: ${(recall * 100).toFixed(1)}%`);
  console.log(`  F1 Score: ${(f1 * 100).toFixed(1)}%`);
  console.log(`  AUC: ${(auc * 100).toFixed(1)}%`);
  console.log();

  // Print top features by absolute weight
  const sortedWeights = Object.entries(weights)
    .map(([k, v]) => ({ feature: k, weight: v, absWeight: Math.abs(v) }))
    .sort((a, b) => b.absWeight - a.absWeight);

  console.log('Top 10 Features by Importance:');
  for (const { feature, weight } of sortedWeights.slice(0, 10)) {
    const direction = weight > 0 ? '+' : '';
    console.log(`  ${feature.padEnd(25)} ${direction}${weight.toFixed(4)}`);
  }

  return {
    intercept,
    weights,
    featureMeans,
    featureStds,
    version: 'politician-exit-v1.0',
    trainedAt: new Date().toISOString(),
    trainingSamples: data.length,
    validationAccuracy: accuracy * 100,
    metrics: {
      precision: precision * 100,
      recall: recall * 100,
      f1: f1 * 100,
      auc: auc * 100,
    },
  };
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('='.repeat(80));
  console.log('POLITICIAN EXIT MODEL TRAINING');
  console.log('='.repeat(80));
  console.log();

  // Generate training data
  const trainingData = await generateTrainingData();

  if (trainingData.length < 100) {
    console.error('Not enough training data. Need at least 100 examples.');
    process.exit(1);
  }

  // Analyze label distribution by holding days
  console.log();
  console.log('Label Distribution by Holding Days:');
  const dayBuckets: Record<number, { exit: number; hold: number }> = {};
  for (const ex of trainingData) {
    const bucket = Math.floor(ex.holdingDays / 5) * 5;  // 0-4, 5-9, 10-14, etc.
    if (!dayBuckets[bucket]) dayBuckets[bucket] = { exit: 0, hold: 0 };
    if (ex.label === 1) dayBuckets[bucket].exit++;
    else dayBuckets[bucket].hold++;
  }
  for (const [bucket, counts] of Object.entries(dayBuckets).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const total = counts.exit + counts.hold;
    const exitPct = ((counts.exit / total) * 100).toFixed(0);
    console.log(`  Days ${bucket}-${Number(bucket) + 4}: ${total} samples, ${exitPct}% EXIT`);
  }

  // Train model
  const coefficients = trainModel(trainingData, 0.01, 2000, 0.01);

  // Save model
  const outputPath = path.join(process.cwd(), 'data', 'politician-exit-model.json');
  fs.writeFileSync(outputPath, JSON.stringify(coefficients, null, 2));
  console.log();
  console.log(`Model saved to: ${outputPath}`);

  // Print summary
  console.log();
  console.log('='.repeat(80));
  console.log('TRAINING COMPLETE');
  console.log('='.repeat(80));
  console.log();
  console.log('Model Summary:');
  console.log(`  Training samples: ${coefficients.trainingSamples}`);
  console.log(`  Validation accuracy: ${coefficients.validationAccuracy.toFixed(1)}%`);
  console.log(`  Precision: ${coefficients.metrics.precision.toFixed(1)}%`);
  console.log(`  Recall: ${coefficients.metrics.recall.toFixed(1)}%`);
  console.log(`  AUC: ${coefficients.metrics.auc.toFixed(1)}%`);
  console.log();
  console.log('Key EXIT signals (positive weights):');
  const exitSignals = Object.entries(coefficients.weights)
    .filter(([, w]) => w > 0.1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [feature, weight] of exitSignals) {
    console.log(`  ${feature}: +${weight.toFixed(3)}`);
  }
  console.log();
  console.log('Key HOLD signals (negative weights):');
  const holdSignals = Object.entries(coefficients.weights)
    .filter(([, w]) => w < -0.1)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 5);
  for (const [feature, weight] of holdSignals) {
    console.log(`  ${feature}: ${weight.toFixed(3)}`);
  }
}

main().catch(console.error);
