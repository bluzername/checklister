'use server';

import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import {
  evaluatePositionExit,
  evaluateMultiplePositions,
  getModelInfo,
} from '@/lib/politician/exit-evaluator';
import type {
  PoliticianSignal,
  NewSignalInput,
  PoliticianPosition,
  PositionWithExitSignal,
  OpenPositionInput,
  ClosePositionInput,
  ExitEvaluation,
  TradeLogEntry,
  LogEventInput,
  PerformanceSummary,
  ActionResult,
  TradeEventType,
} from '@/lib/politician/types';

// ============================================
// Signal Management
// ============================================

export async function getPoliticianSignals(
  status?: 'pending' | 'processed' | 'all'
): Promise<ActionResult<PoliticianSignal[]>> {
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
      .from('politician_signals')
      .select('*')
      .eq('user_id', user.id)
      .order('signal_date', { ascending: false });

    if (status === 'pending') {
      query = query.eq('processed', false);
    } else if (status === 'processed') {
      query = query.eq('processed', true);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as PoliticianSignal[] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function addPoliticianSignal(
  signal: NewSignalInput
): Promise<ActionResult<PoliticianSignal>> {
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
      .from('politician_signals')
      .insert({
        user_id: user.id,
        ticker: signal.ticker.toUpperCase(),
        signal_date: signal.signal_date,
        politician_name: signal.politician_name || null,
        transaction_type: signal.transaction_type,
        amount_range: signal.amount_range || null,
        source: signal.source || 'MANUAL',
        raw_message: signal.raw_message || null,
        strength: signal.strength || null,
        processed: false,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Log the signal received event
    await logTradeEvent({
      signal_id: data.id,
      event_type: 'SIGNAL_RECEIVED',
      event_data: {
        ticker: signal.ticker,
        politician_name: signal.politician_name,
        transaction_type: signal.transaction_type,
        amount_range: signal.amount_range,
        source: signal.source || 'MANUAL',
      },
    });

    return { success: true, data: data as PoliticianSignal };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function skipSignal(
  signalId: string,
  reason?: string
): Promise<ActionResult<void>> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Database not configured' };
    }
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Mark signal as processed
    const { error } = await supabase
      .from('politician_signals')
      .update({ processed: true })
      .eq('id', signalId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    // Log the skip
    await logTradeEvent({
      signal_id: signalId,
      event_type: 'SIGNAL_SKIPPED',
      event_data: { reason: reason || 'User skipped' },
      notes: reason,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// Position Management
// ============================================

export async function getPoliticianPositions(
  status?: 'OPEN' | 'CLOSED' | 'all'
): Promise<ActionResult<PositionWithExitSignal[]>> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Database not configured' };
    }
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Use the view that includes exit signals
    let query = supabase
      .from('politician_positions_with_exit_signal')
      .select('*')
      .eq('user_id', user.id)
      .order('entry_date', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      // Fallback to regular positions table if view doesn't exist
      const fallbackQuery = supabase
        .from('politician_positions')
        .select('*')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false });

      if (status && status !== 'all') {
        fallbackQuery.eq('status', status);
      }

      const fallbackResult = await fallbackQuery;
      if (fallbackResult.error) {
        return { success: false, error: fallbackResult.error.message };
      }

      // Add null exit signal fields
      const positionsWithNullSignal = (fallbackResult.data || []).map((p) => ({
        ...p,
        exit_probability: null,
        confidence: null,
        should_exit: null,
        exit_reasons: null,
        last_evaluation_date: null,
      }));

      return { success: true, data: positionsWithNullSignal as PositionWithExitSignal[] };
    }

    return { success: true, data: data as PositionWithExitSignal[] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function openPosition(
  input: OpenPositionInput
): Promise<ActionResult<PoliticianPosition>> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Database not configured' };
    }
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const initialRisk = input.stop_loss
      ? input.entry_price - input.stop_loss
      : null;

    const { data, error } = await supabase
      .from('politician_positions')
      .insert({
        user_id: user.id,
        signal_id: input.signal_id || null,
        ticker: input.ticker.toUpperCase(),
        entry_date: input.entry_date,
        entry_price: input.entry_price,
        shares: input.shares,
        stop_loss: input.stop_loss || null,
        initial_risk: initialRisk,
        status: 'OPEN',
        current_price: input.entry_price,
        unrealized_pnl: 0,
        unrealized_r: 0,
        holding_days: 0,
        high_water_mark: input.entry_price,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Mark signal as processed if provided
    if (input.signal_id) {
      await supabase
        .from('politician_signals')
        .update({ processed: true })
        .eq('id', input.signal_id)
        .eq('user_id', user.id);
    }

    // Log position opened
    await logTradeEvent({
      position_id: data.id,
      signal_id: input.signal_id,
      event_type: 'POSITION_OPENED',
      event_data: {
        ticker: input.ticker,
        entry_price: input.entry_price,
        shares: input.shares,
        stop_loss: input.stop_loss,
        initial_risk: initialRisk,
        position_value: input.entry_price * input.shares,
      },
    });

    return { success: true, data: data as PoliticianPosition };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function processSignalToPosition(
  signalId: string,
  entryPrice: number,
  shares: number,
  stopLoss?: number
): Promise<ActionResult<PoliticianPosition>> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Database not configured' };
    }
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get the signal
    const { data: signal, error: signalError } = await supabase
      .from('politician_signals')
      .select('*')
      .eq('id', signalId)
      .eq('user_id', user.id)
      .single();

    if (signalError || !signal) {
      return { success: false, error: 'Signal not found' };
    }

    // Create position
    return openPosition({
      signal_id: signalId,
      ticker: signal.ticker,
      entry_date: new Date().toISOString().split('T')[0],
      entry_price: entryPrice,
      shares: shares,
      stop_loss: stopLoss,
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function closePosition(
  positionId: string,
  input: ClosePositionInput
): Promise<ActionResult<PoliticianPosition>> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Database not configured' };
    }
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get current position
    const { data: position, error: posError } = await supabase
      .from('politician_positions')
      .select('*')
      .eq('id', positionId)
      .eq('user_id', user.id)
      .single();

    if (posError || !position) {
      return { success: false, error: 'Position not found' };
    }

    // Calculate realized P&L
    const realizedPnl = (input.exit_price - position.entry_price) * position.shares;
    const realizedR = position.initial_risk
      ? (input.exit_price - position.entry_price) / position.initial_risk
      : null;

    const entryDate = new Date(position.entry_date);
    const exitDate = input.exit_date ? new Date(input.exit_date) : new Date();
    const holdingDays = Math.floor((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

    const { data, error } = await supabase
      .from('politician_positions')
      .update({
        status: 'CLOSED',
        exit_date: input.exit_date || new Date().toISOString().split('T')[0],
        exit_price: input.exit_price,
        exit_reason: input.exit_reason,
        realized_pnl: realizedPnl,
        realized_r: realizedR,
        holding_days: holdingDays,
      })
      .eq('id', positionId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Log position closed
    await logTradeEvent({
      position_id: positionId,
      event_type: 'POSITION_CLOSED',
      event_data: {
        exit_price: input.exit_price,
        exit_reason: input.exit_reason,
        realized_pnl: realizedPnl,
        realized_r: realizedR,
        holding_days: holdingDays,
      },
      notes: input.notes,
    });

    return { success: true, data: data as PoliticianPosition };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// Exit Model Evaluation
// ============================================

export async function evaluateOpenPositions(): Promise<ActionResult<ExitEvaluation[]>> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Database not configured' };
    }
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get open positions
    const { data: positions, error: posError } = await supabase
      .from('politician_positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'OPEN');

    if (posError) {
      return { success: false, error: posError.message };
    }

    if (!positions || positions.length === 0) {
      return { success: true, data: [] };
    }

    const evaluations: ExitEvaluation[] = [];
    const today = new Date().toISOString().split('T')[0];

    // Evaluate each position
    for (const position of positions) {
      try {
        const result = await evaluatePositionExit(position as PoliticianPosition);

        // Store evaluation in database
        const { data: evalData, error: evalError } = await supabase
          .from('politician_exit_evaluations')
          .upsert({
            position_id: position.id,
            evaluation_date: today,
            exit_probability: result.exitProbability,
            confidence: result.confidence,
            should_exit: result.shouldExit,
            reasons: result.reasons,
            features: result.features,
          }, {
            onConflict: 'position_id,evaluation_date',
          })
          .select()
          .single();

        if (!evalError && evalData) {
          evaluations.push(evalData as ExitEvaluation);

          // Log exit recommendation if should_exit is true
          if (result.shouldExit) {
            await logTradeEvent({
              position_id: position.id,
              event_type: 'EXIT_RECOMMENDED',
              event_data: {
                exit_probability: result.exitProbability,
                confidence: result.confidence,
                reasons: result.reasons,
                current_price: position.current_price,
                unrealized_r: position.unrealized_r,
              },
            });
          }
        }

        // Rate limit
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error evaluating position ${position.id}:`, error);
      }
    }

    return { success: true, data: evaluations };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getLatestExitEvaluation(
  positionId: string
): Promise<ActionResult<ExitEvaluation>> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Database not configured' };
    }
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify ownership
    const { data: position } = await supabase
      .from('politician_positions')
      .select('id')
      .eq('id', positionId)
      .eq('user_id', user.id)
      .single();

    if (!position) {
      return { success: false, error: 'Position not found' };
    }

    const { data, error } = await supabase
      .from('politician_exit_evaluations')
      .select('*')
      .eq('position_id', positionId)
      .order('evaluation_date', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as ExitEvaluation };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// Price Updates (for cron job)
// ============================================

export async function updatePositionPrices(): Promise<ActionResult<number>> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Database not configured' };
    }

    // Use admin client for cron job
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    // Get all open positions
    const { data: positions, error: posError } = await supabase
      .from('politician_positions')
      .select('*')
      .eq('status', 'OPEN');

    if (posError) {
      return { success: false, error: posError.message };
    }

    if (!positions || positions.length === 0) {
      return { success: true, data: 0 };
    }

    let updatedCount = 0;

    // Update each position
    for (const position of positions) {
      try {
        // Fetch current price (use FMP or Yahoo)
        const { getQuote } = await import('@/lib/data-services/price-provider');
        const quote = await getQuote(position.ticker);

        if (!quote?.price) continue;

        const currentPrice = quote.price;
        const unrealizedPnl = (currentPrice - position.entry_price) * position.shares;
        const unrealizedR = position.initial_risk
          ? (currentPrice - position.entry_price) / position.initial_risk
          : null;

        const entryDate = new Date(position.entry_date);
        const holdingDays = Math.floor((Date.now() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

        const highWaterMark = Math.max(position.high_water_mark || position.entry_price, currentPrice);

        await supabase
          .from('politician_positions')
          .update({
            current_price: currentPrice,
            unrealized_pnl: unrealizedPnl,
            unrealized_r: unrealizedR,
            holding_days: holdingDays,
            high_water_mark: highWaterMark,
          })
          .eq('id', position.id);

        updatedCount++;

        // Rate limit
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error updating position ${position.id}:`, error);
      }
    }

    return { success: true, data: updatedCount };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// Trade Log
// ============================================

async function logTradeEvent(input: LogEventInput): Promise<void> {
  try {
    if (!isSupabaseConfigured()) return;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('politician_trade_log').insert({
      user_id: user.id,
      position_id: input.position_id || null,
      signal_id: input.signal_id || null,
      event_type: input.event_type,
      event_data: input.event_data,
      notes: input.notes || null,
    });
  } catch {
    // Log silently fails - not critical
  }
}

export async function getTradeLog(
  positionId?: string,
  limit: number = 100
): Promise<ActionResult<TradeLogEntry[]>> {
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
      .from('politician_trade_log')
      .select('*')
      .eq('user_id', user.id)
      .order('event_date', { ascending: false })
      .limit(limit);

    if (positionId) {
      query = query.eq('position_id', positionId);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as TradeLogEntry[] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function logExitIgnored(
  positionId: string,
  notes?: string
): Promise<ActionResult<void>> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Database not configured' };
    }
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get latest evaluation
    const { data: evaluation } = await supabase
      .from('politician_exit_evaluations')
      .select('*')
      .eq('position_id', positionId)
      .order('evaluation_date', { ascending: false })
      .limit(1)
      .single();

    await logTradeEvent({
      position_id: positionId,
      event_type: 'EXIT_IGNORED',
      event_data: {
        exit_probability: evaluation?.exit_probability,
        confidence: evaluation?.confidence,
        reasons: evaluation?.reasons,
        ignored_at: new Date().toISOString(),
      },
      notes,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// Performance Summary
// ============================================

export async function getPerformanceSummary(): Promise<ActionResult<PerformanceSummary>> {
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
      .from('politician_performance_summary')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      // Return default summary if no trades yet
      return {
        success: true,
        data: {
          user_id: user.id,
          total_trades: 0,
          winners: 0,
          losers: 0,
          avg_r: null,
          total_pnl: null,
          avg_holding_days: null,
          signal_exits: 0,
          signal_exit_avg_r: null,
          stop_losses: 0,
          stop_loss_avg_r: null,
          time_exits: 0,
          time_exit_avg_r: null,
          manual_exits: 0,
          open_positions: 0,
          open_unrealized_pnl: null,
        },
      };
    }

    return { success: true, data: data as PerformanceSummary };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// Model Info
// ============================================

export async function getExitModelInfo() {
  try {
    const info = getModelInfo();
    return { success: true, data: info };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
