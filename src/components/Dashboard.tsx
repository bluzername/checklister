'use client';

import React from 'react';
import { AnalysisResult } from '@/lib/types';
import { CriteriaList } from './CriteriaList';
import { TradingViewChart } from './TradingViewChart';

export function Dashboard({ data }: { data: AnalysisResult }) {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-start">
                {/* Left Column: 10-Point Analysis */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900">
                            10-Point Swing Analysis: <span className="text-teal-600">{data.ticker}</span>
                        </h2>
                    </div>
                    <CriteriaList data={data} />
                </div>

                {/* Right Column: TradingView Chart */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900">
                            {data.ticker} Chart
                        </h2>
                    </div>
                    <div className="p-4">
                        <TradingViewChart symbol={data.ticker} />
                    </div>
                </div>
            </div>

            {/* Bottom Stats Bar */}
            <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                        <div className="text-sm text-gray-500 mb-1">Current Price</div>
                        <div className="text-2xl font-bold text-gray-900">${data.current_price.toFixed(2)}</div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-500 mb-1">Success Probability</div>
                        <div className="text-2xl font-bold text-teal-600">{data.success_probability}%</div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-500 mb-1">Recommendation</div>
                        <div className={`text-2xl font-bold ${
                            data.recommendation.includes('BUY') ? 'text-emerald-600' :
                            data.recommendation.includes('AVOID') ? 'text-red-600' : 'text-amber-600'
                        }`}>
                            {data.recommendation}
                        </div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-500 mb-1">Trade Type</div>
                        <div className="text-2xl font-bold text-gray-900">{data.trade_type.replace('_', ' ')}</div>
                    </div>
                </div>
            </div>

            {/* Disclaimer */}
            <div className="mt-6 text-center text-xs text-gray-400">
                {data.disclaimers.join(' • ')}
            </div>
        </div>
    );
}
