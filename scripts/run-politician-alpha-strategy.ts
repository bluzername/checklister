/**
 * Politician Alpha Strategy Backtest
 *
 * Entry: POLITICIAN signals from channel database
 * Exit: ML-timed using trained exit model
 * Target: 10-15 day holding period, capturing short-term alpha
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { config } from 'dotenv';
import {
  loadPoliticianExitModel,
  generateExitSignal,
  extractExitFeatures,
  calculateATR,
  PriceBar,
} from '../src/lib/backtest/politician-exit-model';

config({ path: '.env.local' });

const DB_PATH = path.join(process.cwd(), 'data', 'signals.sqlite');
const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';

// ============================================
// STRATEGY CONFIG
// ============================================

const STRATEGY_CONFIG = {
  // Entry
  signalType: 'POLITICIAN',
  minStrength: 'MODERATE',  // Include MODERATE, STRONG, VERY_STRONG

  // Exit model
  exitProbabilityThreshold: 0.50,  // Exit when P(exit) >= 50%
  maxHoldingDays: 25,              // Force exit at 25 days

  // Risk management
  riskPerTrade: 0.01,              // 1% per trade
  atrStopMultiple: 1.5,            // Stop at 1.5 ATR below entry
  initialCapital: 100000,
  maxOpenPositions: 10,

  // Transaction costs
  slippagePercent: 0.1,
  commissionPerShare: 0.005,
};

// ============================================
// TYPES
// ============================================

interface Trade {
  ticker: string;
  signalDate: string;
  entryDate: string;
  entryPrice: number;
  stopLoss: number;
  shares: number;
  riskDollars: number;
  exitDate?: string;
  exitPrice?: number;
  exitReason?: 'SIGNAL_EXIT' | 'STOP_LOSS' | 'TIME_EXIT';
  realizedPnl?: number;
  realizedR?: number;
  holdingDays?: number;
  maxR?: number;
  exitProbability?: number;
}

interface BacktestResult {
  trades: Trade[];
  metrics: {
    totalTrades: number;
    winners: number;
    losers: number;
    winRate: number;
    avgReturn: number;
    avgWinR: number;
    avgLossR: number;
    totalPnl: number;
    totalReturn: number;
    maxDrawdown: number;
    sharpeRatio: number;
    profitFactor: number;
    avgHoldingDays: number;
  };
  byExitReason: Record<string, { count: number; avgR: number; winRate: number }>;
  byMonth: Record<string, { count: number; avgR: number; winRate: number; pnl: number }>;
  equityCurve: { date: string; equity: number }[];
}

// ============================================
// RATE LIMITER & DATA FETCHING
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
const priceCache = new Map<string, PriceBar[]>();

async function fetchPrices(ticker: string): Promise<PriceBar[]> {
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

    const prices: PriceBar[] = data.map((d: any) => ({
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
// BACKTEST LOGIC
// ============================================

async function runBacktest(): Promise<BacktestResult> {
  console.log('='.repeat(80));
  console.log('POLITICIAN ALPHA STRATEGY - BACKTEST');
  console.log('='.repeat(80));
  console.log();

  // Load exit model
  console.log('Loading exit model...');
  const exitModel = loadPoliticianExitModel();
  console.log(`Model: ${exitModel.version}, AUC: ${exitModel.metrics.auc.toFixed(1)}%`);
  console.log();

  // Get politician signals
  const db = new Database(DB_PATH);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);  // Need 30 days for exits
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  const signals = db.prepare(`
    SELECT DISTINCT ticker, date, strength, confidence
    FROM signals
    WHERE signal_type = ?
      AND date <= ?
    ORDER BY date ASC
  `).all(STRATEGY_CONFIG.signalType, cutoffStr) as {
    ticker: string;
    date: string;
    strength: string;
    confidence: number;
  }[];

  console.log(`Found ${signals.length} ${STRATEGY_CONFIG.signalType} signals`);
  console.log();

  // Fetch SPY for benchmark
  console.log('Fetching SPY data...');
  const spyPrices = await fetchPrices('SPY');
  console.log(`SPY data points: ${spyPrices.length}`);
  console.log();

  // Process signals
  const trades: Trade[] = [];
  let equity = STRATEGY_CONFIG.initialCapital;
  const equityCurve: { date: string; equity: number }[] = [];
  let processed = 0;

  console.log('Processing signals...');

  for (const signal of signals) {
    const prices = await fetchPrices(signal.ticker);
    if (prices.length < 50) continue;

    // Find entry point (next trading day after signal)
    const entryIdx = prices.findIndex(p => p.date > signal.date);
    if (entryIdx === -1 || entryIdx + 30 >= prices.length) continue;

    const entryPrice = prices[entryIdx].open;
    const entryDate = prices[entryIdx].date;

    // Calculate stop loss (1.5 ATR below entry)
    const pricesForATR = prices.slice(Math.max(0, entryIdx - 20), entryIdx + 1);
    const atr = calculateATR(pricesForATR, 14) || entryPrice * 0.03;
    const stopLoss = entryPrice - (atr * STRATEGY_CONFIG.atrStopMultiple);
    const risk = entryPrice - stopLoss;

    if (risk <= 0) continue;

    // Position sizing
    const riskDollars = equity * STRATEGY_CONFIG.riskPerTrade;
    const shares = Math.floor(riskDollars / risk);
    if (shares <= 0) continue;

    // Apply slippage to entry
    const slippedEntry = entryPrice * (1 + STRATEGY_CONFIG.slippagePercent / 100);

    const trade: Trade = {
      ticker: signal.ticker,
      signalDate: signal.date,
      entryDate,
      entryPrice: slippedEntry,
      stopLoss,
      shares,
      riskDollars: shares * risk,
    };

    // Simulate trade day by day
    let maxR = 0;
    for (let day = 1; day <= STRATEGY_CONFIG.maxHoldingDays && entryIdx + day < prices.length; day++) {
      const currentIdx = entryIdx + day;
      const bar = prices[currentIdx];

      // Check stop loss
      if (bar.low <= stopLoss) {
        const exitPrice = Math.max(stopLoss, bar.low) * (1 - STRATEGY_CONFIG.slippagePercent / 100);
        const pnl = (exitPrice - trade.entryPrice) * shares;

        trade.exitDate = bar.date;
        trade.exitPrice = exitPrice;
        trade.exitReason = 'STOP_LOSS';
        trade.realizedPnl = pnl;
        trade.realizedR = (exitPrice - trade.entryPrice) / risk;
        trade.holdingDays = day;
        trade.maxR = maxR;
        break;
      }

      // Track max R (MFE)
      const dayMaxR = (bar.high - trade.entryPrice) / risk;
      if (dayMaxR > maxR) maxR = dayMaxR;

      // Check exit model
      const spyIdx = spyPrices.findIndex(p => p.date >= bar.date);
      const features = extractExitFeatures(
        prices,
        trade.entryPrice,
        stopLoss,
        currentIdx,
        entryIdx,
        spyPrices,
        spyIdx >= 0 ? spyIdx : undefined
      );

      const exitSignal = generateExitSignal(features, STRATEGY_CONFIG.exitProbabilityThreshold);

      if (exitSignal.shouldExit) {
        const exitPrice = bar.close * (1 - STRATEGY_CONFIG.slippagePercent / 100);
        const pnl = (exitPrice - trade.entryPrice) * shares;

        trade.exitDate = bar.date;
        trade.exitPrice = exitPrice;
        trade.exitReason = 'SIGNAL_EXIT';
        trade.realizedPnl = pnl;
        trade.realizedR = (exitPrice - trade.entryPrice) / risk;
        trade.holdingDays = day;
        trade.maxR = maxR;
        trade.exitProbability = exitSignal.exitProbability;
        break;
      }

      // Time exit at max holding days
      if (day >= STRATEGY_CONFIG.maxHoldingDays) {
        const exitPrice = bar.close * (1 - STRATEGY_CONFIG.slippagePercent / 100);
        const pnl = (exitPrice - trade.entryPrice) * shares;

        trade.exitDate = bar.date;
        trade.exitPrice = exitPrice;
        trade.exitReason = 'TIME_EXIT';
        trade.realizedPnl = pnl;
        trade.realizedR = (exitPrice - trade.entryPrice) / risk;
        trade.holdingDays = day;
        trade.maxR = maxR;
        break;
      }
    }

    // Only count completed trades
    if (trade.exitDate) {
      trades.push(trade);
      equity += trade.realizedPnl || 0;
      equityCurve.push({ date: trade.exitDate, equity });
    }

    processed++;
    if (processed % 25 === 0) {
      console.log(`Processed ${processed}/${signals.length} (API: ${rateLimiter.getUsage()})`);
    }
  }

  db.close();
  console.log();
  console.log(`Completed ${trades.length} trades`);
  console.log();

  // Calculate metrics
  const winners = trades.filter(t => (t.realizedR || 0) > 0);
  const losers = trades.filter(t => (t.realizedR || 0) <= 0);
  const totalPnl = trades.reduce((sum, t) => sum + (t.realizedPnl || 0), 0);

  // Calculate max drawdown
  let peak = STRATEGY_CONFIG.initialCapital;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const dd = (peak - point.equity) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Calculate Sharpe (simplified)
  const returns = trades.map(t => t.realizedR || 0);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdReturn = Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  );
  const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252 / 15) : 0;  // Annualized assuming 15-day avg hold

  // Profit factor
  const grossProfit = winners.reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + (t.realizedPnl || 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 999;

  // By exit reason
  const byExitReason: Record<string, { count: number; avgR: number; winRate: number }> = {};
  for (const reason of ['SIGNAL_EXIT', 'STOP_LOSS', 'TIME_EXIT']) {
    const reasonTrades = trades.filter(t => t.exitReason === reason);
    if (reasonTrades.length > 0) {
      const reasonWinners = reasonTrades.filter(t => (t.realizedR || 0) > 0);
      byExitReason[reason] = {
        count: reasonTrades.length,
        avgR: reasonTrades.reduce((sum, t) => sum + (t.realizedR || 0), 0) / reasonTrades.length,
        winRate: (reasonWinners.length / reasonTrades.length) * 100,
      };
    }
  }

  // By month
  const byMonth: Record<string, { count: number; avgR: number; winRate: number; pnl: number }> = {};
  for (const trade of trades) {
    const month = trade.exitDate?.substring(0, 7) || 'unknown';
    if (!byMonth[month]) {
      byMonth[month] = { count: 0, avgR: 0, winRate: 0, pnl: 0 };
    }
    byMonth[month].count++;
    byMonth[month].pnl += trade.realizedPnl || 0;
  }
  for (const [month, data] of Object.entries(byMonth)) {
    const monthTrades = trades.filter(t => t.exitDate?.startsWith(month));
    data.avgR = monthTrades.reduce((sum, t) => sum + (t.realizedR || 0), 0) / monthTrades.length;
    data.winRate = (monthTrades.filter(t => (t.realizedR || 0) > 0).length / monthTrades.length) * 100;
  }

  const metrics = {
    totalTrades: trades.length,
    winners: winners.length,
    losers: losers.length,
    winRate: (winners.length / trades.length) * 100,
    avgReturn: avgReturn * 100,
    avgWinR: winners.length > 0 ? winners.reduce((sum, t) => sum + (t.realizedR || 0), 0) / winners.length : 0,
    avgLossR: losers.length > 0 ? losers.reduce((sum, t) => sum + (t.realizedR || 0), 0) / losers.length : 0,
    totalPnl,
    totalReturn: (totalPnl / STRATEGY_CONFIG.initialCapital) * 100,
    maxDrawdown: maxDrawdown * 100,
    sharpeRatio: sharpe,
    profitFactor,
    avgHoldingDays: trades.reduce((sum, t) => sum + (t.holdingDays || 0), 0) / trades.length,
  };

  return {
    trades,
    metrics,
    byExitReason,
    byMonth,
    equityCurve,
  };
}

// ============================================
// MAIN
// ============================================

async function main() {
  const result = await runBacktest();

  console.log('='.repeat(80));
  console.log('BACKTEST RESULTS');
  console.log('='.repeat(80));
  console.log();

  console.log('OVERALL METRICS:');
  console.log('-'.repeat(50));
  console.log(`Total Trades:      ${result.metrics.totalTrades}`);
  console.log(`Winners:           ${result.metrics.winners}`);
  console.log(`Losers:            ${result.metrics.losers}`);
  console.log(`Win Rate:          ${result.metrics.winRate.toFixed(1)}%`);
  console.log(`Avg R:             ${(result.metrics.avgReturn / 100).toFixed(2)}R`);
  console.log(`Avg Win R:         ${result.metrics.avgWinR.toFixed(2)}R`);
  console.log(`Avg Loss R:        ${result.metrics.avgLossR.toFixed(2)}R`);
  console.log(`Total P&L:         $${result.metrics.totalPnl.toFixed(2)}`);
  console.log(`Total Return:      ${result.metrics.totalReturn.toFixed(1)}%`);
  console.log(`Max Drawdown:      ${result.metrics.maxDrawdown.toFixed(1)}%`);
  console.log(`Sharpe Ratio:      ${result.metrics.sharpeRatio.toFixed(2)}`);
  console.log(`Profit Factor:     ${result.metrics.profitFactor.toFixed(2)}`);
  console.log(`Avg Holding Days:  ${result.metrics.avgHoldingDays.toFixed(1)}`);
  console.log();

  console.log('BY EXIT REASON:');
  console.log('-'.repeat(60));
  console.log(`${'Reason'.padEnd(15)} ${'Count'.padEnd(8)} ${'Avg R'.padEnd(10)} ${'Win Rate'.padEnd(10)}`);
  for (const [reason, data] of Object.entries(result.byExitReason)) {
    console.log(`${reason.padEnd(15)} ${String(data.count).padEnd(8)} ${data.avgR.toFixed(2).padEnd(10)} ${data.winRate.toFixed(0)}%`);
  }
  console.log();

  console.log('BY MONTH:');
  console.log('-'.repeat(70));
  console.log(`${'Month'.padEnd(10)} ${'Count'.padEnd(8)} ${'Avg R'.padEnd(10)} ${'Win Rate'.padEnd(10)} ${'P&L'.padEnd(12)}`);
  for (const [month, data] of Object.entries(result.byMonth).sort((a, b) => a[0].localeCompare(b[0]))) {
    const pnlStr = data.pnl >= 0 ? `+$${data.pnl.toFixed(0)}` : `-$${Math.abs(data.pnl).toFixed(0)}`;
    console.log(`${month.padEnd(10)} ${String(data.count).padEnd(8)} ${data.avgR.toFixed(2).padEnd(10)} ${data.winRate.toFixed(0).padEnd(8)}%  ${pnlStr}`);
  }
  console.log();

  console.log('TOP 10 BEST TRADES:');
  console.log('-'.repeat(80));
  const bestTrades = [...result.trades].sort((a, b) => (b.realizedR || 0) - (a.realizedR || 0)).slice(0, 10);
  console.log(`${'Exit Date'.padEnd(12)} ${'Ticker'.padEnd(8)} ${'R'.padEnd(8)} ${'P&L'.padEnd(12)} ${'Days'.padEnd(6)} Exit Reason`);
  for (const t of bestTrades) {
    const pnlStr = (t.realizedPnl || 0) >= 0 ? `+$${(t.realizedPnl || 0).toFixed(0)}` : `-$${Math.abs(t.realizedPnl || 0).toFixed(0)}`;
    console.log(`${(t.exitDate || '').padEnd(12)} ${t.ticker.padEnd(8)} ${(t.realizedR?.toFixed(2) || '0').padEnd(8)} ${pnlStr.padEnd(12)} ${String(t.holdingDays || 0).padEnd(6)} ${t.exitReason}`);
  }
  console.log();

  console.log('TOP 10 WORST TRADES:');
  console.log('-'.repeat(80));
  const worstTrades = [...result.trades].sort((a, b) => (a.realizedR || 0) - (b.realizedR || 0)).slice(0, 10);
  console.log(`${'Exit Date'.padEnd(12)} ${'Ticker'.padEnd(8)} ${'R'.padEnd(8)} ${'P&L'.padEnd(12)} ${'Days'.padEnd(6)} Exit Reason`);
  for (const t of worstTrades) {
    const pnlStr = (t.realizedPnl || 0) >= 0 ? `+$${(t.realizedPnl || 0).toFixed(0)}` : `-$${Math.abs(t.realizedPnl || 0).toFixed(0)}`;
    console.log(`${(t.exitDate || '').padEnd(12)} ${t.ticker.padEnd(8)} ${(t.realizedR?.toFixed(2) || '0').padEnd(8)} ${pnlStr.padEnd(12)} ${String(t.holdingDays || 0).padEnd(6)} ${t.exitReason}`);
  }
  console.log();

  // Compare to baseline (45-day hold)
  console.log('='.repeat(80));
  console.log('COMPARISON TO BASELINES');
  console.log('='.repeat(80));
  console.log();
  console.log('Strategy performance vs baselines:');
  console.log(`  ML-Timed Exit (this):  ${result.metrics.avgReturn.toFixed(2)}% avg, ${result.metrics.winRate.toFixed(0)}% win rate, ${result.metrics.avgHoldingDays.toFixed(1)} day avg hold`);
  console.log(`  45-Day Hold (baseline): +2.15% excess vs SPY, 59% win rate, 45 day hold`);
  console.log(`  15-Day Hold (from prior backtest): +2.23% excess vs SPY, 60% win rate`);
  console.log();

  if (result.metrics.avgHoldingDays < 20 && result.metrics.winRate > 50) {
    console.log('✓ Strategy achieved shorter holding period with acceptable win rate');
  }
  if (result.metrics.profitFactor > 1.5) {
    console.log('✓ Profit factor > 1.5 indicates positive edge');
  }
}

main().catch(console.error);
