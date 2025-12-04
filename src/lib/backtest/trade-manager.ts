/**
 * Trade Manager
 * Handles entry/exit logic for backtesting
 */

import { BacktestConfig, BacktestTrade, ExitReason } from './types';

export interface ExitCheckResult {
  shouldExit: boolean;
  exitPrice: number;
  exitReason: ExitReason;
  isPartialExit?: boolean;
  partialShares?: number;
}

export class TradeManager {
  private config: BacktestConfig;

  constructor(config: BacktestConfig) {
    this.config = config;
  }

  /**
   * Check if trade should exit based on price action
   */
  checkExit(
    trade: BacktestTrade,
    high: number,
    low: number,
    close: number,
    date: Date
  ): ExitCheckResult {
    // Check stop loss first (highest priority)
    if (low <= trade.stopLoss) {
      return this.handleStopLoss(trade, low);
    }

    // Check time-based exit
    if (this.config.maxHoldingDays) {
      const holdingDays = this.calculateHoldingDays(trade.entryDate, date);
      if (holdingDays >= this.config.maxHoldingDays) {
        return {
          shouldExit: true,
          exitPrice: close,
          exitReason: 'TIME_EXIT',
        };
      }
    }

    // Check take profit levels
    const tpResult = this.checkTakeProfitLevels(trade, high, close);
    if (tpResult.shouldExit) {
      return tpResult;
    }

    // Check trailing stop if enabled and activated
    if (this.config.useTrailingStop && trade.mfeR && trade.mfeR >= (this.config.trailingStopActivation || 1.0)) {
      const trailingResult = this.checkTrailingStop(trade, low, close);
      if (trailingResult.shouldExit) {
        return trailingResult;
      }
    }

    // No exit
    return {
      shouldExit: false,
      exitPrice: 0,
      exitReason: 'TIME_EXIT', // Placeholder
    };
  }

  /**
   * Handle stop loss hit
   */
  private handleStopLoss(trade: BacktestTrade, low: number): ExitCheckResult {
    // Check for gap through stop (worst case - gap open below stop)
    let exitPrice = trade.stopLoss;

    if (this.config.gapHandling === 'MARKET') {
      // If price gapped through stop, exit at low (slippage applied later)
      exitPrice = Math.min(trade.stopLoss, low);
    } else if (this.config.gapHandling === 'SKIP') {
      // Skip execution if gapped significantly
      if (low < trade.stopLoss * 0.97) { // Gap > 3%
        return {
          shouldExit: false,
          exitPrice: 0,
          exitReason: 'STOP_LOSS',
        };
      }
    }

    return {
      shouldExit: true,
      exitPrice,
      exitReason: 'STOP_LOSS',
    };
  }

  /**
   * Check take profit levels
   */
  private checkTakeProfitLevels(
    trade: BacktestTrade,
    high: number,
    close: number
  ): ExitCheckResult {
    const partialExits = trade.partialExits || [];
    const hasTP1 = partialExits.some(p => p.reason === 'TP1');
    const hasTP2 = partialExits.some(p => p.reason === 'TP2');
    const hasTP3 = partialExits.some(p => p.reason === 'TP3');

    // Check TP3 (final exit)
    if (!hasTP3 && high >= trade.tp3) {
      return {
        shouldExit: true,
        exitPrice: trade.tp3,
        exitReason: 'TP3',
      };
    }

    // Check TP2
    if (!hasTP2 && high >= trade.tp2) {
      const sharesToSell = Math.floor(trade.shares * this.config.tpSizes[1]);
      if (sharesToSell > 0) {
        return {
          shouldExit: false,
          exitPrice: trade.tp2,
          exitReason: 'TP2',
          isPartialExit: true,
          partialShares: sharesToSell,
        };
      }
    }

    // Check TP1
    if (!hasTP1 && high >= trade.tp1) {
      const sharesToSell = Math.floor(trade.shares * this.config.tpSizes[0]);
      if (sharesToSell > 0) {
        return {
          shouldExit: false,
          exitPrice: trade.tp1,
          exitReason: 'TP1',
          isPartialExit: true,
          partialShares: sharesToSell,
        };
      }
    }

    return {
      shouldExit: false,
      exitPrice: 0,
      exitReason: 'TIME_EXIT',
    };
  }

