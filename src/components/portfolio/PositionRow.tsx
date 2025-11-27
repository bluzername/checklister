'use client';

import { useState } from 'react';
import { Trash2, Loader2, TrendingUp, TrendingDown, Check } from 'lucide-react';
import { PortfolioPosition } from '@/lib/types';
import { deletePosition, recordSellAtPrice, SellPriceLevel } from '@/app/portfolio-actions';
import { ActionBadge } from './ActionBadge';
import { SellAtPriceModal, PriceLevel } from './SellAtPriceModal';

interface PositionRowProps {
    position: PortfolioPosition;
    onDelete: () => void;
    onSelect: (position: PortfolioPosition) => void;
    onUpdate: () => void;
}

interface PriceButtonProps {
    price: number | undefined;
    label: string;
    level: PriceLevel;
    soldShares?: number;
    isStopLoss?: boolean;
    currentPrice?: number;
    onClick: () => void;
    disabled?: boolean;
}

function PriceButton({ price, label, soldShares, isStopLoss, currentPrice, onClick, disabled }: PriceButtonProps) {
    if (!price) return <span className="text-gray-300 text-xs">--</span>;

    const isSold = soldShares && soldShares > 0;
    const isPriceHit = currentPrice && (isStopLoss ? currentPrice <= price : currentPrice >= price);
    
    const baseClasses = "group relative px-2 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer hover:scale-105";
    
    let colorClasses = "";
    if (isSold) {
        colorClasses = isStopLoss 
            ? "bg-red-100 text-red-700 border border-red-200" 
            : "bg-emerald-100 text-emerald-700 border border-emerald-200";
    } else if (isPriceHit) {
        colorClasses = isStopLoss
            ? "bg-red-50 text-red-600 border border-red-300 animate-pulse"
            : "bg-emerald-50 text-emerald-600 border border-emerald-300 animate-pulse";
    } else {
        colorClasses = isStopLoss 
            ? "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200" 
            : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200";
    }

    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            disabled={disabled}
            className={`${baseClasses} ${colorClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
            title={`${label}: $${price.toFixed(2)}${isSold ? ` (${soldShares} sold)` : ''}`}
        >
            <div className="flex items-center gap-1">
                {isSold && <Check className="w-3 h-3" />}
                <span>${price.toFixed(2)}</span>
            </div>
            {isSold && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-white border border-current rounded-full flex items-center justify-center text-[10px] font-bold">
                    {soldShares}
                </div>
            )}
        </button>
    );
}

export function PositionRow({ position, onDelete, onSelect, onUpdate }: PositionRowProps) {
    const [deleting, setDeleting] = useState(false);
    const [sellModal, setSellModal] = useState<{
        isOpen: boolean;
        priceLevel: PriceLevel;
        targetPrice: number;
    } | null>(null);

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

    const handleOpenSellModal = (priceLevel: PriceLevel, targetPrice: number) => {
        setSellModal({ isOpen: true, priceLevel, targetPrice });
    };

    const handleConfirmSell = async (sharesSold: number) => {
        if (!sellModal) return;
        
        const result = await recordSellAtPrice(
            position.id,
            sellModal.priceLevel as SellPriceLevel,
            sharesSold,
            sellModal.targetPrice
        );
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to record sale');
        }
        
        onUpdate();
    };

    const profitLoss = position.profit_loss ?? 0;
    const profitLossPercent = position.profit_loss_percent ?? 0;
    const isProfit = profitLoss >= 0;

    // Get trading plan data
    const tradingPlan = position.analysis?.trading_plan;
    const stopLossPrice = tradingPlan?.stop_loss?.price;
    const pt1Price = tradingPlan?.take_profit_levels?.[0]?.target_price;
    const pt2Price = tradingPlan?.take_profit_levels?.[1]?.target_price;
    const pt3Price = tradingPlan?.take_profit_levels?.[2]?.target_price;

    // Get sells data
    const sells = position.sells || {};
    const remainingShares = position.remaining_shares ?? position.quantity;
    const hasRemainingShares = remainingShares > 0;

    return (
        <>
            <tr 
                className="hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => onSelect(position)}
            >
                <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{position.ticker}</div>
                    <div className="text-xs text-gray-500">
                        {remainingShares} / {position.quantity} shares
                    </div>
                </td>
                <td className="px-4 py-3 text-right">
                    <div className="font-medium text-gray-900">${position.buy_price.toFixed(2)}</div>
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
                {/* Stop Loss */}
                <td className="px-3 py-3 text-center">
                    <PriceButton
                        price={stopLossPrice}
                        label="Stop Loss"
                        level="stop_loss"
                        soldShares={sells.stop_loss?.shares_sold}
                        isStopLoss={true}
                        currentPrice={position.current_price}
                        onClick={() => stopLossPrice && handleOpenSellModal('stop_loss', stopLossPrice)}
                        disabled={!hasRemainingShares}
                    />
                </td>
                {/* PT1 */}
                <td className="px-3 py-3 text-center">
                    <PriceButton
                        price={pt1Price}
                        label="PT1"
                        level="pt1"
                        soldShares={sells.pt1?.shares_sold}
                        currentPrice={position.current_price}
                        onClick={() => pt1Price && handleOpenSellModal('pt1', pt1Price)}
                        disabled={!hasRemainingShares}
                    />
                </td>
                {/* PT2 */}
                <td className="px-3 py-3 text-center">
                    <PriceButton
                        price={pt2Price}
                        label="PT2"
                        level="pt2"
                        soldShares={sells.pt2?.shares_sold}
                        currentPrice={position.current_price}
                        onClick={() => pt2Price && handleOpenSellModal('pt2', pt2Price)}
                        disabled={!hasRemainingShares}
                    />
                </td>
                {/* PT3 */}
                <td className="px-3 py-3 text-center">
                    <PriceButton
                        price={pt3Price}
                        label="PT3"
                        level="pt3"
                        soldShares={sells.pt3?.shares_sold}
                        currentPrice={position.current_price}
                        onClick={() => pt3Price && handleOpenSellModal('pt3', pt3Price)}
                        disabled={!hasRemainingShares}
                    />
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

            {/* Sell Modal */}
            {sellModal && (
                <SellAtPriceModal
                    isOpen={sellModal.isOpen}
                    onClose={() => setSellModal(null)}
                    onConfirm={handleConfirmSell}
                    priceLevel={sellModal.priceLevel}
                    targetPrice={sellModal.targetPrice}
                    remainingShares={remainingShares}
                    ticker={position.ticker}
                    currentPrice={position.current_price || position.buy_price}
                />
            )}
        </>
    );
}

