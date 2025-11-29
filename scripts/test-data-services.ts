/**
 * Test Script for SwingTrade Pro SOTA System
 * 
 * Run with: npx tsx scripts/test-data-services.ts
 * 
 * Tests:
 * 1. FMP fundamentals fetching
 * 2. Claude sentiment analysis
 * 3. Cache functionality
 * 4. Phase 1: Market Regime Detection
 * 5. Phase 2: Multi-Timeframe Analysis
 * 6. Phase 3: Volume Profile Analysis
 * 7. Phase 4: Divergence & Adaptive RSI
 * 8. Full analysis integration
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });

import { getFundamentals, isFmpConfigured } from '../src/lib/data-services/fmp';
import { analyzeSentiment, isClaudeConfigured } from '../src/lib/data-services/sentiment';
import { getApiStats, getRecentLogs, clearLogs } from '../src/lib/data-services/logger';
import { getCacheStats, clearCache } from '../src/lib/data-services/cache';
import { analyzeTicker } from '../src/lib/analysis';

// Phase 1: Market Regime
import { detectMarketRegime, getRegimeThresholds, getMarketContext } from '../src/lib/market-regime';

// Phase 2: Multi-Timeframe
import { get4HourData, getMultiTimeframeAlignment } from '../src/lib/multi-timeframe';

// Phase 3: Volume Profile
import { calculateVolumeProfile } from '../src/lib/volume-profile';

// Phase 4: Momentum
import { analyzeDivergences, analyzeAdaptiveRSI } from '../src/lib/momentum';

const TEST_TICKERS = ['AAPL', 'NVDA', 'TSLA'];

async function testEodhd() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST 1: FMP Fundamentals');
    console.log('='.repeat(60));
    
    const configured = isFmpConfigured();
    console.log(`\nFMP API configured: ${configured ? '✅ Yes' : '❌ No (will use fallback)'}`);
    
    for (const ticker of TEST_TICKERS) {
        console.log(`\n--- ${ticker} ---`);
        const startTime = Date.now();
        
        try {
            const data = await getFundamentals(ticker);
            const latency = Date.now() - startTime;
            
            console.log(`  Data available: ${data.data_available ? '✅' : '❌'}`);
            console.log(`  Latency: ${latency}ms`);
            
            if (data.data_available) {
                console.log(`  EPS Actual: ${data.eps_actual ?? 'N/A'}`);
                console.log(`  EPS Expected: ${data.eps_expected ?? 'N/A'}`);
                console.log(`  Earnings Surprise: ${data.earnings_surprise ? '✅ Beat' : '❌ Miss/Meet'}`);
                console.log(`  Revenue Growth QoQ: ${data.revenue_growth_qoq?.toFixed(1) ?? 'N/A'}%`);
                console.log(`  Market Cap: $${data.market_cap?.toFixed(1) ?? 'N/A'}B`);
            }
        } catch (error) {
            console.log(`  ❌ Error: ${error}`);
        }
    }
}

async function testSentiment() {
    console.log('\n' + '='.repeat(60));
    console.log('🎭 TEST 2: Claude Sentiment Analysis');
    console.log('='.repeat(60));
    
    const configured = isClaudeConfigured();
    console.log(`\nClaude API configured: ${configured ? '✅ Yes' : '❌ No (will use fallback)'}`);
    
    for (const ticker of TEST_TICKERS) {
        console.log(`\n--- ${ticker} ---`);
        const startTime = Date.now();
        
        try {
            const data = await analyzeSentiment(ticker);
            const latency = Date.now() - startTime;
            
            console.log(`  Data available: ${data.data_available ? '✅' : '❌'}`);
            console.log(`  Latency: ${latency}ms`);
            
            if (data.data_available) {
                console.log(`  Sentiment Score: ${data.sentiment_score.toFixed(2)}`);
                console.log(`  Sentiment Label: ${data.sentiment_label}`);
                console.log(`  Catalyst Detected: ${data.catalyst_detected ? '✅ ' + (data.catalyst_type || 'Yes') : '❌ No'}`);
                if (data.catalyst_keywords.length > 0) {
                    console.log(`  Keywords: ${data.catalyst_keywords.join(', ')}`);
                }
                console.log(`  Summary: ${data.summary}`);
                console.log(`  Confidence: ${(data.confidence * 100).toFixed(0)}%`);
            }
        } catch (error) {
            console.log(`  ❌ Error: ${error}`);
        }
    }
}

async function testCache() {
    console.log('\n' + '='.repeat(60));
    console.log('💾 TEST 3: Cache Functionality');
    console.log('='.repeat(60));
    
    const ticker = 'AAPL';
    
    // First call (should hit API)
    console.log(`\n--- First call for ${ticker} (should hit API) ---`);
    const start1 = Date.now();
    await getFundamentals(ticker);
    const time1 = Date.now() - start1;
    console.log(`  Time: ${time1}ms`);
    
    // Second call (should hit cache)
    console.log(`\n--- Second call for ${ticker} (should hit cache) ---`);
    const start2 = Date.now();
    await getFundamentals(ticker);
    const time2 = Date.now() - start2;
    console.log(`  Time: ${time2}ms`);
    
    const cacheWorking = time2 < time1 / 2 || time2 < 10;
    console.log(`\n  Cache working: ${cacheWorking ? '✅ Yes (second call was faster)' : '⚠️ Check cache implementation'}`);
    
    // Cache stats
    const cacheStats = getCacheStats();
    console.log(`\n--- Cache Stats ---`);
    console.log(`  Items cached: ${cacheStats.size}`);
    console.log(`  Memory: ${cacheStats.memoryEstimate}`);
}

async function testMarketRegime() {
    console.log('\n' + '='.repeat(60));
    console.log('🌊 TEST 4: Phase 1 - Market Regime Detection');
    console.log('='.repeat(60));
    
    try {
        const startTime = Date.now();
        const regime = await detectMarketRegime();
        const latency = Date.now() - startTime;
        
        console.log(`\n✅ Market Regime detected in ${latency}ms`);
        console.log(`\n--- Regime Analysis ---`);
        console.log(`  Current Regime: ${regime.regime}`);
        console.log(`  Confidence: ${regime.confidence}%`);
        console.log(`  VIX Level: ${regime.details.vixLevel.toFixed(1)}`);
        console.log(`  Volatility: ${regime.details.volatilityEnvironment}`);
        console.log(`  SPY > 50 SMA: ${regime.details.spyAbove50SMA ? '✅' : '❌'}`);
        console.log(`  SPY > 200 SMA: ${regime.details.spyAbove200SMA ? '✅' : '❌'}`);
        console.log(`  Golden Cross: ${regime.details.goldenCross ? '✅' : '❌'}`);
        console.log(`  Trend Strength: ${regime.details.trendStrength.toFixed(1)}/10`);
        
        // Get thresholds for current regime
        const thresholds = getRegimeThresholds(regime.regime);
        console.log(`\n--- Regime Thresholds (${regime.regime}) ---`);
        console.log(`  Min Entry Score: ${thresholds.minEntryScore}/10`);
        console.log(`  Min R:R Ratio: ${thresholds.minRRRatio}:1`);
        console.log(`  Require Volume Confirm: ${thresholds.requireVolumeConfirm ? '✅' : '❌'}`);
        console.log(`  Require 4H Confirm: ${thresholds.requireMultiTimeframe ? '✅' : '❌'}`);
        console.log(`  Allow Shorts: ${thresholds.allowShorts ? '✅' : '❌'}`);
        
    } catch (error) {
        console.log(`\n❌ Market Regime test failed: ${error}`);
    }
}

async function testMultiTimeframe() {
    console.log('\n' + '='.repeat(60));
    console.log('📈 TEST 5: Phase 2 - Multi-Timeframe Analysis');
    console.log('='.repeat(60));
    
    const ticker = 'AAPL';
    
    try {
        // Test 4H data fetching
        console.log(`\n--- 4H Data Fetch for ${ticker} ---`);
        const startTime = Date.now();
        const data4h = await get4HourData(ticker);
        const latency = Date.now() - startTime;
        
        console.log(`  Data Source: ${data4h.dataSource}`);
        console.log(`  Candles: ${data4h.candles.length}`);
        console.log(`  Latency: ${latency}ms`);
        
        if (data4h.candles.length > 0) {
            console.log(`  Latest Close: $${data4h.candles[0].close.toFixed(2)}`);
            console.log(`  Latest Volume: ${data4h.candles[0].volume.toLocaleString()}`);
        }
        
        // Test multi-timeframe alignment
        console.log(`\n--- MTF Alignment for ${ticker} ---`);
        const mtf = await getMultiTimeframeAlignment(ticker, 7.5, 'UPTREND', 'BULL');
        
        console.log(`  Daily Score: ${mtf.daily.score}/10`);
        console.log(`  4H Score: ${mtf.hour4.score}/10`);
        console.log(`  Combined Score: ${mtf.combined_score}/10`);
        console.log(`  Alignment: ${mtf.alignment}`);
        console.log(`  4H MACD Status: ${mtf.hour4.macd.status}`);
        console.log(`  4H RSI: ${mtf.hour4.rsi}`);
        console.log(`  4H Resistance: $${mtf.hour4.resistance.toFixed(2)}`);
        console.log(`  4H Support: $${mtf.hour4.support.toFixed(2)}`);
        console.log(`  Recommendation: ${mtf.recommendation}`);
        
    } catch (error) {
        console.log(`\n❌ Multi-Timeframe test failed: ${error}`);
    }
}

async function testVolumeProfile() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST 6: Phase 3 - Volume Profile Analysis');
    console.log('='.repeat(60));
    
    // Create sample data for testing
    // In real scenario, this would come from Yahoo Finance
    const samplePrices = [185, 184, 183, 185, 186, 187, 185, 184, 183, 182, 
                         181, 180, 181, 182, 183, 184, 185, 186, 187, 188,
                         187, 186, 185, 184, 183, 182, 181, 180, 179, 178];
    const sampleVolumes = [50000000, 45000000, 60000000, 55000000, 70000000,
                          65000000, 40000000, 35000000, 45000000, 50000000,
                          55000000, 60000000, 50000000, 45000000, 40000000,
                          35000000, 30000000, 35000000, 40000000, 45000000,
                          50000000, 55000000, 60000000, 65000000, 70000000,
                          75000000, 80000000, 85000000, 90000000, 95000000];
    
    try {
        console.log('\n--- Volume Profile Calculation ---');
        const startTime = Date.now();
        
        const volumeProfile = calculateVolumeProfile(
            samplePrices, // opens (simplified - using closes)
            samplePrices.map(p => p * 1.02), // highs
            samplePrices.map(p => p * 0.98), // lows
            samplePrices, // closes
            sampleVolumes
        );
        
        const latency = Date.now() - startTime;
        
        console.log(`  Calculation Time: ${latency}ms`);
        console.log(`\n--- Results ---`);
        console.log(`  Overall Score: ${volumeProfile.overallScore}/10`);
        console.log(`  Interpretation: ${volumeProfile.interpretation}`);
        console.log(`  Smart Money: ${volumeProfile.smartMoneySignal}`);
        console.log(`  Confidence: ${volumeProfile.confidence}%`);
        
        console.log(`\n--- Component Scores ---`);
        console.log(`  RVOL Score: ${volumeProfile.details.rvolScore}/10`);
        console.log(`  OBV Score: ${volumeProfile.details.obvScore}/10`);
        console.log(`  CMF Score: ${volumeProfile.details.cmfScore}/10`);
        
        console.log(`\n--- Detailed Metrics ---`);
        console.log(`  RVOL Ratio: ${volumeProfile.rvol.ratio}x`);
        console.log(`  RVOL Level: ${volumeProfile.rvol.interpretation}`);
        console.log(`  OBV Trend: ${volumeProfile.obv.trend}`);
        console.log(`  OBV Divergence: ${volumeProfile.obv.divergence}`);
        console.log(`  CMF Value: ${volumeProfile.cmf.value.toFixed(3)}`);
        console.log(`  CMF Flow: ${volumeProfile.cmf.flowStrength}`);
        console.log(`  Price-Volume Aligned: ${volumeProfile.details.priceVolumeAlignment ? '✅' : '❌'}`);
        console.log(`  Institutional Activity: ${volumeProfile.details.institutionalActivity ? '✅' : '❌'}`);
        
    } catch (error) {
        console.log(`\n❌ Volume Profile test failed: ${error}`);
    }
}

async function testMomentum() {
    console.log('\n' + '='.repeat(60));
    console.log('📉 TEST 7: Phase 4 - Divergence & Adaptive RSI');
    console.log('='.repeat(60));
    
    // Create sample price data with a potential divergence
    const samplePrices = [185, 183, 181, 180, 182, 184, 183, 181, 179, 178,
                         180, 182, 184, 186, 185, 183, 181, 180, 179, 177,
                         175, 177, 179, 181, 183, 185, 184, 182, 180, 178];
    
    try {
        console.log('\n--- Divergence Detection ---');
        const startTime = Date.now();
        
        const divergence = analyzeDivergences(samplePrices);
        const latency = Date.now() - startTime;
        
        console.log(`  Calculation Time: ${latency}ms`);
        console.log(`\n--- RSI Divergence ---`);
        console.log(`  Type: ${divergence.rsiDivergence.type}`);
        console.log(`  Strength: ${divergence.rsiDivergence.strength}/10`);
        console.log(`  Implication: ${divergence.rsiDivergence.implication}`);
        
        console.log(`\n--- MACD Divergence ---`);
        console.log(`  Type: ${divergence.macdDivergence.type}`);
        console.log(`  Strength: ${divergence.macdDivergence.strength}/10`);
        console.log(`  Implication: ${divergence.macdDivergence.implication}`);
        
        console.log(`\n--- Strongest Signal ---`);
        console.log(`  Type: ${divergence.strongest.type}`);
        console.log(`  Indicator: ${divergence.strongest.indicator}`);
        console.log(`  Description: ${divergence.strongest.description}`);
        console.log(`  Actionable: ${divergence.hasActionableSignal ? '✅ Yes' : '❌ No'}`);
        console.log(`  Recommendation: ${divergence.recommendation}`);
        
        // Test Adaptive RSI
        console.log('\n--- Adaptive RSI Thresholds ---');
        const rsi = 55;
        const atr = 3.5;
        const price = 185;
        
        const adaptiveRSI = analyzeAdaptiveRSI(rsi, atr, price);
        
        console.log(`  Current RSI: ${adaptiveRSI.currentRSI}`);
        console.log(`  ATR %: ${adaptiveRSI.atrPercent}%`);
        console.log(`  Is Volatile: ${adaptiveRSI.isVolatile ? '✅ Yes' : '❌ No'}`);
        console.log(`  Zone: ${adaptiveRSI.zone}`);
        console.log(`  Score: ${adaptiveRSI.score}/10`);
        console.log(`\n--- Adaptive Thresholds ---`);
        console.log(`  Oversold: ${adaptiveRSI.thresholds.oversold}`);
        console.log(`  Overbought: ${adaptiveRSI.thresholds.overbought}`);
        console.log(`  Optimal Buy: ${adaptiveRSI.thresholds.optimalBuyLow}-${adaptiveRSI.thresholds.optimalBuyHigh}`);
        console.log(`  Volatility Factor: ${adaptiveRSI.thresholds.volatilityFactor}x`);
        console.log(`  Recommendation: ${adaptiveRSI.recommendation}`);
        
    } catch (error) {
        console.log(`\n❌ Momentum test failed: ${error}`);
    }
}

async function testFullAnalysis() {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 TEST 8: Full SOTA Analysis Integration');
    console.log('='.repeat(60));
    
    const ticker = TEST_TICKERS[0];
    console.log(`\nAnalyzing ${ticker} with all SOTA features...`);
    
    const startTime = Date.now();
    
    try {
        const result = await analyzeTicker(ticker);
        const latency = Date.now() - startTime;
        
        console.log(`\n✅ Analysis complete in ${latency}ms`);
        console.log(`\n--- Basic Results ---`);
        console.log(`  Ticker: ${result.ticker}`);
        console.log(`  Price: $${result.current_price.toFixed(2)}`);
        console.log(`  Success Probability: ${result.success_probability}%`);
        console.log(`  Recommendation: ${result.recommendation}`);
        
        // Phase 1: Market Regime
        console.log(`\n--- Phase 1: Market Regime ---`);
        if (result.market_regime) {
            console.log(`  Regime: ${result.market_regime.regime}`);
            console.log(`  Confidence: ${result.market_regime.confidence}%`);
            console.log(`  VIX: ${result.market_regime.details.vixLevel.toFixed(1)}`);
            console.log(`  Regime Adjusted: ${result.regime_adjusted ? '✅ Yes' : '❌ No'}`);
            if (result.original_score) {
                console.log(`  Original Score: ${result.original_score}%`);
            }
        }
        
        // Phase 2: Multi-Timeframe
        console.log(`\n--- Phase 2: Multi-Timeframe ---`);
        if (result.multi_timeframe) {
            console.log(`  Daily Score: ${result.multi_timeframe.daily_score}/10`);
            console.log(`  4H Score: ${result.multi_timeframe.hour4_score}/10`);
            console.log(`  Combined: ${result.multi_timeframe.combined_score}/10`);
            console.log(`  Alignment: ${result.multi_timeframe.alignment}`);
            console.log(`  4H MACD: ${result.multi_timeframe.macd_4h_status}`);
        }
        
        // Phase 3: Volume Profile
        console.log(`\n--- Phase 3: Volume Profile ---`);
        if (result.volume_profile) {
            console.log(`  RVOL: ${result.volume_profile.rvol}x`);
            console.log(`  OBV Trending: ${result.volume_profile.obv_trending ? '✅ UP' : '❌ DOWN'}`);
            console.log(`  CMF: ${result.volume_profile.cmf_value.toFixed(3)}`);
            console.log(`  CMF Positive: ${result.volume_profile.cmf_positive ? '✅' : '❌'}`);
            console.log(`  Interpretation: ${result.volume_profile.interpretation}`);
        }
        
        // Phase 4: Divergence & Adaptive RSI
        console.log(`\n--- Phase 4: Divergence & Adaptive RSI ---`);
        if (result.divergence) {
            console.log(`  Divergence Type: ${result.divergence.type}`);
            console.log(`  Indicator: ${result.divergence.indicator}`);
            console.log(`  Strength: ${result.divergence.strength}/10`);
            console.log(`  Implication: ${result.divergence.implication}`);
        }
        if (result.adaptive_rsi) {
            console.log(`  RSI: ${result.adaptive_rsi.value}`);
            console.log(`  Adaptive Oversold: ${result.adaptive_rsi.oversold_threshold}`);
            console.log(`  Adaptive Overbought: ${result.adaptive_rsi.overbought_threshold}`);
            console.log(`  In Optimal Range: ${result.adaptive_rsi.in_optimal_range ? '✅' : '❌'}`);
        }
        
        // Criterion Scores
        console.log(`\n--- Criterion Scores ---`);
        const p = result.parameters;
        console.log(`  1. Market Condition:    ${p["1_market_condition"].score}/10 - ${p["1_market_condition"].status}`);
        console.log(`  2. Sector Condition:    ${p["2_sector_condition"].score}/10 - ${p["2_sector_condition"].sector}`);
        console.log(`  3. Company Condition:   ${p["3_company_condition"].score}/10`);
        console.log(`  4. Catalyst & RVOL:     ${p["4_catalyst"].score}/10 - RVOL ${p["4_catalyst"].rvol}x`);
        console.log(`  5. Patterns & Gaps:     ${p["5_patterns_gaps"].score}/10 - ${p["5_patterns_gaps"].pattern}`);
        console.log(`  6. Support/Resistance:  ${p["6_support_resistance"].score}/10 - R:R ${p["6_support_resistance"].risk_reward_ratio}`);
        console.log(`  7. Price Action:        ${p["7_price_movement"].score}/10 - ${p["7_price_movement"].trend}`);
        console.log(`  8. Volume (UPGRADED):   ${p["8_volume"].score}/10 - ${p["8_volume"].status}`);
        console.log(`  9. MA & Fibonacci:      ${p["9_ma_fibonacci"].score}/10`);
        console.log(`  10. RSI (UPGRADED):     ${p["10_rsi"].score}/10 - Zone: ${p["10_rsi"].status}`);
        
    } catch (error) {
        console.log(`\n❌ Analysis failed: ${error}`);
        console.error(error);
    }
}

async function showApiStats() {
    console.log('\n' + '='.repeat(60));
    console.log('📈 API Usage Statistics');
    console.log('='.repeat(60));
    
    const stats = getApiStats();
    const logs = getRecentLogs(15);
    
    console.log(`\n--- Summary ---`);
    console.log(`  Total Calls: ${stats.total_calls}`);
    console.log(`  Successful: ${stats.successful_calls}`);
    console.log(`  Failed: ${stats.failed_calls}`);
    console.log(`  Cache Hits: ${stats.cache_hits}`);
    console.log(`  Avg Latency: ${stats.avg_latency_ms}ms`);
    console.log(`  Est. Cost: $${stats.estimated_cost.toFixed(4)}`);
    
    console.log(`\n--- Calls by Service ---`);
    for (const [service, count] of Object.entries(stats.calls_by_service)) {
        console.log(`  ${service}: ${count}`);
    }
    
    console.log(`\n--- Recent Logs (last 15) ---`);
    for (const log of logs) {
        const status = log.success ? '✅' : '❌';
        const cached = log.cached ? ' [CACHED]' : '';
        console.log(`  ${status} ${log.service}/${log.operation} - ${log.ticker} - ${log.latency_ms}ms${cached}`);
    }
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     SwingTrade Pro SOTA - Complete Test Suite              ║');
    console.log('║     Testing all 4 Phases + Data Services                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    // Clear previous state
    clearLogs();
    clearCache();
    
    // Run tests
    await testEodhd();
    await testSentiment();
    await testCache();
    await testMarketRegime();
    await testMultiTimeframe();
    await testVolumeProfile();
    await testMomentum();
    await testFullAnalysis();
    await showApiStats();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All SOTA tests completed!');
    console.log('='.repeat(60) + '\n');
}

main().catch(console.error);
