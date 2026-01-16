'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2,
  RefreshCw,
  TrendingUp,
  Landmark,
  Plus,
  BarChart3,
} from 'lucide-react';
import {
  getPoliticianSignals,
  getPoliticianPositions,
  getPerformanceSummary,
  evaluateOpenPositions,
} from '@/app/politician-actions';
import type {
  PoliticianSignal,
  PositionWithExitSignal,
  PerformanceSummary,
} from '@/lib/politician/types';
import { SignalQueue } from '@/components/politician/SignalQueue';
import { PositionList } from '@/components/politician/PositionList';
import { PerformanceSummaryCard } from '@/components/politician/PerformanceSummary';
import { SignalEntryForm } from '@/components/politician/SignalEntryForm';

interface PoliticianTabProps {
  onSelectTicker: (ticker: string) => void;
}

export function PoliticianTab({ onSelectTicker }: PoliticianTabProps) {
  const [signals, setSignals] = useState<PoliticianSignal[]>([]);
  const [positions, setPositions] = useState<PositionWithExitSignal[]>([]);
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddSignal, setShowAddSignal] = useState(false);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [signalsResult, positionsResult, perfResult] = await Promise.all([
        getPoliticianSignals('pending'),
        getPoliticianPositions('OPEN'),
        getPerformanceSummary(),
      ]);

      if (signalsResult.success) {
        setSignals(signalsResult.data || []);
      }

      if (positionsResult.success) {
        setPositions(positionsResult.data || []);
      }

      if (perfResult.success) {
        setPerformance(perfResult.data || null);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    loadData(true);
  };

  const handleEvaluateExits = async () => {
    setEvaluating(true);
    try {
      const result = await evaluateOpenPositions();
      if (result.success) {
        // Reload positions to get updated exit signals
        await loadData(true);
      } else {
        setError(result.error || 'Failed to evaluate exits');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed');
    }
    setEvaluating(false);
  };

  const handleSignalAdded = () => {
    setShowAddSignal(false);
    loadData(true);
  };

  const handleSignalProcessed = () => {
    loadData(true);
  };

  const handlePositionClosed = () => {
    loadData(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const pendingCount = signals.length;
  const openCount = positions.filter((p) => p.status === 'OPEN').length;
  const exitRecommendedCount = positions.filter((p) => p.should_exit).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Landmark className="h-6 w-6 text-purple-500" />
          <h2 className="text-xl font-semibold text-gray-100">Politician Trading</h2>
          {exitRecommendedCount > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-red-500/20 text-red-400 rounded-full">
              {exitRecommendedCount} exit signal{exitRecommendedCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEvaluateExits}
            disabled={evaluating || openCount === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            {evaluating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BarChart3 className="h-4 w-4" />
            )}
            Evaluate Exits
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Signal Queue Section */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            <h3 className="font-medium text-gray-100">
              Signal Queue
              {pendingCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
                  {pendingCount} pending
                </span>
              )}
            </h3>
          </div>
          <button
            onClick={() => setShowAddSignal(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Signal
          </button>
        </div>

        {showAddSignal && (
          <div className="p-4 border-b border-gray-700 bg-gray-800/30">
            <SignalEntryForm
              onSignalAdded={handleSignalAdded}
              onCancel={() => setShowAddSignal(false)}
            />
          </div>
        )}

        <SignalQueue
          signals={signals}
          onSignalProcessed={handleSignalProcessed}
          onSelectTicker={onSelectTicker}
        />
      </div>

      {/* Open Positions Section */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-purple-500" />
            <h3 className="font-medium text-gray-100">
              Open Positions
              {openCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded-full">
                  {openCount} open
                </span>
              )}
            </h3>
          </div>
        </div>

        <PositionList
          positions={positions}
          onPositionClosed={handlePositionClosed}
          onSelectTicker={onSelectTicker}
        />
      </div>

      {/* Performance Summary Section */}
      {performance && (
        <PerformanceSummaryCard
          summary={performance}
          onViewHistory={() => {
            // Could navigate to history view
          }}
        />
      )}
    </div>
  );
}
