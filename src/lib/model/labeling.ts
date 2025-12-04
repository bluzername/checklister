/**
 * Trade Labeling
 * Functions to label historical trades for ML model training
 */

import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * Label trade result for model training
 */
export interface TradeLabelResult {
  label: 0 | 1;
  realizedR: number;
  exitPrice: number;
  exitDate: string;
  exitReason: 'TP1' | 'TP2' | 'TP3' | 'STOP_LOSS' | 'TIME_EXIT' | 'MFE_TRACKING';
  maxFavorableExcursion: number;
  maxAdverseExcursion: number;
  mfeR: number;
  maeR: number;
  holdingDays: number;
}

/**
 * Label a trade by simulating forward from entry
 * 
 * @param ticker - Stock ticker symbol
 * @param entryDate - Date of entry
 * @param entryPrice - Entry price
 * @param stopLoss - Stop loss price
 * @param targetR - R multiple to consider a "win" (default 1.5)
 * @param maxHoldingDays - Maximum days to hold (default 20)
 */
export async function labelTrade(
  ticker: string,
  entryDate: string,
  entryPrice: number,
  stopLoss: number,
  targetR: number = 1.5,
  maxHoldingDays: number = 20
): Promise<TradeLabelResult | null> {
  try {
    const risk = entryPrice - stopLoss;
    if (risk <= 0) {
      console.warn(`Invalid risk for ${ticker}: entry ${entryPrice}, stop ${stopLoss}`);
      return null;
    }

    const targetPrice = entryPrice + (risk * targetR);

    // Fetch forward price data
    const startDate = new Date(entryDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + maxHoldingDays + 5); // Buffer for weekends

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const historical = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    }) as any;

    if (!historical || !historical.quotes || historical.quotes.length === 0) {
      return null;
    }

    // Filter quotes after entry date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const forwardQuotes = historical.quotes.filter((q: any) => {
      const quoteDate = new Date(q.date);
      return quoteDate > startDate && q.close != null;
    });

    if (forwardQuotes.length === 0) {
      return null;
    }

    // Track through price history
    let maxPrice = entryPrice;
    let minPrice = entryPrice;
    let exitPrice = entryPrice;
    let exitDate = entryDate;
    let exitReason: TradeLabelResult['exitReason'] = 'TIME_EXIT';
    let holdingDays = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const quote of forwardQuotes) {
      holdingDays++;
      const high = quote.high as number;
      const low = quote.low as number;
      const close = quote.close as number;
      const quoteDate = new Date(quote.date).toISOString().split('T')[0];

      // Update MFE/MAE
      maxPrice = Math.max(maxPrice, high);
      minPrice = Math.min(minPrice, low);

      // Check stop loss
      if (low <= stopLoss) {
        exitPrice = stopLoss;
        exitDate = quoteDate;
        exitReason = 'STOP_LOSS';
        break;
      }

      // Check target (1.5R for TP1, 2.5R for TP2, 4R for TP3)
      if (high >= targetPrice) {
        exitPrice = targetPrice;
        exitDate = quoteDate;
        
        // Determine which TP was hit
        const r2 = entryPrice + (risk * 2.5);
        const r4 = entryPrice + (risk * 4.0);
        
        if (high >= r4) {
          exitReason = 'TP3';
          exitPrice = r4;
        } else if (high >= r2) {
          exitReason = 'TP2';
          exitPrice = r2;
        } else {
          exitReason = 'TP1';
        }
        break;
      }

      // Check max holding days
      if (holdingDays >= maxHoldingDays) {
        exitPrice = close;
        exitDate = quoteDate;
        exitReason = 'TIME_EXIT';
        break;
      }
    }

    // Calculate metrics
    const realizedR = (exitPrice - entryPrice) / risk;
    const mfeR = (maxPrice - entryPrice) / risk;
    const maeR = (entryPrice - minPrice) / risk;
    const label = realizedR >= targetR ? 1 : 0;

    return {
      label,
      realizedR,
      exitPrice,
      exitDate,
      exitReason,
      maxFavorableExcursion: maxPrice,
      maxAdverseExcursion: minPrice,
      mfeR,
      maeR,
      holdingDays,
    };
  } catch (error) {
    console.error(`Error labeling trade for ${ticker}:`, error);
    return null;
  }
}

/**
 * Batch label multiple trades
 */
