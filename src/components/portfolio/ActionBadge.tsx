'use client';

import { PortfolioAction } from '@/lib/types';
import { 
    AlertTriangle, 
    TrendingUp, 
    PlusCircle, 
    Pause,
    DollarSign,
    XCircle
} from 'lucide-react';

interface ActionBadgeProps {
    action: PortfolioAction;
}

const actionConfig: Record<PortfolioAction, {
    label: string;
    className: string;
    icon: typeof AlertTriangle;
}> = {
    STOP_LOSS: {
        label: 'STOP LOSS',
        className: 'bg-red-100 text-red-700 border-red-200',
        icon: AlertTriangle,
    },
    CUT_LOSS: {
        label: 'CUT LOSS',
        className: 'bg-orange-100 text-orange-700 border-orange-200',
        icon: XCircle,
    },
    SELL_ALL: {
        label: 'SELL ALL',
        className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        icon: DollarSign,
    },
    TAKE_PROFIT: {
        label: 'TAKE PROFIT',
        className: 'bg-green-100 text-green-700 border-green-200',
        icon: TrendingUp,
    },
    ADD_MORE: {
        label: 'ADD MORE',
        className: 'bg-blue-100 text-blue-700 border-blue-200',
        icon: PlusCircle,
    },
    HOLD: {
        label: 'HOLD',
        className: 'bg-gray-100 text-gray-700 border-gray-200',
        icon: Pause,
    },
};

export function ActionBadge({ action }: ActionBadgeProps) {
    const config = actionConfig[action];
    const Icon = config.icon;

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full border ${config.className}`}>
            <Icon className="w-3.5 h-3.5" />
            {config.label}
        </span>
    );
}
