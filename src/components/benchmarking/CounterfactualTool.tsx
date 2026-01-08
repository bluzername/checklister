'use client';

import { useState, useEffect } from 'react';
import {
    Loader2, AlertCircle, TrendingUp, TrendingDown,
    Sliders, Play, RotateCcw, Sparkles
} from 'lucide-react';
import { runCounterfactual, findOptimalExit, runAllPresetScenarios } from '@/app/benchmarking-actions';
import { CompletedTrade, CounterfactualScenario, CounterfactualResult, OptimalExitResult } from '@/lib/benchmarking/types';

interface CounterfactualToolProps {
    trade: CompletedTrade;
    onClose?: () => void;
}

function ScenarioResult({ result, isActual = false }: { result: CounterfactualResult; isActual?: boolean }) {
    const isPositive = result.realized_pnl >= 0;
    const improvementPositive = result.improvement_vs_actual > 0;

    return (
        <div className={`p-4 rounded-lg border ${isActual ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}>
            <div className="flex items-start justify-between mb-3">
                <div>
                    <h4 className="font-medium text-gray-900">
                        {isActual ? 'Actual Result' : result.scenario.name}
                    </h4>
                    {result.scenario.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{result.scenario.description}</p>
                    )}
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                    result.exit_reason === 'STOP_LOSS' ? 'bg-red-100 text-red-700' :
                    result.exit_reason.startsWith('TP') ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-700'
                }`}>
                    {result.exit_reason}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <p className="text-gray-500 text-xs">P/L</p>
                    <p className={`font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isPositive ? '+' : ''}${result.realized_pnl.toFixed(0)}
                        <span className="text-xs ml-1 opacity-75">
                            ({isPositive ? '+' : ''}{result.realized_pnl_percent.toFixed(1)}%)
                        </span>
                    </p>
                </div>
                <div>
                    <p className="text-gray-500 text-xs">R-Multiple</p>
                    <p className={`font-semibold ${result.realized_r >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {result.realized_r >= 0 ? '+' : ''}{result.realized_r.toFixed(2)}R
                    </p>
                </div>
                <div>
                    <p className="text-gray-500 text-xs">Exit Date</p>
                    <p className="text-gray-900">{result.exit_date}</p>
                </div>
                <div>
                    <p className="text-gray-500 text-xs">Holding Days</p>
                    <p className="text-gray-900">{result.holding_days}</p>
                </div>
            </div>

            {!isActual && (
                <div className={`mt-3 pt-3 border-t ${improvementPositive ? 'border-green-200' : 'border-red-200'}`}>
                    <div className="flex items-center gap-2">
                        {improvementPositive ? (
                            <TrendingUp className="w-4 h-4 text-green-600" />
                        ) : (
                            <TrendingDown className="w-4 h-4 text-red-600" />
                        )}
                        <span className={`text-sm font-medium ${improvementPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {improvementPositive ? '+' : ''}{result.improvement_vs_actual.toFixed(0)} vs actual
                            <span className="ml-1 opacity-75">
                                ({improvementPositive ? '+' : ''}{result.improvement_r_vs_actual.toFixed(2)}R)
                            </span>
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

export function CounterfactualTool({ trade, onClose }: CounterfactualToolProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [presetResults, setPresetResults] = useState<CounterfactualResult[]>([]);
    const [optimalExit, setOptimalExit] = useState<OptimalExitResult | null>(null);
    const [customScenario, setCustomScenario] = useState<CounterfactualScenario>({
        name: 'Custom Scenario',
        stop_loss: trade.entry_stop_loss,
        tp1: trade.entry_tp1,
    });
    const [customResult, setCustomResult] = useState<CounterfactualResult | null>(null);

    const loadPresets = async () => {
        setLoading(true);
        setError(null);

        try {
            const [presetsResult, optimalResult] = await Promise.all([
                runAllPresetScenarios(trade.id),
                findOptimalExit(trade.id),
            ]);

            if (presetsResult.success && presetsResult.data) {
                setPresetResults(presetsResult.data);
            }

            if (optimalResult.success && optimalResult.data) {
                setOptimalExit(optimalResult.data);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load scenarios');
        } finally {
            setLoading(false);
        }
    };

    const runCustomScenario = async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await runCounterfactual(trade.id, customScenario);

            if (result.success && result.data) {
                setCustomResult(result.data);
            } else {
                setError(result.error || 'Failed to run scenario');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to run scenario');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPresets();
    }, [trade.id]);

    const entryPrice = trade.entry_price;
    const riskPerShare = trade.entry_stop_loss ? entryPrice - trade.entry_stop_loss : entryPrice * 0.05;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">What-If Analysis</h3>
                    <p className="text-sm text-gray-500">
                        {trade.ticker} - Entry: ${entryPrice.toFixed(2)} on {trade.entry_date}
                    </p>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        Close
                    </button>
                )}
            </div>

            {/* Optimal Exit */}
            {optimalExit && (
                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-5 h-5 text-amber-600" />
                        <h4 className="font-medium text-amber-900">Optimal Exit Point</h4>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <p className="text-amber-700 text-xs">Best Exit Date</p>
                            <p className="font-semibold text-amber-900">{optimalExit.optimal_exit_date}</p>
                        </div>
                        <div>
                            <p className="text-amber-700 text-xs">Peak Price</p>
                            <p className="font-semibold text-amber-900">${optimalExit.optimal_exit_price.toFixed(2)}</p>
                        </div>
                        <div>
                            <p className="text-amber-700 text-xs">Max Possible</p>
                            <p className="font-semibold text-green-600">
                                +${optimalExit.max_possible_pnl.toFixed(0)} ({optimalExit.max_possible_r.toFixed(2)}R)
                            </p>
                        </div>
                        <div>
                            <p className="text-amber-700 text-xs">MFE Captured</p>
                            <p className={`font-semibold ${
                                optimalExit.mfe_capture_percent >= 50 ? 'text-green-600' : 'text-amber-600'
                            }`}>
                                {optimalExit.mfe_capture_percent.toFixed(0)}%
                            </p>
                        </div>
                    </div>
                    {optimalExit.actual_vs_optimal_gap > 0 && (
                        <p className="mt-3 text-sm text-amber-700">
                            Left {optimalExit.actual_vs_optimal_gap.toFixed(2)}R on the table
                        </p>
                    )}
                </div>
            )}

            {/* Custom Scenario Builder */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                    <Sliders className="w-4 h-4 text-gray-400" />
                    <h4 className="font-medium text-gray-900">Custom Scenario</h4>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Stop Loss</label>
                        <input
                            type="number"
                            step="0.01"
                            value={customScenario.stop_loss || ''}
                            onChange={(e) => setCustomScenario({
                                ...customScenario,
                                stop_loss: e.target.value ? parseFloat(e.target.value) : undefined,
                            })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            placeholder={`${(entryPrice - riskPerShare).toFixed(2)}`}
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Take Profit</label>
                        <input
                            type="number"
                            step="0.01"
                            value={customScenario.tp1 || ''}
                            onChange={(e) => setCustomScenario({
                                ...customScenario,
                                tp1: e.target.value ? parseFloat(e.target.value) : undefined,
                            })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            placeholder={`${(entryPrice + riskPerShare * 2).toFixed(2)}`}
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Trailing Stop %</label>
                        <input
                            type="number"
                            step="1"
                            value={customScenario.trailing_stop_percent || ''}
                            onChange={(e) => setCustomScenario({
                                ...customScenario,
                                trailing_stop_percent: e.target.value ? parseFloat(e.target.value) : undefined,
                            })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            placeholder="10"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Max Days</label>
                        <input
                            type="number"
                            value={customScenario.max_holding_days || ''}
                            onChange={(e) => setCustomScenario({
                                ...customScenario,
                                max_holding_days: e.target.value ? parseInt(e.target.value) : undefined,
                            })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            placeholder="20"
                        />
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={runCustomScenario}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Play className="w-4 h-4" />
                        )}
                        Run Scenario
                    </button>
                    <button
                        onClick={() => {
                            setCustomScenario({
                                name: 'Custom Scenario',
                                stop_loss: trade.entry_stop_loss,
                                tp1: trade.entry_tp1,
                            });
                            setCustomResult(null);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Reset
                    </button>
                </div>

                {customResult && (
                    <div className="mt-4">
                        <ScenarioResult result={customResult} />
                    </div>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {/* Preset Scenarios */}
            {loading && presetResults.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
                </div>
            ) : presetResults.length > 0 ? (
                <div>
                    <h4 className="font-medium text-gray-900 mb-3">Preset Scenarios (sorted by R)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {presetResults.slice(0, 6).map((result, idx) => (
                            <ScenarioResult key={idx} result={result} />
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
