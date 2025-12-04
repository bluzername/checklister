'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Loader2, AlertCircle, CheckCircle, User, X, Mail } from 'lucide-react';
import { Dashboard } from '@/components/Dashboard';
import { getAnalysis } from './actions';
import { AnalysisResult, PortfolioPosition, WatchlistItem } from '@/lib/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { AuthModal } from '@/components/auth/AuthModal';
import { UserMenu } from '@/components/auth/UserMenu';
import { TabBar, TabType } from '@/components/tabs/TabBar';
import { PortfolioTab } from '@/components/tabs/PortfolioTab';
import { WatchlistTab } from '@/components/tabs/WatchlistTab';
import { MethodologyTab } from '@/components/tabs/MethodologyTab';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

// Wrapper component to provide Suspense for useSearchParams
export default function Home() {
    return (
        <Suspense fallback={<HomeLoading />}>
            <HomeContent />
        </Suspense>
    );
}

function HomeLoading() {
    return (
        <main className="min-h-screen bg-[#f8fafc]">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16 gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xl font-bold text-gray-900 hidden sm:block">SwingTrade Pro</span>
                        </div>
                        <div className="flex-1 max-w-md">
                            <div className="w-full h-10 bg-gray-100 rounded-xl animate-pulse" />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
                    </div>
                </div>
            </header>
            <div className="flex items-center justify-center min-h-[calc(100vh-120px)]">
                <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
            </div>
        </main>
    );
}

