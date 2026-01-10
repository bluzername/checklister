'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
    Loader2,
    RefreshCw,
    TrendingUp,
    Users,
    ExternalLink,
    ChevronUp,
    ChevronDown,
    ChevronsUpDown,
    Sparkles,
    Clock,
    AlertCircle,
} from 'lucide-react';
import {
    getRecommendationsGrouped,
    Recommendation,
} from '@/app/recommendations-actions';

type SortColumn = 'ticker' | 'score' | 'buys' | 'ratio' | 'date';
type SortDirection = 'asc' | 'desc';

interface RecommendationsTabProps {
    onSelectTicker: (ticker: string) => void;
}

export function RecommendationsTab({ onSelectTicker }: RecommendationsTabProps) {
    const [strong, setStrong] = useState<Recommendation[]>([]);
    const [moderate, setModerate] = useState<Recommendation[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [sortColumn, setSortColumn] = useState<SortColumn>('score');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const loadRecommendations = useCallback(async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        else setLoading(true);

        const result = await getRecommendationsGrouped();

        if (result.success) {
            setStrong(result.strong || []);
            setModerate(result.moderate || []);
            setLastUpdated(result.lastUpdated || null);
            setError(null);
        } else {
            setError(result.error || 'Failed to load recommendations');
        }

        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => {
        loadRecommendations();
    }, [loadRecommendations]);

    const handleRefresh = () => {
        loadRecommendations(true);
    };

    // Trigger manual cron job (for testing)
    const handleManualScan = async () => {
        setRefreshing(true);
        try {
            const response = await fetch('/api/cron/recommendations');
            const data = await response.json();
            if (data.success) {
                // Reload data after scan
                await loadRecommendations(true);
            } else {
                setError(data.error || 'Scan failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Scan failed');
        }
        setRefreshing(false);
    };

    // Handle column header click for sorting
    const handleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection(column === 'ticker' ? 'asc' : 'desc');
        }
    };

    // Sort recommendations
    const sortItems = (items: Recommendation[]): Recommendation[] => {
        return [...items].sort((a, b) => {
            let comparison = 0;

            switch (sortColumn) {
                case 'ticker':
                    comparison = a.ticker.localeCompare(b.ticker);
                    break;
                case 'score':
                    comparison = (a.soft_signal_score || 0) - (b.soft_signal_score || 0);
                    break;
                case 'buys':
                    comparison = a.insider_buys - b.insider_buys;
                    break;
                case 'ratio':
                    comparison = (a.insider_buy_ratio || 0) - (b.insider_buy_ratio || 0);
                    break;
                case 'date':
                    const dateA = a.last_trade_date ? new Date(a.last_trade_date).getTime() : 0;
                    const dateB = b.last_trade_date ? new Date(b.last_trade_date).getTime() : 0;
                    comparison = dateA - dateB;
                    break;
            }

            return sortDirection === 'asc' ? comparison : -comparison;
        });
    };

    const sortedStrong = useMemo(() => sortItems(strong), [strong, sortColumn, sortDirection]);
    const sortedModerate = useMemo(() => sortItems(moderate), [moderate, sortColumn, sortDirection]);

    // Render sort icon for column header
    const SortIcon = ({ column }: { column: SortColumn }) => {
        if (sortColumn !== column) {
            return <ChevronsUpDown className="w-3 h-3 text-gray-400" />;
        }
        return sortDirection === 'asc'
            ? <ChevronUp className="w-3 h-3 text-teal-600" />
            : <ChevronDown className="w-3 h-3 text-teal-600" />;
    };

    // Format last updated date
    const formatLastUpdated = (date: string | null): string => {
        if (!date) return 'Never';
        const d = new Date(date);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        return `${diffDays} days ago`;
    };

    // Format trade value
    const formatValue = (value: number | null): string => {
        if (!value) return '-';
        if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
        return `$${value.toFixed(0)}`;
    };

    // Format date
    const formatDate = (date: string | null): string => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            </div>
        );
    }

    const RecommendationTable = ({
        items,
        title,
        icon,
        iconColor,
        bgColor,
    }: {
        items: Recommendation[];
        title: string;
        icon: React.ReactNode;
        iconColor: string;
        bgColor: string;
    }) => (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center`}>
                    {icon}
                </div>
                <h3 className="font-semibold text-gray-900">{title}</h3>
                <span className="text-sm text-gray-500">({items.length})</span>
            </div>

            {items.length === 0 ? (
                <div className="text-sm text-gray-500 py-4 text-center bg-gray-50 rounded-xl">
                    No {title.toLowerCase()} recommendations found.
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th
                                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                    onClick={() => handleSort('ticker')}
                                >
                                    <div className="flex items-center gap-1">
                                        Ticker
                                        <SortIcon column="ticker" />
                                    </div>
                                </th>
                                <th
                                    className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                    onClick={() => handleSort('buys')}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Insider Buys
                                        <SortIcon column="buys" />
                                    </div>
                                </th>
                                <th
                                    className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                    onClick={() => handleSort('ratio')}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Buy Ratio
                                        <SortIcon column="ratio" />
                                    </div>
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Top Buyer
                                </th>
                                <th
                                    className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                    onClick={() => handleSort('score')}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Score
                                        <SortIcon column="score" />
                                    </div>
                                </th>
                                <th
                                    className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                    onClick={() => handleSort('date')}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Last Trade
                                        <SortIcon column="date" />
                                    </div>
                                </th>
                                <th className="px-4 py-3 w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map((item) => (
                                <tr
                                    key={item.id}
                                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                                    onClick={() => onSelectTicker(item.ticker)}
                                >
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-gray-900">
                                            {item.ticker}
                                        </div>
                                        {item.company_name && (
                                            <div className="text-xs text-gray-500 truncate max-w-[150px]">
                                                {item.company_name}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="font-semibold text-emerald-600">
                                            {item.insider_buys}
                                        </span>
                                        {item.insider_sells > 0 && (
                                            <span className="text-gray-400 text-sm">
                                                {' '}/ {item.insider_sells} sells
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {item.insider_buy_ratio !== null ? (
                                            <span className={`font-medium ${
                                                item.insider_buy_ratio >= 0.7 ? 'text-emerald-600' :
                                                item.insider_buy_ratio >= 0.5 ? 'text-yellow-600' :
                                                'text-red-600'
                                            }`}>
                                                {Math.round(item.insider_buy_ratio * 100)}%
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="text-sm text-gray-700 truncate max-w-[180px]">
                                            {item.top_buyer || '-'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${
                                            item.signal_strength === 'STRONG'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            {item.soft_signal_score?.toFixed(1) || '-'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                                        {formatDate(item.last_trade_date)}
                                        {item.last_trade_value && (
                                            <div className="text-xs text-gray-400">
                                                {formatValue(item.last_trade_value)}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectTicker(item.ticker);
                                            }}
                                            className="p-2 text-gray-400 hover:text-teal-600 hover:bg-gray-100 rounded-lg transition-colors"
                                            title="Analyze"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Recommendations</h1>
                <p className="text-gray-500 text-sm">
                    Stocks with strong insider buying activity. Data refreshed daily.
                </p>
            </div>

            <div className="space-y-6">
                {/* Actions Bar */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        <span>Updated: {formatLastUpdated(lastUpdated)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleManualScan}
                            disabled={refreshing}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            Scan Now
                        </button>
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Summary Alert */}
                {strong.length + moderate.length > 0 && (
                    <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <div className="font-semibold text-emerald-800">
                                {strong.length + moderate.length} Stocks with Insider Activity
                            </div>
                            <div className="text-sm text-emerald-600">
                                {strong.length} strong signals, {moderate.length} moderate signals.
                                Click to analyze technical timing.
                            </div>
                        </div>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        <div className="text-red-700">{error}</div>
                    </div>
                )}

                {/* Empty State */}
                {strong.length === 0 && moderate.length === 0 && !error && (
                    <div className="text-center py-12 bg-gray-50 rounded-xl">
                        <TrendingUp className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            No Recommendations Yet
                        </h3>
                        <p className="text-gray-500 text-sm mb-4">
                            Click &quot;Scan Now&quot; to search for stocks with insider buying activity.
                        </p>
                        <button
                            onClick={handleManualScan}
                            disabled={refreshing}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            Scan Now
                        </button>
                    </div>
                )}

                {/* Strong Signals Table */}
                <RecommendationTable
                    items={sortedStrong}
                    title="Strong Insider Activity"
                    icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
                    iconColor="text-emerald-600"
                    bgColor="bg-emerald-100"
                />

                {/* Moderate Signals Table */}
                <RecommendationTable
                    items={sortedModerate}
                    title="Moderate Activity"
                    icon={<Users className="w-4 h-4 text-yellow-600" />}
                    iconColor="text-yellow-600"
                    bgColor="bg-yellow-100"
                />

                {/* Stats Grid */}
                {(strong.length > 0 || moderate.length > 0) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <div className="text-xs text-gray-500 mb-1">Strong Signals</div>
                            <div className="text-xl font-bold text-emerald-600">{strong.length}</div>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <div className="text-xs text-gray-500 mb-1">Moderate Signals</div>
                            <div className="text-xl font-bold text-yellow-600">{moderate.length}</div>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <div className="text-xs text-gray-500 mb-1">Avg Buy Ratio</div>
                            <div className="text-xl font-bold text-teal-600">
                                {(() => {
                                    const all = [...strong, ...moderate];
                                    const avg = all.reduce((sum, r) => sum + (r.insider_buy_ratio || 0), 0) / (all.length || 1);
                                    return `${Math.round(avg * 100)}%`;
                                })()}
                            </div>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <div className="text-xs text-gray-500 mb-1">Total Insider Buys</div>
                            <div className="text-xl font-bold text-gray-900">
                                {[...strong, ...moderate].reduce((sum, r) => sum + r.insider_buys, 0)}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
