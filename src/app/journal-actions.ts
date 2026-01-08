'use server';

/**
 * Trade Journal Server Actions
 * CRUD operations for trade journal entries
 */

import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { TradeJournalEntry, CreateJournalEntryInput, JournalEntryType } from '@/lib/benchmarking/types';

// ============================================
// CREATE JOURNAL ENTRY
// ============================================

export async function createJournalEntry(
    input: CreateJournalEntryInput
): Promise<{ success: boolean; data?: TradeJournalEntry; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Verify the trade exists and belongs to user
        const { data: trade, error: tradeError } = await supabase
            .from('completed_trades')
            .select('id')
            .eq('id', input.trade_id)
            .eq('user_id', user.id)
            .single();

        if (tradeError || !trade) {
            return { success: false, error: 'Trade not found or access denied' };
        }

        const entryDate = input.entry_date || new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('trade_journal')
            .insert({
                trade_id: input.trade_id,
                user_id: user.id,
                entry_type: input.entry_type,
                entry_date: entryDate,
                content: input.content,
                what_went_well: input.what_went_well,
                what_went_wrong: input.what_went_wrong,
                lesson_learned: input.lesson_learned,
                would_take_again: input.would_take_again,
                confidence_before: input.confidence_before,
                confidence_after: input.confidence_after,
                chart_screenshot_url: input.chart_screenshot_url,
            })
            .select()
            .single();

        if (error) {
            console.error('[Journal] Create error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data as TradeJournalEntry };
    } catch (error) {
        console.error('[Journal] Create exception:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// UPDATE JOURNAL ENTRY
// ============================================

export async function updateJournalEntry(
    entryId: string,
    updates: Partial<Omit<CreateJournalEntryInput, 'trade_id'>>
): Promise<{ success: boolean; data?: TradeJournalEntry; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data, error } = await supabase
            .from('trade_journal')
            .update({
                ...updates,
                // Ensure these fields can't be overwritten
                user_id: undefined,
                trade_id: undefined,
            })
            .eq('id', entryId)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error) {
            console.error('[Journal] Update error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data as TradeJournalEntry };
    } catch (error) {
        console.error('[Journal] Update exception:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// GET JOURNAL ENTRIES
// ============================================

export async function getJournalEntries(
    tradeId: string
): Promise<{ success: boolean; data?: TradeJournalEntry[]; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data, error } = await supabase
            .from('trade_journal')
            .select('*')
            .eq('trade_id', tradeId)
            .eq('user_id', user.id)
            .order('entry_date', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Journal] Get error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: (data || []) as TradeJournalEntry[] };
    } catch (error) {
        console.error('[Journal] Get exception:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// GET SINGLE JOURNAL ENTRY
// ============================================

export async function getJournalEntry(
    entryId: string
): Promise<{ success: boolean; data?: TradeJournalEntry; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data, error } = await supabase
            .from('trade_journal')
            .select('*')
            .eq('id', entryId)
            .eq('user_id', user.id)
            .single();

        if (error) {
            console.error('[Journal] Get single error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data as TradeJournalEntry };
    } catch (error) {
        console.error('[Journal] Get single exception:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// DELETE JOURNAL ENTRY
// ============================================

export async function deleteJournalEntry(
    entryId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        const { error } = await supabase
            .from('trade_journal')
            .delete()
            .eq('id', entryId)
            .eq('user_id', user.id);

        if (error) {
            console.error('[Journal] Delete error:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('[Journal] Delete exception:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// GET ALL USER JOURNAL ENTRIES
// ============================================

export async function getAllJournalEntries(options?: {
    entryType?: JournalEntryType;
    limit?: number;
    offset?: number;
}): Promise<{ success: boolean; data?: TradeJournalEntry[]; total?: number; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        let query = supabase
            .from('trade_journal')
            .select('*', { count: 'exact' })
            .eq('user_id', user.id);

        if (options?.entryType) {
            query = query.eq('entry_type', options.entryType);
        }

        query = query.order('entry_date', { ascending: false });

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
        }

        const { data, error, count } = await query;

        if (error) {
            console.error('[Journal] Get all error:', error);
            return { success: false, error: error.message };
        }

        return {
            success: true,
            data: (data || []) as TradeJournalEntry[],
            total: count || 0,
        };
    } catch (error) {
        console.error('[Journal] Get all exception:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// GET LESSONS LEARNED
// ============================================

export async function getLessonsLearned(options?: {
    limit?: number;
}): Promise<{ success: boolean; data?: TradeJournalEntry[]; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        let query = supabase
            .from('trade_journal')
            .select('*')
            .eq('user_id', user.id)
            .not('lesson_learned', 'is', null)
            .order('entry_date', { ascending: false });

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[Journal] Get lessons error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: (data || []) as TradeJournalEntry[] };
    } catch (error) {
        console.error('[Journal] Get lessons exception:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// JOURNAL STATS
// ============================================

export async function getJournalStats(): Promise<{
    success: boolean;
    data?: {
        totalEntries: number;
        byType: Record<JournalEntryType, number>;
        wouldTakeAgainRate: number;
        avgConfidenceChange: number;
        lessonsCount: number;
    };
    error?: string;
}> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data: entries, error } = await supabase
            .from('trade_journal')
            .select('*')
            .eq('user_id', user.id);

        if (error) {
            console.error('[Journal] Stats error:', error);
            return { success: false, error: error.message };
        }

        const journalEntries = (entries || []) as TradeJournalEntry[];

        // Count by type
        const byType: Record<JournalEntryType, number> = {
            ENTRY_THESIS: 0,
            EXIT_REVIEW: 0,
            MID_TRADE_NOTE: 0,
            LESSON_LEARNED: 0,
        };

        let wouldTakeAgainCount = 0;
        let wouldTakeAgainTotal = 0;
        let confidenceChangeSum = 0;
        let confidenceChangeCount = 0;
        let lessonsCount = 0;

        for (const entry of journalEntries) {
            byType[entry.entry_type as JournalEntryType]++;

            if (entry.would_take_again !== null && entry.would_take_again !== undefined) {
                wouldTakeAgainTotal++;
                if (entry.would_take_again) wouldTakeAgainCount++;
            }

            if (entry.confidence_before && entry.confidence_after) {
                confidenceChangeSum += entry.confidence_after - entry.confidence_before;
                confidenceChangeCount++;
            }

            if (entry.lesson_learned) {
                lessonsCount++;
            }
        }

        return {
            success: true,
            data: {
                totalEntries: journalEntries.length,
                byType,
                wouldTakeAgainRate: wouldTakeAgainTotal > 0 ? wouldTakeAgainCount / wouldTakeAgainTotal : 0,
                avgConfidenceChange: confidenceChangeCount > 0 ? confidenceChangeSum / confidenceChangeCount : 0,
                lessonsCount,
            },
        };
    } catch (error) {
        console.error('[Journal] Stats exception:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
