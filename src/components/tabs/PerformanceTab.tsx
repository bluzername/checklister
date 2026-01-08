'use client';

import { BenchmarkingDashboard } from '@/components/benchmarking/BenchmarkingDashboard';

export function PerformanceTab() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Performance</h1>
                <p className="text-gray-500 text-sm">Track your trading performance and analyze trade outcomes.</p>
            </div>
            <BenchmarkingDashboard />
        </div>
    );
}
