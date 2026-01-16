/**
 * Politician Exit Evaluator
 * Wraps the trained exit model for use in the web application
 */

import {
  loadPoliticianExitModel,
  generateExitSignal,
  extractExitFeatures,
  PriceBar,
  ExitSignal,
  ExitFeatureVector,
} from '@/lib/backtest/politician-exit-model';
import { getHistoricalPrices, HistoricalData } from '@/lib/data-services/fmp-historical';
import type {
  PoliticianPosition,
  ExitEvaluation,
  ExitConfidence,
  ExitFeatureSnapshot,
} from './types';

/**
 * Convert HistoricalData to PriceBar array
 */
function historicalDataToPriceBars(data: HistoricalData): PriceBar[] {
  return data.quotes.map((q) => ({
    date: q.date,
    open: q.open,
    high: q.high,
    low: q.low,
    close: q.close,
    volume: q.volume,
  })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// ============================================
// Configuration
// ============================================

const EXIT_THRESHOLD = 0.50; // Default threshold for exit recommendation
const MAX_HOLDING_DAYS = 25; // Force exit recommendation after this many days
const PROFIT_PROTECTION_THRESHOLD = 2.0; // Lower exit threshold when above 2R

// ============================================
// Main Evaluation Function
// ============================================

export interface EvaluatePositionResult {
  exitProbability: number;
  confidence: ExitConfidence;
  shouldExit: boolean;
  reasons: string[];
  features: ExitFeatureSnapshot;
}

/**
 * Evaluate a single position for exit timing
 */
export async function evaluatePositionExit(
  position: PoliticianPosition,
  exitThreshold: number = EXIT_THRESHOLD
): Promise<EvaluatePositionResult> {
  // Fetch price history for the ticker
  const endDate = new Date();
  const startDate = new Date(position.entry_date);
  startDate.setDate(startDate.getDate() - 60); // Get extra history for indicators

  const priceData = await getHistoricalPrices(position.ticker, startDate, endDate);

  if (!priceData || !priceData.quotes || priceData.quotes.length < 20) {
    throw new Error(`Insufficient price data for ${position.ticker}`);
  }

  // Convert to PriceBar format
  const prices = historicalDataToPriceBars(priceData);

  // Find entry index
  const entryIdx = prices.findIndex((p) => p.date >= position.entry_date);
  if (entryIdx === -1) {
    throw new Error(`Entry date ${position.entry_date} not found in price data`);
  }

  const currentIdx = prices.length - 1;

  // Calculate stop loss if not set (use 1.5 ATR)
  let stopLoss = position.stop_loss;
  if (!stopLoss) {
    const atr = calculateSimpleATR(prices, entryIdx, 14);
    stopLoss = position.entry_price - 1.5 * atr;
  }

  // Fetch SPY data for market context
  let spyPrices: PriceBar[] | undefined;
  let spyCurrentIdx: number | undefined;
  try {
    const spyData = await getHistoricalPrices('SPY', startDate, endDate);
    if (spyData && spyData.quotes && spyData.quotes.length > 0) {
      spyPrices = historicalDataToPriceBars(spyData);
      spyCurrentIdx = spyPrices.length - 1;
    }
  } catch {
    // SPY data is optional, continue without it
  }

  // Extract features
  const features = extractExitFeatures(
    prices,
    position.entry_price,
    stopLoss,
    currentIdx,
    entryIdx,
    spyPrices,
    spyCurrentIdx
  );

  // Adjust threshold based on position state
  let adjustedThreshold = exitThreshold;

  // Lower threshold if significantly profitable (protect gains)
  if (features.unrealized_r >= PROFIT_PROTECTION_THRESHOLD) {
    adjustedThreshold = Math.min(adjustedThreshold, 0.40);
  }

  // Force exit recommendation after max holding days
  if (features.holding_days >= MAX_HOLDING_DAYS) {
    adjustedThreshold = 0.30; // Very low threshold - strong exit bias
  }

  // Generate exit signal
  const exitSignal = generateExitSignal(features, adjustedThreshold);

  // Add holding day warning to reasons if applicable
  const reasons = [...exitSignal.reasons];
  if (features.holding_days >= MAX_HOLDING_DAYS && !exitSignal.shouldExit) {
    reasons.push(`WARNING: Position held ${features.holding_days} days - consider exiting`);
  }

  return {
    exitProbability: exitSignal.exitProbability,
    confidence: exitSignal.confidence,
    shouldExit: exitSignal.shouldExit,
    reasons,
    features: features as ExitFeatureSnapshot,
  };
}

/**
 * Evaluate multiple positions in batch
 */
export async function evaluateMultiplePositions(
  positions: PoliticianPosition[],
  exitThreshold: number = EXIT_THRESHOLD
): Promise<Map<string, EvaluatePositionResult>> {
  const results = new Map<string, EvaluatePositionResult>();

  // Process positions with rate limiting
  for (const position of positions) {
    try {
      const result = await evaluatePositionExit(position, exitThreshold);
      results.set(position.id, result);

      // Rate limit: wait 200ms between API calls
      await delay(200);
    } catch (error) {
      console.error(`Error evaluating position ${position.id} (${position.ticker}):`, error);
      // Continue with other positions
    }
  }

  return results;
}

// ============================================
// Model Info
// ============================================

export interface ModelInfo {
  version: string;
  trainedAt: string;
  trainingSamples: number;
  validationAccuracy: number;
  auc: number;
  topExitFactors: Array<{ feature: string; weight: number }>;
  topHoldFactors: Array<{ feature: string; weight: number }>;
}

/**
 * Get information about the loaded model
 */
export function getModelInfo(): ModelInfo {
  const model = loadPoliticianExitModel();

  // Sort weights by absolute value
  const sortedWeights = Object.entries(model.weights)
    .map(([feature, weight]) => ({ feature, weight }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  const topExitFactors = sortedWeights
    .filter((w) => w.weight > 0)
    .slice(0, 5);

  const topHoldFactors = sortedWeights
    .filter((w) => w.weight < 0)
    .slice(0, 5)
    .map((w) => ({ feature: w.feature, weight: Math.abs(w.weight) }));

  return {
    version: model.version,
    trainedAt: model.trainedAt,
    trainingSamples: model.trainingSamples,
    validationAccuracy: model.validationAccuracy,
    auc: model.metrics.auc,
    topExitFactors,
    topHoldFactors,
  };
}

// ============================================
// Helper Functions
// ============================================

function calculateSimpleATR(prices: PriceBar[], endIdx: number, period: number): number {
  if (endIdx < period) return prices[endIdx].high - prices[endIdx].low;

  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) {
    const tr = Math.max(
      prices[i].high - prices[i].low,
      i > 0 ? Math.abs(prices[i].high - prices[i - 1].close) : 0,
      i > 0 ? Math.abs(prices[i].low - prices[i - 1].close) : 0
    );
    sum += tr;
  }
  return sum / period;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Feature Explanation
// ============================================

export interface FeatureExplanation {
  feature: string;
  value: number;
  contribution: 'exit' | 'hold' | 'neutral';
  description: string;
}

/**
 * Explain what each feature means for a given evaluation
 */
export function explainFeatures(features: ExitFeatureSnapshot): FeatureExplanation[] {
  const model = loadPoliticianExitModel();
  const explanations: FeatureExplanation[] = [];

  const featureDescriptions: Record<string, (value: number) => string> = {
    holding_days: (v) => `Position held for ${v} trading days`,
    unrealized_r: (v) => `Currently at ${v.toFixed(2)}R ${v >= 0 ? 'profit' : 'loss'}`,
    unrealized_pct: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}% return`,
    return_from_high: (v) => `${v.toFixed(1)}% from highest point`,
    return_last_5d: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}% over last 5 days`,
    return_last_3d: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}% over last 3 days`,
    return_last_1d: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}% today`,
    rsi_14: (v) => `RSI(14) at ${v.toFixed(0)} (${v > 70 ? 'overbought' : v < 30 ? 'oversold' : 'neutral'})`,
    price_vs_20sma: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}% vs 20-day SMA`,
    price_vs_50sma: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}% vs 50-day SMA`,
    spy_return_5d: (v) => `SPY ${v >= 0 ? '+' : ''}${v.toFixed(1)}% over 5 days`,
    atr_percent: (v) => `ATR is ${v.toFixed(1)}% of price (volatility)`,
  };

  for (const [feature, value] of Object.entries(features)) {
    const weight = model.weights[feature] || 0;
    const mean = model.featureMeans[feature] || 0;
    const std = model.featureStds[feature] || 1;

    // Calculate normalized contribution
    const normalized = std > 0.0001 ? (value - mean) / std : 0;
    const contribution = weight * normalized;

    let contributionType: 'exit' | 'hold' | 'neutral' = 'neutral';
    if (Math.abs(contribution) > 0.1) {
      contributionType = contribution > 0 ? 'exit' : 'hold';
    }

    const descriptionFn = featureDescriptions[feature];
    const description = descriptionFn ? descriptionFn(value) : `${feature}: ${value.toFixed(2)}`;

    explanations.push({
      feature,
      value,
      contribution: contributionType,
      description,
    });
  }

  // Sort by absolute contribution
  return explanations.sort((a, b) => {
    const aWeight = Math.abs(model.weights[a.feature] || 0);
    const bWeight = Math.abs(model.weights[b.feature] || 0);
    return bWeight - aWeight;
  });
}

// ============================================
// Export Types
// ============================================

export type { ExitSignal, ExitFeatureVector, PriceBar };
