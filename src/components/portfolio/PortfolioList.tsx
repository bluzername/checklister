'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw, Briefcase } from 'lucide-react';
import { PortfolioPosition } from '@/lib/types';
import { analyzePortfolio } from '@/app/portfolio-actions';
import { AddPositionForm } from './AddPositionForm';
import { PositionRow } from './PositionRow';

interface PortfolioListProps {
    onSelectPosition: (position: PortfolioPosition) => void;
}

export function PortfolioList({ onSelectPosition }: PortfolioListProps) {
    const [positions, setPositions] = useState<PortfolioPosition[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadPortfolio = useCallback(async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        else setLoading(true);
        
        const result = await analyzePortfolio();
        
        if (result.success) {
            setPositions(result.data || []);
            setError(null);
        } else {
            setError(result.error || 'Failed to load portfolio');
        }
        
        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => {
        loadPortfolio();
    }, [loadPortfolio]);

    const handleRefresh = () => {
        loadPortfolio(true);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <AddPositionForm onSuccess={() => loadPortfolio(true)} />
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    {error}
                </div>
            )}

            {/* Table */}
            {positions.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl">
                    <Briefcase className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No positions yet</h3>
                    <p className="text-gray-500 text-sm">Add your first position to start tracking your portfolio.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Ticker
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Entry
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Current
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    P/L
                                </th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-red-500 uppercase tracking-wider">
                                    Stop
                                </th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-emerald-600 uppercase tracking-wider">
                                    PT1
                                </th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-teal-600 uppercase tracking-wider">
                                    PT2
                                </th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-blue-600 uppercase tracking-wider">
                                    PT3
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Action
                                </th>
                                <th className="px-4 py-3 w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {positions.map((position) => (
                                <PositionRow
                                    key={position.id}
                                    position={position}
                                    onDelete={() => loadPortfolio(true)}
                                    onSelect={onSelectPosition}
                                    onUpdate={() => loadPortfolio(true)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Summary */}
            {positions.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="text-xs text-gray-500 mb-1">Total Positions</div>
                        <div className="text-xl font-bold text-gray-900">{positions.length}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="text-xs text-gray-500 mb-1">Hold</div>
                        <div className="text-xl font-bold text-gray-600">
                            {positions.filter(p => p.action === 'HOLD').length}
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="text-xs text-gray-500 mb-1">Action Needed</div>
                        <div className="text-xl font-bold text-amber-600">
                            {positions.filter(p => p.action && p.action !== 'HOLD').length}
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="text-xs text-gray-500 mb-1">Alerts</div>
                        <div className="text-xl font-bold text-red-600">
                            {positions.filter(p => p.action === 'STOP_LOSS' || p.action === 'CUT_LOSS').length}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

