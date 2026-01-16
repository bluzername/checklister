'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { addPoliticianSignal } from '@/app/politician-actions';
import type { TransactionType, SignalStrength } from '@/lib/politician/types';

interface SignalEntryFormProps {
  onSignalAdded: () => void;
  onCancel: () => void;
}

export function SignalEntryForm({ onSignalAdded, onCancel }: SignalEntryFormProps) {
  const [ticker, setTicker] = useState('');
  const [signalDate, setSignalDate] = useState(new Date().toISOString().split('T')[0]);
  const [politicianName, setPoliticianName] = useState('');
  const [transactionType, setTransactionType] = useState<TransactionType>('BUY');
  const [amountRange, setAmountRange] = useState('');
  const [strength, setStrength] = useState<SignalStrength>('MODERATE');
  const [rawMessage, setRawMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim()) {
      setError('Ticker is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await addPoliticianSignal({
      ticker: ticker.toUpperCase().trim(),
      signal_date: signalDate,
      politician_name: politicianName.trim() || undefined,
      transaction_type: transactionType,
      amount_range: amountRange.trim() || undefined,
      strength,
      raw_message: rawMessage.trim() || undefined,
    });

    if (result.success) {
      onSignalAdded();
    } else {
      setError(result.error || 'Failed to add signal');
    }

    setSubmitting(false);
  };

  const amountOptions = [
    '$1K-$15K',
    '$15K-$50K',
    '$50K-$100K',
    '$100K-$250K',
    '$250K-$500K',
    '$500K-$1M',
    '$1M-$5M',
    '$5M+',
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-200">Add New Signal</h4>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-300"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {error && (
        <div className="p-2 text-sm bg-red-500/10 border border-red-500/30 rounded text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Ticker */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Ticker *</label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="NVDA"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:border-purple-500"
            maxLength={10}
          />
        </div>

        {/* Signal Date */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Signal Date</label>
          <input
            type="date"
            value={signalDate}
            onChange={(e) => setSignalDate(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Transaction Type */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Type</label>
          <select
            value={transactionType}
            onChange={(e) => setTransactionType(e.target.value as TransactionType)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:border-purple-500"
          >
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </div>

        {/* Strength */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Strength</label>
          <select
            value={strength}
            onChange={(e) => setStrength(e.target.value as SignalStrength)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:border-purple-500"
          >
            <option value="STRONG">STRONG</option>
            <option value="MODERATE">MODERATE</option>
            <option value="WEAK">WEAK</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Politician Name */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Politician Name</label>
          <input
            type="text"
            value={politicianName}
            onChange={(e) => setPoliticianName(e.target.value)}
            placeholder="Nancy Pelosi"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Amount Range */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Amount Range</label>
          <select
            value={amountRange}
            onChange={(e) => setAmountRange(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:border-purple-500"
          >
            <option value="">Select...</option>
            {amountOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Raw Message */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Raw Message (optional)</label>
        <textarea
          value={rawMessage}
          onChange={(e) => setRawMessage(e.target.value)}
          placeholder="Paste the original signal message here for reference..."
          rows={2}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:border-purple-500 resize-none"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !ticker.trim()}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Add Signal
        </button>
      </div>
    </form>
  );
}