  /**
   * Check trailing stop
   */
  private checkTrailingStop(
    trade: BacktestTrade,
    low: number,
    close: number
  ): ExitCheckResult {
    if (!trade.mfe) {
      return { shouldExit: false, exitPrice: 0, exitReason: 'TRAILING_STOP' };
    }

    const trailDistance = this.config.trailingStopDistance || 0.15; // 15% default
    const trailingStop = trade.mfe * (1 - trailDistance);

    if (low <= trailingStop) {
      return {
        shouldExit: true,
        exitPrice: Math.max(trailingStop, low),
        exitReason: 'TRAILING_STOP',
      };
    }

    return { shouldExit: false, exitPrice: 0, exitReason: 'TRAILING_STOP' };
  }

  /**
   * Calculate holding days between two dates
   */
  private calculateHoldingDays(entryDateStr: string, exitDate: Date): number {
    const entryDate = new Date(entryDateStr);
    const diffMs = exitDate.getTime() - entryDate.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate position size based on risk
   */
  calculatePositionSize(
    equity: number,
    entryPrice: number,
    stopLoss: number,
    maxPositionSize?: number
  ): { shares: number; riskDollars: number } {
    const risk = entryPrice - stopLoss;
    if (risk <= 0) {
      return { shares: 0, riskDollars: 0 };
    }

    const riskDollars = equity * this.config.riskPerTrade;
    let shares = Math.floor(riskDollars / risk);

    // Apply max position size limit
    if (maxPositionSize) {
      const maxShares = Math.floor((equity * maxPositionSize) / entryPrice);
      shares = Math.min(shares, maxShares);
    }

    return { shares, riskDollars: shares * risk };
  }

  /**
   * Apply slippage to price
   */
  applySlippage(price: number, isBuy: boolean): number {
    const slippage = price * (this.config.slippagePercent / 100);
    return isBuy ? price + slippage : price - slippage;
  }

  /**
   * Calculate commission for trade
   */
  calculateCommission(shares: number): number {
    return shares * this.config.commissionPerShare;
  }

  /**
   * Check if entry is valid based on regime
   */
  isValidEntry(
    probability: number,
    rrRatio: number,
    regime: string,
    volumeConfirms: boolean,
    mtfAlignment: string
  ): boolean {
    let minProb = this.config.entryThreshold;
    let minRR = this.config.minRRRatio;

    // Apply regime adjustments
    if (this.config.adjustForRegime) {
      if (regime === 'CHOPPY') {
        minProb = Math.max(minProb, 70);
        minRR = Math.max(minRR, 2.5);
      } else if (regime === 'CRASH') {
        minProb = Math.max(minProb, 80);
        minRR = Math.max(minRR, 3.0);
      }
    }

    if (probability < minProb) return false;
    if (rrRatio < minRR) return false;

    // Check volume confirmation
    if (this.config.requireVolumeConfirm && !volumeConfirms) {
      return false;
    }

    // Check MTF alignment
    if (this.config.requireMTFAlign) {
      if (mtfAlignment !== 'STRONG_BUY' && mtfAlignment !== 'BUY') {
        return false;
      }
    }

    return true;
  }
}

/**
 * Helper function to calculate R multiple
 */
export function calculateRMultiple(
  entryPrice: number,
  exitPrice: number,
  stopLoss: number
): number {
  const risk = entryPrice - stopLoss;
  if (risk <= 0) return 0;
  return (exitPrice - entryPrice) / risk;
}

/**
 * Helper function to get exit reason description
 */
export function getExitReasonDescription(reason: ExitReason): string {
  switch (reason) {
    case 'TP1':
      return 'Take Profit 1 (1.5R)';
    case 'TP2':
      return 'Take Profit 2 (2.5R)';
    case 'TP3':
      return 'Take Profit 3 (4R)';
    case 'STOP_LOSS':
      return 'Stop Loss Hit';
    case 'TIME_EXIT':
      return 'Max Holding Days';
    case 'TRAILING_STOP':
      return 'Trailing Stop Hit';
    case 'SIGNAL_EXIT':
      return 'Signal-Based Exit';
    case 'MANUAL':
      return 'Manual Exit';
    default:
      return 'Unknown';
  }
}




