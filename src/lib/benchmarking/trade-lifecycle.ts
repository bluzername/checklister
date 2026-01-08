/**
 * Trade Lifecycle Service
 * Manages the complete lifecycle of trades for benchmarking
 */

import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { AnalysisResult } from '@/lib/types';
import { FeatureVector } from '@/lib/backtest/types';
import {
    CompletedTrade,
    CreateTradeInput,
    RecordExitInput,
    PartialExit,
    TradeStatus,
    TradePricePoint,
} from './types';

// ============================================
// TRADE CREATION
// ============================================

/**
 * Create a new completed_trade record when a position is opened
 */
export async function createTrade(
    input: CreateTradeInput
): Promise<{ success: boolean; data?: CompletedTrade; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Extract entry context from analysis if provided
        const entryContext = input.analysis ? extractEntryContext(input.analysis) : {};

        const tradeData = {
            user_id: user.id,
            portfolio_id: input.portfolio_id || null,
            ticker: input.ticker.toUpperCase(),
            trade_type: input.trade_type || 'SWING_LONG',
            entry_date: input.entry_date,
            entry_price: input.entry_price,
            entry_shares: input.entry_shares,
            entry_value: input.entry_price * input.entry_shares,
            entry_stop_loss: input.entry_stop_loss || null,
            entry_tp1: input.entry_tp1 || null,
            entry_tp2: input.entry_tp2 || null,
            entry_tp3: input.entry_tp3 || null,
            entry_notes: input.entry_notes || null,
            tags: input.tags || [],
            is_paper_trade: input.is_paper_trade || false,
            remaining_shares: input.entry_shares,
            status: 'OPEN' as TradeStatus,
            partial_exits: [],
            // Set initial MFE/MAE to entry price
            mfe: input.entry_price,
            mae: input.entry_price,
            mfe_date: input.entry_date,
            mae_date: input.entry_date,
            ...entryContext,
        };

        const { data, error } = await supabase
            .from('completed_trades')
            .insert(tradeData)
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, data: data as CompletedTrade };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Extract entry context from analysis result
 */
function extractEntryContext(analysis: AnalysisResult): Partial<CompletedTrade> {
    const context: Partial<CompletedTrade> = {
        entry_probability: analysis.success_probability,
        entry_regime: analysis.market_regime?.regime,
        entry_sector: analysis.parameters?.['2_sector_condition']?.sector,
        entry_rr_ratio: analysis.trading_plan?.risk_reward_ratio
            ? parseFloat(analysis.trading_plan.risk_reward_ratio.split('/')[1]?.trim() || '0')
            : undefined,
    };

    // Extract stop loss and take profits from trading plan
    if (analysis.trading_plan) {
        context.entry_stop_loss = analysis.trading_plan.stop_loss?.price;
        const tps = analysis.trading_plan.take_profit_levels || [];
        if (tps[0]) context.entry_tp1 = tps[0].target_price;
        if (tps[1]) context.entry_tp2 = tps[1].target_price;
        if (tps[2]) context.entry_tp3 = tps[2].target_price;
    }

    // Extract feature vector if multi-timeframe data exists
    if (analysis.multi_timeframe || analysis.volume_profile || analysis.divergence) {
        context.entry_feature_vector = buildFeatureVector(analysis);
    }

    return context;
}

/**
 * Build a partial feature vector from analysis
 */
function buildFeatureVector(analysis: AnalysisResult): Partial<FeatureVector> {
    const fv: Partial<FeatureVector> = {};

    // Scores
    if (analysis.parameters) {
        const p = analysis.parameters;
        fv.score_market_condition = p['1_market_condition']?.score;
        fv.score_sector_condition = p['2_sector_condition']?.score;
        fv.score_company_condition = p['3_company_condition']?.score;
        fv.score_catalyst = p['4_catalyst']?.score;
        fv.score_patterns_gaps = p['5_patterns_gaps']?.score;
        fv.score_support_resistance = p['6_support_resistance']?.score;
        fv.score_price_movement = p['7_price_movement']?.score;
        fv.score_volume = p['8_volume']?.score;
        fv.score_ma_fibonacci = p['9_ma_fibonacci']?.score;
        fv.score_rsi = p['10_rsi']?.score;
        fv.rsi_value = p['10_rsi']?.value;
        fv.rvol = p['4_catalyst']?.rvol;
        fv.rr_ratio = p['6_support_resistance']?.risk_reward_ratio;
    }

    // Market regime
    if (analysis.market_regime) {
        fv.regime = analysis.market_regime.regime === 'BULL' ? 2 :
                    analysis.market_regime.regime === 'CHOPPY' ? 1 : 0;
        fv.regime_confidence = analysis.market_regime.confidence;
        fv.vix_level = analysis.market_regime.details?.vixLevel;
    }

    // Multi-timeframe
    if (analysis.multi_timeframe) {
        fv.mtf_daily_score = analysis.multi_timeframe.daily_score;
        fv.mtf_4h_score = analysis.multi_timeframe.hour4_score;
        fv.mtf_combined_score = analysis.multi_timeframe.combined_score;
    }

    // Volume profile
    if (analysis.volume_profile) {
        fv.obv_trend = analysis.volume_profile.obv_trending ? 1 : 0;
        fv.cmf_value = analysis.volume_profile.cmf_value;
    }

    // Divergence
    if (analysis.divergence) {
        fv.divergence_strength = analysis.divergence.strength;
    }

    return fv;
}

