'use client';

import { useState } from 'react';
import {
  Loader2,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  X,
} from 'lucide-react';
import { closePosition, logExitIgnored } from '@/app/politician-actions';
import type { PositionWithExitSignal, ExitReason } from '@/lib/politician/types';

interface PositionListProps {
  positions: PositionWithExitSignal[];
  onPositionClosed: () => void;
  onSelectTicker: (ticker: string) => void;
}

export function PositionList({ positions, onPositionClosed, onSelectTicker }: PositionListProps) {
  const [closingId, setClosingId] = useState<string | null>(null);
  const [showCloseForm, setShowCloseForm] = useState<string | null>(null);

  const openPositions = positions.filter((p) => p.status === 'OPEN');

  if (openPositions.length === 0) {
    return (
      <div className="p-6 text-center text-gray-400">
        No open positions. Process a signal to open a position.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-xs text-gray-400 border-b border-gray-700">
            <th className="px-4 py-3 text-left font-medium">Ticker</th>
            <th className="px-4 py-3 text-right font-medium">Entry</th>
            <th className="px-4 py-3 text-right font-medium">Current</th>
            <th className="px-4 py-3 text-right font-medium">P&L</th>
            <th className="px-4 py-3 text-right font-medium">Days</th>
            <th className="px-4 py-3 text-right font-medium">R</th>
            <th className="px-4 py-3 text-center font-medium">Exit Signal</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {openPositions.map((position) => (
            <PositionRow
              key={position.id}
              position={position}
              closing={closingId === position.id}
              showCloseForm={showCloseForm === position.id}
              onShowClose={() => setShowCloseForm(position.id)}
              onClose={async (exitPrice, exitReason) => {
                setClosingId(position.id);
                await closePosition(position.id, { exit_price: exitPrice, exit_reason: exitReason });
                setClosingId(null);
                setShowCloseForm(null);
                onPositionClosed();
              }}
              onCancelClose={() => setShowCloseForm(null)}
              onIgnoreExit={async () => {
                await logExitIgnored(position.id);
              }}
              onSelectTicker={onSelectTicker}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PositionRowProps {
  position: PositionWithExitSignal;
  closing: boolean;
  showCloseForm: boolean;
  onShowClose: () => void;
  onClose: (exitPrice: number, exitReason: ExitReason) => Promise<void>;
  onCancelClose: () => void;
  onIgnoreExit: () => Promise<void>;
  onSelectTicker: (ticker: string) => void;
}

function PositionRow({
  position,
  closing,
  showCloseForm,
  onShowClose,
  onClose,
  onCancelClose,
  onIgnoreExit,
  onSelectTicker,
}: PositionRowProps) {
  const [exitPrice, setExitPrice] = useState(position.current_price?.toString() || '');
  const [exitReason, setExitReason] = useState<ExitReason>('MANUAL');
  const [error, setError] = useState<string | null>(null);

  const handleClose = async () => {
    const price = parseFloat(exitPrice);
    if (isNaN(price) || price <= 0) {
      setError('Invalid exit price');
      return;
    }
    setError(null);
    await onClose(price, exitReason);
  };

  const pnl = position.unrealized_pnl ?? 0;
  const pnlPercent = position.entry_price > 0
    ? ((position.current_price ?? position.entry_price) - position.entry_price) / position.entry_price * 100
    : 0;
  const r = position.unrealized_r ?? 0;

  const isProfitable = pnl >= 0;
  const shouldExit = position.should_exit;
  const exitProbability = position.exit_probability ?? 0;

  // Exit signal badge color
  const getExitBadgeClass = () => {
    if (!position.exit_probability) return 'bg-gray-600/50 text-gray-400';
    if (exitProbability >= 0.6) return 'bg-red-500/20 text-red-400';
    if (exitProbability >= 0.5) return 'bg-yellow-500/20 text-yellow-400';
    return 'bg-green-500/20 text-green-400';
  };

  const getExitIcon = () => {
    if (!position.exit_probability) return null;
    if (exitProbability >= 0.5) return <AlertTriangle className="h-3 w-3" />;
    return null;
  };

  return (
    <>
      <tr className={`hover:bg-gray-700/30 ${shouldExit ? 'bg-red-500/5' : ''}`}>
        {/* Ticker */}
        <td className="px-4 py-3">
          <button
            onClick={() => onSelectTicker(position.ticker)}
            className="flex items-center gap-1 font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            {position.ticker}
            <ExternalLink className="h-3 w-3" />
          </button>
        </td>

        {/* Entry Price */}
        <td className="px-4 py-3 text-right text-gray-300">
          ${position.entry_price.toFixed(2)}
        </td>

        {/* Current Price */}
        <td className="px-4 py-3 text-right text-gray-100">
          ${(position.current_price ?? position.entry_price).toFixed(2)}
        </td>

        {/* P&L */}
        <td className={`px-4 py-3 text-right font-medium ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
          <div className="flex items-center justify-end gap-1">
            {isProfitable ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span>{isProfitable ? '+' : ''}{pnlPercent.toFixed(1)}%</span>
          </div>
          <div className="text-xs text-gray-400">
            {isProfitable ? '+' : ''}${pnl.toFixed(0)}
          </div>
        </td>

        {/* Holding Days */}
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1 text-gray-300">
            <Clock className="h-3 w-3 text-gray-500" />
            {position.holding_days}
          </div>
        </td>

        {/* R Multiple */}
        <td className={`px-4 py-3 text-right font-medium ${r >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {r >= 0 ? '+' : ''}{r.toFixed(2)}R
        </td>

        {/* Exit Signal */}
        <td className="px-4 py-3">
          <div className="flex items-center justify-center">
            <span className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${getExitBadgeClass()}`}>
              {getExitIcon()}
              {position.exit_probability
                ? `${shouldExit ? 'EXIT' : 'HOLD'} ${(exitProbability * 100).toFixed(0)}%`
                : 'N/A'}
            </span>
          </div>
          {position.confidence && (
            <div className="text-center text-xs text-gray-500 mt-1">
              {position.confidence}
            </div>
          )}
        </td>

        {/* Actions */}
        <td className="px-4 py-3 text-right">
          {closing ? (
            <Loader2 className="h-5 w-5 animate-spin text-gray-400 ml-auto" />
          ) : (
            <div className="flex items-center justify-end gap-2">
              {shouldExit && (
                <button
                  onClick={onIgnoreExit}
                  className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
                  title="Ignore exit recommendation"
                >
                  Ignore
                </button>
              )}
              <button
                onClick={onShowClose}
                className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </td>
      </tr>

      {/* Close Form Row */}
      {showCloseForm && (
        <tr className="bg-gray-700/30">
          <td colSpan={8} className="px-4 py-4">
            <div className="max-w-lg mx-auto">
              <h4 className="text-sm font-medium text-gray-200 mb-3">
                Close Position: {position.ticker}
              </h4>

              {error && (
                <div className="mb-3 p-2 text-sm bg-red-500/10 border border-red-500/30 rounded text-red-400">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Exit Price</label>
                  <input
                    type="number"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    step="0.01"
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-gray-100 text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Exit Reason</label>
                  <select
                    value={exitReason}
                    onChange={(e) => setExitReason(e.target.value as ExitReason)}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-gray-100 text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="SIGNAL_EXIT">ML Signal Exit</option>
                    <option value="STOP_LOSS">Stop Loss</option>
                    <option value="TIME_EXIT">Time Exit</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={onCancelClose}
                  className="px-3 py-1.5 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClose}
                  disabled={closing}
                  className="flex items-center gap-1 px-4 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded transition-colors"
                >
                  {closing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Close Position
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}

      {/* Exit Reasons Row */}
      {position.exit_reasons && position.exit_reasons.length > 0 && !showCloseForm && (
        <tr className="bg-gray-800/30">
          <td colSpan={8} className="px-4 py-2">
            <div className="flex flex-wrap gap-2 text-xs">
              {position.exit_reasons.slice(0, 3).map((reason, i) => (
                <span key={i} className="px-2 py-1 bg-gray-700/50 text-gray-400 rounded">
                  {reason}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
