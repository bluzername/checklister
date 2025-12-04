'use client';

import React from 'react';

type MarketRegime = 'BULL' | 'CHOPPY' | 'CRASH';
type VolatilityEnvironment = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';

interface RegimeBadgeProps {
  regime: MarketRegime;
  confidence: number;
  details: {
    spyAbove50SMA: boolean;
    spyAbove200SMA: boolean;
    vixLevel: number;
    trendStrength: number;
    volatilityEnvironment: VolatilityEnvironment;
  };
  thresholds?: {
    minEntryScore: number;
    minRRRatio: number;
    requireVolumeConfirm: boolean;
    requireMultiTimeframe: boolean;
    description: string;
  };
  regimeAdjusted?: boolean;
  originalScore?: number;
  currentScore?: number;
}

const regimeConfig: Record<MarketRegime, {
  label: string;
  emoji: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  description: string;
}> = {
  BULL: {
    label: 'BULL REGIME',
    emoji: '🟢',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    description: 'Favorable conditions for swing trading',
  },
  CHOPPY: {
    label: 'CHOPPY REGIME',
    emoji: '🟡',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    description: 'Elevated criteria - require confirmation',
  },
  CRASH: {
    label: 'CRASH REGIME',
    emoji: '🔴',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    description: 'Capital preservation mode - elite setups only',
  },
};

const vixConfig: Record<string, { color: string; label: string }> = {
  safe: { color: 'text-emerald-600', label: 'Low Fear' },
  elevated: { color: 'text-amber-600', label: 'Elevated' },
  extreme: { color: 'text-red-600', label: 'High Fear' },
};

export function RegimeBadge({
  regime,
  confidence,
  details,
  thresholds,
  regimeAdjusted,
  originalScore,
  currentScore,
}: RegimeBadgeProps) {
  const config = regimeConfig[regime];
  const vixStatus = details.vixLevel < 20 ? 'safe' : details.vixLevel < 25 ? 'elevated' : 'extreme';
  const vixStyle = vixConfig[vixStatus];

  return (
    <div className={`rounded-xl border-2 ${config.borderColor} ${config.bgColor} p-4 space-y-3`}>
      {/* Regime Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{config.emoji}</span>
          <span className={`font-bold text-lg ${config.textColor}`}>
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <span>Confidence:</span>
          <span className={`font-semibold ${config.textColor}`}>{confidence}%</span>
        </div>
      </div>

      {/* Market Indicators */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {/* VIX Level */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500">VIX:</span>
          <span className={`font-semibold ${vixStyle.color}`}>
            {details.vixLevel.toFixed(1)}
          </span>
          <span className={`text-xs ${vixStyle.color}`}>({vixStyle.label})</span>
        </div>

        {/* Trend Strength */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Trend:</span>
          <span className={`font-semibold ${
            details.trendStrength >= 7 ? 'text-emerald-600' :
            details.trendStrength >= 4 ? 'text-amber-600' : 'text-red-600'
          }`}>
            {details.trendStrength.toFixed(1)}/10
          </span>
        </div>

        {/* SPY vs 50 SMA */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500">SPY &gt; 50 SMA:</span>
          <span className={details.spyAbove50SMA ? 'text-emerald-600' : 'text-red-600'}>
            {details.spyAbove50SMA ? '✓' : '✗'}
          </span>
        </div>

        {/* SPY vs 200 SMA */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500">SPY &gt; 200 SMA:</span>
          <span className={details.spyAbove200SMA ? 'text-emerald-600' : 'text-red-600'}>
            {details.spyAbove200SMA ? '✓' : '✗'}
          </span>
        </div>
      </div>

      {/* Regime Thresholds */}
      {thresholds && (
        <div className="pt-2 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-2">Entry Criteria for {regime} Regime:</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Min Score:</span>
              <span className="font-semibold">{thresholds.minEntryScore}/10</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Min R:R:</span>
              <span className="font-semibold">{thresholds.minRRRatio}:1</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Volume Confirm:</span>
              <span className={thresholds.requireVolumeConfirm ? 'text-amber-600 font-semibold' : 'text-gray-400'}>
                {thresholds.requireVolumeConfirm ? 'Required' : 'Optional'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">4H Confirm:</span>
              <span className={thresholds.requireMultiTimeframe ? 'text-amber-600 font-semibold' : 'text-gray-400'}>
                {thresholds.requireMultiTimeframe ? 'Required' : 'Optional'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Score Adjustment Notice */}
      {regimeAdjusted && originalScore !== undefined && currentScore !== undefined && (
        <div className="pt-2 border-t border-gray-200">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-amber-600 font-semibold">⚠️ Score Adjusted:</span>
            <span className="text-gray-500">
              {originalScore.toFixed(0)}% → {currentScore.toFixed(0)}%
            </span>
            <span className="text-gray-400">(regime filter applied)</span>
          </div>
        </div>
      )}

      {/* Description */}
      <div className="text-xs text-gray-500 italic">
        {config.description}
      </div>
    </div>
  );
}

/**
 * Compact version for inline display
 */
export function RegimeBadgeCompact({
  regime,
  vixLevel,
}: {
  regime: MarketRegime;
  vixLevel: number;
}) {
  const config = regimeConfig[regime];
  const vixStatus = vixLevel < 20 ? 'safe' : vixLevel < 25 ? 'elevated' : 'extreme';
  const vixStyle = vixConfig[vixStatus];

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bgColor} ${config.borderColor} border`}>
      <span className="text-sm">{config.emoji}</span>
      <span className={`text-sm font-semibold ${config.textColor}`}>
        {regime}
      </span>
      <span className="text-gray-400">|</span>
      <span className={`text-sm ${vixStyle.color}`}>
        VIX: {vixLevel.toFixed(1)}
      </span>
    </div>
  );
}




