'use server';

/**
 * Trade Server Actions
 * Individual trade operations
 */

import { getTrade as fetchTrade, getTrades as fetchTrades } from '@/lib/benchmarking/trade-lifecycle';
import { CompletedTrade } from '@/lib/benchmarking/types';

export async function getTrade(
    tradeId: string
): Promise<{ success: boolean; data?: CompletedTrade; error?: string }> {
    return fetchTrade(tradeId);
}

export async function getTradesList(filters?: {
    status?: ('OPEN' | 'PARTIALLY_CLOSED' | 'CLOSED')[];
    tickers?: string[];
}): Promise<{ success: boolean; data?: CompletedTrade[]; error?: string }> {
    return fetchTrades(filters);
}
