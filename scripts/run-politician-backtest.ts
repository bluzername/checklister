/**
 * Politician Signal Backtest
 * Focused analysis of politician trading signals
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { config } from 'dotenv';

config({ path: '.env.local' });

const DB_PATH = path.join(process.cwd(), 'data', 'signals.sqlite');
const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';

// Rate limiter
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
        console.log(`[Rate Limit] Waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      this.callTimestamps = this.callTimestamps.filter(ts => Date.now() - ts < this.windowMs);
    }
    this.callTimestamps.push(Date.now());
  }
}

const rateLimiter = new RateLimiter();

interface PriceData {
  date: string;
  close: number;
}

interface SignalResult {
  ticker: string;
  signalDate: string;
  entryPrice: number;
  returns: { day5: number | null; day15: number | null; day25: number | null; day45: number | null; day60: number | null };
  spyReturns: { day5: number | null; day15: number | null; day25: number | null; day45: number | null; day60: number | null };
  excess: { day5: number | null; day15: number | null; day25: number | null; day45: number | null; day60: number | null };
}

const priceCache = new Map<string, PriceData[]>();

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

    const prices: PriceData[] = data.map((d: any) => ({ date: d.date, close: d.close }));
    prices.sort((a, b) => a.date.localeCompare(b.date));
    priceCache.set(ticker, prices);
    return prices;
  } catch {
    return [];
  }
}

function findPriceAtDate(prices: PriceData[], targetDate: string): number | null {
  for (const p of prices) {
    if (p.date >= targetDate) return p.close;
  }
  return null;
}

function findPriceAfterDays(prices: PriceData[], startDate: string, days: number): number | null {
  const idx = prices.findIndex(p => p.date >= startDate);
  if (idx === -1 || idx + days >= prices.length) return null;
  return prices[idx + days].close;
}

function avg(arr: (number | null)[]): number {
  const valid = arr.filter(v => v !== null) as number[];
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
}

function median(arr: (number | null)[]): number {
  const valid = arr.filter(v => v !== null) as number[];
  if (!valid.length) return 0;
  valid.sort((a, b) => a - b);
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

function winRate(arr: (number | null)[]): number {
  const valid = arr.filter(v => v !== null) as number[];
  return valid.length ? (valid.filter(v => v > 0).length / valid.length) * 100 : 0;
}

async function runBacktest() {
  console.log('='.repeat(80));
  console.log('POLITICIAN TRADING SIGNALS - DETAILED BACKTEST');
  console.log('='.repeat(80));
  console.log();

  const db = new Database(DB_PATH);

  // Get all politician signals
  const signals = db.prepare(`
    SELECT DISTINCT
      s.ticker,
      s.date,
      s.reason,
      s.strength,
      s.confidence,
      s.raw_message
    FROM signals s
    WHERE s.signal_type = 'POLITICIAN'
    ORDER BY s.date ASC
  `).all() as any[];

  console.log(`Found ${signals.length} politician trading signals`);
  console.log();

  // Get unique tickers
  const tickers = [...new Set(signals.map(s => s.ticker))];
  console.log(`Unique tickers: ${tickers.length}`);
  console.log(`Tickers: ${tickers.join(', ')}`);
  console.log();

  // Fetch SPY data
  console.log('Fetching price data...');
  const spyPrices = await fetchPrices('SPY');
  console.log(`SPY data points: ${spyPrices.length}`);

  const results: SignalResult[] = [];
  let processed = 0;

  for (const signal of signals) {
    const prices = await fetchPrices(signal.ticker);
    if (prices.length < 50) continue;

    const entryPrice = findPriceAtDate(prices, signal.date);
    if (!entryPrice) continue;

    const price5 = findPriceAfterDays(prices, signal.date, 5);
    const price15 = findPriceAfterDays(prices, signal.date, 15);
    const price25 = findPriceAfterDays(prices, signal.date, 25);
    const price45 = findPriceAfterDays(prices, signal.date, 45);
    const price60 = findPriceAfterDays(prices, signal.date, 60);

    const ret = (p: number | null) => p ? ((p - entryPrice) / entryPrice) * 100 : null;

    const spyEntry = findPriceAtDate(spyPrices, signal.date);
    const spyRet = (days: number) => {
      const p = findPriceAfterDays(spyPrices, signal.date, days);
      return spyEntry && p ? ((p - spyEntry) / spyEntry) * 100 : null;
    };

    const r5 = ret(price5), r15 = ret(price15), r25 = ret(price25), r45 = ret(price45), r60 = ret(price60);
    const s5 = spyRet(5), s15 = spyRet(15), s25 = spyRet(25), s45 = spyRet(45), s60 = spyRet(60);

    results.push({
      ticker: signal.ticker,
      signalDate: signal.date,
      entryPrice,
      returns: { day5: r5, day15: r15, day25: r25, day45: r45, day60: r60 },
      spyReturns: { day5: s5, day15: s15, day25: s25, day45: s45, day60: s60 },
      excess: {
        day5: r5 !== null && s5 !== null ? r5 - s5 : null,
        day15: r15 !== null && s15 !== null ? r15 - s15 : null,
        day25: r25 !== null && s25 !== null ? r25 - s25 : null,
        day45: r45 !== null && s45 !== null ? r45 - s45 : null,
        day60: r60 !== null && s60 !== null ? r60 - s60 : null,
      },
    });
    processed++;
  }

  console.log(`Processed ${processed} signals`);
  console.log();

  // ============================================
  // RESULTS
  // ============================================

  console.log('='.repeat(80));
  console.log('POLITICIAN SIGNALS - BACKTEST RESULTS');
  console.log('='.repeat(80));
  console.log();

  // 1. OVERALL PERFORMANCE
  console.log('1. OVERALL PERFORMANCE');
  console.log('-'.repeat(80));
  const horizons = [
    { name: '5-Day', key: 'day5' as const },
    { name: '15-Day', key: 'day15' as const },
    { name: '25-Day', key: 'day25' as const },
    { name: '45-Day', key: 'day45' as const },
    { name: '60-Day', key: 'day60' as const },
  ];

  console.log(`${'Horizon'.padEnd(12)} ${'Avg'.padEnd(10)} ${'Median'.padEnd(10)} ${'Win%'.padEnd(10)} ${'SPY'.padEnd(10)} ${'Excess'.padEnd(10)} N`);
  console.log('-'.repeat(75));

  for (const h of horizons) {
    const rets = results.map(r => r.returns[h.key]);
    const spyRets = results.map(r => r.spyReturns[h.key]);
    const excess = results.map(r => r.excess[h.key]);
    const n = rets.filter(v => v !== null).length;

    console.log(
      `${h.name.padEnd(12)} ${avg(rets).toFixed(2).padStart(7)}%  ${median(rets).toFixed(2).padStart(7)}%  ${winRate(rets).toFixed(1).padStart(7)}%  ${avg(spyRets).toFixed(2).padStart(7)}%  ${avg(excess).toFixed(2).padStart(7)}%  ${n}`
    );
  }
  console.log();

  // 2. PERFORMANCE BY TICKER
  console.log('2. PERFORMANCE BY TICKER (45-day)');
  console.log('-'.repeat(80));

  const tickerPerf = tickers.map(ticker => {
    const tickerResults = results.filter(r => r.ticker === ticker);
    const rets = tickerResults.map(r => r.returns.day45);
    const excess = tickerResults.map(r => r.excess.day45);
    return {
      ticker,
      count: tickerResults.length,
      avgRet: avg(rets),
      winRate: winRate(rets),
      excess: avg(excess),
      validCount: rets.filter(v => v !== null).length,
    };
  }).filter(t => t.validCount >= 1).sort((a, b) => b.excess - a.excess);

  console.log(`${'Ticker'.padEnd(8)} ${'Signals'.padEnd(10)} ${'Avg Ret'.padEnd(12)} ${'Win Rate'.padEnd(12)} ${'Excess'.padEnd(12)}`);
  console.log('-'.repeat(60));
  for (const t of tickerPerf) {
    const emoji = t.excess > 0 ? '✓' : '✗';
    console.log(
      `${emoji} ${t.ticker.padEnd(6)} ${String(t.count).padEnd(10)} ${(t.avgRet.toFixed(1) + '%').padEnd(12)} ${(t.winRate.toFixed(0) + '%').padEnd(12)} ${(t.excess.toFixed(1) + '%').padEnd(12)}`
    );
  }
  console.log();

  // 3. MONTHLY BREAKDOWN
  console.log('3. MONTHLY PERFORMANCE');
  console.log('-'.repeat(80));

  const months = [...new Set(results.map(r => r.signalDate.substring(0, 7)))].sort();

  console.log(`${'Month'.padEnd(10)} ${'N'.padEnd(5)} ${'Avg Ret'.padEnd(12)} ${'Win Rate'.padEnd(12)} ${'Excess'.padEnd(12)} Tickers`);
  console.log('-'.repeat(80));

  for (const month of months) {
    const monthResults = results.filter(r => r.signalDate.startsWith(month));
    const rets = monthResults.map(r => r.returns.day45);
    const excess = monthResults.map(r => r.excess.day45);
    const tickerList = [...new Set(monthResults.map(r => r.ticker))].join(', ');
    const validN = rets.filter(v => v !== null).length;

    if (validN < 1) continue;

    console.log(
      `${month.padEnd(10)} ${String(monthResults.length).padEnd(5)} ${(avg(rets).toFixed(1) + '%').padEnd(12)} ${(winRate(rets).toFixed(0) + '%').padEnd(12)} ${(avg(excess).toFixed(1) + '%').padEnd(12)} ${tickerList.substring(0, 25)}`
    );
  }
  console.log();

  // 4. ALL SIGNALS DETAILED
  console.log('4. ALL POLITICIAN SIGNALS - DETAILED VIEW');
  console.log('-'.repeat(100));

  const sortedResults = [...results].sort((a, b) => a.signalDate.localeCompare(b.signalDate));

  console.log(`${'Date'.padEnd(12)} ${'Ticker'.padEnd(8)} ${'Entry$'.padEnd(10)} ${'5d'.padEnd(8)} ${'15d'.padEnd(8)} ${'25d'.padEnd(8)} ${'45d'.padEnd(10)} ${'Excess45'.padEnd(10)}`);
  console.log('-'.repeat(90));

  for (const r of sortedResults) {
    const fmt = (v: number | null) => v !== null ? (v.toFixed(1) + '%').padStart(7) : '   -   ';
    const excess45 = r.excess.day45 !== null ? (r.excess.day45 > 0 ? '+' : '') + r.excess.day45.toFixed(1) + '%' : '-';

    console.log(
      `${r.signalDate.padEnd(12)} ${r.ticker.padEnd(8)} $${r.entryPrice.toFixed(2).padEnd(8)} ${fmt(r.returns.day5)} ${fmt(r.returns.day15)} ${fmt(r.returns.day25)} ${fmt(r.returns.day45).padEnd(10)} ${excess45.padEnd(10)}`
    );
  }
  console.log();

  // 5. BEST AND WORST
  console.log('5. TOP 10 BEST POLITICIAN SIGNALS (45-day)');
  console.log('-'.repeat(80));

  const best = results
    .filter(r => r.returns.day45 !== null)
    .sort((a, b) => (b.returns.day45 || 0) - (a.returns.day45 || 0))
    .slice(0, 10);

  for (const r of best) {
    console.log(`  ${r.signalDate} ${r.ticker.padEnd(6)} +${r.returns.day45?.toFixed(1)}% (excess: +${r.excess.day45?.toFixed(1)}%)`);
  }
  console.log();

  console.log('6. TOP 10 WORST POLITICIAN SIGNALS (45-day)');
  console.log('-'.repeat(80));

  const worst = results
    .filter(r => r.returns.day45 !== null)
    .sort((a, b) => (a.returns.day45 || 0) - (b.returns.day45 || 0))
    .slice(0, 10);

  for (const r of worst) {
    console.log(`  ${r.signalDate} ${r.ticker.padEnd(6)} ${r.returns.day45?.toFixed(1)}% (excess: ${r.excess.day45?.toFixed(1)}%)`);
  }
  console.log();

  // 7. SUMMARY STATISTICS
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log();

  const valid45 = results.filter(r => r.returns.day45 !== null);
  const avgRet45 = avg(valid45.map(r => r.returns.day45));
  const avgExcess45 = avg(valid45.map(r => r.excess.day45));
  const win45 = winRate(valid45.map(r => r.returns.day45));
  const excessWin45 = winRate(valid45.map(r => r.excess.day45));

  console.log(`Total politician signals: ${results.length}`);
  console.log(`Signals with 45-day data: ${valid45.length}`);
  console.log(`Date range: ${results[0]?.signalDate} to ${results[results.length - 1]?.signalDate}`);
  console.log();
  console.log('45-Day Performance:');
  console.log(`  Average Return: ${avgRet45.toFixed(2)}%`);
  console.log(`  Win Rate (positive return): ${win45.toFixed(1)}%`);
  console.log(`  Average Excess vs SPY: ${avgExcess45.toFixed(2)}%`);
  console.log(`  Beat SPY Rate: ${excessWin45.toFixed(1)}%`);
  console.log();

  // Annualized return calculation
  const annualized = (ret: number, days: number) => (Math.pow(1 + ret / 100, 252 / days) - 1) * 100;
  console.log('Annualized Returns (assuming reinvestment):');
  console.log(`  5-Day strategy: ${annualized(avg(results.map(r => r.returns.day5)), 5).toFixed(1)}%`);
  console.log(`  15-Day strategy: ${annualized(avg(results.map(r => r.returns.day15)), 15).toFixed(1)}%`);
  console.log(`  45-Day strategy: ${annualized(avgRet45, 45).toFixed(1)}%`);
  console.log();

  // Statistical significance
  const stdDev = (arr: number[]) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length);
  };

  const excessReturns = valid45.map(r => r.excess.day45).filter(v => v !== null) as number[];
  const excessStd = stdDev(excessReturns);
  const tStat = (avgExcess45 / excessStd) * Math.sqrt(excessReturns.length);

  console.log('Statistical Analysis:');
  console.log(`  Excess Return Std Dev: ${excessStd.toFixed(2)}%`);
  console.log(`  T-Statistic: ${tStat.toFixed(2)}`);
  console.log(`  Statistically Significant (t > 2): ${tStat > 2 ? 'YES' : 'NO'}`);
  console.log();

  db.close();
  console.log('Backtest complete!');
}

runBacktest().catch(console.error);
