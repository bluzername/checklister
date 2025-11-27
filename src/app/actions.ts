'use server';

import { analyzeTicker } from '@/lib/analysis';

export async function getAnalysis(ticker: string) {
    try {
        const data = await analyzeTicker(ticker);
        return { success: true, data };
    } catch (error) {
        console.error("Analysis Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}
