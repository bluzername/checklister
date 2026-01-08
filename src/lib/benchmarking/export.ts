/**
 * Export & Reporting
 * Generate CSV exports and JSON backups of trade data
 */

import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { CompletedTrade, TradeJournalEntry, TradeSummaryStats } from './types';
import { getTradeSummaryStats } from './attribution';

// ============================================
// CSV GENERATION
// ============================================

/**
 * Convert trades to CSV format
 */
function tradesToCSV(trades: CompletedTrade[]): string {
    const headers = [
        'ID',
        'Ticker',
        'Trade Type',
        'Status',
        'Entry Date',
        'Entry Price',
        'Entry Shares',
        'Entry Value',
        'Entry Probability',
        'Entry Regime',
        'Entry Sector',
        'Entry Stop Loss',
        'Entry TP1',
        'Exit Date',
        'Final Exit Price',
        'Blended Exit Price',
        'Exit Reason',
        'Remaining Shares',
        'Total P/L',
        'Total P/L %',
        'Realized R',
        'Holding Days',
        'MFE',
        'MAE',
        'MFE R',
        'MAE R',
        'MFE Date',
        'MAE Date',
        'Tags',
        'Is Paper Trade',
    ];

    const rows = trades.map(t => [
        t.id,
        t.ticker,
        t.trade_type,
        t.status,
        t.entry_date,
        t.entry_price?.toFixed(4) || '',
        t.entry_shares,
        t.entry_value?.toFixed(2) || '',
        t.entry_probability?.toFixed(2) || '',
        t.entry_regime || '',
        t.entry_sector || '',
        t.entry_stop_loss?.toFixed(4) || '',
        t.entry_tp1?.toFixed(4) || '',
        t.exit_date || '',
        t.final_exit_price?.toFixed(4) || '',
        t.blended_exit_price?.toFixed(4) || '',
        t.exit_reason || '',
        t.remaining_shares,
        t.total_realized_pnl?.toFixed(2) || '',
        t.total_realized_pnl_percent?.toFixed(4) || '',
        t.realized_r?.toFixed(4) || '',
        t.holding_days || '',
        t.mfe?.toFixed(4) || '',
        t.mae?.toFixed(4) || '',
        t.mfe_r?.toFixed(4) || '',
        t.mae_r?.toFixed(4) || '',
        t.mfe_date || '',
        t.mae_date || '',
        (t.tags || []).join(';'),
        t.is_paper_trade ? 'Yes' : 'No',
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
}

/**
 * Convert journal entries to CSV format
 */
function journalToCSV(entries: TradeJournalEntry[]): string {
    const headers = [
        'ID',
        'Trade ID',
        'Entry Type',
        'Entry Date',
        'Content',
        'What Went Well',
        'What Went Wrong',
        'Lesson Learned',
        'Would Take Again',
        'Confidence Before',
        'Confidence After',
        'Created At',
    ];

    const rows = entries.map(e => [
        e.id,
        e.trade_id,
        e.entry_type,
        e.entry_date,
        e.content,
        e.what_went_well || '',
        e.what_went_wrong || '',
        e.lesson_learned || '',
        e.would_take_again != null ? (e.would_take_again ? 'Yes' : 'No') : '',
        e.confidence_before || '',
        e.confidence_after || '',
        e.created_at || '',
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""').replace(/\n/g, ' ')}"`).join(',')),
    ].join('\n');

    return csvContent;
}

// ============================================
// EXPORT FUNCTIONS
// ============================================

/**
 * Export all trades as CSV
 */
export async function exportTradesToCSV(filters?: {
    status?: string[];
    dateRange?: { start: string; end: string };
}): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
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
            .from('completed_trades')
            .select('*')
            .eq('user_id', user.id)
            .order('entry_date', { ascending: false });

        if (filters?.status && filters.status.length > 0) {
            query = query.in('status', filters.status);
        }

        if (filters?.dateRange) {
            query = query
                .gte('entry_date', filters.dateRange.start)
                .lte('entry_date', filters.dateRange.end);
        }

        const { data: trades, error } = await query;

        if (error) {
            return { success: false, error: error.message };
        }

        const csv = tradesToCSV((trades || []) as CompletedTrade[]);
        const date = new Date().toISOString().split('T')[0];
        const filename = `trades-export-${date}.csv`;

        return { success: true, data: csv, filename };
    } catch (error) {
        console.error('[Export] Trades CSV error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Export journal entries as CSV
 */
export async function exportJournalToCSV(): Promise<{
    success: boolean;
    data?: string;
    filename?: string;
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
            .eq('user_id', user.id)
            .order('entry_date', { ascending: false });

        if (error) {
            return { success: false, error: error.message };
        }

        const csv = journalToCSV((entries || []) as TradeJournalEntry[]);
        const date = new Date().toISOString().split('T')[0];
        const filename = `journal-export-${date}.csv`;

        return { success: true, data: csv, filename };
    } catch (error) {
        console.error('[Export] Journal CSV error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Export complete backup as JSON
 */
export async function exportFullBackup(): Promise<{
    success: boolean;
    data?: string;
    filename?: string;
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

        // Fetch all data in parallel
        const [tradesResult, journalResult, priceHistoryResult] = await Promise.all([
            supabase
                .from('completed_trades')
                .select('*')
                .eq('user_id', user.id),
            supabase
                .from('trade_journal')
                .select('*')
                .eq('user_id', user.id),
            supabase
                .from('trade_price_history')
                .select('*, completed_trades!inner(user_id)')
                .eq('completed_trades.user_id', user.id),
        ]);

        const backup = {
            export_date: new Date().toISOString(),
            version: '1.0',
            trades: tradesResult.data || [],
            journal_entries: journalResult.data || [],
            price_history: priceHistoryResult.data || [],
        };

        const json = JSON.stringify(backup, null, 2);
        const date = new Date().toISOString().split('T')[0];
        const filename = `benchmarking-backup-${date}.json`;

        return { success: true, data: json, filename };
    } catch (error) {
        console.error('[Export] Full backup error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// MONTHLY REPORT
// ============================================

interface MonthlyReport {
    period: string;
    generated_at: string;
    summary: TradeSummaryStats | null;
    top_winners: Array<{ ticker: string; pnl: number; r: number }>;
    top_losers: Array<{ ticker: string; pnl: number; r: number }>;
    lessons_learned: string[];
    key_insights: string[];
}

/**
 * Generate monthly performance report
 */
export async function generateMonthlyReport(
    year: number,
    month: number
): Promise<{ success: boolean; data?: MonthlyReport; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Calculate date range for the month
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month

        // Get trades for the month
        const { data: trades, error: tradesError } = await supabase
            .from('completed_trades')
            .select('*')
            .eq('user_id', user.id)
            .gte('entry_date', startDate)
            .lte('entry_date', endDate)
            .in('status', ['CLOSED', 'PARTIALLY_CLOSED']);

        if (tradesError) {
            return { success: false, error: tradesError.message };
        }

        const completedTrades = (trades || []) as CompletedTrade[];

        // Get summary stats
        const statsResult = await getTradeSummaryStats({
            dateRange: { start: startDate, end: endDate },
            status: ['CLOSED', 'PARTIALLY_CLOSED'],
        });

        // Find top winners and losers
        const sortedByPnl = [...completedTrades].sort(
            (a, b) => (b.total_realized_pnl || 0) - (a.total_realized_pnl || 0)
        );

        const topWinners = sortedByPnl
            .filter(t => (t.total_realized_pnl || 0) > 0)
            .slice(0, 5)
            .map(t => ({
                ticker: t.ticker,
                pnl: t.total_realized_pnl || 0,
                r: t.realized_r || 0,
            }));

        const topLosers = sortedByPnl
            .filter(t => (t.total_realized_pnl || 0) < 0)
            .slice(-5)
            .reverse()
            .map(t => ({
                ticker: t.ticker,
                pnl: t.total_realized_pnl || 0,
                r: t.realized_r || 0,
            }));

        // Get lessons learned
        const { data: journalEntries } = await supabase
            .from('trade_journal')
            .select('lesson_learned')
            .eq('user_id', user.id)
            .not('lesson_learned', 'is', null)
            .gte('entry_date', startDate)
            .lte('entry_date', endDate);

        const lessons = (journalEntries || [])
            .map(e => e.lesson_learned)
            .filter(Boolean) as string[];

        // Generate key insights
        const insights: string[] = [];
        const stats = statsResult.data;

        if (stats) {
            if (stats.win_rate >= 0.6) {
                insights.push(`Strong win rate of ${(stats.win_rate * 100).toFixed(0)}% this month`);
            } else if (stats.win_rate < 0.4) {
                insights.push(`Win rate of ${(stats.win_rate * 100).toFixed(0)}% - consider reviewing entry criteria`);
            }

            if (stats.avg_r > 0.5) {
                insights.push(`Excellent average R of ${stats.avg_r.toFixed(2)}`);
            } else if (stats.avg_r < 0) {
                insights.push(`Negative average R of ${stats.avg_r.toFixed(2)} - review risk management`);
            }

            if (stats.avg_mfe_capture < 50) {
                insights.push(`Only capturing ${stats.avg_mfe_capture.toFixed(0)}% of MFE - consider exit strategy improvements`);
            }

            if (stats.profit_factor && stats.profit_factor > 2) {
                insights.push(`Strong profit factor of ${stats.profit_factor.toFixed(2)}`);
            }
        }

        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        const report: MonthlyReport = {
            period: `${monthNames[month - 1]} ${year}`,
            generated_at: new Date().toISOString(),
            summary: statsResult.data || null,
            top_winners: topWinners,
            top_losers: topLosers,
            lessons_learned: lessons,
            key_insights: insights,
        };

        return { success: true, data: report };
    } catch (error) {
        console.error('[Export] Monthly report error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Export monthly report as formatted text
 */
export async function exportMonthlyReportText(
    year: number,
    month: number
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const result = await generateMonthlyReport(year, month);

    if (!result.success || !result.data) {
        return { success: false, error: result.error };
    }

    const report = result.data;
    const stats = report.summary;

    let text = `# Monthly Performance Report: ${report.period}\n`;
    text += `Generated: ${new Date(report.generated_at).toLocaleDateString()}\n\n`;

    text += `## Summary\n`;
    if (stats) {
        text += `- Total Trades: ${stats.total_trades}\n`;
        text += `- Win Rate: ${(stats.win_rate * 100).toFixed(1)}%\n`;
        text += `- Total P/L: $${stats.total_pnl.toFixed(2)}\n`;
        text += `- Average R: ${stats.avg_r.toFixed(2)}\n`;
        text += `- Profit Factor: ${stats.profit_factor?.toFixed(2) || 'N/A'}\n`;
        text += `- Average Holding Days: ${stats.avg_holding_days.toFixed(1)}\n`;
        text += `- MFE Capture: ${stats.avg_mfe_capture.toFixed(0)}%\n`;
    } else {
        text += `No trades completed this month.\n`;
    }

    text += `\n## Top Winners\n`;
    if (report.top_winners.length > 0) {
        report.top_winners.forEach((t, i) => {
            text += `${i + 1}. ${t.ticker}: $${t.pnl.toFixed(2)} (${t.r.toFixed(2)}R)\n`;
        });
    } else {
        text += `No winning trades this month.\n`;
    }

    text += `\n## Top Losers\n`;
    if (report.top_losers.length > 0) {
        report.top_losers.forEach((t, i) => {
            text += `${i + 1}. ${t.ticker}: $${t.pnl.toFixed(2)} (${t.r.toFixed(2)}R)\n`;
        });
    } else {
        text += `No losing trades this month.\n`;
    }

    text += `\n## Key Insights\n`;
    if (report.key_insights.length > 0) {
        report.key_insights.forEach(insight => {
            text += `- ${insight}\n`;
        });
    } else {
        text += `No specific insights for this period.\n`;
    }

    text += `\n## Lessons Learned\n`;
    if (report.lessons_learned.length > 0) {
        report.lessons_learned.forEach((lesson, i) => {
            text += `${i + 1}. ${lesson}\n`;
        });
    } else {
        text += `No lessons recorded this month.\n`;
    }

    const filename = `report-${year}-${String(month).padStart(2, '0')}.md`;

    return { success: true, data: text, filename };
}
