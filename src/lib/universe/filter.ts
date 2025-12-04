/**
 * Universe Filter
 * Defines and applies stock universe filters for backtesting and scanning
 */

import YahooFinance from 'yahoo-finance2';
import { createClient, isSupabaseConfigured } from '../supabase/server';
import { UniverseFilter, UniverseDefinition } from '../backtest/types';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// ============================================
// DEFAULT UNIVERSE CONFIGURATIONS
// ============================================

/**
 * Default universe: Liquid US stocks suitable for swing trading
 */
export const DEFAULT_UNIVERSE_FILTER: UniverseFilter = {
  minAvgDollarVolume: 5_000_000, // $5M daily volume
  minPrice: 5,
  maxPrice: 500,
  minMarketCap: 1, // $1B market cap
  excludeADRs: false,
  excludeETFs: true,
  excludeSectors: [], // Include all sectors
  excludeTickers: ['BRK.A', 'BRK.B'], // Exclude Berkshire due to special handling
};

/**
 * Conservative universe: Large-cap, highly liquid
 */
export const CONSERVATIVE_UNIVERSE_FILTER: UniverseFilter = {
  minAvgDollarVolume: 50_000_000, // $50M daily volume
  minPrice: 20,
  maxPrice: 500,
  minMarketCap: 10, // $10B market cap
  excludeADRs: true,
  excludeETFs: true,
};

/**
 * Growth universe: Mid to large cap growth stocks
 */
export const GROWTH_UNIVERSE_FILTER: UniverseFilter = {
  minAvgDollarVolume: 10_000_000,
  minPrice: 10,
  maxPrice: 1000,
  minMarketCap: 2, // $2B
  maxMarketCap: 100, // $100B
  excludeADRs: false,
  excludeETFs: true,
  excludeSectors: ['Utilities', 'Real Estate'],
};

/**
 * S&P 500 equivalent filter
 */
export const SP500_FILTER: UniverseFilter = {
  minAvgDollarVolume: 20_000_000,
  minPrice: 5,
  maxPrice: 10000,
  minMarketCap: 10, // Roughly S&P 500 minimum
  excludeADRs: false,
  excludeETFs: true,
};

// ============================================
// COMMON STOCK LISTS
// ============================================

/**
 * S&P 500 components (subset for testing)
 * In production, this would be fetched from an API or database
 */
export const SP500_TICKERS = [
  'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA', 'BRK.B', 'UNH', 'JNJ',
  'XOM', 'V', 'JPM', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV', 'LLY',
  'PEP', 'KO', 'COST', 'AVGO', 'MCD', 'WMT', 'TMO', 'CSCO', 'ACN', 'ABT',
  'CRM', 'DHR', 'NEE', 'LIN', 'NKE', 'AMD', 'TXN', 'PM', 'UNP', 'UPS',
  'ORCL', 'INTC', 'RTX', 'HON', 'LOW', 'QCOM', 'IBM', 'CAT', 'SBUX', 'GE',
  'INTU', 'AMAT', 'BA', 'AMGN', 'PLD', 'SPGI', 'DE', 'MS', 'BLK', 'GS',
  'AXP', 'GILD', 'MDLZ', 'ISRG', 'ADI', 'SYK', 'VRTX', 'MMC', 'TJX', 'ADP',
  'CVS', 'REGN', 'BKNG', 'C', 'SCHW', 'LRCX', 'MO', 'PGR', 'CB', 'ETN',
  'CI', 'ZTS', 'EOG', 'SO', 'BSX', 'FISV', 'AMT', 'BDX', 'DUK', 'SLB',
  'CME', 'CL', 'ITW', 'EQIX', 'NOC', 'MU', 'AON', 'WM', 'SHW', 'ICE',
];

/**
 * NASDAQ 100 components (subset)
 */