function HomeContent() {
    const { user, loading: authLoading } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [ticker, setTicker] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<AnalysisResult | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('analysis');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [resendEmail, setResendEmail] = useState('');
    const [resendLoading, setResendLoading] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);

    // Handle auth errors from URL params
    useEffect(() => {
        const authErrorParam = searchParams.get('auth_error');
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        
        if (authErrorParam) {
            setAuthError(decodeURIComponent(authErrorParam));
            // Clean up URL
            router.replace('/', { scroll: false });
        } else if (errorParam) {
            // Handle Supabase's direct error redirect (e.g., otp_expired)
            const message = errorDescription 
                ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
                : errorParam;
            setAuthError(message);
            // Clean up URL
            router.replace('/', { scroll: false });
        }
    }, [searchParams, router]);

    const handleResendVerification = async () => {
        if (!resendEmail || !isSupabaseConfigured()) return;
        
        setResendLoading(true);
        const supabase = createClient();
        
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: resendEmail,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/confirm`,
            },
        });
        
        setResendLoading(false);
        
        if (error) {
            setAuthError(error.message);
        } else {
            setResendSuccess(true);
        }
    };

    const dismissAuthError = () => {
        setAuthError(null);
        setResendEmail('');
        setResendSuccess(false);
    };

    const handleAnalyze = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ticker) return;

        setLoading(true);
        setError(null);
        setActiveTab('analysis');

        const result = await getAnalysis(ticker);

        if (result.success && result.data) {
            setData(result.data);
        } else {
            setError(result.error || "Failed to analyze ticker");
        }

        setLoading(false);
    };

    const handleNewAnalysis = () => {
        setData(null);
        setTicker('');
        setError(null);
    };

    const handleSelectPosition = (position: PortfolioPosition) => {
        if (position.analysis) {
            setData(position.analysis);
            setActiveTab('analysis');
        } else {
            setTicker(position.ticker);
            handleAnalyze({ preventDefault: () => {} } as React.FormEvent);
        }
    };

    const handleSelectWatchlistItem = (item: WatchlistItem) => {
        if (item.analysis) {
            setData(item.analysis);
            setActiveTab('analysis');
        } else {
            setTicker(item.ticker);
            handleAnalyze({ preventDefault: () => {} } as React.FormEvent);
        }
    };

    const handleAuthRequired = () => {
        setShowAuthModal(true);
    };

    const handleTabChange = (tab: TabType) => {
        setActiveTab(tab);
        if (tab !== 'analysis' && tab !== 'methodology') {
            setData(null);
        }
    };

    return (
        <main className="min-h-screen bg-[#f8fafc]">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16 gap-4">
                        {/* Logo */}
                        <div 
                            className="flex items-center gap-2 cursor-pointer flex-shrink-0"
                            onClick={handleNewAnalysis}
                        >
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xl font-bold text-gray-900 hidden sm:block">SwingTrade Pro</span>
                        </div>

                        {/* Search Bar */}
                        <form onSubmit={handleAnalyze} className="flex-1 max-w-md">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    value={ticker}
                                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                                    placeholder="Enter Ticker"
                                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                                />
                                {loading && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-teal-500 animate-spin" />
                                )}
                            </div>
                        </form>

                        {/* Auth Section */}
                        <div className="flex-shrink-0">
                            {authLoading ? (
                                <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
                            ) : user ? (
                                <UserMenu />
                            ) : (
                                <button
                                    onClick={() => setShowAuthModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition-colors"
                                >
                                    <User className="w-4 h-4" />
                                    <span className="hidden sm:inline">Sign In</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Tab Bar */}
            <TabBar 
                activeTab={activeTab} 
                onTabChange={handleTabChange}
                onAuthRequired={handleAuthRequired}
            />

            {/* Auth Error Banner */}
            {authError && (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
                    <div className="relative p-4 rounded-xl bg-amber-50 border border-amber-200">
                        <button
                            onClick={dismissAuthError}
                            className="absolute top-3 right-3 p-1 rounded-lg hover:bg-amber-100 transition-colors"
                        >
                            <X className="w-4 h-4 text-amber-600" />
                        </button>
                        
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h3 className="font-semibold text-amber-800 mb-1">
                                    Email Verification Issue
                                </h3>
                                <p className="text-amber-700 text-sm mb-3">
                                    {authError}
                                </p>
                                
                                {!resendSuccess ? (
                                    <div className="space-y-2">
                                        <p className="text-amber-600 text-xs">
                                            Enter your email to receive a new verification link:
                                        </p>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1 max-w-xs">
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" />
                                                <input
                                                    type="email"
                                                    value={resendEmail}
                                                    onChange={(e) => setResendEmail(e.target.value)}
                                                    placeholder="your@email.com"
                                                    className="w-full pl-9 pr-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
                                                />
                                            </div>
                                            <button
                                                onClick={handleResendVerification}
                                                disabled={!resendEmail || resendLoading}
                                                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                            >
                                                {resendLoading ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    'Resend'
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg">
                                        <CheckCircle className="w-4 h-4" />
                                        <span className="text-sm">
                                            Verification email sent! Check your inbox.
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
                    <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                </div>
            )}

            {/* Main Content */}
            {activeTab === 'portfolio' && user && (
                <PortfolioTab onSelectPosition={handleSelectPosition} />
            )}

            {activeTab === 'watchlist' && user && (
                <WatchlistTab onSelectItem={handleSelectWatchlistItem} />
            )}

            {activeTab === 'methodology' && (
                <MethodologyTab />
            )}

            {activeTab === 'analysis' && (
                <>
                    {!data ? (
                        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] p-8">
                            <div className="text-center space-y-6 max-w-lg">
                                <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
                                    <CheckCircle className="w-10 h-10 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                                        10-Point Swing Analysis
                                    </h1>
                                    <p className="text-gray-500">
                                        Enter a stock ticker above to get a comprehensive swing trading analysis with technical indicators and trading signals.
                                    </p>
                                </div>
                                <div className="flex flex-wrap justify-center gap-2 text-sm">
                                    {['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA'].map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => {
                                                setTicker(t);
                                            }}
                                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:border-teal-300 hover:text-teal-600 transition-colors"
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <Dashboard data={data} />
                    )}
                </>
            )}

            {/* Auth Modal */}
            <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
        </main>
    );
}
