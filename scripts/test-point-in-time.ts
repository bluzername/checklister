/**
 * Test Point-in-Time Analysis
 * Verifies that analyzeTicker works correctly with historical dates
 * 
 * Run with: npx ts-node scripts/test-point-in-time.ts
 */

import { analyzeTicker } from '../src/lib/analysis';

async function testPointInTimeAnalysis() {
  console.log('='.repeat(60));
  console.log('Testing Point-in-Time Analysis');
  console.log('='.repeat(60));

  const ticker = 'AAPL';
  
  // Test 1: Live analysis (no date)
  console.log('\n📊 Test 1: Live Analysis');
  console.log('-'.repeat(40));
  try {
    const liveResult = await analyzeTicker(ticker);
    console.log(`Ticker: ${liveResult.ticker}`);
    console.log(`Current Price: $${liveResult.current_price.toFixed(2)}`);
    console.log(`Success Probability: ${liveResult.success_probability}%`);
    console.log(`Recommendation: ${liveResult.recommendation}`);
    console.log(`Regime: ${liveResult.market_regime?.regime}`);
    console.log('✅ Live analysis successful');
  } catch (error) {
    console.error('❌ Live analysis failed:', error);
  }

  // Test 2: Historical analysis (1 month ago)
  console.log('\n📊 Test 2: Historical Analysis (1 month ago)');
  console.log('-'.repeat(40));
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  
  try {
    const historicalResult = await analyzeTicker(ticker, oneMonthAgo);
    console.log(`Ticker: ${historicalResult.ticker}`);
    console.log(`Analysis Date: ${oneMonthAgo.toISOString().split('T')[0]}`);
    console.log(`Price (as of date): $${historicalResult.current_price.toFixed(2)}`);
    console.log(`Success Probability: ${historicalResult.success_probability}%`);
    console.log(`Recommendation: ${historicalResult.recommendation}`);
    console.log(`Regime: ${historicalResult.market_regime?.regime}`);
    console.log(`Trade Type: ${historicalResult.trade_type}`);
    console.log('✅ Historical analysis successful');
  } catch (error) {
    console.error('❌ Historical analysis failed:', error);
  }

  // Test 3: Historical analysis (3 months ago)
  console.log('\n📊 Test 3: Historical Analysis (3 months ago)');
  console.log('-'.repeat(40));
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
  try {
    const historicalResult2 = await analyzeTicker(ticker, threeMonthsAgo);
    console.log(`Ticker: ${historicalResult2.ticker}`);
    console.log(`Analysis Date: ${threeMonthsAgo.toISOString().split('T')[0]}`);
    console.log(`Price (as of date): $${historicalResult2.current_price.toFixed(2)}`);
    console.log(`Success Probability: ${historicalResult2.success_probability}%`);
    console.log(`Recommendation: ${historicalResult2.recommendation}`);
    console.log(`Regime: ${historicalResult2.market_regime?.regime}`);
    
    // Check criteria scores
    console.log('\nCriteria Scores:');
    const params = historicalResult2.parameters;
    console.log(`  Market Condition: ${params['1_market_condition'].score}/10`);
    console.log(`  Sector Condition: ${params['2_sector_condition'].score}/10`);
    console.log(`  Company Condition: ${params['3_company_condition'].score}/10`);
    console.log(`  Catalyst: ${params['4_catalyst'].score}/10`);
    console.log(`  Patterns: ${params['5_patterns_gaps'].score}/10`);
    console.log(`  Support/Resistance: ${params['6_support_resistance'].score}/10`);
    console.log(`  Price Movement: ${params['7_price_movement'].score}/10`);
    console.log(`  Volume: ${params['8_volume'].score}/10`);
    console.log(`  MA/Fibonacci: ${params['9_ma_fibonacci'].score}/10`);
    console.log(`  RSI: ${params['10_rsi'].score}/10`);
    
    console.log('✅ Historical analysis (3mo) successful');
  } catch (error) {
    console.error('❌ Historical analysis failed:', error);
  }

  // Test 4: Multiple tickers at same date
  console.log('\n📊 Test 4: Multiple Tickers at Same Historical Date');
  console.log('-'.repeat(40));
  const tickers = ['MSFT', 'NVDA', 'GOOGL'];
  const testDate = new Date();
  testDate.setMonth(testDate.getMonth() - 2);
  
  try {
    const results = await Promise.all(
      tickers.map(t => analyzeTicker(t, testDate))
    );
    
    console.log(`Analysis Date: ${testDate.toISOString().split('T')[0]}`);
    console.log('\nResults:');
    for (const result of results) {
      console.log(`  ${result.ticker}: $${result.current_price.toFixed(2)}, Prob: ${result.success_probability}%, Rec: ${result.recommendation}`);
    }
    console.log('✅ Multi-ticker analysis successful');
  } catch (error) {
    console.error('❌ Multi-ticker analysis failed:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Point-in-Time Analysis Tests Complete');
  console.log('='.repeat(60));
}

// Run the tests
testPointInTimeAnalysis().catch(console.error);




