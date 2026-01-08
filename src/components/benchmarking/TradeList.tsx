'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    ChevronUp, ChevronDown, ExternalLink, TrendingUp, TrendingDown,
    AlertCircle, Loader2, Clock, Tag, MoreHorizontal
} from 'lucide-react';
import { getTrades } from '@/app/benchmarking-actions';
import { CompletedTrade, TradeStatus } from '@/lib/benchmarking/types';

type SortField = 'entry_date' | 'ticker' | 'total_realized_pnl' | 'realized_r' | 'holding_days' | 'status';
type SortDirection = 'asc' | 'desc';

interface TradeListProps {
    limit?: number;
    statusFilter?: TradeStatus[];
}

function StatusBadge({ status }: { status: TradeStatus }) {
    const styles = {
        OPEN: 'bg-blue-100 text-blue-700',
        PARTIALLY_CLOSED: 'bg-yellow-100 text-yellow-700',
        CLOSED: 'bg-green-100 text-green-700',
    };

    const labels = {
        OPEN: 'Open',
        PARTIALLY_CLOSED: 'Partial',
        CLOSED: 'Closed',
    };

    return (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
            {labels[status]}
        </span>
    );
}

function PnLDisplay({ pnl, pnlPercent }: { pnl?: number; pnlPercent?: number }) {
    if (pnl === undefined) {
        return <span className="text-gray-400">-</span>;
    }

    const isPositive = pnl >= 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;

    return (
        <div className={`flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            <Icon className="w-3 h-3" />
            <span className="font-medium">
                {isPositive ? '+' : ''}{pnl.toFixed(0)}
            </span>
            {pnlPercent !== undefined && (
                <span className="text-xs opacity-75">
                    ({isPositive ? '+' : ''}{pnlPercent.toFixed(1)}%)
                </span>
            )}
        </div>
    );
}

function RDisplay({ r }: { r?: number }) {
    if (r === undefined) {
        return <span className="text-gray-400">-</span>;
    }

    const isPositive = r >= 0;
    return (
        <span className={`font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{r.toFixed(2)}R
        </span>
    );
}

export function TradeList({ limit = 20, statusFilter }: TradeListProps) {
    const [trades, setTrades] = useState<CompletedTrade[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortField, setSortField] = useState<SortField>('entry_date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [expandedTrade, setExpandedTrade] = useState<string | null>(null);

    useEffect(() => {
        const fetchTrades = async () => {
            setLoading(true);
            setError(null);

            try {
                const result = await getTrades({
                    status: statusFilter,
                });

                if (result.success && result.data) {
                    setTrades(result.data);
                } else {
                    setError(result.error || 'Failed to load trades');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        fetchTrades();
    }, [statusFilter]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const sortedTrades = [...trades].sort((a, b) => {
        let aVal: string | number = 0;
        let bVal: string | number = 0;

        switch (sortField) {
            case 'entry_date':
                aVal = a.entry_date;
                bVal = b.entry_date;
                break;
            case 'ticker':
                aVal = a.ticker;
                bVal = b.ticker;
                break;
            case 'total_realized_pnl':
                aVal = a.total_realized_pnl || 0;
                bVal = b.total_realized_pnl || 0;
                break;
            case 'realized_r':
                aVal = a.realized_r || 0;
                bVal = b.realized_r || 0;
                break;
            case 'holding_days':
                aVal = a.holding_days || 0;
                bVal = b.holding_days || 0;
                break;
            case 'status':
                aVal = a.status;
                bVal = b.status;
                break;
        }

        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortDirection === 'asc'
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        }

        return sortDirection === 'asc'
            ? (aVal as number) - (bVal as number)
            : (bVal as number) - (aVal as number);
    }).slice(0, limit);

    const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
        <th
            className="pb-2 font-medium cursor-pointer hover:text-teal-600 transition-colors"
            onClick={() => handleSort(field)}
        >
            <div className="flex items-center gap-1">
                {label}
                {sortField === field && (
                    sortDirection === 'asc'
                        ? <ChevronUp className="w-3 h-3" />
                        : <ChevronDown className="w-3 h-3" />
                )}
            </div>
        </th>
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{error}</span>
            </div>
        );
    }

    if (trades.length === 0) {
        return (
            <div className="p-8 text-center text-gray-500">
                <p>No trades found.</p>
                <p className="text-sm mt-1">Add positions to your portfolio to start tracking trades.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                        <SortHeader field="ticker" label="Ticker" />
                        <SortHeader field="entry_date" label="Entry" />
                        <SortHeader field="status" label="Status" />
                        <th className="pb-2 font-medium text-right">Entry Price</th>
                        <th className="pb-2 font-medium text-right">Exit Price</th>
                        <SortHeader field="total_realized_pnl" label="P/L" />
                        <SortHeader field="realized_r" label="R" />
                        <SortHeader field="holding_days" label="Days" />
                        <th className="pb-2 font-medium w-8"></th>
                    </tr>
                </thead>
                <tbody>
                    {sortedTrades.map((trade) => (
                        <>
                            <tr
                                key={trade.id}
                                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                                onClick={() => setExpandedTrade(expandedTrade === trade.id ? null : trade.id)}
                            >
                                <td className="py-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-gray-900">{trade.ticker}</span>
                                        {trade.is_paper_trade && (
                                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                                                Paper
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="py-3 text-gray-600">{trade.entry_date}</td>
                                <td className="py-3"><StatusBadge status={trade.status} /></td>
                                <td className="py-3 text-right text-gray-900">${trade.entry_price.toFixed(2)}</td>
                                <td className="py-3 text-right text-gray-600">
                                    {trade.blended_exit_price ? `$${trade.blended_exit_price.toFixed(2)}` : '-'}
                                </td>
                                <td className="py-3 text-right">
                                    <PnLDisplay pnl={trade.total_realized_pnl} pnlPercent={trade.total_realized_pnl_percent} />
                                </td>
                                <td className="py-3 text-right"><RDisplay r={trade.realized_r} /></td>
                                <td className="py-3 text-right text-gray-600">
                                    {trade.holding_days || '-'}
                                </td>
                                <td className="py-3 text-center">
                                    {expandedTrade === trade.id ? (
                                        <ChevronUp className="w-4 h-4 text-gray-400" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-gray-400" />
                                    )}
                                </td>
                            </tr>

                            {/* Expanded Details */}
                            {expandedTrade === trade.id && (
                                <tr key={`${trade.id}-details`}>
                                    <td colSpan={9} className="bg-gray-50 p-4">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                            <div>
                                                <p className="text-gray-500 text-xs mb-1">Entry Context</p>
                                                <p className="text-gray-900">
                                                    Prob: {trade.entry_probability ? `${trade.entry_probability.toFixed(0)}%` : 'N/A'}
                                                </p>
                                                {trade.entry_regime && (
                                                    <p className="text-gray-600 text-xs">{trade.entry_regime}</p>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-gray-500 text-xs mb-1">Position</p>
                                                <p className="text-gray-900">{trade.entry_shares} shares</p>
                                                <p className="text-gray-600 text-xs">
                                                    ${trade.entry_value.toLocaleString()}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500 text-xs mb-1">MFE / MAE</p>
                                                <p className="text-gray-900">
                                                    {trade.mfe ? `$${trade.mfe.toFixed(2)}` : '-'} /
                                                    {trade.mae ? ` $${trade.mae.toFixed(2)}` : ' -'}
                                                </p>
                                                {trade.mfe_r !== undefined && trade.mae_r !== undefined && (
                                                    <p className="text-gray-600 text-xs">
                                                        {trade.mfe_r.toFixed(1)}R / {trade.mae_r.toFixed(1)}R
                                                    </p>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-gray-500 text-xs mb-1">Stop / Targets</p>
                                                <p className="text-gray-900">
                                                    SL: {trade.entry_stop_loss ? `$${trade.entry_stop_loss.toFixed(2)}` : '-'}
                                                </p>
                                                <p className="text-gray-600 text-xs">
                                                    TP: {trade.entry_tp1 ? `$${trade.entry_tp1.toFixed(2)}` : '-'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Partial Exits */}
                                        {trade.partial_exits && trade.partial_exits.length > 0 && (
                                            <div className="mt-4 pt-4 border-t border-gray-200">
                                                <p className="text-gray-500 text-xs mb-2">Partial Exits</p>
                                                <div className="space-y-2">
                                                    {trade.partial_exits.map((exit, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="flex items-center justify-between text-sm bg-white rounded px-3 py-2"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-gray-600">{exit.date}</span>
                                                                <span className="font-medium">{exit.shares} @ ${exit.price.toFixed(2)}</span>
                                                                <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                                                                    {exit.reason}
                                                                </span>
                                                            </div>
                                                            <span className={exit.pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                                {exit.pnl >= 0 ? '+' : ''}{exit.pnl.toFixed(0)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Tags */}
                                        {trade.tags && trade.tags.length > 0 && (
                                            <div className="mt-4 flex items-center gap-2">
                                                <Tag className="w-3 h-3 text-gray-400" />
                                                {trade.tags.map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-xs"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Notes */}
                                        {trade.entry_notes && (
                                            <div className="mt-4 p-3 bg-white rounded border border-gray-200">
                                                <p className="text-gray-500 text-xs mb-1">Notes</p>
                                                <p className="text-gray-700 text-sm">{trade.entry_notes}</p>
                                            </div>
                                        )}

                                        {/* View Details Link */}
                                        <div className="mt-4 pt-4 border-t border-gray-200">
                                            <Link
                                                href={`/trades/${trade.id}`}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                                View Full Details
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
