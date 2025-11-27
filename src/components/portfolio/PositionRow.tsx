'use client';

import { useState } from 'react';
import { Trash2, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { PortfolioPosition } from '@/lib/types';
import { deletePosition } from '@/app/portfolio-actions';
import { ActionBadge } from './ActionBadge';

interface PositionRowProps {
    position: PortfolioPosition;
    onDelete: () => void;
    onSelect: (position: PortfolioPosition) => void;
}

export function PositionRow({ position, onDelete, onSelect }: PositionRowProps) {
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Remove ${position.ticker} from your portfolio?`)) return;
        
        setDeleting(true);
        const result = await deletePosition(position.id);
        if (result.success) {
            onDelete();
        } else {
            alert(result.error || 'Failed to delete position');
        }
        setDeleting(false);
    };

    const profitLoss = position.profit_loss ?? 0;
    const profitLossPercent = position.profit_loss_percent ?? 0;
    const isProfit = profitLoss >= 0;

    return (
        <tr 
            className="hover:bg-gray-50 transition-colors cursor-pointer"
            onClick={() => onSelect(position)}
        >
            <td className="px-4 py-3">
                <div className="font-semibold text-gray-900">{position.ticker}</div>
                {position.notes && (
                    <div className="text-xs text-gray-500 truncate max-w-[150px]">{position.notes}</div>
                )}
            </td>
            <td className="px-4 py-3 text-right">
                <div className="font-medium text-gray-900">${position.buy_price.toFixed(2)}</div>
                <div className="text-xs text-gray-500">{position.quantity} shares</div>
            </td>
            <td className="px-4 py-3 text-right">
                {position.current_price ? (
                    <div className="font-medium text-gray-900">${position.current_price.toFixed(2)}</div>
                ) : (
                    <div className="text-gray-400">--</div>
                )}
            </td>
            <td className="px-4 py-3 text-right">
                {position.current_price ? (
                    <div className={`flex items-center justify-end gap-1 ${isProfit ? 'text-emerald-600' : 'text-red-600'}`}>
                        {isProfit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        <span className="font-medium">
                            {isProfit ? '+' : ''}{profitLossPercent.toFixed(2)}%
                        </span>
                    </div>
                ) : (
                    <div className="text-gray-400">--</div>
                )}
            </td>
            <td className="px-4 py-3">
                {position.action ? (
                    <ActionBadge action={position.action} />
                ) : (
                    <span className="text-gray-400 text-sm">Analyzing...</span>
                )}
            </td>
            <td className="px-4 py-3">
                <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
            </td>
        </tr>
    );
}

