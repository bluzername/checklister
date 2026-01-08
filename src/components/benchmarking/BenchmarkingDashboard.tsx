'use client';

import { useState, useEffect } from 'react';
import {
    TrendingUp, TrendingDown, DollarSign, Target, Clock,
    BarChart3, PieChart, AlertCircle, Loader2, RefreshCw,
    ChevronDown, ChevronUp, Gauge, Download
} from 'lucide-react';
import { TradeList } from './TradeList';
import { RDistributionChart } from './RDistributionChart';
import { EquityCurve } from './EquityCurve';
import { CalibrationView } from './CalibrationView';
import { ExportPanel } from './ExportPanel';
import { getTradeSummaryStats, getPeriodicStats } from '@/app/benchmarking-actions';
import { TradeSummaryStats } from '@/lib/benchmarking/types';

type SubTab = 'overview' | 'calibration' | 'export';

interface StatCardProps {
    label: string;
    value: string | number;
    subValue?: string;
    trend?: 'up' | 'down' | 'neutral';
    icon?: React.ReactNode;
}

function StatCard({ label, value, subValue, trend, icon }: StatCardProps) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-gray-500 mb-1">{label}</p>
                    <p className={`text-2xl font-bold ${
                        trend === 'up' ? 'text-green-600' :
                        trend === 'down' ? 'text-red-600' :
                        'text-gray-900'
                    }`}>
                        {value}
                    </p>
                    {subValue && (
                        <p className="text-xs text-gray-400 mt-1">{subValue}</p>
                    )}
                </div>
                {icon && (
                    <div className={`p-2 rounded-lg ${
                        trend === 'up' ? 'bg-green-50 text-green-600' :
                        trend === 'down' ? 'bg-red-50 text-red-600' :
                        'bg-gray-50 text-gray-600'
                    }`}>
                        {icon}
                    </div>
                )}
            </div>
        </div>
    );
}

