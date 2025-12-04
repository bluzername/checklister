/**
 * Backtest Simulator
 * Core engine for running historical backtests
 */

import { analyzeTicker } from '../analysis';
import { AnalysisResult } from '../types';
import { MarketRegime } from '../market-regime/types';
import {
  BacktestConfig,
  BacktestResult,
  BacktestTrade,
  PerformanceMetrics,
  EquityPoint,
  ExitReason,
  extractFeatureVector,
} from './types';
import { calculateMetrics, calculateEquityCurve } from './metrics';
import { TradeManager } from './trade-manager';

// ============================================
// SIMULATOR CLASS
// ============================================

export class BacktestSimulator {
  private config: BacktestConfig;
  private tradeManager: TradeManager;
  private trades: BacktestTrade[] = [];
  private equity: number;
  private equityHistory: EquityPoint[] = [];
  private currentDate: Date;
  private tradeIdCounter: number = 0;

  constructor(config: BacktestConfig) {
    this.config = config;
    this.equity = config.initialCapital;
    this.currentDate = new Date(config.startDate);
    this.tradeManager = new TradeManager(config);
  }

  /**
   * Run the full backtest
   */
  async run(): Promise<BacktestResult> {
    console.log(`Starting backtest: ${this.config.name}`);
    console.log(`Period: ${this.config.startDate} to ${this.config.endDate}`);
    console.log(`Universe: ${this.getUniverseSize()} tickers`);

    const startTime = Date.now();
    const endDate = new Date(this.config.endDate);

    // Initialize equity history
    this.equityHistory.push({
      date: this.config.startDate,
      equity: this.equity,
      drawdown: 0,
      drawdownPercent: 0,
      openPositions: 0,
      dailyPnl: 0,
      dailyReturn: 0,
    });

    // Iterate through each trading day
    while (this.currentDate <= endDate) {
      await this.processDay(this.currentDate);
      
      // Move to next trading day (skip weekends)
      this.currentDate = this.getNextTradingDay(this.currentDate);
    }

    // Close any remaining open positions at end
    await this.closeAllPositions(endDate, 'TIME_EXIT');

    const completedAt = new Date().toISOString();
    const metrics = calculateMetrics(this.trades, this.config.initialCapital);
    const equityCurve = calculateEquityCurve(this.trades, this.config.initialCapital);

    // Calculate performance breakdowns
    const performanceByRegime = this.calculatePerformanceByRegime();
    const performanceBySector = this.calculatePerformanceBySector();
    const performanceByMonth = this.calculatePerformanceByMonth();
    const performanceByYear = this.calculatePerformanceByYear();
    const calibrationByBucket = this.calculateCalibrationBuckets();

    console.log(`Backtest completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log(`Total trades: ${this.trades.length}`);
    console.log(`Win rate: ${metrics.winRate.toFixed(1)}%`);
    console.log(`Sharpe ratio: ${metrics.sharpeRatio.toFixed(2)}`);

    return {
      config: this.config,
      metrics,
      equityCurve,
      trades: this.trades,
      performanceByRegime,
      performanceBySector,
      performanceByMonth,
      performanceByYear,
      calibrationByBucket,
      status: 'COMPLETED',
      completedAt,
    };
  }

  /**
   * Process a single trading day
   */
  private async processDay(date: Date): Promise<void> {
    const dateStr = date.toISOString().split('T')[0];
    
    // 1. Update open positions with current prices and check exits
    await this.updateOpenPositions(date);

    // 2. Check for new entry signals
    await this.scanForEntries(date);

    // 3. Record equity for this day
    this.recordEquity(date);
  }

  /**
   * Update open positions and check for exits
   */
  private async updateOpenPositions(date: Date): Promise<void> {
    const openTrades = this.trades.filter(t => t.status === 'OPEN');

    for (const trade of openTrades) {
      try {
        // Get current price data for the ticker
        const priceData = await this.getPriceData(trade.ticker, date);
        
        if (!priceData) continue;

        const { high, low, close } = priceData;

        // Update MFE/MAE
        if (high > (trade.mfe || trade.entryPrice)) {
          trade.mfe = high;
          trade.mfeR = (high - trade.entryPrice) / (trade.entryPrice - trade.stopLoss);
        }
        if (low < (trade.mae || trade.entryPrice)) {
          trade.mae = low;
          trade.maeR = (trade.entryPrice - low) / (trade.entryPrice - trade.stopLoss);
        }

        // Check exit conditions
        const exitResult = this.tradeManager.checkExit(trade, high, low, close, date);
        
        if (exitResult.shouldExit) {
          this.closeTrade(trade, date, exitResult.exitPrice, exitResult.exitReason);
        }
      } catch (error) {
        // If we can't get price data, skip this ticker for today
        console.warn(`Could not get price data for ${trade.ticker} on ${date.toISOString().split('T')[0]}`);
      }
    }
  }

  /**
   * Scan universe for new entry signals
   */
  private async scanForEntries(date: Date): Promise<void> {
    const universe = this.getUniverse();
    const openPositionTickers = new Set(
      this.trades.filter(t => t.status === 'OPEN').map(t => t.ticker)
    );

    // Check if we can open new positions
    const openPositionCount = this.trades.filter(t => t.status === 'OPEN').length;
    if (openPositionCount >= this.config.maxOpenPositions) {
      return;
    }

    // Analyze each ticker in universe
    const candidates: { ticker: string; analysis: AnalysisResult }[] = [];

    for (const ticker of universe) {
      // Skip if already have position
      if (openPositionTickers.has(ticker)) continue;

      try {
        const analysis = await analyzeTicker(ticker, date);
        
        // Check if meets entry criteria
        if (this.meetsEntryCriteria(analysis)) {
          candidates.push({ ticker, analysis });
        }
      } catch (error) {
        // Skip tickers that fail analysis
        continue;
      }
    }

    // Sort candidates by probability (best first)
    candidates.sort((a, b) => b.analysis.success_probability - a.analysis.success_probability);

    // Take top candidates up to max positions
    const slotsAvailable = this.config.maxOpenPositions - openPositionCount;
    const toEnter = candidates.slice(0, slotsAvailable);

    // Enter positions
    for (const { ticker, analysis } of toEnter) {
      await this.enterTrade(ticker, analysis, date);
    }
  }

  /**
   * Check if analysis meets entry criteria
   */
  private meetsEntryCriteria(analysis: AnalysisResult): boolean {
    // Check probability threshold
    if (analysis.success_probability < this.config.entryThreshold) {
      return false;
    }

    // Check R:R ratio
    const rrRatio = analysis.parameters['6_support_resistance'].risk_reward_ratio;
    if (rrRatio < this.config.minRRRatio) {
      return false;
    }

    // Check trade type
    if (analysis.trade_type !== 'SWING_LONG') {
      return false;
    }

    // Check volume confirmation if required
    if (this.config.requireVolumeConfirm) {
      const volumeConfirms = analysis.parameters['8_volume'].volume_confirms;
      if (!volumeConfirms) return false;
    }

    // Check MTF alignment if required
    if (this.config.requireMTFAlign) {
      const alignment = analysis.multi_timeframe?.alignment;
      if (alignment !== 'STRONG_BUY' && alignment !== 'BUY') {
        return false;
      }
    }

    return true;
  }

  /**
   * Enter a new trade
   */
  private async enterTrade(
    ticker: string,
    analysis: AnalysisResult,
    date: Date
  ): Promise<void> {
    const entryPrice = analysis.current_price;
    const stopLoss = analysis.trading_plan.stop_loss.price;
    const risk = entryPrice - stopLoss;

    // Calculate position size based on risk
    const riskDollars = this.equity * this.config.riskPerTrade;
    const shares = Math.floor(riskDollars / risk);
    
    if (shares <= 0) return;

    const positionValue = shares * entryPrice;

    // Apply slippage to entry
    const slippage = entryPrice * (this.config.slippagePercent / 100);
    const adjustedEntryPrice = entryPrice + slippage;

    // Calculate take profit levels
    const tp1 = entryPrice + risk * this.config.tpRatios[0];
    const tp2 = entryPrice + risk * this.config.tpRatios[1];
    const tp3 = entryPrice + risk * this.config.tpRatios[2];

    const trade: BacktestTrade = {
      tradeId: `T${++this.tradeIdCounter}`,
      ticker,
      signalDate: date.toISOString().split('T')[0],
      entryDate: date.toISOString().split('T')[0],
      entryPrice: adjustedEntryPrice,
      entryProbability: analysis.success_probability,
      shares,
      positionValue,
      stopLoss,
      tp1,
      tp2,
      tp3,
      regime: (analysis.market_regime?.regime || 'CHOPPY') as MarketRegime,
      sector: analysis.parameters['2_sector_condition'].sector,
      status: 'OPEN',
      partialExits: [],
    };

    this.trades.push(trade);
    this.equity -= positionValue + (shares * this.config.commissionPerShare);
  }

  /**
   * Close a trade
   */
  private closeTrade(
    trade: BacktestTrade,
    date: Date,
    exitPrice: number,
    exitReason: ExitReason
  ): void {
    // Apply slippage to exit
    const slippage = exitPrice * (this.config.slippagePercent / 100);
    const adjustedExitPrice = exitPrice - slippage;

    trade.exitDate = date.toISOString().split('T')[0];
    trade.exitPrice = adjustedExitPrice;
    trade.exitReason = exitReason;
    trade.status = 'CLOSED';

    // Calculate performance
    const risk = trade.entryPrice - trade.stopLoss;
    trade.realizedPnl = (adjustedExitPrice - trade.entryPrice) * trade.shares;
    trade.realizedPnlPercent = ((adjustedExitPrice - trade.entryPrice) / trade.entryPrice) * 100;
    trade.realizedR = risk > 0 ? (adjustedExitPrice - trade.entryPrice) / risk : 0;

    // Calculate holding days
    const entryMs = new Date(trade.entryDate).getTime();
    const exitMs = date.getTime();
    trade.holdingDays = Math.ceil((exitMs - entryMs) / (1000 * 60 * 60 * 24));

    // Update equity
    const exitValue = trade.shares * adjustedExitPrice;
    const commission = trade.shares * this.config.commissionPerShare;
    this.equity += exitValue - commission;
  }

  /**
   * Close all open positions
   */
  private async closeAllPositions(date: Date, reason: ExitReason): Promise<void> {
    const openTrades = this.trades.filter(t => t.status === 'OPEN');

    for (const trade of openTrades) {
      try {
        const priceData = await this.getPriceData(trade.ticker, date);
        if (priceData) {
          this.closeTrade(trade, date, priceData.close, reason);
        }
      } catch {
        // Use last known price or entry price
        this.closeTrade(trade, date, trade.entryPrice, reason);
      }
    }
  }

  /**
   * Record equity at end of day
   */
  private recordEquity(date: Date): void {
    const openTrades = this.trades.filter(t => t.status === 'OPEN');
    const closedToday = this.trades.filter(
      t => t.status === 'CLOSED' && t.exitDate === date.toISOString().split('T')[0]
    );

    const dailyPnl = closedToday.reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
    const prevEquity = this.equityHistory[this.equityHistory.length - 1]?.equity || this.config.initialCapital;
    const dailyReturn = prevEquity > 0 ? (dailyPnl / prevEquity) * 100 : 0;

    // Calculate drawdown
    const peakEquity = Math.max(...this.equityHistory.map(e => e.equity), this.equity);
    const drawdown = peakEquity - this.equity;
    const drawdownPercent = peakEquity > 0 ? (drawdown / peakEquity) * 100 : 0;

    this.equityHistory.push({
      date: date.toISOString().split('T')[0],
      equity: this.equity,
      drawdown,
      drawdownPercent,
      openPositions: openTrades.length,
      dailyPnl,
      dailyReturn,
    });
  }

  /**
   * Get price data for a ticker on a specific date
   */
  private async getPriceData(
    ticker: string,
    date: Date
  ): Promise<{ high: number; low: number; close: number } | null> {
    try {
      // Use analyzeTicker to get price data (it fetches historical data)
      const analysis = await analyzeTicker(ticker, date);
      
      // Extract OHLC from chart_data or use current_price
      const chartData = analysis.chart_data;
      if (chartData && chartData.length > 0) {
        const todayData = chartData[0]; // Most recent
        return {
          high: todayData.price * 1.02, // Approximate high
          low: todayData.price * 0.98, // Approximate low
          close: todayData.price,
        };
      }
      
      return {
        high: analysis.current_price * 1.02,
        low: analysis.current_price * 0.98,
        close: analysis.current_price,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get next trading day (skip weekends)
   */
  private getNextTradingDay(date: Date): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    
    // Skip weekends
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
    
    return next;
  }

  /**
   * Get universe of tickers to scan
   */
  private getUniverse(): string[] {
    if (Array.isArray(this.config.universe)) {
      return this.config.universe;
    }
    // If universe is a filter, we'd need to apply it
    // For now, return empty array
    return [];
  }

  /**
   * Get universe size
   */
  private getUniverseSize(): number {
    return this.getUniverse().length;
  }

  /**
   * Calculate performance by regime
   */
  private calculatePerformanceByRegime(): Record<MarketRegime, PerformanceMetrics> {
    const regimes: MarketRegime[] = ['BULL', 'CHOPPY', 'CRASH'];
    const result: Record<string, PerformanceMetrics> = {};

    for (const regime of regimes) {
      const regimeTrades = this.trades.filter(t => t.regime === regime && t.status === 'CLOSED');
      result[regime] = calculateMetrics(regimeTrades, this.config.initialCapital);
    }

    return result as Record<MarketRegime, PerformanceMetrics>;
  }

  /**
   * Calculate performance by sector
   */
  private calculatePerformanceBySector(): Record<string, PerformanceMetrics> {
    const sectors = new Set(this.trades.map(t => t.sector || 'Unknown'));
    const result: Record<string, PerformanceMetrics> = {};

    for (const sector of sectors) {
      const sectorTrades = this.trades.filter(t => t.sector === sector && t.status === 'CLOSED');
      result[sector] = calculateMetrics(sectorTrades, this.config.initialCapital);
    }

    return result;
  }

  /**
   * Calculate performance by month
   */
  private calculatePerformanceByMonth(): Record<string, PerformanceMetrics> {
    const result: Record<string, PerformanceMetrics> = {};
    const closedTrades = this.trades.filter(t => t.status === 'CLOSED' && t.exitDate);

    for (const trade of closedTrades) {
      const month = trade.exitDate!.substring(0, 7); // YYYY-MM
      if (!result[month]) {
        result[month] = calculateMetrics([], this.config.initialCapital);
      }
    }

    // Group trades by month and recalculate
    for (const month of Object.keys(result)) {
      const monthTrades = closedTrades.filter(t => t.exitDate!.startsWith(month));
      result[month] = calculateMetrics(monthTrades, this.config.initialCapital);
    }

    return result;
  }

  /**
   * Calculate performance by year
   */
  private calculatePerformanceByYear(): Record<string, PerformanceMetrics> {
    const result: Record<string, PerformanceMetrics> = {};
    const closedTrades = this.trades.filter(t => t.status === 'CLOSED' && t.exitDate);

    for (const trade of closedTrades) {
      const year = trade.exitDate!.substring(0, 4); // YYYY
      if (!result[year]) {
        result[year] = calculateMetrics([], this.config.initialCapital);
      }
    }

    // Group trades by year and recalculate
    for (const year of Object.keys(result)) {
      const yearTrades = closedTrades.filter(t => t.exitDate!.startsWith(year));
      result[year] = calculateMetrics(yearTrades, this.config.initialCapital);
    }

    return result;
  }

  /**
   * Calculate calibration buckets
   */
  private calculateCalibrationBuckets(): BacktestResult['calibrationByBucket'] {
    const buckets: Record<string, { predictions: number[]; outcomes: number[] }> = {};
    const closedTrades = this.trades.filter(t => t.status === 'CLOSED');

    for (const trade of closedTrades) {
      const prob = trade.entryProbability;
      const bucketStart = Math.floor(prob / 10) * 10;
      const bucketKey = `${bucketStart}-${bucketStart + 10}%`;

      if (!buckets[bucketKey]) {
        buckets[bucketKey] = { predictions: [], outcomes: [] };
      }

      buckets[bucketKey].predictions.push(prob);
      buckets[bucketKey].outcomes.push((trade.realizedR || 0) >= 1.5 ? 1 : 0);
    }

    return Object.entries(buckets).map(([bucket, data]) => ({
      bucket,
      predictedAvg: data.predictions.reduce((a, b) => a + b, 0) / data.predictions.length,
      actualWinRate: (data.outcomes.filter(o => o === 1).length / data.outcomes.length) * 100,
      count: data.predictions.length,
    })).sort((a, b) => {
      const aStart = parseInt(a.bucket.split('-')[0]);
      const bStart = parseInt(b.bucket.split('-')[0]);
      return aStart - bStart;
    });
  }
}

/**
 * Run a backtest with the given configuration
 */
export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const simulator = new BacktestSimulator(config);
  return simulator.run();
}

/**
 * Create a default backtest configuration
 */
export function createDefaultConfig(
  universe: string[],
  startDate: string,
  endDate: string
): BacktestConfig {
  return {
    name: `Backtest ${startDate} to ${endDate}`,
    universe,
    startDate,
    endDate,
    initialCapital: 100000,
    riskPerTrade: 0.01, // 1%
    maxTotalRisk: 0.06, // 6%
    maxOpenPositions: 10,
    entryThreshold: 65,
    minRRRatio: 2.0,
    requireVolumeConfirm: false,
    requireMTFAlign: false,
    tpRatios: [1.5, 2.5, 4.0],
    tpSizes: [0.33, 0.33, 0.34],
    maxHoldingDays: 20,
    useTrailingStop: false,
    slippagePercent: 0.1,
    commissionPerShare: 0.005,
    gapHandling: 'MARKET',
    adjustForRegime: true,
  };
}




