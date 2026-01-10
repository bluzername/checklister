import { NextRequest, NextResponse } from 'next/server';
import { upsertRecommendations, cleanupOldRecommendations, RecommendationInput } from '@/app/recommendations-actions';
import { calculateSoftSignalScore, InsiderTrade } from '@/lib/data-services/quiver';

const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';

// FMP API response type
interface FMPInsiderTrade {
    symbol: string;
    filingDate: string;
    transactionDate: string;
    reportingCik: string;
    companyCik: string;
    transactionType: string;
    securitiesOwned: number;
    reportingName: string;
    typeOfOwner: string;
    acquisitionOrDisposition: 'A' | 'D';
    directOrIndirect: string;
    formType: string;
    securitiesTransacted: number;
    price: number;
    securityName: string;
    url: string;
}

/**
 * Parse transaction type from FMP format
 */
function parseTransactionType(trade: FMPInsiderTrade): 'BUY' | 'SELL' | 'OPTION' {
    const txType = (trade.transactionType || '').toLowerCase();

    if (txType.includes('purchase') || txType === 'p' || txType === 'p-purchase') {
        return 'BUY';
    }
    if (txType.includes('sale') || txType === 's' || txType === 's-sale') {
        return 'SELL';
    }
    if (txType.includes('option') || txType.includes('exercise') || txType === 'm') {
        return 'OPTION';
    }
    if (txType.includes('gift') || txType === 'g' || txType === 'g-gift') {
        return 'OPTION';
    }

    if (trade.acquisitionOrDisposition === 'A') {
        return 'BUY';
    }
    if (trade.acquisitionOrDisposition === 'D') {
        return 'SELL';
    }

    return 'OPTION';
}

/**
 * Fetch all recent insider trades from FMP
 */
async function fetchAllInsiderTrades(): Promise<InsiderTrade[]> {
    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
        throw new Error('FMP_API_KEY not configured');
    }

    console.log('[Cron] Fetching insider trades from FMP...');

    const allTrades: InsiderTrade[] = [];
    const pagesToFetch = 5; // 500 trades total

    for (let page = 0; page < pagesToFetch; page++) {
        const url = `${FMP_BASE_URL}/insider-trading/latest?page=${page}&limit=100&apikey=${apiKey}`;
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            console.error(`[Cron] FMP API error: ${response.status}`);
            break;
        }

        const data: FMPInsiderTrade[] = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
            break;
        }

        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const trades = data
            .filter(trade => {
                const tradeDate = new Date(trade.transactionDate);
                return !isNaN(tradeDate.getTime()) && tradeDate >= ninetyDaysAgo;
            })
            .map(trade => ({
                ticker: trade.symbol,
                name: trade.reportingName || 'Unknown',
                title: trade.typeOfOwner || 'Unknown',
                transactionType: parseTransactionType(trade),
                shares: Math.abs(trade.securitiesTransacted || 0),
                pricePerShare: trade.price || null,
                totalValue: trade.price && trade.securitiesTransacted
                    ? Math.abs(trade.price * trade.securitiesTransacted)
                    : null,
                filingDate: trade.filingDate,
                transactionDate: trade.transactionDate,
            }));

        allTrades.push(...trades);

        // Small delay between pages
        if (page < pagesToFetch - 1) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    console.log(`[Cron] Fetched ${allTrades.length} insider trades`);
    return allTrades;
}

/**
 * Group trades by ticker and calculate soft signal scores
 */
function calculateTickerScores(allTrades: InsiderTrade[]): Map<string, RecommendationInput> {
    // Group by ticker
    const byTicker = new Map<string, InsiderTrade[]>();
    for (const trade of allTrades) {
        const ticker = trade.ticker.toUpperCase();
        if (!byTicker.has(ticker)) {
            byTicker.set(ticker, []);
        }
        byTicker.get(ticker)!.push(trade);
    }

    console.log(`[Cron] Found ${byTicker.size} unique tickers`);

    // Calculate scores for each ticker
    const results = new Map<string, RecommendationInput>();

    for (const [ticker, trades] of byTicker) {
        // Filter to real buys/sells (not options/gifts)
        const realTrades = trades.filter(t =>
            t.transactionType === 'BUY' || t.transactionType === 'SELL'
        );

        const buys = realTrades.filter(t => t.transactionType === 'BUY');
        const sells = realTrades.filter(t => t.transactionType === 'SELL');

        // Calculate soft signal score
        const { score, strength } = calculateSoftSignalScore(trades, []); // No congress data

        // Find top buyer (by value)
        const topBuyer = buys
            .filter(t => t.totalValue !== null)
            .sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0))[0];

        // Find most recent trade
        const sortedTrades = realTrades.sort((a, b) =>
            new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
        );
        const lastTrade = sortedTrades[0];

        results.set(ticker, {
            ticker,
            insider_buys: buys.length,
            insider_sells: sells.length,
            insider_buy_ratio: realTrades.length > 0
                ? Math.round((buys.length / realTrades.length) * 100) / 100
                : undefined,
            top_buyer: topBuyer ? `${topBuyer.name} (${topBuyer.title})` : undefined,
            congress_buys: 0,
            congress_sells: 0,
            soft_signal_score: score,
            signal_strength: strength,
            last_trade_date: lastTrade?.transactionDate,
            last_trade_value: lastTrade?.totalValue || undefined,
        });
    }

    return results;
}

/**
 * Cron job: Update recommendations based on insider activity
 *
 * This runs daily at 6 AM UTC (after market close + filings processed)
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/recommendations",
 *     "schedule": "0 6 * * *"
 *   }]
 * }
 */
export async function GET(request: NextRequest) {
    // Verify cron secret (Vercel sets this automatically)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Allow access if:
    // 1. CRON_SECRET is set and matches
    // 2. Request is from localhost (development)
    // 3. No CRON_SECRET set (disabled auth for testing)
    const isLocalhost = request.headers.get('host')?.includes('localhost');
    const isAuthorized = !cronSecret || authHeader === `Bearer ${cronSecret}` || isLocalhost;

    if (!isAuthorized) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    console.log('[Cron] Starting recommendations update...');
    const startTime = Date.now();

    try {
        // 1. Fetch all recent insider trades from FMP
        const allTrades = await fetchAllInsiderTrades();

        if (allTrades.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'No insider trades fetched',
            });
        }

        // 2. Calculate scores for each ticker
        const tickerScores = calculateTickerScores(allTrades);

        // 3. Filter for STRONG or MODERATE signals only
        const recommendations: RecommendationInput[] = [];
        for (const [, input] of tickerScores) {
            if (input.signal_strength === 'STRONG' || input.signal_strength === 'MODERATE') {
                recommendations.push(input);
            }
        }

        console.log(`[Cron] Found ${recommendations.length} recommendations (STRONG/MODERATE)`);

        // 4. Upsert to database
        if (recommendations.length > 0) {
            const upsertResult = await upsertRecommendations(recommendations);
            if (!upsertResult.success) {
                throw new Error(upsertResult.error || 'Failed to upsert recommendations');
            }
        }

        // 5. Cleanup old recommendations (tickers no longer in data)
        const keepTickers = Array.from(tickerScores.keys());
        const cleanupResult = await cleanupOldRecommendations(keepTickers);

        const duration = Date.now() - startTime;
        console.log(`[Cron] Completed in ${duration}ms`);

        return NextResponse.json({
            success: true,
            totalTrades: allTrades.length,
            uniqueTickers: tickerScores.size,
            recommendations: recommendations.length,
            removed: cleanupResult.removed || 0,
            durationMs: duration,
        });

    } catch (error) {
        console.error('[Cron] Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
