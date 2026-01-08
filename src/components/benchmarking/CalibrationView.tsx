'use client';

import { useState, useEffect } from 'react';
import {
    Loader2, AlertCircle, TrendingUp, TrendingDown, AlertTriangle,
    CheckCircle, Target, ArrowRight, RefreshCw
} from 'lucide-react';
import {
    getCalibrationMetrics,
    detectDrift,
    getThresholdRecommendations,
    getReconciliationSummary,
} from '@/app/calibration-actions';
import { CalibrationMetrics, DriftDetection } from '@/lib/benchmarking/types';

interface ThresholdRecommendation {
    current_threshold: number;
    recommended_threshold: number;
    expected_win_rate_change: number;
    expected_trade_count_change: number;
    confidence: 'high' | 'medium' | 'low';
    rationale: string;
}

function CalibrationChart({ metrics }: { metrics: CalibrationMetrics[] }) {
    if (metrics.length === 0) {
        return (
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                <p className="text-gray-400 text-sm">No calibration data available</p>
            </div>
        );
    }

    const maxCount = Math.max(...metrics.map(m => m.trade_count));

    return (
        <div className="space-y-4">
            {/* Chart */}
            <div className="relative h-64">
                <svg viewBox="0 0 400 200" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                    {/* Grid lines */}
                    <line x1="50" y1="20" x2="50" y2="180" stroke="#e5e7eb" strokeWidth="1" />
                    <line x1="50" y1="180" x2="380" y2="180" stroke="#e5e7eb" strokeWidth="1" />

                    {/* Perfect calibration line */}
                    <line x1="50" y1="20" x2="380" y2="180" stroke="#9ca3af" strokeWidth="1" strokeDasharray="4,4" />
                    <text x="385" y="175" fill="#9ca3af" fontSize="8">Perfect</text>

                    {/* Y-axis labels */}
                    <text x="10" y="25" fill="#6b7280" fontSize="9">100%</text>
                    <text x="10" y="100" fill="#6b7280" fontSize="9">50%</text>
                    <text x="10" y="180" fill="#6b7280" fontSize="9">0%</text>

                    {/* X-axis label */}
                    <text x="200" y="198" fill="#6b7280" fontSize="9" textAnchor="middle">Predicted Probability</text>

                    {/* Data points */}
                    {metrics.map((m, idx) => {
                        const x = 50 + ((m.expected_win_rate - 0.5) / 0.5) * 330;
                        const y = 180 - (m.actual_win_rate * 160);
                        const radius = 4 + (m.trade_count / maxCount) * 8;
                        const isOverconfident = m.is_overconfident;
                        const isUnderconfident = m.is_underconfident;

                        return (
                            <g key={idx}>
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={radius}
                                    fill={isOverconfident ? '#ef4444' : isUnderconfident ? '#3b82f6' : '#10b981'}
                                    fillOpacity="0.7"
                                    stroke={isOverconfident ? '#dc2626' : isUnderconfident ? '#2563eb' : '#059669'}
                                    strokeWidth="1.5"
                                />
                                <text x={x} y={y + radius + 12} fill="#374151" fontSize="8" textAnchor="middle">
                                    {m.bucket}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 text-xs text-gray-600">
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-green-500 opacity-70" />
                    <span>Well Calibrated</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500 opacity-70" />
                    <span>Overconfident</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-blue-500 opacity-70" />
                    <span>Underconfident</span>
                </div>
            </div>
        </div>
    );
}

function CalibrationTable({ metrics }: { metrics: CalibrationMetrics[] }) {
    if (metrics.length === 0) return null;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                        <th className="pb-2 font-medium">Bucket</th>
                        <th className="pb-2 font-medium text-right">Trades</th>
                        <th className="pb-2 font-medium text-right">Expected</th>
                        <th className="pb-2 font-medium text-right">Actual</th>
                        <th className="pb-2 font-medium text-right">Error</th>
                        <th className="pb-2 font-medium text-center">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {metrics.map((m, idx) => (
                        <tr key={idx} className="border-b border-gray-100">
                            <td className="py-2 font-medium text-gray-900">{m.bucket}</td>
                            <td className="py-2 text-right text-gray-600">{m.trade_count}</td>
                            <td className="py-2 text-right text-gray-600">
                                {(m.expected_win_rate * 100).toFixed(0)}%
                            </td>
                            <td className={`py-2 text-right font-medium ${
                                m.actual_win_rate >= m.expected_win_rate ? 'text-green-600' : 'text-red-600'
                            }`}>
                                {(m.actual_win_rate * 100).toFixed(0)}%
                            </td>
                            <td className={`py-2 text-right ${
                                Math.abs(m.calibration_error) <= 0.05 ? 'text-gray-600' :
                                m.calibration_error < 0 ? 'text-red-600' : 'text-blue-600'
                            }`}>
                                {m.calibration_error >= 0 ? '+' : ''}{(m.calibration_error * 100).toFixed(1)}%
                            </td>
                            <td className="py-2 text-center">
                                {Math.abs(m.calibration_error) <= 0.05 ? (
                                    <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                                ) : m.is_overconfident ? (
                                    <TrendingDown className="w-4 h-4 text-red-500 mx-auto" />
                                ) : (
                                    <TrendingUp className="w-4 h-4 text-blue-500 mx-auto" />
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function DriftCard({ drift }: { drift: DriftDetection }) {
    return (
        <div className={`rounded-xl border p-4 ${
            drift.has_significant_drift
                ? 'bg-amber-50 border-amber-200'
                : 'bg-green-50 border-green-200'
        }`}>
            <div className="flex items-start gap-3">
                {drift.has_significant_drift ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                ) : (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                    <h4 className={`font-medium ${
                        drift.has_significant_drift ? 'text-amber-900' : 'text-green-900'
                    }`}>
                        {drift.has_significant_drift ? 'Model Drift Detected' : 'Model Performance Stable'}
                    </h4>
                    <p className={`text-sm mt-1 ${
                        drift.has_significant_drift ? 'text-amber-700' : 'text-green-700'
                    }`}>
                        {drift.recommendation}
                    </p>
                    <div className="grid grid-cols-3 gap-4 mt-3">
                        <div>
                            <p className="text-xs text-gray-500">Period</p>
                            <p className="text-sm font-medium text-gray-900">{drift.period}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Calibration Error</p>
                            <p className={`text-sm font-medium ${
                                Math.abs(drift.overall_calibration_error) <= 0.05 ? 'text-green-600' : 'text-amber-600'
                            }`}>
                                {drift.overall_calibration_error >= 0 ? '+' : ''}
                                {(drift.overall_calibration_error * 100).toFixed(1)}%
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Max Bucket Error</p>
                            <p className={`text-sm font-medium ${
                                drift.max_bucket_error <= 0.10 ? 'text-green-600' : 'text-amber-600'
                            }`}>
                                {(drift.max_bucket_error * 100).toFixed(1)}%
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ThresholdCard({ recommendation }: { recommendation: ThresholdRecommendation }) {
    const needsChange = Math.abs(recommendation.recommended_threshold - recommendation.current_threshold) >= 0.05;

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-teal-600" />
                <h4 className="font-medium text-gray-900">Threshold Recommendation</h4>
                <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                    recommendation.confidence === 'high' ? 'bg-green-100 text-green-700' :
                    recommendation.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-700'
                }`}>
                    {recommendation.confidence} confidence
                </span>
            </div>

            {needsChange ? (
                <div className="flex items-center gap-4 mb-4">
                    <div className="text-center">
                        <p className="text-xs text-gray-500">Current</p>
                        <p className="text-2xl font-bold text-gray-400">
                            {(recommendation.current_threshold * 100).toFixed(0)}%
                        </p>
                    </div>
                    <ArrowRight className="w-6 h-6 text-teal-500" />
                    <div className="text-center">
                        <p className="text-xs text-gray-500">Recommended</p>
                        <p className="text-2xl font-bold text-teal-600">
                            {(recommendation.recommended_threshold * 100).toFixed(0)}%
                        </p>
                    </div>
                    <div className="flex-1 text-right">
                        <p className="text-xs text-gray-500">Expected Impact</p>
                        <p className="text-sm">
                            <span className={recommendation.expected_win_rate_change >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {recommendation.expected_win_rate_change >= 0 ? '+' : ''}
                                {(recommendation.expected_win_rate_change * 100).toFixed(1)}% win rate
                            </span>
                            <span className="text-gray-400 mx-1">|</span>
                            <span className={recommendation.expected_trade_count_change >= 0 ? 'text-blue-600' : 'text-amber-600'}>
                                {recommendation.expected_trade_count_change >= 0 ? '+' : ''}
                                {recommendation.expected_trade_count_change.toFixed(0)}% trades
                            </span>
                        </p>
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-2 mb-4 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <p className="font-medium">Current threshold is optimal</p>
                </div>
            )}

            <p className="text-sm text-gray-600">{recommendation.rationale}</p>
        </div>
    );
}

export function CalibrationView() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [metrics, setMetrics] = useState<CalibrationMetrics[]>([]);
    const [drift, setDrift] = useState<DriftDetection | null>(null);
    const [recommendation, setRecommendation] = useState<ThresholdRecommendation | null>(null);
    const [matchStats, setMatchStats] = useState<{ total: number; matched: number; rate: number } | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await getReconciliationSummary();

            if (result.success && result.data) {
                setMetrics(result.data.calibration);
                setDrift(result.data.drift);
                setRecommendation(result.data.threshold_recommendation);
                setMatchStats({
                    total: result.data.total_trades,
                    matched: result.data.matched_trades,
                    rate: result.data.match_rate,
                });
            } else {
                setError(result.error || 'Failed to load calibration data');
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
                    <p className="text-red-700 font-medium">Error loading calibration data</p>
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Model Calibration</h2>
                    <p className="text-sm text-gray-500">
                        Compare predicted probabilities to actual outcomes
                    </p>
                </div>
                <button
                    onClick={fetchData}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>

            {/* Match Stats */}
            {matchStats && (
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-6">
                        <div>
                            <p className="text-xs text-gray-500">Total Trades</p>
                            <p className="text-xl font-bold text-gray-900">{matchStats.total}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Matched to Predictions</p>
                            <p className="text-xl font-bold text-teal-600">{matchStats.matched}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Match Rate</p>
                            <p className="text-xl font-bold text-gray-900">
                                {(matchStats.rate * 100).toFixed(0)}%
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Drift Detection */}
            {drift && <DriftCard drift={drift} />}

            {/* Threshold Recommendation */}
            {recommendation && <ThresholdCard recommendation={recommendation} />}

            {/* Calibration Chart */}
            {metrics.length > 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-900 mb-4">Calibration Curve</h3>
                    <CalibrationChart metrics={metrics} />
                </div>
            ) : (
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center">
                    <Target className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-700 mb-2">No Calibration Data</h3>
                    <p className="text-gray-500 text-sm max-w-md mx-auto">
                        Complete more trades with prediction logs to see calibration analysis.
                        This requires trades to be matched with model predictions.
                    </p>
                </div>
            )}

            {/* Calibration Table */}
            {metrics.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-900 mb-4">Calibration by Bucket</h3>
                    <CalibrationTable metrics={metrics} />
                </div>
            )}
        </div>
    );
}
