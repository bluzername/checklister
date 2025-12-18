/**
 * Portfolio Analysis Cache
 *
 * Caches portfolio analysis results to avoid expensive API calls on every page load.
 * Cache is invalidated when:
 * - 15 minutes have passed (TTL)
 * - Positions have changed (add/remove)
 * - User explicitly requests refresh
 */

import { PortfolioPosition } from '@/lib/types';

// Cache TTL in milliseconds (15 minutes)
const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  positions: PortfolioPosition[];
  positionFingerprint: string;
  timestamp: number;
  isRefreshing: boolean;
}

// In-memory cache (per serverless instance)
// For production, consider Redis or storing in Supabase
const portfolioCache = new Map<string, CacheEntry>();

/**
 * Generate a fingerprint from positions to detect changes
 * Only considers ticker + quantity + sells (the things that matter for cache invalidation)
 */
export function generatePositionFingerprint(positions: Array<{ ticker: string; quantity: number; sells?: unknown }>): string {
  const sorted = [...positions].sort((a, b) => a.ticker.localeCompare(b.ticker));
  const data = sorted.map(p => `${p.ticker}:${p.quantity}:${JSON.stringify(p.sells || {})}`).join('|');
  // Simple hash - good enough for cache invalidation
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Get cached portfolio analysis for a user
 */
export function getCachedAnalysis(
  userId: string,
  currentPositions: Array<{ ticker: string; quantity: number; sells?: unknown }>
): {
  cached: PortfolioPosition[] | null;
  isStale: boolean;
  isRefreshing: boolean;
  lastUpdated: number | null;
} {
  const entry = portfolioCache.get(userId);

  if (!entry) {
    return { cached: null, isStale: true, isRefreshing: false, lastUpdated: null };
  }

  const now = Date.now();
  const age = now - entry.timestamp;
  const currentFingerprint = generatePositionFingerprint(currentPositions);

  // Cache is invalid if positions changed
  if (currentFingerprint !== entry.positionFingerprint) {
    return { cached: null, isStale: true, isRefreshing: entry.isRefreshing, lastUpdated: entry.timestamp };
  }

  // Cache is stale if older than TTL
  const isStale = age > CACHE_TTL_MS;

  return {
    cached: entry.positions,
    isStale,
    isRefreshing: entry.isRefreshing,
    lastUpdated: entry.timestamp
  };
}

/**
 * Store portfolio analysis in cache
 */
export function setCachedAnalysis(
  userId: string,
  positions: PortfolioPosition[],
  rawPositions: Array<{ ticker: string; quantity: number; sells?: unknown }>
): void {
  portfolioCache.set(userId, {
    positions,
    positionFingerprint: generatePositionFingerprint(rawPositions),
    timestamp: Date.now(),
    isRefreshing: false,
  });
}

/**
 * Mark cache as currently refreshing (to prevent duplicate refreshes)
 */
export function markCacheRefreshing(userId: string, isRefreshing: boolean): void {
  const entry = portfolioCache.get(userId);
  if (entry) {
    entry.isRefreshing = isRefreshing;
  }
}

/**
 * Invalidate cache for a user (call on add/delete position)
 */
export function invalidateCache(userId: string): void {
  portfolioCache.delete(userId);
}

/**
 * Get cache age in minutes (for display)
 */
export function getCacheAgeMinutes(userId: string): number | null {
  const entry = portfolioCache.get(userId);
  if (!entry) return null;
  return Math.floor((Date.now() - entry.timestamp) / 60000);
}

/**
 * Check if cache needs refresh
 */
export function shouldRefreshCache(
  userId: string,
  currentPositions: Array<{ ticker: string; quantity: number; sells?: unknown }>
): boolean {
  const { isStale, isRefreshing, cached } = getCachedAnalysis(userId, currentPositions);
  return (isStale || !cached) && !isRefreshing;
}