// ============================================
// PARTIAL EXITS
// ============================================

/**
 * Record a partial exit (sell) on a trade
 */
export async function recordPartialExit(
    input: RecordExitInput
): Promise<{ success: boolean; data?: CompletedTrade; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Get current trade
        const { data: trade, error: fetchError } = await supabase
            .from('completed_trades')
            .select('*')
            .eq('id', input.trade_id)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !trade) {
            return { success: false, error: fetchError?.message || 'Trade not found' };
        }

        // Validate shares
        if (input.shares > trade.remaining_shares) {
            return { success: false, error: `Cannot sell more than ${trade.remaining_shares} remaining shares` };
        }

        // Calculate P/L for this exit
        const pnl = (input.price - trade.entry_price) * input.shares;
        const pnlPercent = ((input.price - trade.entry_price) / trade.entry_price) * 100;
        const rMultiple = trade.entry_stop_loss
            ? (input.price - trade.entry_price) / (trade.entry_price - trade.entry_stop_loss)
            : undefined;

        // Create exit record
        const exitRecord: PartialExit = {
            date: input.date,
            price: input.price,
            shares: input.shares,
            reason: input.reason,
            pnl,
            pnl_percent: pnlPercent,
            r_multiple: rMultiple,
        };

        // Update trade
        const currentExits = trade.partial_exits || [];
        const newExits = [...currentExits, exitRecord];
        const newRemainingShares = trade.remaining_shares - input.shares;
        const newStatus: TradeStatus = newRemainingShares === 0 ? 'CLOSED' : 'PARTIALLY_CLOSED';

        // Calculate totals if fully closed
        let updateData: Record<string, unknown> = {
            partial_exits: newExits,
            remaining_shares: newRemainingShares,
            status: newStatus,
            exit_notes: input.notes || trade.exit_notes,
        };

        if (newStatus === 'CLOSED') {
            const metrics = calculateFinalMetrics(trade, newExits);
            updateData = { ...updateData, ...metrics };
        }

        const { data: updatedTrade, error: updateError } = await supabase
            .from('completed_trades')
            .update(updateData)
            .eq('id', input.trade_id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (updateError) {
            return { success: false, error: updateError.message };
        }

        return { success: true, data: updatedTrade as CompletedTrade };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Calculate final metrics when trade is fully closed
 */
function calculateFinalMetrics(
    trade: CompletedTrade,
    exits: PartialExit[]
): Partial<CompletedTrade> {
    // Calculate blended exit price (weighted average)
    let totalShares = 0;
    let totalValue = 0;
    let totalPnl = 0;
    let lastExitDate = '';

    for (const exit of exits) {
        totalShares += exit.shares;
        totalValue += exit.price * exit.shares;
        totalPnl += exit.pnl;
        if (exit.date > lastExitDate) lastExitDate = exit.date;
    }

    const blendedExitPrice = totalShares > 0 ? totalValue / totalShares : 0;
    const totalPnlPercent = ((blendedExitPrice - trade.entry_price) / trade.entry_price) * 100;

    // Calculate realized R
    let realizedR: number | undefined;
    if (trade.entry_stop_loss) {
        const riskPerShare = trade.entry_price - trade.entry_stop_loss;
        if (riskPerShare > 0) {
            realizedR = (blendedExitPrice - trade.entry_price) / riskPerShare;
        }
    }

    // Calculate holding days
    const entryDate = new Date(trade.entry_date);
    const exitDate = new Date(lastExitDate);
    const holdingDays = Math.ceil((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

    // Determine primary exit reason (from largest exit)
    const largestExit = exits.reduce((max, e) => e.shares > max.shares ? e : max, exits[0]);

    return {
        exit_date: lastExitDate,
        final_exit_price: blendedExitPrice,
        total_realized_pnl: totalPnl,
        total_realized_pnl_percent: totalPnlPercent,
        blended_exit_price: blendedExitPrice,
        realized_r: realizedR,
        holding_days: holdingDays,
        exit_reason: largestExit?.reason,
    };
}

// ============================================
// MFE/MAE TRACKING
// ============================================

/**
 * Update MFE (Max Favorable Excursion) and MAE (Max Adverse Excursion)
 */
export async function updateMFEMAE(
    tradeId: string,
    priceDate: string,
    highPrice: number,
    lowPrice: number
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Get current trade
        const { data: trade, error: fetchError } = await supabase
            .from('completed_trades')
            .select('*')
            .eq('id', tradeId)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !trade) {
            return { success: false, error: fetchError?.message || 'Trade not found' };
        }

        // Only update open trades
        if (trade.status === 'CLOSED') {
            return { success: true }; // No update needed
        }

        const updateData: Record<string, unknown> = {};

        // Update MFE if new high
        if (highPrice > (trade.mfe || 0)) {
            updateData.mfe = highPrice;
            updateData.mfe_date = priceDate;
            if (trade.entry_stop_loss) {
                const riskPerShare = trade.entry_price - trade.entry_stop_loss;
                if (riskPerShare > 0) {
                    updateData.mfe_r = (highPrice - trade.entry_price) / riskPerShare;
                }
            }
        }

        // Update MAE if new low
        if (lowPrice < (trade.mae || Infinity)) {
            updateData.mae = lowPrice;
            updateData.mae_date = priceDate;
            if (trade.entry_stop_loss) {
                const riskPerShare = trade.entry_price - trade.entry_stop_loss;
                if (riskPerShare > 0) {
                    updateData.mae_r = (lowPrice - trade.entry_price) / riskPerShare;
                }
            }
        }

        if (Object.keys(updateData).length === 0) {
            return { success: true }; // No update needed
        }

        const { error: updateError } = await supabase
            .from('completed_trades')
            .update(updateData)
            .eq('id', tradeId)
            .eq('user_id', user.id);

        if (updateError) {
            return { success: false, error: updateError.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// PRICE HISTORY
// ============================================

/**
 * Record a price point in trade_price_history
 */
export async function recordPricePoint(
    tradeId: string,
    pricePoint: Omit<TradePricePoint, 'id' | 'trade_id'>
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { error } = await supabase
            .from('trade_price_history')
            .upsert({
                trade_id: tradeId,
                ...pricePoint,
            }, {
                onConflict: 'trade_id,price_date',
            });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Get price history for a trade
 */
export async function getPriceHistory(
    tradeId: string
): Promise<{ success: boolean; data?: TradePricePoint[]; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data, error } = await supabase
            .from('trade_price_history')
            .select('*')
            .eq('trade_id', tradeId)
            .order('price_date', { ascending: true });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, data: data as TradePricePoint[] };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// TRADE QUERIES
// ============================================

/**
 * Get a single trade by ID
 */
export async function getTrade(
    tradeId: string
): Promise<{ success: boolean; data?: CompletedTrade; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data, error } = await supabase
            .from('completed_trades')
            .select('*')
            .eq('id', tradeId)
            .eq('user_id', user.id)
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, data: data as CompletedTrade };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Get all trades for the current user
 */
export async function getTrades(options?: {
    status?: TradeStatus[];
    ticker?: string;
    limit?: number;
    offset?: number;
}): Promise<{ success: boolean; data?: CompletedTrade[]; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        let query = supabase
            .from('completed_trades')
            .select('*')
            .eq('user_id', user.id)
            .order('entry_date', { ascending: false });

        if (options?.status && options.status.length > 0) {
            query = query.in('status', options.status);
        }

        if (options?.ticker) {
            query = query.eq('ticker', options.ticker.toUpperCase());
        }

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
        }

        const { data, error } = await query;

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, data: data as CompletedTrade[] };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Get trade by portfolio position ID
 */
export async function getTradeByPortfolioId(
    portfolioId: string
): Promise<{ success: boolean; data?: CompletedTrade; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data, error } = await supabase
            .from('completed_trades')
            .select('*')
            .eq('portfolio_id', portfolioId)
            .eq('user_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') { // Not found is ok
            return { success: false, error: error.message };
        }

        return { success: true, data: data as CompletedTrade | undefined };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// TRADE UPDATES
// ============================================

/**
 * Update trade tags
 */
export async function updateTradeTags(
    tradeId: string,
    tags: string[]
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        const { error } = await supabase
            .from('completed_trades')
            .update({ tags })
            .eq('id', tradeId)
            .eq('user_id', user.id);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Update trade notes
 */
export async function updateTradeNotes(
    tradeId: string,
    entryNotes?: string,
    exitNotes?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        const updateData: Record<string, unknown> = {};
        if (entryNotes !== undefined) updateData.entry_notes = entryNotes;
        if (exitNotes !== undefined) updateData.exit_notes = exitNotes;

        const { error } = await supabase
            .from('completed_trades')
            .update(updateData)
            .eq('id', tradeId)
            .eq('user_id', user.id);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Delete a trade (use with caution)
 */
export async function deleteTrade(
    tradeId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        const { error } = await supabase
            .from('completed_trades')
            .delete()
            .eq('id', tradeId)
            .eq('user_id', user.id);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