export const NDX100_TICKERS = [
  'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA', 'AVGO', 'COST', 'PEP',
  'ADBE', 'CSCO', 'NFLX', 'AMD', 'CMCSA', 'INTC', 'INTU', 'TXN', 'QCOM', 'AMGN',
  'HON', 'SBUX', 'AMAT', 'BKNG', 'ISRG', 'GILD', 'MDLZ', 'ADI', 'VRTX', 'ADP',
  'REGN', 'LRCX', 'MU', 'CSX', 'PYPL', 'PANW', 'SNPS', 'KLAC', 'CDNS', 'MELI',
  'ORLY', 'MAR', 'NXPI', 'MNST', 'CTAS', 'PCAR', 'AEP', 'KDP', 'FTNT', 'WDAY',
];

/**
 * High-beta tech stocks for momentum strategies
 */
export const HIGH_BETA_TECH = [
  'NVDA', 'AMD', 'TSLA', 'MELI', 'SHOP', 'SQ', 'CRWD', 'SNOW', 'DDOG', 'NET',
  'PLTR', 'COIN', 'ROKU', 'DOCU', 'ZS', 'OKTA', 'MDB', 'TWLO', 'TTD', 'BILL',
];

// ============================================
// FILTER VALIDATION
// ============================================

/**
 * Check if a stock passes the universe filter
 * Returns null if data cannot be fetched
 */
export async function passesFilter(
  ticker: string,
  filter: UniverseFilter
): Promise<{ passes: boolean; reason?: string } | null> {
  try {
    // Check exclusion lists first
    if (filter.excludeTickers?.includes(ticker.toUpperCase())) {
      return { passes: false, reason: 'Ticker excluded' };
    }

    if (filter.includeOnlyTickers && filter.includeOnlyTickers.length > 0) {
      if (!filter.includeOnlyTickers.includes(ticker.toUpperCase())) {
        return { passes: false, reason: 'Not in include list' };
      }
    }

    // Fetch quote data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote = await yahooFinance.quote(ticker) as any;
    
    if (!quote) {
      return null;
    }

    // Price filter
    const price = quote.regularMarketPrice || 0;
    if (price < filter.minPrice) {
      return { passes: false, reason: `Price ${price} below minimum ${filter.minPrice}` };
    }
    if (price > filter.maxPrice) {
      return { passes: false, reason: `Price ${price} above maximum ${filter.maxPrice}` };
    }

    // Market cap filter (in billions)
    const marketCapBillions = (quote.marketCap || 0) / 1_000_000_000;
    if (marketCapBillions < filter.minMarketCap) {
      return { passes: false, reason: `Market cap ${marketCapBillions.toFixed(1)}B below minimum ${filter.minMarketCap}B` };
    }
    if (filter.maxMarketCap && marketCapBillions > filter.maxMarketCap) {
      return { passes: false, reason: `Market cap ${marketCapBillions.toFixed(1)}B above maximum ${filter.maxMarketCap}B` };
    }

    // Average volume filter
    const avgVolume = quote.averageDailyVolume10Day || quote.averageVolume || 0;
    const avgDollarVolume = avgVolume * price;
    if (avgDollarVolume < filter.minAvgDollarVolume) {
      return { 
        passes: false, 
        reason: `Avg dollar volume ${(avgDollarVolume / 1_000_000).toFixed(1)}M below minimum ${(filter.minAvgDollarVolume / 1_000_000).toFixed(1)}M` 
      };
    }

    // Sector filter
    const sector = quote.sector || '';
    if (filter.excludeSectors && filter.excludeSectors.includes(sector)) {
      return { passes: false, reason: `Sector ${sector} excluded` };
    }

    // ETF filter
    if (filter.excludeETFs && quote.quoteType === 'ETF') {
      return { passes: false, reason: 'ETFs excluded' };
    }

    // All filters passed
    return { passes: true };

  } catch (error) {
    console.error(`Error checking filter for ${ticker}:`, error);
    return null;
  }
}

/**
 * Filter a list of tickers against universe criteria
 */
