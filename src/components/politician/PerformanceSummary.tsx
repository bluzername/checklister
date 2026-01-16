'use client';

import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  Clock,
  Award,
  AlertOctagon,
  Timer,
} from 'lucide-react';
import type { PerformanceSummary } from '@/lib/politician/types';

interface PerformanceSummaryCardProps {
  summary: PerformanceSummary;
  onViewHistory?: () => void;
}

export function PerformanceSummaryCard({ summary, onViewHistory }: PerformanceSummaryCardProps) {
  const winRate = summary.total_trades > 0
    ? (summary.winners / summary.total_trades * 100)
    : 0;

  const signalExitWinRate = summary.signal_exits > 0 && summary.signal_exit_avg_r !== null
    ? (summary.signal_exit_avg_r > 0 ? 100 : 0) // Simplified - would need more data for true win rate
    : 0;

  const profitFactor = summary.losers > 0 && summary.winners > 0 && summary.avg_r !== null
    ? Math.abs((summary.signal_exit_avg_r ?? 0) / (summary.stop_loss_avg_r ?? -1))
    : 0;

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-500" />
          <h3 className="font-medium text-gray-100">Performance Summary</h3>
        </div>
        {onViewHistory && (
          <button
            onClick={onViewHistory}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            View History
          </button>
        )}
      </div>

      <div className="p-4">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Total Trades */}
          <StatCard
            icon={<Target className="h-5 w-5" />}
            label="Total Trades"
            value={summary.total_trades.toString()}
            subtext={`${summary.winners}W / ${summary.losers}L`}
            color="blue"
          />

          {/* Win Rate */}
          <StatCard
            icon={<Award className="h-5 w-5" />}
            label="Win Rate"
            value={`${winRate.toFixed(0)}%`}
            subtext={summary.total_trades > 0 ? `${summary.winners} winners` : 'No trades yet'}
            color={winRate >= 50 ? 'green' : 'red'}
          />

          {/* Average R */}
          <StatCard
            icon={summary.avg_r !== null && summary.avg_r >= 0
              ? <TrendingUp className="h-5 w-5" />
              : <TrendingDown className="h-5 w-5" />
            }
            label="Avg R"
            value={summary.avg_r !== null ? `${summary.avg_r >= 0 ? '+' : ''}${summary.avg_r.toFixed(2)}R` : 'N/A'}
            subtext={summary.total_pnl !== null
              ? `$${summary.total_pnl >= 0 ? '+' : ''}${summary.total_pnl.toFixed(0)} total`
              : 'No P&L data'
            }
            color={summary.avg_r !== null && summary.avg_r >= 0 ? 'green' : 'red'}
          />

          {/* Avg Holding Days */}
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="Avg Hold"
            value={summary.avg_holding_days !== null
              ? `${summary.avg_holding_days.toFixed(0)} days`
              : 'N/A'
            }
            subtext={`Target: 9-15 days`}
            color="purple"
          />
        </div>

        {/* Exit Breakdown */}
        <div className="border-t border-gray-700 pt-4">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Exit Breakdown</h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Signal Exit */}
            <ExitBreakdownCard
              icon={<BarChart3 className="h-4 w-4" />}
              label="ML Signal Exit"
              count={summary.signal_exits}
              avgR={summary.signal_exit_avg_r}
              color="purple"
              isGood={summary.signal_exit_avg_r !== null && summary.signal_exit_avg_r > 0}
            />

            {/* Stop Loss */}
            <ExitBreakdownCard
              icon={<AlertOctagon className="h-4 w-4" />}
              label="Stop Loss"
              count={summary.stop_losses}
              avgR={summary.stop_loss_avg_r}
              color="red"
              isGood={false}
            />

            {/* Time Exit */}
            <ExitBreakdownCard
              icon={<Timer className="h-4 w-4" />}
              label="Time Exit"
              count={summary.time_exits}
              avgR={summary.time_exit_avg_r}
              color="yellow"
              isGood={summary.time_exit_avg_r !== null && summary.time_exit_avg_r > 0}
            />
          </div>
        </div>

        {/* Open Positions Summary */}
        {summary.open_positions > 0 && (
          <div className="border-t border-gray-700 pt-4 mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Open Positions</span>
              <span className="text-gray-200">
                {summary.open_positions} positions
                {summary.open_unrealized_pnl !== null && (
                  <span className={summary.open_unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {' '}({summary.open_unrealized_pnl >= 0 ? '+' : ''}${summary.open_unrealized_pnl.toFixed(0)} unrealized)
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  color: 'blue' | 'green' | 'red' | 'purple' | 'yellow';
}

function StatCard({ icon, label, value, subtext, color }: StatCardProps) {
  const colorClasses = {
    blue: 'text-blue-500 bg-blue-500/10',
    green: 'text-green-500 bg-green-500/10',
    red: 'text-red-500 bg-red-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
    yellow: 'text-yellow-500 bg-yellow-500/10',
  };

  return (
    <div className="p-3 bg-gray-700/30 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded ${colorClasses[color]}`}>
          {icon}
        </div>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="text-xl font-semibold text-gray-100">{value}</div>
      {subtext && (
        <div className="text-xs text-gray-500 mt-1">{subtext}</div>
      )}
    </div>
  );
}

interface ExitBreakdownCardProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  avgR: number | null;
  color: 'purple' | 'red' | 'yellow' | 'green';
  isGood: boolean;
}

function ExitBreakdownCard({ icon, label, count, avgR, color, isGood }: ExitBreakdownCardProps) {
  const colorClasses = {
    purple: 'border-purple-500/30',
    red: 'border-red-500/30',
    yellow: 'border-yellow-500/30',
    green: 'border-green-500/30',
  };

  const iconColorClasses = {
    purple: 'text-purple-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
    green: 'text-green-400',
  };

  return (
    <div className={`p-3 bg-gray-700/20 rounded border ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={iconColorClasses[color]}>{icon}</span>
        <span className="text-sm text-gray-300">{label}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-semibold text-gray-100">{count}</span>
        {avgR !== null && (
          <span className={`text-sm font-medium ${isGood ? 'text-green-400' : 'text-red-400'}`}>
            {avgR >= 0 ? '+' : ''}{avgR.toFixed(2)}R avg
          </span>
        )}
      </div>
    </div>
  );
}
