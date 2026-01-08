'use client';

import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, BarChart3 } from 'lucide-react';
import { getDistributions } from '@/app/benchmarking-actions';
import { DistributionData, DistributionBucket } from '@/lib/benchmarking/types';

interface RDistributionChartProps {
    dateRange?: { start: string; end: string };
}

function BarChart({ buckets, valueKey = 'count' }: { buckets: DistributionBucket[]; valueKey?: 'count' | 'percent' }) {
    const maxValue = Math.max(...buckets.map(b => valueKey === 'percent' ? b.percent : b.count));

    return (
        <div className="space-y-2">
            {buckets.map((bucket, idx) => {
                const value = valueKey === 'percent' ? bucket.percent : bucket.count;
                const width = maxValue > 0 ? (value / maxValue) * 100 : 0;
                const isPositive = bucket.range_start >= 0 || bucket.label.includes('+');
                const isNegative = bucket.range_end < 0 || bucket.label.includes('-');

                return (
                    <div key={idx} className="flex items-center gap-3">
                        <div className="w-24 text-xs text-gray-600 text-right">{bucket.label}</div>
                        <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden relative">
                            <div
                                className={`h-full rounded transition-all duration-300 ${
                                    isNegative ? 'bg-red-400' :
                                    isPositive ? 'bg-green-400' :
                                    'bg-gray-300'
                                }`}
                                style={{ width: `${width}%` }}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-700">
                                {bucket.count} ({bucket.percent.toFixed(1)}%)
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function StatsSummary({ data }: { data: DistributionData }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200">
            <div>
                <p className="text-xs text-gray-500">Mean</p>
                <p className="font-semibold text-gray-900">{data.mean.toFixed(2)}R</p>
            </div>
            <div>
                <p className="text-xs text-gray-500">Median</p>
                <p className="font-semibold text-gray-900">{data.median.toFixed(2)}R</p>
            </div>
            <div>
                <p className="text-xs text-gray-500">Std Dev</p>
                <p className="font-semibold text-gray-900">{data.std_dev.toFixed(2)}</p>
            </div>
            <div>
                <p className="text-xs text-gray-500">Skewness</p>
                <p className={`font-semibold ${data.skewness >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {data.skewness.toFixed(2)}
                </p>
            </div>
        </div>
    );
}

export function RDistributionChart({ dateRange }: RDistributionChartProps) {
    const [data, setData] = useState<DistributionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const result = await getDistributions({ dateRange });

                if (result.success && result.data?.r) {
                    setData(result.data.r);
                } else {
                    setError('No R distribution data available');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [dateRange]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <BarChart3 className="w-8 h-8 mb-2" />
                <p className="text-sm">{error || 'No data available'}</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-gray-900">R-Multiple Distribution</h4>
                <span className="text-sm text-gray-500">{data.count} trades</span>
            </div>

            <BarChart buckets={data.buckets} />

            <StatsSummary data={data} />

            {/* Percentiles */}
            <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2">Percentiles</p>
                <div className="flex flex-wrap gap-4 text-sm">
                    <span>P5: {data.percentiles.p5.toFixed(2)}R</span>
                    <span>P25: {data.percentiles.p25.toFixed(2)}R</span>
                    <span>P50: {data.percentiles.p50.toFixed(2)}R</span>
                    <span>P75: {data.percentiles.p75.toFixed(2)}R</span>
                    <span>P95: {data.percentiles.p95.toFixed(2)}R</span>
                </div>
            </div>
        </div>
    );
}