export async function filterTickers(
  tickers: string[],
  filter: UniverseFilter,
  concurrency: number = 5
): Promise<{ passed: string[]; failed: { ticker: string; reason: string }[] }> {
  const passed: string[] = [];
  const failed: { ticker: string; reason: string }[] = [];

  // Process in batches to avoid rate limiting
  for (let i = 0; i < tickers.length; i += concurrency) {
    const batch = tickers.slice(i, i + concurrency);
    
    const results = await Promise.all(
      batch.map(async (ticker) => {
        const result = await passesFilter(ticker, filter);
        return { ticker, result };
      })
    );

    for (const { ticker, result } of results) {
      if (result === null) {
        failed.push({ ticker, reason: 'Could not fetch data' });
      } else if (result.passes) {
        passed.push(ticker);
      } else {
        failed.push({ ticker, reason: result.reason || 'Unknown' });
      }
    }

    // Small delay between batches
    if (i + concurrency < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return { passed, failed };
}

// ============================================
// UNIVERSE DEFINITION MANAGEMENT
// ============================================

/**
 * Save a universe definition to the database
 */
export async function saveUniverseDefinition(
  universe: Omit<UniverseDefinition, 'id' | 'created_at' | 'updated_at'>
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Database not configured' };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('universe_definitions')
      .upsert(universe, { onConflict: 'name' })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get a universe definition by name
 */
export async function getUniverseDefinition(
  name: string
): Promise<{ success: boolean; data?: UniverseDefinition; error?: string }> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Database not configured' };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('universe_definitions')
      .select('*')
      .eq('name', name)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as UniverseDefinition };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * List all active universe definitions
 */
export async function listUniverseDefinitions(): Promise<{
  success: boolean;
  data?: UniverseDefinition[];
  error?: string;
}> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Database not configured' };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('universe_definitions')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as UniverseDefinition[] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Refresh universe tickers by applying filters
 */
export async function refreshUniverseTickers(
  universeName: string,
  sourceTickers?: string[]
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Database not configured' };
    }

    // Get universe definition
    const universeResult = await getUniverseDefinition(universeName);
    if (!universeResult.success || !universeResult.data) {
      return { success: false, error: universeResult.error || 'Universe not found' };
    }

    const universe = universeResult.data;
    
    // Use provided tickers or default to S&P 500
    const tickersToFilter = sourceTickers || SP500_TICKERS;
    
    // Apply filters
    const { passed } = await filterTickers(tickersToFilter, universe.filters);

    // Update universe definition
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('universe_definitions')
      .update({
        tickers: passed,
        ticker_count: passed.length,
        last_refresh: new Date().toISOString(),
      })
      .eq('name', universeName);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, count: passed.length };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// QUICK UNIVERSE GETTERS
// ============================================

/**
 * Get filtered tickers for a predefined universe
 */
export async function getUniverseTickers(
  universeName: 'default' | 'conservative' | 'growth' | 'sp500' | 'ndx100' | 'high_beta_tech'
): Promise<string[]> {
  switch (universeName) {
    case 'default':
      const defaultResult = await filterTickers(SP500_TICKERS, DEFAULT_UNIVERSE_FILTER);
      return defaultResult.passed;
      
    case 'conservative':
      const conservativeResult = await filterTickers(SP500_TICKERS, CONSERVATIVE_UNIVERSE_FILTER);
      return conservativeResult.passed;
      
    case 'growth':
      const growthResult = await filterTickers([...SP500_TICKERS, ...NDX100_TICKERS], GROWTH_UNIVERSE_FILTER);
      return growthResult.passed;
      
    case 'sp500':
      return SP500_TICKERS;
      
    case 'ndx100':
      return NDX100_TICKERS;
      
    case 'high_beta_tech':
      return HIGH_BETA_TECH;
      
    default:
      return SP500_TICKERS;
  }
}

/**
 * Get a quick universe without database (for testing)
 */
export function getQuickUniverse(size: 'small' | 'medium' | 'large' = 'medium'): string[] {
  switch (size) {
    case 'small':
      return ['AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA', 'JPM', 'V', 'UNH'];
    case 'medium':
      return SP500_TICKERS.slice(0, 50);
    case 'large':
      return SP500_TICKERS;
    default:
      return SP500_TICKERS.slice(0, 50);
  }
}




