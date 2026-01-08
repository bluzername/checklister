'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Loader2, AlertCircle, TrendingUp, TrendingDown,
    Calendar, DollarSign, Target, Clock, Tag, FileText,
    ChevronDown, ChevronUp, BarChart3, Sparkles
} from 'lucide-react';
import { getTrade } from '@/app/trade-actions';
import { CompletedTrade } from '@/lib/benchmarking/types';
import { CounterfactualTool } from '@/components/benchmarking/CounterfactualTool';
import { TradeJournal } from '@/components/benchmarking/TradeJournal';

interface TradeDetailPageProps {
    params: Promise<{ id: string }>;
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        OPEN: 'bg-blue-100 text-blue-700',
        PARTIALLY_CLOSED: 'bg-yellow-100 text-yellow-700',
        CLOSED: 'bg-green-100 text-green-700',
    };

    const labels: Record<string, string> = {
        OPEN: 'Open',
        PARTIALLY_CLOSED: 'Partial',
        CLOSED: 'Closed',
    };

    return (
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
            {labels[status] || status}
        </span>
    );
}

function MetricCard({ label, value, subValue, icon, trend }: {
    label: string;
    value: string;
    subValue?: string;
    icon: React.ReactNode;
    trend?: 'up' | 'down' | 'neutral';
}) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
                {icon}
                <span className="text-sm">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${
                trend === 'up' ? 'text-green-600' :
                trend === 'down' ? 'text-red-600' :
                'text-gray-900'
            }`}>
                {value}
            </p>
            {subValue && (
                <p className="text-sm text-gray-500 mt-1">{subValue}</p>
            )}
        </div>
    );
}

export default function TradeDetailPage({ params }: TradeDetailPageProps) {
    const { id } = use(params);
    const router = useRouter();
    const [trade, setTrade] = useState<CompletedTrade | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<'overview' | 'counterfactual' | 'journal'>('overview');

    useEffect(() => {
        const fetchTrade = async () => {
            setLoading(true);
            setError(null);

            try {
                const result = await getTrade(id);

                if (result.success && result.data) {
                    setTrade(result.data);
                } else {
                    setError(result.error || 'Trade not found');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load trade');
            } finally {
                setLoading(false);
            }
        };

        fetchTrade();
    }, [id]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
            </div>
        );
    }

    if (error || !trade) {
        return (
            <div className="min-h-screen bg-gray-50 p-8">
                <div className="max-w-2xl mx-auto">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </button>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-4">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                        <div>
                            <h2 className="font-semibold text-red-900">Error Loading Trade</h2>
                            <p className="text-red-700">{error || 'Trade not found'}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const isPositive = (trade.total_realized_pnl || 0) >= 0;
    const pnl = trade.total_realized_pnl || 0;
    const pnlPercent = trade.total_realized_pnl_percent || 0;
    const realizedR = trade.realized_r || 0;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 py-4">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Performance
                    </button>

                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-gray-900">{trade.ticker}</h1>
                                <StatusBadge status={trade.status} />
                                {trade.is_paper_trade && (
                                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                        Paper
                                    </span>
                                )}
                            </div>
                            <p className="text-gray-500 mt-1">
                                {trade.trade_type} &bull; Entry: {trade.entry_date}
                                {trade.exit_date && ` &bull; Exit: ${trade.exit_date}`}
                            </p>
                        </div>

                        {trade.status === 'CLOSED' && (
                            <div className="text-right">
                                <p className={`text-3xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                    {isPositive ? '+' : ''}{realizedR.toFixed(2)}R
                                </p>
                                <p className={`text-lg ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                    {isPositive ? '+' : ''}${pnl.toFixed(0)} ({isPositive ? '+' : ''}{pnlPercent.toFixed(1)}%)
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Section Tabs */}
                    <div className="flex gap-1 mt-6">
                        {[
                            { id: 'overview', label: 'Overview', icon: BarChart3 },
                            { id: 'counterfactual', label: 'What-If Analysis', icon: Sparkles },
                            { id: 'journal', label: 'Journal', icon: FileText },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSection(tab.id as typeof activeSection)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    activeSection === tab.id
                                        ? 'bg-teal-100 text-teal-700'
                                        : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-6xl mx-auto px-4 py-6">
                {activeSection === 'overview' && (
                    <div className="space-y-6">
                        {/* Key Metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <MetricCard
                                label="Entry Price"
                                value={`$${trade.entry_price.toFixed(2)}`}
                                subValue={`${trade.entry_shares} shares`}
                                icon={<DollarSign className="w-4 h-4" />}
                            />
                            <MetricCard
                                label="Exit Price"
                                value={trade.blended_exit_price ? `$${trade.blended_exit_price.toFixed(2)}` : '-'}
                                subValue={trade.exit_reason || undefined}
                                icon={<Target className="w-4 h-4" />}
                                trend={trade.blended_exit_price ? (trade.blended_exit_price > trade.entry_price ? 'up' : 'down') : undefined}
                            />
                            <MetricCard
                                label="Holding Period"
                                value={trade.holding_days ? `${trade.holding_days} days` : '-'}
                                icon={<Clock className="w-4 h-4" />}
                            />
                            <MetricCard
                                label="Position Value"
                                value={`$${trade.entry_value.toLocaleString()}`}
                                icon={<DollarSign className="w-4 h-4" />}
                            />
                        </div>

                        {/* Entry Context */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6">
                            <h3 className="font-semibold text-gray-900 mb-4">Entry Context</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div>
                                    <p className="text-sm text-gray-500">Probability</p>
                                    <p className="text-lg font-medium text-gray-900">
                                        {trade.entry_probability ? `${trade.entry_probability.toFixed(0)}%` : '-'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Regime</p>
                                    <p className="text-lg font-medium text-gray-900">{trade.entry_regime || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Sector</p>
                                    <p className="text-lg font-medium text-gray-900">{trade.entry_sector || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">R:R Ratio</p>
                                    <p className="text-lg font-medium text-gray-900">
                                        {trade.entry_rr_ratio ? `1:${trade.entry_rr_ratio.toFixed(1)}` : '-'}
                                    </p>
                                </div>
                            </div>

                            {/* Stop & Targets */}
                            <div className="mt-6 pt-6 border-t border-gray-200">
                                <p className="text-sm text-gray-500 mb-3">Stop Loss & Targets</p>
                                <div className="flex flex-wrap gap-4">
                                    {trade.entry_stop_loss && (
                                        <div className="px-4 py-2 bg-red-50 rounded-lg">
                                            <p className="text-xs text-red-600">Stop Loss</p>
                                            <p className="font-semibold text-red-700">${trade.entry_stop_loss.toFixed(2)}</p>
                                        </div>
                                    )}
                                    {trade.entry_tp1 && (
                                        <div className="px-4 py-2 bg-green-50 rounded-lg">
                                            <p className="text-xs text-green-600">TP1</p>
                                            <p className="font-semibold text-green-700">${trade.entry_tp1.toFixed(2)}</p>
                                        </div>
                                    )}
                                    {trade.entry_tp2 && (
                                        <div className="px-4 py-2 bg-green-50 rounded-lg">
                                            <p className="text-xs text-green-600">TP2</p>
                                            <p className="font-semibold text-green-700">${trade.entry_tp2.toFixed(2)}</p>
                                        </div>
                                    )}
                                    {trade.entry_tp3 && (
                                        <div className="px-4 py-2 bg-green-50 rounded-lg">
                                            <p className="text-xs text-green-600">TP3</p>
                                            <p className="font-semibold text-green-700">${trade.entry_tp3.toFixed(2)}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* MFE/MAE */}
                        {(trade.mfe || trade.mae) && (
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <h3 className="font-semibold text-gray-900 mb-4">Price Excursion</h3>
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <p className="text-sm text-gray-500">Max Favorable (MFE)</p>
                                        <p className="text-2xl font-bold text-green-600">
                                            ${trade.mfe?.toFixed(2) || '-'}
                                        </p>
                                        {trade.mfe_r !== undefined && (
                                            <p className="text-sm text-green-600">{trade.mfe_r.toFixed(2)}R</p>
                                        )}
                                        {trade.mfe_date && (
                                            <p className="text-xs text-gray-400 mt-1">{trade.mfe_date}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Max Adverse (MAE)</p>
                                        <p className="text-2xl font-bold text-red-600">
                                            ${trade.mae?.toFixed(2) || '-'}
                                        </p>
                                        {trade.mae_r !== undefined && (
                                            <p className="text-sm text-red-600">{trade.mae_r.toFixed(2)}R</p>
                                        )}
                                        {trade.mae_date && (
                                            <p className="text-xs text-gray-400 mt-1">{trade.mae_date}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Partial Exits */}
                        {trade.partial_exits && trade.partial_exits.length > 0 && (
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <h3 className="font-semibold text-gray-900 mb-4">Exit History</h3>
                                <div className="space-y-3">
                                    {trade.partial_exits.map((exit, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className="text-gray-600">{exit.date}</span>
                                                <span className="font-medium">{exit.shares} @ ${exit.price.toFixed(2)}</span>
                                                <span className="px-2 py-0.5 bg-gray-200 rounded text-xs text-gray-700">
                                                    {exit.reason}
                                                </span>
                                            </div>
                                            <span className={`font-semibold ${exit.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {exit.pnl >= 0 ? '+' : ''}${exit.pnl.toFixed(0)}
                                                {exit.r_multiple !== undefined && (
                                                    <span className="text-sm ml-1">({exit.r_multiple.toFixed(2)}R)</span>
                                                )}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tags */}
                        {trade.tags && trade.tags.length > 0 && (
                            <div className="flex items-center gap-2">
                                <Tag className="w-4 h-4 text-gray-400" />
                                {trade.tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Notes */}
                        {trade.entry_notes && (
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <h3 className="font-semibold text-gray-900 mb-2">Entry Notes</h3>
                                <p className="text-gray-700 whitespace-pre-wrap">{trade.entry_notes}</p>
                            </div>
                        )}
                    </div>
                )}

                {activeSection === 'counterfactual' && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <CounterfactualTool trade={trade} />
                    </div>
                )}

                {activeSection === 'journal' && (
                    <TradeJournal tradeId={trade.id} />
                )}
            </div>
        </div>
    );
}
