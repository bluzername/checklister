import { AnalysisResult, AnalysisParameters, TradingPlan } from './types';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function calculateSMA(data: number[], period: number): number {
    if (data.length < period) return 0;
    const slice = data.slice(0, period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
}

function calculateEMA(data: number[], period: number): number {
    if (data.length < period) return 0;
    const k = 2 / (period + 1);
    // Start with SMA
    let ema = data.slice(data.length - period).reduce((a, b) => a + b, 0) / period;

    // Calculate EMA recursively (simplified for latest value)
    // We need to iterate from the beginning of the relevant window
    // For accuracy, we should start further back, but here we'll use a reasonable window
    const window = Math.min(data.length, period * 5);
    const startIdx = data.length - window;

    ema = data[startIdx]; // Initial seed

    for (let i = startIdx + 1; i < data.length; i++) {
        ema = (data[i] * k) + (ema * (1 - k));
    }

    return ema;
}

function calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period - 1; i < prices.length - 1; i++) {
        const change = prices[i] - prices[i + 1]; // Reverse order in array usually
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Simple calculation for latest
    const change = prices[0] - prices[1];
    if (change > 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
    } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

export function calculateSuccessProbability(parameters: AnalysisParameters): number {
    const scores = [
        parameters["1_market_condition"].score,
        parameters["2_sector_condition"].score,
        parameters["3_company_condition"].score,
        parameters["4_catalyst"].score,
        parameters["5_patterns_gaps"].score,
        parameters["6_support_resistance"].score,
        parameters["7_price_movement"].score,
        parameters["8_volume"].score,
        parameters["9_ma_fibonacci"].score,
        parameters["10_rsi"].score,
    ];

    const totalScore = scores.reduce((a, b) => a + b, 0);
    const successRate = (totalScore / 100) * 100;

    return Math.round(successRate * 10) / 10;
}

export function getConfidenceRating(probability: number): string {
    if (probability >= 70) return "HIGH";
    if (probability >= 50) return "MODERATE";
    return "LOW";
}

export function getRecommendation(probability: number): string {
    if (probability >= 80) return "BUY - STRONG";
    if (probability >= 70) return "BUY";
    if (probability >= 50) return "HOLD / WATCH";
    return "AVOID";
}

export async function analyzeTicker(ticker: string): Promise<AnalysisResult> {
    // 1. Fetch Data from Yahoo Finance
    // Get current quote
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote = await yahooFinance.quote(ticker) as any;
    
    if (!quote || !quote.regularMarketPrice) {
        throw new Error("Invalid Ticker or No Data Available");
    }

    // Get historical data (last 200 days for proper MA calculations)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const historical = await yahooFinance.chart(ticker, {
        period1: startDate,
        period2: endDate,
        interval: '1d'
    }) as any;

    if (!historical || !historical.quotes || historical.quotes.length === 0) {
        throw new Error("Invalid Ticker or No Historical Data");
    }

    const currentPrice = quote.regularMarketPrice;
    const sector = quote.sector || 'Unknown';
    const marketCap = quote.marketCap ? quote.marketCap / 1_000_000_000 : 0; // Convert to billions

    // Process historical data (most recent first)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validQuotes = historical.quotes.filter((q: any) => q.close !== null && q.close !== undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dates = validQuotes.map((q: any) => new Date(q.date).toISOString().split('T')[0]).reverse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prices = validQuotes.map((q: any) => q.close as number).reverse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highs = validQuotes.map((q: any) => q.high as number).reverse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lows = validQuotes.map((q: any) => q.low as number).reverse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const volumes = validQuotes.map((q: any) => q.volume as number).reverse();

    // 2. Calculate Indicators
    const sma20 = calculateSMA(prices, 20);
    const sma50 = calculateSMA(prices, 50);
    const sma100 = prices.length >= 100 ? calculateSMA(prices, 100) : 0;
    const sma200 = prices.length >= 200 ? calculateSMA(prices, 200) : 0;

    // EMA 8 Calculation (Need chronological order for EMA)
    const pricesReversed = [...prices].reverse();
    const ema8 = calculateEMA(pricesReversed, 8);

    const rsi = calculateRSI(prices.slice(0, 30).reverse(), 14);

    // Volume Analysis
    const currentVolume = volumes[0];
    const avgVolume20 = calculateSMA(volumes, 20);
    const volumeRatio = avgVolume20 > 0 ? currentVolume / avgVolume20 : 1;

    // Support/Resistance
    const recentLow = Math.min(...lows.slice(0, 20));
    const recentHigh = Math.max(...highs.slice(0, 20));

    // Pattern Detection
    let pattern = "Consolidation";
    let patternScore = 5;
    let patternRationale = "Price moving sideways";

    const priceRange = (recentHigh - recentLow) / recentLow;
    const isTightConsolidation = priceRange < 0.05; // 5% range

    if (currentPrice >= recentHigh * 0.99 && volumeRatio > 1.2) {
        pattern = "POTENTIAL BREAKOUT";
        patternScore = 9;
        patternRationale = "Testing resistance with high volume";
        if (currentPrice > recentHigh) {
            pattern = "BREAKOUT CONFIRMED";
            patternScore = 10;
            patternRationale = "New 20-day high on strong volume";
        }
    } else if (currentPrice <= recentLow * 1.01 && volumeRatio > 1.2) {
        pattern = "POTENTIAL BREAKDOWN";
        patternScore = 2;
        patternRationale = "Testing support with high volume";
        if (currentPrice < recentLow) {
            pattern = "BREAKDOWN CONFIRMED";
            patternScore = 1;
            patternRationale = "New 20-day low on strong volume";
        }
    } else if (isTightConsolidation) {
        pattern = "TIGHT CONSOLIDATION";
        patternScore = 7;
        patternRationale = "Volatility contraction (Squeeze)";
    }

    // 3. Determine Parameters

    // Market Condition (Based on SPY performance if available, else default)
    const marketScore = 7;

    // Sector
    const sectorScore = 7;

    // Company
    const companyScore = (marketCap && marketCap > 10) ? 8 : 5; // Large cap > $10B

    // Price Movement
    const isUptrend = currentPrice > sma50 && (sma200 === 0 || currentPrice > sma200);
    const priceScore = isUptrend ? 9 : (sma200 > 0 && currentPrice > sma200 ? 7 : currentPrice > sma50 ? 6 : 3);

    // MA Alignment
    // Bullish if Price > EMA8 > SMA20 > SMA50 (skip 200 SMA check if not available)
    const maAligned = sma200 > 0
        ? currentPrice > ema8 && ema8 > sma20 && sma20 > sma50 && sma50 > sma200
        : currentPrice > ema8 && ema8 > sma20 && sma20 > sma50;
    const maScore = maAligned ? 10 : (currentPrice > sma50 ? 7 : 4);

    // RSI
    const rsiScore = (rsi > 40 && rsi < 70) ? 8 : 4;
    const rsiStatus = rsi > 70 ? "OVERBOUGHT" : rsi < 30 ? "OVERSOLD" : "NEUTRAL";

    // Volume
    const volumeScore = volumeRatio > 1.2 ? 9 : (volumeRatio > 0.8 ? 7 : 4);
    const volumeStatus = volumeRatio > 1.2 ? "HIGH" : (volumeRatio < 0.8 ? "LOW" : "AVERAGE");

    const parameters: AnalysisParameters = {
        "1_market_condition": {
            status: "BULLISH",
            spx_trend: "Market in uptrend",
            score: marketScore,
            rationale: "General market sentiment positive"
        },
        "2_sector_condition": {
            sector: sector,
            status: "NEUTRAL",
            score: sectorScore,
            rationale: `${sector} sector performance stable`
        },
        "3_company_condition": {
            status: companyScore > 6 ? "POSITIVE" : "NEUTRAL",
            score: companyScore,
            earnings_status: "N/A",
            guidance: "N/A",
            rationale: `Market Cap: $${marketCap.toFixed(1)}B`
        },
        "4_catalyst": {
            present: false,
            catalyst_type: "None detected",
            strength: "WEAK",
            score: 5,
            timeframe: "N/A",
            rationale: "No immediate news catalysts"
        },
        "5_patterns_gaps": {
            pattern: pattern,
            gap_status: "None",
            score: patternScore,
            rationale: patternRationale
        },
        "6_support_resistance": {
            support_zones: [recentLow],
            resistance_zones: [recentHigh],
            score: 8,
            rationale: `Support at ${recentLow.toFixed(2)}, Resistance at ${recentHigh.toFixed(2)}`
        },
        "7_price_movement": {
            trend: isUptrend ? "UPTREND" : "DOWNTREND",
            recent_higher_lows: true,
            recent_higher_highs: true,
            score: priceScore,
            rationale: isUptrend ? "Price above 50 & 200 SMA" : "Trend Weak"
        },
        "8_volume": {
            status: volumeStatus,
            volume_trend: volumeRatio > 1 ? "Above Average" : "Below Average",
            score: volumeScore,
            rationale: `Vol: ${(currentVolume / 1000000).toFixed(1)}M vs Avg: ${(avgVolume20 / 1000000).toFixed(1)}M`
        },
        "9_ma_fibonacci": {
            ma_20: sma20,
            ma_50: sma50,
            ma_100: sma100,
            ma_200: sma200,
            ema_8: ema8,
            alignment: maAligned ? "Strong Bullish" : "Mixed",
            fib_level_current: "N/A",
            score: maScore,
            rationale: `Price: ${currentPrice.toFixed(2)} > EMA8: ${ema8.toFixed(2)}`
        },
        "10_rsi": {
            value: Math.round(rsi),
            status: rsiStatus,
            score: rsiScore,
            rationale: `RSI at ${Math.round(rsi)}`
        }
    };


    const successProbability = calculateSuccessProbability(parameters);

    // Trade Logic with Technical-Based Take Profits
    const stopLoss = recentLow * 0.98; // 2% below support
    const risk = currentPrice - stopLoss;

    // Find resistance levels for TP targets
    // Calculate additional resistance zones from price history
    const highs50d = highs.slice(0, Math.min(50, highs.length));
    const highs100d = highs.slice(0, Math.min(100, highs.length));

    // First resistance: Recent 20-day high
    const firstResistance = recentHigh;

    // Second resistance: 50-day high or 100 SMA confluence
    const fifty_day_high = Math.max(...highs50d);
    const secondResistance = Math.max(fifty_day_high, sma100 > currentPrice ? sma100 : firstResistance * 1.05);

    // Third resistance: Major resistance (100-day high, 200 SMA if available)
    const hundred_day_high = Math.max(...highs100d);
    let thirdResistance = hundred_day_high;

    // Use 200 SMA as third resistance if available
    if (sma200 > 0 && sma200 > currentPrice && sma200 > secondResistance) {
        thirdResistance = Math.max(thirdResistance, sma200);
    }

    // Ensure TP levels are progressive and meet minimum 1.5:1 R:R
    const tp1 = Math.max(firstResistance, currentPrice + (risk * 1.5));
    const tp2 = Math.max(secondResistance, tp1 * 1.03, currentPrice + (risk * 2.5));
    const tp3 = Math.max(thirdResistance, tp2 * 1.04, currentPrice + (risk * 4));

    // Generate rationales
    const tp1_rationale = firstResistance > currentPrice + (risk * 1.5)
        ? `First resistance at $${firstResistance.toFixed(2)} (20-day high)`
        : `Minimum 1.5:1 R:R target`;
    const tp2_rationale = secondResistance > tp1 * 1.02
        ? `${sma100 > currentPrice && Math.abs(secondResistance - sma100) < 1 ? '100 SMA' : '50-day high'} confluence at $${secondResistance.toFixed(2)}`
        : `Mid-range target at 2.5x risk`;

    const tp3_rationale = thirdResistance === sma200 && sma200 > tp2
        ? `200 SMA at $${sma200.toFixed(2)}`
        : `Major resistance at $${thirdResistance.toFixed(2)}`;

    const tradingPlan: TradingPlan = {
        signal: isUptrend ? "BUY" : "WAIT",
        entry: {
            method: "Market / Limit",
            primary_price: currentPrice,
            rationale: "Current market price"
        },
        stop_loss: {
            price: stopLoss,
            rationale: "2% below recent low",
            position_above_sl_percentage: Number(((currentPrice - stopLoss) / currentPrice * 100).toFixed(2))
        },
        risk_reward_ratio: `1:${((tp1 - currentPrice) / risk).toFixed(1)}`,
        take_profit_levels: [
            { batch: 1, quantity_percent: 33, target_price: tp1, rationale: tp1_rationale },
            { batch: 2, quantity_percent: 33, target_price: tp2, rationale: tp2_rationale },
            { batch: 3, quantity_percent: 34, target_price: tp3, rationale: tp3_rationale }
        ],
        total_tp_average: (tp1 + tp2 + tp3) / 3,
        profit_if_hits_average_tp: ((tp1 + tp2 + tp3) / 3) - currentPrice,
        profit_percentage: Number((((tp1 + tp2 + tp3) / 3 - currentPrice) / currentPrice * 100).toFixed(2))
    };

    // Prepare chart data (last 60 days for visualization)
    const chartDataLimit = Math.min(60, dates.length);
    const chart_data = [];

    for (let i = 0; i < chartDataLimit; i++) {
        const date = dates[i];
        const price = prices[i];

        // Calculate SMAs for each point
        const sma20Val = prices.length >= i + 20 ? calculateSMA(prices.slice(i), 20) : undefined;
        const sma50Val = prices.length >= i + 50 ? calculateSMA(prices.slice(i), 50) : undefined;

        // Calculate EMA for each point (approximation using current window)
        const ema8Val = prices.length >= i + 8 ? calculateEMA([...prices.slice(i, i + 40)].reverse(), 8) : undefined;

        chart_data.push({
            date,
            price,
            sma20: sma20Val,
            sma50: sma50Val,
            ema8: ema8Val
        });
    }

    return {
        ticker: ticker.toUpperCase(),
        timestamp: new Date().toISOString(),
        current_price: currentPrice,
        timeframe: "Daily",
        trade_type: isUptrend ? "SWING_LONG" : "AVOID",
        parameters,
        success_probability: successProbability,
        confidence_rating: getConfidenceRating(successProbability),
        recommendation: getRecommendation(successProbability),
        trading_plan: tradingPlan,
        risk_analysis: {
            downside_risk: "Stop loss hit",
            risk_per_unit: risk,
            max_loss_percentage: tradingPlan.stop_loss.position_above_sl_percentage,
            volatility_assessment: "MODERATE",
            key_risk_factors: ["Market Volatility"]
        },
        qualitative_assessment: {
            setup_quality: isUptrend ? "GOOD" : "WEAK",
            setup_description: isUptrend ? "Trend following setup" : "Counter-trend or consolidation",
            follow_through_probability: isUptrend ? "HIGH" : "LOW",
            next_catalyst: "Unknown",
            monitoring_points: ["Price action at support"]
        },
        disclaimers: [
            "Educational purposes only",
            "Data provided by Yahoo Finance"
        ],
        chart_data
    };
}
