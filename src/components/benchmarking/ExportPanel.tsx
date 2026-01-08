'use client';

import { useState } from 'react';
import {
    Download, FileText, FileJson, FileSpreadsheet, Calendar,
    Loader2, Check, AlertCircle, X
} from 'lucide-react';
import {
    exportTradesToCSV,
    exportJournalToCSV,
    exportFullBackup,
    exportMonthlyReportText,
} from '@/app/export-actions';

interface ExportStatus {
    type: 'success' | 'error';
    message: string;
}

function downloadFile(data: string, filename: string, mimeType: string) {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function ExportPanel() {
    const [loading, setLoading] = useState<string | null>(null);
    const [status, setStatus] = useState<ExportStatus | null>(null);
    const [reportYear, setReportYear] = useState(new Date().getFullYear());
    const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);

    const handleExportTrades = async () => {
        setLoading('trades');
        setStatus(null);

        try {
            const result = await exportTradesToCSV();

            if (result.success && result.data && result.filename) {
                downloadFile(result.data, result.filename, 'text/csv');
                setStatus({ type: 'success', message: 'Trades exported successfully' });
            } else {
                setStatus({ type: 'error', message: result.error || 'Export failed' });
            }
        } catch (error) {
            setStatus({ type: 'error', message: 'Export failed' });
        } finally {
            setLoading(null);
        }
    };

    const handleExportJournal = async () => {
        setLoading('journal');
        setStatus(null);

        try {
            const result = await exportJournalToCSV();

            if (result.success && result.data && result.filename) {
                downloadFile(result.data, result.filename, 'text/csv');
                setStatus({ type: 'success', message: 'Journal exported successfully' });
            } else {
                setStatus({ type: 'error', message: result.error || 'Export failed' });
            }
        } catch (error) {
            setStatus({ type: 'error', message: 'Export failed' });
        } finally {
            setLoading(null);
        }
    };

    const handleExportBackup = async () => {
        setLoading('backup');
        setStatus(null);

        try {
            const result = await exportFullBackup();

            if (result.success && result.data && result.filename) {
                downloadFile(result.data, result.filename, 'application/json');
                setStatus({ type: 'success', message: 'Backup exported successfully' });
            } else {
                setStatus({ type: 'error', message: result.error || 'Export failed' });
            }
        } catch (error) {
            setStatus({ type: 'error', message: 'Export failed' });
        } finally {
            setLoading(null);
        }
    };

    const handleExportReport = async () => {
        setLoading('report');
        setStatus(null);

        try {
            const result = await exportMonthlyReportText(reportYear, reportMonth);

            if (result.success && result.data && result.filename) {
                downloadFile(result.data, result.filename, 'text/markdown');
                setStatus({ type: 'success', message: 'Report exported successfully' });
            } else {
                setStatus({ type: 'error', message: result.error || 'Export failed' });
            }
        } catch (error) {
            setStatus({ type: 'error', message: 'Export failed' });
        } finally {
            setLoading(null);
        }
    };

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-lg font-semibold text-gray-900">Export & Reports</h2>
                <p className="text-sm text-gray-500">
                    Download your trade data and generate performance reports
                </p>
            </div>

            {/* Status Message */}
            {status && (
                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                    status.type === 'success'
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                    {status.type === 'success' ? (
                        <Check className="w-4 h-4" />
                    ) : (
                        <AlertCircle className="w-4 h-4" />
                    )}
                    <span className="text-sm">{status.message}</span>
                    <button
                        onClick={() => setStatus(null)}
                        className="ml-auto opacity-70 hover:opacity-100"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Export Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Trades CSV */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-teal-50 rounded-lg">
                            <FileSpreadsheet className="w-5 h-5 text-teal-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-medium text-gray-900">Trade History</h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Export all trades as CSV with entry/exit details, P/L, and metrics
                            </p>
                            <button
                                onClick={handleExportTrades}
                                disabled={loading !== null}
                                className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
                            >
                                {loading === 'trades' ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4" />
                                )}
                                Export CSV
                            </button>
                        </div>
                    </div>
                </div>

                {/* Journal CSV */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-purple-50 rounded-lg">
                            <FileText className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-medium text-gray-900">Trade Journal</h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Export all journal entries including lessons and reflections
                            </p>
                            <button
                                onClick={handleExportJournal}
                                disabled={loading !== null}
                                className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
                            >
                                {loading === 'journal' ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4" />
                                )}
                                Export CSV
                            </button>
                        </div>
                    </div>
                </div>

                {/* Full Backup */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-amber-50 rounded-lg">
                            <FileJson className="w-5 h-5 text-amber-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-medium text-gray-900">Full Backup</h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Complete JSON backup of trades, journal, and price history
                            </p>
                            <button
                                onClick={handleExportBackup}
                                disabled={loading !== null}
                                className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                            >
                                {loading === 'backup' ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4" />
                                )}
                                Export JSON
                            </button>
                        </div>
                    </div>
                </div>

                {/* Monthly Report */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <Calendar className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-medium text-gray-900">Monthly Report</h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Generate performance summary with insights and lessons
                            </p>
                            <div className="flex items-center gap-2 mt-3">
                                <select
                                    value={reportMonth}
                                    onChange={(e) => setReportMonth(parseInt(e.target.value))}
                                    className="px-2 py-1.5 border border-gray-200 rounded text-sm"
                                >
                                    {months.map((month, idx) => (
                                        <option key={idx} value={idx + 1}>
                                            {month}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={reportYear}
                                    onChange={(e) => setReportYear(parseInt(e.target.value))}
                                    className="px-2 py-1.5 border border-gray-200 rounded text-sm"
                                >
                                    {years.map((year) => (
                                        <option key={year} value={year}>
                                            {year}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleExportReport}
                                    disabled={loading !== null}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                >
                                    {loading === 'report' ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Download className="w-4 h-4" />
                                    )}
                                    Generate
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tips */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <h3 className="font-medium text-gray-900 mb-2">Export Tips</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                    <li>• CSV files can be opened in Excel, Google Sheets, or any spreadsheet app</li>
                    <li>• JSON backups preserve all data including price history for restoration</li>
                    <li>• Monthly reports include key insights and lessons learned from journal entries</li>
                    <li>• Export regularly to maintain a local backup of your trading records</li>
                </ul>
            </div>
        </div>
    );
}
