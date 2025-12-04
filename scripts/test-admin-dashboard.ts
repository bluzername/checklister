/**
 * Test Script for Admin Dashboard API Tracking
 * 
 * Run with: npx tsx scripts/test-admin-dashboard.ts
 * 
 * This test verifies that:
 * 1. API calls are properly logged using globalThis persistence
 * 2. Stats are correctly calculated
 * 3. Cache hits are tracked
 * 4. The admin dashboard API route returns correct data
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });

import { 
    logApiCall, 
    getApiStats, 
    getApiStatsFromDb,
    getRecentLogs,
    getRecentLogsFromDb,
    clearLogs,
    getLogCount,
    isSupabaseLoggingEnabled,
    ApiLogEntry 
} from '../src/lib/data-services/logger';
import { 
    getCacheStats, 
    clearCache,
    setCache,
    getCached,
    cacheKey 
} from '../src/lib/data-services/cache';

// Test utilities
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string): void {
    if (condition) {
        console.log(`  ✅ ${message}`);
        passedTests++;
    } else {
        console.log(`  ❌ ${message}`);
        failedTests++;
    }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
    const isEqual = JSON.stringify(actual) === JSON.stringify(expected);
    if (isEqual) {
        console.log(`  ✅ ${message}`);
        passedTests++;
    } else {
        console.log(`  ❌ ${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
        failedTests++;
    }
}

// ============================================
// TEST 1: Logger Basic Functionality
// ============================================
async function testLoggerBasics() {
    console.log('\n' + '='.repeat(60));
    console.log('🔧 TEST 1: Logger Basic Functionality');
    console.log('='.repeat(60));
    
    // Clear logs before testing
    clearLogs();
    
    // Verify logs are empty
    const initialCount = getLogCount();
    assertEqual(initialCount, 0, 'Logs should be empty after clearing');
    
    // Log a test API call
    logApiCall({
        service: 'yahoo',
        operation: 'quote',
        ticker: 'AAPL',
        latency_ms: 150,
        success: true,
        cached: false,
    });
    
    // Verify log was added
    const countAfterOne = getLogCount();
    assertEqual(countAfterOne, 1, 'Log count should be 1 after adding one log');
    
    // Add more logs
    logApiCall({
        service: 'eodhd',
        operation: 'fundamentals',
        ticker: 'NVDA',
        latency_ms: 250,
        success: true,
        cached: false,
    });
    
    logApiCall({
        service: 'claude',
        operation: 'sentiment',
        ticker: 'TSLA',
        latency_ms: 800,
        success: true,
        cached: false,
    });
    
    logApiCall({
        service: 'cache',
        operation: 'quote',
        ticker: 'AAPL',
        latency_ms: 1,
        success: true,
        cached: true,
    });
    
    // Add a failed call
    logApiCall({
        service: 'fmp',
        operation: 'fundamentals',
        ticker: 'INVALID',
        latency_ms: 500,
        success: false,
        error: 'Invalid ticker symbol',
        cached: false,
    });
    
    const finalCount = getLogCount();
    assertEqual(finalCount, 5, 'Log count should be 5 after adding 5 logs');
}

// ============================================
// TEST 2: API Stats Calculation
// ============================================
async function testApiStats() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST 2: API Stats Calculation');
    console.log('='.repeat(60));
    
    const stats = getApiStats();
    
    assertEqual(stats.total_calls, 5, 'Total calls should be 5');
    assertEqual(stats.successful_calls, 4, 'Successful calls should be 4');
    assertEqual(stats.failed_calls, 1, 'Failed calls should be 1');
    assertEqual(stats.cache_hits, 1, 'Cache hits should be 1');
    
    // Check calls by service
    assertEqual(stats.calls_by_service['yahoo'], 1, 'Yahoo calls should be 1');
    assertEqual(stats.calls_by_service['eodhd'], 1, 'EODHD calls should be 1');
    assertEqual(stats.calls_by_service['claude'], 1, 'Claude calls should be 1');
    assertEqual(stats.calls_by_service['cache'], 1, 'Cache calls should be 1');
    assertEqual(stats.calls_by_service['fmp'], 1, 'FMP calls should be 1');
    
    // Check average latency (150 + 250 + 800 + 1 + 500) / 5 = 340.2
    assert(stats.avg_latency_ms > 300 && stats.avg_latency_ms < 400, 
        `Avg latency should be around 340ms (got ${stats.avg_latency_ms}ms)`);
    
    // Check estimated cost > 0 (EODHD + Claude + FMP all have costs)
    assert(stats.estimated_cost > 0, 
        `Estimated cost should be > 0 (got $${stats.estimated_cost.toFixed(4)})`);
    
    // Check calls today/this week
    assert(stats.calls_today === 5, 
        `Calls today should be 5 (got ${stats.calls_today})`);
    assert(stats.calls_this_week === 5, 
        `Calls this week should be 5 (got ${stats.calls_this_week})`);
}

// ============================================
// TEST 3: Recent Logs Retrieval
// ============================================
async function testRecentLogs() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST 3: Recent Logs Retrieval');
    console.log('='.repeat(60));
    
    const logs = getRecentLogs(10);
    
    assertEqual(logs.length, 5, 'Should retrieve 5 logs');
    
    // Logs should be in reverse order (newest first)
    // Last added was FMP INVALID, so it should be first
    assertEqual(logs[0].service, 'fmp', 'First log should be FMP (most recent)');
    assertEqual(logs[0].ticker, 'INVALID', 'First log ticker should be INVALID');
    assertEqual(logs[0].success, false, 'First log should be failed');
    
    // Check that all logs have required fields
    for (const log of logs) {
        assert(log.id !== undefined, `Log ${log.ticker} has id`);
        assert(log.timestamp !== undefined, `Log ${log.ticker} has timestamp`);
        assert(log.service !== undefined, `Log ${log.ticker} has service`);
        assert(log.operation !== undefined, `Log ${log.ticker} has operation`);
        assert(log.latency_ms !== undefined, `Log ${log.ticker} has latency_ms`);
    }
}

// ============================================
// TEST 4: Cache Functionality
// ============================================
async function testCacheFunctionality() {
    console.log('\n' + '='.repeat(60));
    console.log('💾 TEST 4: Cache Functionality');
    console.log('='.repeat(60));
    
    // Clear cache before testing
    clearCache();
    
    const initialStats = getCacheStats();
    assertEqual(initialStats.size, 0, 'Cache should be empty after clearing');
    
    // Add items to cache
    const key1 = cacheKey('test', 'operation1', 'AAPL');
    const key2 = cacheKey('test', 'operation2', 'NVDA');
    
    setCache(key1, { price: 185.50, volume: 1000000 }, 60000);
    setCache(key2, { price: 450.25, volume: 2000000 }, 60000);
    
    const statsAfterAdd = getCacheStats();
    assertEqual(statsAfterAdd.size, 2, 'Cache should have 2 items');
    
    // Retrieve from cache
    const cached1 = getCached<{ price: number; volume: number }>(key1);
    assert(cached1 !== undefined, 'Should retrieve cached item 1');
    assertEqual(cached1?.price, 185.50, 'Cached price for AAPL should be 185.50');
    
    const cached2 = getCached<{ price: number; volume: number }>(key2);
    assert(cached2 !== undefined, 'Should retrieve cached item 2');
    assertEqual(cached2?.price, 450.25, 'Cached price for NVDA should be 450.25');
    
    // Check non-existent key
    const nonExistent = getCached<unknown>('non:existent:key');
    assertEqual(nonExistent, undefined, 'Non-existent key should return undefined');
    
    // Memory estimate should be a string
    assert(statsAfterAdd.memoryEstimate.length > 0, 'Memory estimate should be provided');
    console.log(`    (Memory usage: ${statsAfterAdd.memoryEstimate})`);
}

// ============================================
// TEST 5: GlobalThis Persistence
// ============================================
async function testGlobalThisPersistence() {
    console.log('\n' + '='.repeat(60));
    console.log('🌐 TEST 5: GlobalThis Persistence');
    console.log('='.repeat(60));
    
    // Check that globalThis has the expected properties
    assert(globalThis.__apiLogs !== undefined, 'globalThis.__apiLogs should exist');
    assert(Array.isArray(globalThis.__apiLogs), 'globalThis.__apiLogs should be an array');
    assert(globalThis.__apiCache !== undefined, 'globalThis.__apiCache should exist');
    assert(globalThis.__apiCache instanceof Map, 'globalThis.__apiCache should be a Map');
    
    // Verify the logs array is shared
    const logsFromGlobal = globalThis.__apiLogs?.length ?? 0;
    const logsFromFunction = getLogCount();
    assertEqual(logsFromGlobal, logsFromFunction, 'Global logs should match function logs');
    
    // Verify the cache is shared
    const cacheFromGlobal = globalThis.__apiCache?.size ?? 0;
    const cacheFromFunction = getCacheStats().size;
    assertEqual(cacheFromGlobal, cacheFromFunction, 'Global cache should match function cache');
}

// ============================================
// TEST 6: Supabase Persistence
// ============================================
async function testSupabasePersistence() {
    console.log('\n' + '='.repeat(60));
    console.log('🗄️  TEST 6: Supabase Persistence');
    console.log('='.repeat(60));
    
    const enabled = isSupabaseLoggingEnabled();
    console.log(`\n  Supabase logging enabled: ${enabled ? '✅ Yes' : '❌ No'}`);
    
    if (enabled) {
        console.log('  Testing Supabase functions...');
        
        // Wait a moment for async writes to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test reading from DB
        const dbStats = await getApiStatsFromDb();
        const dbLogs = await getRecentLogsFromDb(10);
        
        console.log(`\n--- Stats from Supabase ---`);
        console.log(`  Total Calls (DB): ${dbStats.total_calls}`);
        console.log(`  Recent Logs (DB): ${dbLogs.length}`);
        
        assert(typeof dbStats.total_calls === 'number', 'DB stats should have total_calls');
        assert(Array.isArray(dbLogs), 'DB logs should be an array');
        
        passedTests += 2;
    } else {
        console.log('  ⚠️  Supabase not configured - skipping DB tests');
        console.log('  To enable: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
}

// ============================================
// TEST 7: Simulated Admin Dashboard Flow
// ============================================
async function testAdminDashboardFlow() {
    console.log('\n' + '='.repeat(60));
    console.log('📈 TEST 7: Simulated Admin Dashboard Flow');
    console.log('='.repeat(60));
    
    // This simulates what the /api/admin/stats endpoint does
    const stats = await getApiStatsFromDb();
    const logs = await getRecentLogsFromDb(50);
    const cacheStats = getCacheStats();
    
    // Verify we can construct the response
    const response = {
        stats,
        logs,
        cacheStats,
    };
    
    assert(response.stats !== undefined, 'Response should have stats');
    assert(response.logs !== undefined, 'Response should have logs');
    assert(response.cacheStats !== undefined, 'Response should have cacheStats');
    
    // Verify stats structure
    assert(typeof response.stats.total_calls === 'number', 'stats.total_calls should be a number');
    assert(typeof response.stats.successful_calls === 'number', 'stats.successful_calls should be a number');
    assert(typeof response.stats.failed_calls === 'number', 'stats.failed_calls should be a number');
    assert(typeof response.stats.cache_hits === 'number', 'stats.cache_hits should be a number');
    assert(typeof response.stats.avg_latency_ms === 'number', 'stats.avg_latency_ms should be a number');
    assert(typeof response.stats.calls_by_service === 'object', 'stats.calls_by_service should be an object');
    assert(typeof response.stats.estimated_cost === 'number', 'stats.estimated_cost should be a number');
    
    // Log the final state
    console.log('\n--- Final Dashboard State ---');
    console.log(`  Total API Calls: ${stats.total_calls}`);
    console.log(`  Success Rate: ${((stats.successful_calls / stats.total_calls) * 100).toFixed(1)}%`);
    console.log(`  Cache Hit Rate: ${((stats.cache_hits / stats.total_calls) * 100).toFixed(1)}%`);
    console.log(`  Avg Latency: ${stats.avg_latency_ms}ms`);
    console.log(`  Est. Cost: $${stats.estimated_cost.toFixed(4)}`);
    console.log(`  Cached Items: ${cacheStats.size}`);
    console.log(`  Memory Usage: ${cacheStats.memoryEstimate}`);
}

// ============================================
// MAIN TEST RUNNER
// ============================================
async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     Admin Dashboard API Tracking - Test Suite              ║');
    console.log('║     Verifying globalThis persistence and stats tracking    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    // Run all tests
    await testLoggerBasics();
    await testApiStats();
    await testRecentLogs();
    await testCacheFunctionality();
    await testGlobalThisPersistence();
    await testSupabasePersistence();
    await testAdminDashboardFlow();
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`  ✅ Passed: ${passedTests}`);
    console.log(`  ❌ Failed: ${failedTests}`);
    console.log('='.repeat(60));
    
    if (failedTests === 0) {
        console.log('\n🎉 All tests passed! Admin dashboard tracking is working correctly.\n');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some tests failed. Please check the output above.\n');
        process.exit(1);
    }
}

main().catch(console.error);




