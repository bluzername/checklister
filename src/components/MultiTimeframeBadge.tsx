'use client';

import React from 'react';

type TimeframeAlignment = 'STRONG_BUY' | 'BUY' | 'CONSIDER' | 'SKIP';
type MACDStatus = 'POSITIVE' | 'TURNING_POSITIVE' | 'NEGATIVE';

interface MultiTimeframeBadgeProps {
  dailyScore: number;
  hour4Score: number;
  combinedScore: number;
  alignment: TimeframeAlignment;
  macd4hStatus: MACDStatus;
  rsi4h: number;
  resistance4h: number;
  support4h: number;
  currentPrice?: number;
}

const alignmentConfig: Record<TimeframeAlignment, {
  label: string;
  emoji: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  description: string;
}> = {
  STRONG_BUY: {
    label: 'STRONG BUY',
    emoji: '🎯',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-300',
    description: 'Strong alignment across daily & 4H timeframes',
  },
  BUY: {
    label: 'BUY',
    emoji: '✅',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
    description: 'Good alignment - valid entry opportunity',
  },
  CONSIDER: {
    label: 'CONSIDER',
    emoji: '🤔',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    description: 'Moderate alignment - use tight risk management',
  },
  SKIP: {
    label: 'SKIP',
    emoji: '⏸️',
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-600',
    borderColor: 'border-gray-200',
    description: 'Timeframes not aligned - skip this trade',
  },
};

const macdStatusConfig: Record<MACDStatus, {
  color: string;
  label: string;
  icon: string;
}> = {
  POSITIVE: { color: 'text-emerald-600', label: 'Positive', icon: '↗️' },
  TURNING_POSITIVE: { color: 'text-amber-600', label: 'Turning Up', icon: '↗️' },
  NEGATIVE: { color: 'text-red-500', label: 'Negative', icon: '↘️' },
};

export function MultiTimeframeBadge({
  dailyScore,
  hour4Score,
  combinedScore,
  alignment,
  macd4hStatus,
  rsi4h,
  resistance4h,
  support4h,
  currentPrice,
}: MultiTimeframeBadgeProps) {
  const config = alignmentConfig[alignment];
  const macdConfig = macdStatusConfig[macd4hStatus];

  // Calculate distance to key levels
  const distToResistance = currentPrice && resistance4h 
    ? ((resistance4h - currentPrice) / currentPrice * 100).toFixed(1) 
    : null;
  const distToSupport = currentPrice && support4h 
    ? ((currentPrice - support4h) / currentPrice * 100).toFixed(1) 
    : null;

  // RSI status
  const rsiStatus = rsi4h >= 40 && rsi4h <= 70 
    ? { color: 'text-emerald-600', label: 'Optimal' }
    : rsi4h > 70 
      ? { color: 'text-amber-600', label: 'Overbought' }
      : { color: 'text-red-500', label: 'Oversold' };

  return (
    <div className={`rounded-xl border-2 ${config.borderColor} ${config.bgColor} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.emoji}</span>
          <span className={`font-bold ${config.textColor}`}>
            Multi-Timeframe: {config.label}
          </span>
        </div>
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <span>Combined:</span>
          <span className={`font-semibold ${config.textColor}`}>{combinedScore.toFixed(1)}/10</span>
        </div>
      </div>

      {/* Score Comparison */}
      <div className="grid grid-cols-2 gap-4">
        {/* Daily Score */}
        <div className="bg-white/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Daily Score</div>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold ${
              dailyScore >= 7.5 ? 'text-emerald-600' :
              dailyScore >= 6.0 ? 'text-amber-600' : 'text-red-500'
            }`}>
              {dailyScore.toFixed(1)}
            </span>
            <span className="text-gray-400">/10</span>
          </div>
          <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full ${
                dailyScore >= 7.5 ? 'bg-emerald-500' :
                dailyScore >= 6.0 ? 'bg-amber-500' : 'bg-red-400'
              }`}
              style={{ width: `${dailyScore * 10}%` }}
            />
          </div>
        </div>

        {/* 4H Score */}
        <div className="bg-white/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">4-Hour Score</div>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold ${
              hour4Score >= 6.0 ? 'text-emerald-600' :
              hour4Score >= 4.0 ? 'text-amber-600' : 'text-red-500'
            }`}>
              {hour4Score.toFixed(1)}
            </span>
            <span className="text-gray-400">/10</span>
          </div>
          <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full ${
                hour4Score >= 6.0 ? 'bg-emerald-500' :
                hour4Score >= 4.0 ? 'bg-amber-500' : 'bg-red-400'
              }`}
              style={{ width: `${hour4Score * 10}%` }}
            />
          </div>
        </div>
      </div>

      {/* 4H Indicators */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {/* MACD Status */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500">4H MACD:</span>
          <span className={`font-semibold ${macdConfig.color}`}>
            {macdConfig.icon} {macdConfig.label}
          </span>
        </div>

        {/* RSI */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500">4H RSI:</span>
          <span className={`font-semibold ${rsiStatus.color}`}>
            {rsi4h} ({rsiStatus.label})
          </span>
        </div>

        {/* Resistance */}
        {resistance4h > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500">4H Resistance:</span>
            <span className="font-semibold text-red-500">
              ${resistance4h.toFixed(2)}
              {distToResistance && <span className="text-xs text-gray-400"> (+{distToResistance}%)</span>}
            </span>
          </div>
        )}

        {/* Support */}
        {support4h > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500">4H Support:</span>
            <span className="font-semibold text-emerald-600">
              ${support4h.toFixed(2)}
              {distToSupport && <span className="text-xs text-gray-400"> (-{distToSupport}%)</span>}
            </span>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="text-xs text-gray-500 italic border-t border-gray-200 pt-2">
        {config.description}
      </div>
    </div>
  );
}

/**
 * Compact inline version
 */
export function MultiTimeframeBadgeCompact({
  alignment,
  combinedScore,
}: {
  alignment: TimeframeAlignment;
  combinedScore: number;
}) {
  const config = alignmentConfig[alignment];

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bgColor} ${config.borderColor} border`}>
      <span className="text-sm">{config.emoji}</span>
      <span className={`text-sm font-semibold ${config.textColor}`}>
        {alignment.replace('_', ' ')}
      </span>
      <span className="text-gray-400">|</span>
      <span className={`text-sm ${config.textColor}`}>
        {combinedScore.toFixed(1)}/10
      </span>
    </div>
  );
}




