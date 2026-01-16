'use client';

import { useState } from 'react';
import { Loader2, ExternalLink, Check, X, DollarSign } from 'lucide-react';
import { skipSignal, processSignalToPosition } from '@/app/politician-actions';
import type { PoliticianSignal } from '@/lib/politician/types';

interface SignalQueueProps {
  signals: PoliticianSignal[];
  onSignalProcessed: () => void;
  onSelectTicker: (ticker: string) => void;
}

export function SignalQueue({ signals, onSignalProcessed, onSelectTicker }: SignalQueueProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showEntryForm, setShowEntryForm] = useState<string | null>(null);

  if (signals.length === 0) {
    return (
      <div className="p-6 text-center text-gray-400">
        No pending signals. Add a new signal to get started.
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-700">
      {signals.map((signal) => (
        <SignalRow
          key={signal.id}
          signal={signal}
          processing={processingId === signal.id}
          showEntryForm={showEntryForm === signal.id}
          onProcess={() => {
            setShowEntryForm(signal.id);
          }}
          onSkip={async (reason) => {
            setProcessingId(signal.id);
            await skipSignal(signal.id, reason);
            setProcessingId(null);
            onSignalProcessed();
          }}
          onConfirmEntry={async (entryPrice, shares, stopLoss) => {
            setProcessingId(signal.id);
            await processSignalToPosition(signal.id, entryPrice, shares, stopLoss);
            setProcessingId(null);
            setShowEntryForm(null);
            onSignalProcessed();
          }}
          onCancelEntry={() => setShowEntryForm(null)}
          onSelectTicker={onSelectTicker}
        />
      ))}
    </div>
  );
}

interface SignalRowProps {
  signal: PoliticianSignal;
  processing: boolean;
  showEntryForm: boolean;
  onProcess: () => void;
  onSkip: (reason?: string) => Promise<void>;
  onConfirmEntry: (entryPrice: number, shares: number, stopLoss?: number) => Promise<void>;
  onCancelEntry: () => void;
  onSelectTicker: (ticker: string) => void;
}

function SignalRow({
  signal,
  processing,
  showEntryForm,
  onProcess,
  onSkip,
  onConfirmEntry,
  onCancelEntry,
  onSelectTicker,
}: SignalRowProps) {
  const [entryPrice, setEntryPrice] = useState('');
  const [shares, setShares] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    const price = parseFloat(entryPrice);
    const qty = parseInt(shares);
    const stop = stopLoss ? parseFloat(stopLoss) : undefined;

    if (isNaN(price) || price <= 0) {
      setError('Invalid entry price');
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      setError('Invalid share quantity');
      return;
    }
    if (stop !== undefined && (isNaN(stop) || stop <= 0 || stop >= price)) {
      setError('Invalid stop loss');
      return;
    }

    setError(null);
    await onConfirmEntry(price, qty, stop);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const strengthColor = {
    STRONG: 'bg-green-500/20 text-green-400',
    MODERATE: 'bg-yellow-500/20 text-yellow-400',
    WEAK: 'bg-gray-500/20 text-gray-400',
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Ticker */}
          <button
            onClick={() => onSelectTicker(signal.ticker)}
            className="flex items-center gap-1 text-lg font-semibold text-blue-400 hover:text-blue-300 transition-colors"
          >
            {signal.ticker}
            <ExternalLink className="h-4 w-4" />
          </button>

          {/* Date */}
          <span className="text-sm text-gray-400">
            {formatDate(signal.signal_date)}
          </span>

          {/* Politician */}
          {signal.politician_name && (
            <span className="text-sm text-gray-300">
              {signal.politician_name}
            </span>
          )}

          {/* Transaction Type */}
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
            signal.transaction_type === 'BUY'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {signal.transaction_type}
          </span>

          {/* Amount */}
          {signal.amount_range && (
            <span className="flex items-center gap-1 text-sm text-gray-400">
              <DollarSign className="h-3 w-3" />
              {signal.amount_range}
            </span>
          )}

          {/* Strength */}
          {signal.strength && (
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${strengthColor[signal.strength]}`}>
              {signal.strength}
            </span>
          )}
        </div>

        {/* Actions */}
        {!showEntryForm && (
          <div className="flex items-center gap-2">
            {processing ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            ) : (
              <>
                <button
                  onClick={onProcess}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                >
                  <Check className="h-4 w-4" />
                  Process
                </button>
                <button
                  onClick={() => onSkip()}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-300 transition-colors"
                >
                  <X className="h-4 w-4" />
                  Skip
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Entry Form */}
      {showEntryForm && (
        <div className="mt-4 p-4 bg-gray-700/50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-200 mb-3">
            Open Position for {signal.ticker}
          </h4>

          {error && (
            <div className="mb-3 p-2 text-sm bg-red-500/10 border border-red-500/30 rounded text-red-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Entry Price *</label>
              <input
                type="number"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="0.00"
                step="0.01"
                className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-gray-100 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Shares *</label>
              <input
                type="number"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="100"
                step="1"
                className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-gray-100 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Stop Loss</label>
              <input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Optional"
                step="0.01"
                className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-gray-100 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={onCancelEntry}
              className="px-3 py-1.5 text-sm text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={processing}
              className="flex items-center gap-1 px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded transition-colors"
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              Open Position
            </button>
          </div>
        </div>
      )}

      {/* Raw message preview */}
      {signal.raw_message && (
        <div className="mt-2 text-xs text-gray-500 truncate">
          {signal.raw_message}
        </div>
      )}
    </div>
  );
}
