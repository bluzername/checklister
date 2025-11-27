'use client';

import React, { useEffect, useRef } from 'react';

interface TradingViewChartProps {
    symbol: string;
}

export function TradingViewChart({ symbol }: TradingViewChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Clear any existing content
        containerRef.current.innerHTML = '';

        // Create the TradingView widget
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        script.type = 'text/javascript';
        script.async = true;
        script.innerHTML = JSON.stringify({
            width: '100%',
            height: 700,
            symbol: symbol,
            interval: 'D',
            timezone: 'Etc/UTC',
            theme: 'light',
            style: '1',
            locale: 'en',
            enable_publishing: false,
            allow_symbol_change: false,
            calendar: false,
            hide_top_toolbar: false,
            hide_legend: false,
            save_image: false,
            support_host: 'https://www.tradingview.com',
        });

        const widgetContainer = document.createElement('div');
        widgetContainer.className = 'tradingview-widget-container__widget';
        widgetContainer.style.height = '700px';
        widgetContainer.style.width = '100%';

        containerRef.current.appendChild(widgetContainer);
        containerRef.current.appendChild(script);

        return () => {
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
        };
    }, [symbol]);

    return (
        <div 
            ref={containerRef}
            className="tradingview-widget-container"
            style={{ height: '700px', width: '100%' }}
        />
    );
}
