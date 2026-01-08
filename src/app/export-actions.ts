'use server';

/**
 * Export Server Actions
 * Server-side wrappers for export and reporting functions
 */

import {
    exportTradesToCSV as exportTrades,
    exportJournalToCSV as exportJournal,
    exportFullBackup as exportBackup,
    generateMonthlyReport as generateReport,
    exportMonthlyReportText as exportReportText,
} from '@/lib/benchmarking/export';

export async function exportTradesToCSV(filters?: {
    status?: string[];
    dateRange?: { start: string; end: string };
}) {
    return exportTrades(filters);
}

export async function exportJournalToCSV() {
    return exportJournal();
}

export async function exportFullBackup() {
    return exportBackup();
}

export async function generateMonthlyReport(year: number, month: number) {
    return generateReport(year, month);
}

export async function exportMonthlyReportText(year: number, month: number) {
    return exportReportText(year, month);
}
