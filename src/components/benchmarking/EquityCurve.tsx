'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { getEquityCurveData, getDrawdowns } from '@/app/benchmarking-actions';

interface EquityCurvePoint {
    date: string;
    cumulative_pnl: number;
    cumulative_pnl_percent: number;
    trade_count: number;
}

interface DrawdownPeriod {
    start_date: string;
    end_date: string | null;
    drawdown_percent: number;
    duration_days: number;
    recovered: boolean;
}

interface EquityCurveProps {
    dateRange?: { start: string; end: string };
    height?: number;
}

export function EquityCurve({ dateRange, height = 200 }: EquityCurveProps) {
    const [curveData, setCurveData] = useState<EquityCurvePoint[]>([]);
    const [drawdownData, setDrawdownData] = useState<{
        current_drawdown_percent: number;
        max_drawdown_percent: number;
        max_drawdown_duration_days: number;
        drawdown_periods: DrawdownPeriod[];
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const [curveResult, drawdownResult] = await Promise.all([
                    getEquityCurveData({ dateRange }),
                    getDrawdowns({ dateRange }),
                ]);

                if (curveResult.success && curveResult.data) {
                    setCurveData(curveResult.data);
                }

                if (drawdownResult.success && drawdownResult.data) {
                    setDrawdownData(drawdownResult.data);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [dateRange]);

    const chartData = useMemo(() => {
        if (curveData.length === 0) return null;

        const values = curveData.map(p => p.cumulative_pnl);
        const minValue = Math.min(...values, 0);
        const maxValue = Math.max(...values, 0);
        const range = maxValue - minValue || 1;

        // Generate SVG path
        const width = 100;
        const padding = 2;

        const points = curveData.map((point, idx) => {
            const x = (idx / (curveData.length - 1 || 1)) * (width - padding * 2) + padding;
            const y = height - padding - ((point.cumulative_pnl - minValue) / range) * (height - padding * 2);
            return { x, y, data: point };
        });

        // Create path
        const pathD = points.length > 0
            ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
            : '';

        // Zero line y position
        const zeroY = height - padding - ((0 - minValue) / range) * (height - padding * 2);

        return { points, pathD, minValue, maxValue, zeroY, width, padding };
    }, [curveData, height]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
            </div>
        );
    }

    if (curveData.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <TrendingUp className="w-8 h-8 mb-2" />
                <p className="text-sm">No equity curve data available</p>
            </div>
        );
    }

    const latestPoint = curveData[curveData.length - 1];
    const isPositive = latestPoint.cumulative_pnl >= 0;

    return (
        <div>
            {/* Header Stats */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h4 className="font-medium text-gray-900">Equity Curve</h4>
                    <p className="text-sm text-gray-500">{curveData.length} data points</p>
                </div>
                <div className="text-right">
                    <p className={`text-xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isPositive ? '+' : ''}${latestPoint.cumulative_pnl.toFixed(0)}
                    </p>
                    <p className="text-sm text-gray-500">
                        {isPositive ? '+' : ''}{latestPoint.cumulative_pnl_percent.toFixed(1)}%
                    </p>
                </div>
            </div>

            {/* SVG Chart */}
            {chartData && (
                <div className="relative bg-gray-50 rounded-lg p-4">
                    <svg
                        viewBox={`0 0 ${chartData.width} ${height}`}
                        className="w-full"
                        preserveAspectRatio="none"
                    >
                        {/* Zero line */}
                        <line
                            x1={chartData.padding}
                            y1={chartData.zeroY}
                            x2={chartData.width - chartData.padding}
                            y2={chartData.zeroY}
                            stroke="#e5e7eb"
                            strokeWidth="0.5"
                            strokeDasharray="2,2"
                        />

                        {/* Area fill */}
                        <path
                            d={`${chartData.pathD} L ${chartData.points[chartData.points.length - 1].x} ${chartData.zeroY} L ${chartData.points[0].x} ${chartData.zeroY} Z`}
                            fill={isPositive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'}
                        />

                        {/* Line */}
                        <path
                            d={chartData.pathD}
                            fill="none"
                            stroke={isPositive ? '#22c55e' : '#ef4444'}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />

                        {/* End point */}
                        <circle
                            cx={chartData.points[chartData.points.length - 1].x}
                            cy={chartData.points[chartData.points.length - 1].y}
                            r="2"
                            fill={isPositive ? '#22c55e' : '#ef4444'}
                        />
                    </svg>

                    {/* Y-axis labels */}
                    <div className="absolute left-0 top-4 bottom-4 flex flex-col justify-between text-xs text-gray-400">
                        <span>${chartData.maxValue.toFixed(0)}</span>
                        <span>$0</span>
                        <span>${chartData.minValue.toFixed(0)}</span>
                    </div>
                </div>
            )}

            {/* Drawdown Stats */}
            {drawdownData && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                            <p className="text-xs text-gray-500">Max Drawdown</p>
                            <p className="font-semibold text-red-600">
                                -{drawdownData.max_drawdown_percent.toFixed(1)}%
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Current DD</p>
                            <p className={`font-semibold ${drawdownData.current_drawdown_percent > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                {drawdownData.current_drawdown_percent > 0
                                    ? `-${drawdownData.current_drawdown_percent.toFixed(1)}%`
                                    : 'None'}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Max DD Duration</p>
                            <p className="font-semibold text-gray-900">
                                {drawdownData.max_drawdown_duration_days} days
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Date Range */}
            {curveData.length > 0 && (
                <div className="mt-4 flex justify-between text-xs text-gray-400">
                    <span>{curveData[0].date}</span>
                    <span>{curveData[curveData.length - 1].date}</span>
                </div>
            )}
        </div>
    );
}
