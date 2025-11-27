'use client';

import { useState } from 'react';
import { X, DollarSign, TrendingDown, Target, Loader2 } from 'lucide-react';

export type PriceLevel = 'stop_loss' | 'pt1' | 'pt2' | 'pt3';

interface SellAtPriceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (sharesSold: number) => Promise<void>;
    priceLevel: PriceLevel;
    targetPrice: number;
    remainingShares: number;
    ticker: string;
    currentPrice: number;
}

const levelConfig = {
    stop_loss: {
        label: 'Stop Loss',
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: TrendingDown,
        description: 'Record shares sold at stop loss level'
    },
    pt1: {
        label: 'PT1 (Take Profit 1)',
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        borderColor: 'border-emerald-200',
        icon: Target,
        description: 'First profit target reached'
    },
    pt2: {
        label: 'PT2 (Take Profit 2)',
        color: 'text-teal-600',
        bgColor: 'bg-teal-50',
        borderColor: 'border-teal-200',
        icon: Target,
        description: 'Second profit target reached'
    },
    pt3: {
        label: 'PT3 (Take Profit 3)',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        icon: Target,
        description: 'Third profit target reached'
    }
};

export function SellAtPriceModal({
    isOpen,
    onClose,
    onConfirm,
    priceLevel,
    targetPrice,
    remainingShares,
    ticker,
    currentPrice
}: SellAtPriceModalProps) {
    const [shares, setShares] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const config = levelConfig[priceLevel];
    const Icon = config.icon;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const shareCount = parseInt(shares, 10);
        if (isNaN(shareCount) || shareCount <= 0) {
            setError('Please enter a valid number of shares');
            return;
        }
        if (shareCount > remainingShares) {
            setError(`Cannot sell more than ${remainingShares} remaining shares`);
            return;
        }

        setLoading(true);
        try {
            await onConfirm(shareCount);
            setShares('');
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to record sale');
        } finally {
            setLoading(false);
        }
    };

    const handleSellAll = () => {
        setShares(remainingShares.toString());
    };

    if (!isOpen) return null;

    const shareCount = parseInt(shares, 10) || 0;
    const proceeds = shareCount * targetPrice;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />
            
            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in overflow-hidden">
                {/* Header */}
                <div className={`${config.bgColor} ${config.borderColor} border-b px-6 py-4`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-white/80`}>
                                <Icon className={`w-5 h-5 ${config.color}`} />
                            </div>
                            <div>
                                <h2 className={`text-lg font-bold ${config.color}`}>
                                    {config.label}
                                </h2>
                                <p className="text-sm text-gray-600">{ticker}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <p className="text-gray-600 text-sm">{config.description}</p>

                    {/* Price Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 rounded-xl p-4">
                            <div className="text-xs text-gray-500 mb-1">Target Price</div>
                            <div className={`text-xl font-bold ${config.color}`}>
                                ${targetPrice.toFixed(2)}
                            </div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <div className="text-xs text-gray-500 mb-1">Current Price</div>
                            <div className="text-xl font-bold text-gray-900">
                                ${currentPrice.toFixed(2)}
                            </div>
                        </div>
                    </div>

                    {/* Remaining Shares Info */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-amber-800 text-sm font-medium">
                                Remaining Shares
                            </span>
                            <span className="text-amber-900 font-bold">
                                {remainingShares}
                            </span>
                        </div>
                    </div>

                    {/* Shares Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Shares Sold
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                min="1"
                                max={remainingShares}
                                value={shares}
                                onChange={(e) => setShares(e.target.value)}
                                placeholder="Enter number of shares"
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-lg font-medium"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={handleSellAll}
                                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-medium text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            >
                                Sell All
                            </button>
                        </div>
                    </div>

                    {/* Proceeds Preview */}
                    {shareCount > 0 && (
                        <div className="bg-gray-900 rounded-xl p-4 text-white">
                            <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                                <DollarSign className="w-4 h-4" />
                                Estimated Proceeds
                            </div>
                            <div className="text-2xl font-bold">
                                ${proceeds.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-sm text-gray-400 mt-1">
                                {shareCount} shares × ${targetPrice.toFixed(2)}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !shares}
                            className={`flex-1 px-4 py-3 font-medium rounded-xl transition-colors flex items-center justify-center gap-2 ${
                                priceLevel === 'stop_loss'
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                            } disabled:opacity-50`}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Recording...
                                </>
                            ) : (
                                'Record Sale'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
