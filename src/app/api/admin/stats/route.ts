import { NextResponse } from 'next/server';
import { getApiStatsFromDb, getRecentLogsFromDb, isSupabaseLoggingEnabled } from '@/lib/data-services/logger';
import { getCacheStats } from '@/lib/data-services/cache';

export async function GET() {
    try {
        // Use Supabase-backed functions for persistent stats
        const stats = await getApiStatsFromDb();
        const logs = await getRecentLogsFromDb(50);
        const cacheStats = getCacheStats();

        return NextResponse.json({
            stats,
            logs,
            cacheStats,
            persistence: isSupabaseLoggingEnabled() ? 'supabase' : 'memory',
        });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch stats' },
            { status: 500 }
        );
    }
}