export async function batchLabelTrades(
  trades: {
    ticker: string;
    entryDate: string;
    entryPrice: number;
    stopLoss: number;
  }[],
  targetR: number = 1.5,
  maxHoldingDays: number = 20,
  concurrency: number = 3
): Promise<(TradeLabelResult | null)[]> {
  const results: (TradeLabelResult | null)[] = [];

  // Process in batches
  for (let i = 0; i < trades.length; i += concurrency) {
    const batch = trades.slice(i, i + concurrency);
    
    const batchResults = await Promise.all(
      batch.map(trade =>
        labelTrade(
          trade.ticker,
          trade.entryDate,
          trade.entryPrice,
          trade.stopLoss,
          targetR,
          maxHoldingDays
        )
      )
    );

    results.push(...batchResults);

    // Rate limiting
    if (i + concurrency < trades.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

/**
 * Calculate label statistics from a set of labeled trades
 */
export function calculateLabelStats(labels: TradeLabelResult[]): {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgR: number;
  avgWinR: number;
  avgLossR: number;
  avgMFE: number;
  avgMAE: number;
  avgHoldingDays: number;
  exitReasonDistribution: Record<string, number>;
} {
  if (labels.length === 0) {
    return {
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      winRate: 0,
      avgR: 0,
      avgWinR: 0,
      avgLossR: 0,
      avgMFE: 0,
      avgMAE: 0,
      avgHoldingDays: 0,
      exitReasonDistribution: {},
    };
  }

  const winners = labels.filter(l => l.label === 1);
  const losers = labels.filter(l => l.label === 0);

  const exitReasonDistribution: Record<string, number> = {};
  for (const label of labels) {
    exitReasonDistribution[label.exitReason] = (exitReasonDistribution[label.exitReason] || 0) + 1;
  }

  return {
    totalTrades: labels.length,
    winCount: winners.length,
    lossCount: losers.length,
    winRate: (winners.length / labels.length) * 100,
    avgR: labels.reduce((s, l) => s + l.realizedR, 0) / labels.length,
    avgWinR: winners.length > 0 ? winners.reduce((s, l) => s + l.realizedR, 0) / winners.length : 0,
    avgLossR: losers.length > 0 ? Math.abs(losers.reduce((s, l) => s + l.realizedR, 0) / losers.length) : 0,
    avgMFE: labels.reduce((s, l) => s + l.mfeR, 0) / labels.length,
    avgMAE: labels.reduce((s, l) => s + l.maeR, 0) / labels.length,
    avgHoldingDays: labels.reduce((s, l) => s + l.holdingDays, 0) / labels.length,
    exitReasonDistribution,
  };
}

/**
 * Analyze optimal exit by looking at MFE distribution
 */
export function analyzeOptimalExit(labels: TradeLabelResult[]): {
  optimalTP1: number;
  optimalTP2: number;
  optimalTP3: number;
  mfeDistribution: { r: number; percentReached: number }[];
} {
  if (labels.length === 0) {
    return {
      optimalTP1: 1.5,
      optimalTP2: 2.5,
      optimalTP3: 4.0,
      mfeDistribution: [],
    };
  }

  // Sort by MFE
  const sortedByMFE = [...labels].sort((a, b) => a.mfeR - b.mfeR);
  
  // Calculate what percent of trades reached each R level
  const rLevels = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0];
  const mfeDistribution = rLevels.map(r => ({
    r,
    percentReached: (labels.filter(l => l.mfeR >= r).length / labels.length) * 100,
  }));

  // Find optimal TP levels based on MFE distribution
  // TP1: ~70% of winners reach this (quick profit lock-in)
  // TP2: ~40% of winners reach this (good extension)
  // TP3: ~15% of winners reach this (runner target)
  
  let optimalTP1 = 1.5;
  let optimalTP2 = 2.5;
  let optimalTP3 = 4.0;

  for (const point of mfeDistribution) {
    if (point.percentReached >= 70 && point.r > optimalTP1) {
      optimalTP1 = point.r;
    }
    if (point.percentReached >= 40 && point.r > optimalTP2) {
      optimalTP2 = point.r;
    }
    if (point.percentReached >= 15 && point.r > optimalTP3) {
      optimalTP3 = point.r;
    }
  }

  // Fallback to reasonable defaults
  optimalTP1 = Math.max(1.0, Math.min(optimalTP1, 2.0));
  optimalTP2 = Math.max(optimalTP1 + 0.5, Math.min(optimalTP2, 3.5));
  optimalTP3 = Math.max(optimalTP2 + 0.5, Math.min(optimalTP3, 6.0));

  return {
    optimalTP1,
    optimalTP2,
    optimalTP3,
    mfeDistribution,
  };
}