export function BenchmarkingDashboard() {
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('overview');
    const [stats, setStats] = useState<TradeSummaryStats | null>(null);
    const [periodicStats, setPeriodicStats] = useState<Array<{ period: string; stats: TradeSummaryStats }>>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showPeriodicStats, setShowPeriodicStats] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        setError(null);

        try {
            const [statsResult, periodicResult] = await Promise.all([
                getTradeSummaryStats(),
                getPeriodicStats('month'),
            ]);

            if (statsResult.success && statsResult.data) {
                setStats(statsResult.data);
            } else {
                setError(statsResult.error || 'Failed to load stats');
            }

            if (periodicResult.success && periodicResult.data) {
                setPeriodicStats(periodicResult.data);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="flex-1">
                    <p className="text-red-700 font-medium">Error loading performance data</p>
                    <p className="text-red-600 text-sm">{error}</p>
                </div>
                <button
                    onClick={fetchData}
                    className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!stats || stats.total_trades === 0) {
        return (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
                <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-700 mb-2">No Trades Yet</h3>
                <p className="text-gray-500 text-sm max-w-md mx-auto">
                    Start tracking your trades by adding positions to your portfolio.
                    Performance metrics will appear here once you have trade data.
                </p>
            </div>
        );
    }

    const formatCurrency = (value: number) => {
        const absValue = Math.abs(value);
        if (absValue >= 1000) {
            return `${value >= 0 ? '' : '-'}$${(absValue / 1000).toFixed(1)}K`;
        }
        return `${value >= 0 ? '' : '-'}$${absValue.toFixed(0)}`;
    };

    const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
    const formatR = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;

    const subTabs = [
        { id: 'overview' as SubTab, label: 'Overview', icon: BarChart3 },
        { id: 'calibration' as SubTab, label: 'Calibration', icon: Gauge },
        { id: 'export' as SubTab, label: 'Export', icon: Download },
    ];

    return (
        <div className="space-y-6">
            {/* Sub-navigation */}
            <div className="flex gap-2 border-b border-gray-200 pb-2">
                {subTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeSubTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSubTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                isActive
                                    ? 'bg-teal-50 text-teal-700'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Calibration Tab */}
            {activeSubTab === 'calibration' && <CalibrationView />}

            {/* Export Tab */}
            {activeSubTab === 'export' && <ExportPanel />}

            {/* Overview Tab */}
            {activeSubTab === 'overview' && (
            <>
            {/* Summary Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    label="Total P/L"
                    value={formatCurrency(stats.total_pnl)}
                    subValue={`${stats.total_trades} trades`}
                    trend={stats.total_pnl >= 0 ? 'up' : 'down'}
                    icon={<DollarSign className="w-5 h-5" />}
                />
                <StatCard
                    label="Win Rate"
                    value={`${(stats.win_rate * 100).toFixed(1)}%`}
                    subValue={`${stats.winning_trades}W / ${stats.losing_trades}L`}
                    trend={stats.win_rate >= 0.5 ? 'up' : 'down'}
                    icon={<Target className="w-5 h-5" />}
                />
                <StatCard
                    label="Avg R"
                    value={formatR(stats.avg_r)}
                    subValue={`Best: ${formatR(stats.best_r)} | Worst: ${formatR(stats.worst_r)}`}
                    trend={stats.avg_r >= 0 ? 'up' : 'down'}
                    icon={stats.avg_r >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                />
                <StatCard
                    label="Profit Factor"
                    value={stats.profit_factor ? stats.profit_factor.toFixed(2) : 'N/A'}
                    subValue={`Exp: ${stats.expectancy ? formatCurrency(stats.expectancy) : 'N/A'}`}
                    trend={stats.profit_factor && stats.profit_factor > 1 ? 'up' : 'down'}
                    icon={<PieChart className="w-5 h-5" />}
                />
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500 mb-1">Avg Win</p>
                    <p className="text-lg font-semibold text-green-600">{formatCurrency(stats.avg_win)}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500 mb-1">Avg Loss</p>
                    <p className="text-lg font-semibold text-red-600">-{formatCurrency(stats.avg_loss)}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500 mb-1">Avg Hold</p>
                    <p className="text-lg font-semibold text-gray-900">{stats.avg_holding_days.toFixed(1)} days</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500 mb-1">MFE Capture</p>
                    <p className="text-lg font-semibold text-gray-900">{stats.avg_mfe_capture.toFixed(0)}%</p>
                </div>
            </div>

            {/* Status Breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Position Status</h3>
                <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span className="text-sm text-gray-600">Open: {stats.by_status.open}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <span className="text-sm text-gray-600">Partial: {stats.by_status.partially_closed}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span className="text-sm text-gray-600">Closed: {stats.by_status.closed}</span>
                    </div>
                </div>
            </div>

            {/* Periodic Stats Toggle */}
            {periodicStats.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200">
                    <button
                        onClick={() => setShowPeriodicStats(!showPeriodicStats)}
                        className="w-full flex items-center justify-between p-4 text-left"
                    >
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="font-medium text-gray-700">Monthly Performance</span>
                        </div>
                        {showPeriodicStats ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                    </button>

                    {showPeriodicStats && (
                        <div className="border-t border-gray-200 p-4">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-gray-500 border-b border-gray-100">
                                            <th className="pb-2 font-medium">Month</th>
                                            <th className="pb-2 font-medium text-right">Trades</th>
                                            <th className="pb-2 font-medium text-right">Win Rate</th>
                                            <th className="pb-2 font-medium text-right">P/L</th>
                                            <th className="pb-2 font-medium text-right">Avg R</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {periodicStats.slice(-6).reverse().map((period) => (
                                            <tr key={period.period} className="border-b border-gray-50">
                                                <td className="py-2 font-medium text-gray-900">{period.period}</td>
                                                <td className="py-2 text-right text-gray-600">{period.stats.total_trades}</td>
                                                <td className="py-2 text-right text-gray-600">
                                                    {(period.stats.win_rate * 100).toFixed(0)}%
                                                </td>
                                                <td className={`py-2 text-right font-medium ${
                                                    period.stats.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                                                }`}>
                                                    {formatCurrency(period.stats.total_pnl)}
                                                </td>
                                                <td className={`py-2 text-right ${
                                                    period.stats.avg_r >= 0 ? 'text-green-600' : 'text-red-600'
                                                }`}>
                                                    {formatR(period.stats.avg_r)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Equity Curve */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <EquityCurve />
                </div>

                {/* R Distribution */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <RDistributionChart />
                </div>
            </div>

            {/* Trade List */}
            <div className="bg-white rounded-xl border border-gray-200">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 className="font-medium text-gray-900">Recent Trades</h3>
                    <button
                        onClick={fetchData}
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
                <TradeList />
            </div>
            </>
            )}
        </div>
    );
}
