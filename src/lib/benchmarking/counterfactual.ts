/**
 * Counterfactual Analyzer
 * Run "what-if" scenarios on trades to evaluate alternative strategies
 */

import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import {
    CompletedTrade,
    TradePricePoint,
    CounterfactualScenario,
    CounterfactualResult,
    OptimalExitResult,
} from './types';

// ============================================
// COUNTERFACTUAL ANALYSIS
// ============================================

/**
 * Run a counterfactual scenario on a trade
 * Simulates what would have happened with different parameters
 */
export async function runCounterfactual(
    tradeId: string,
    scenario: CounterfactualScenario
): Promise<{ success: boolean; data?: CounterfactualResult; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Get the trade
        const { data: trade, error: tradeError } = await supabase
            .from('completed_trades')
            .select('*')
            .eq('id', tradeId)
            .eq('user_id', user.id)
            .single();

        if (tradeError || !trade) {
            return { success: false, error: tradeError?.message || 'Trade not found' };
        }

        // Get price history for the trade
        const { data: priceHistory, error: priceError } = await supabase
            .from('trade_price_history')
            .select('*')
            .eq('trade_id', tradeId)
            .order('price_date', { ascending: true });

        if (priceError || !priceHistory || priceHistory.length === 0) {
            return { success: false, error: 'No price history available for this trade' };
        }

        // Apply scenario parameters (use trade defaults if not specified)
        const stopLoss = scenario.stop_loss ?? trade.entry_stop_loss;
        const tp1 = scenario.tp1 ?? trade.entry_tp1;
        const tp2 = scenario.tp2 ?? trade.entry_tp2;
        const tp3 = scenario.tp3 ?? trade.entry_tp3;
        const maxHoldingDays = scenario.max_holding_days;
        const trailingStopPercent = scenario.trailing_stop_percent;
        const trailingActivation = scenario.trailing_stop_activation;

        // Simulate the trade day by day
        let exitDate: string | undefined;
        let exitPrice: number | undefined;
        let exitReason: string = 'HELD';
        let trailingStop: number | undefined;
        let trailingActivated = false;

        const entryDate = new Date(trade.entry_date);

        for (const pricePoint of priceHistory as TradePricePoint[]) {
            const currentDate = new Date(pricePoint.price_date);
            const daysHeld = Math.floor((currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

            // Check max holding days
            if (maxHoldingDays && daysHeld >= maxHoldingDays) {
                exitDate = pricePoint.price_date;
                exitPrice = pricePoint.close_price;
                exitReason = 'MAX_HOLDING_DAYS';
                break;
            }

            // Check stop loss (check if low breached stop)
            if (stopLoss && pricePoint.low_price <= stopLoss) {
                exitDate = pricePoint.price_date;
                exitPrice = stopLoss; // Assume stop was hit at the stop price
                exitReason = 'STOP_LOSS';
                break;
            }

            // Check trailing stop
            if (trailingStopPercent) {
                const unrealizedGain = ((pricePoint.high_price - trade.entry_price) / trade.entry_price) * 100;

                // Activate trailing stop if threshold reached
                if (trailingActivation && unrealizedGain >= trailingActivation) {
                    trailingActivated = true;
                }

                // Update trailing stop if active (or no activation threshold)
                if (trailingActivated || !trailingActivation) {
                    const newTrailingStop = pricePoint.high_price * (1 - trailingStopPercent / 100);
                    if (!trailingStop || newTrailingStop > trailingStop) {
                        trailingStop = newTrailingStop;
                    }
                }

                // Check if trailing stop hit
                if (trailingStop && pricePoint.low_price <= trailingStop) {
                    exitDate = pricePoint.price_date;
                    exitPrice = trailingStop;
                    exitReason = 'TRAILING_STOP';
                    break;
                }
            }

            // Check TP3 (highest target first)
            if (tp3 && pricePoint.high_price >= tp3) {
                exitDate = pricePoint.price_date;
                exitPrice = tp3;
                exitReason = 'TP3';
                break;
            }

            // Check TP2
            if (tp2 && pricePoint.high_price >= tp2) {
                exitDate = pricePoint.price_date;
                exitPrice = tp2;
                exitReason = 'TP2';
                break;
            }

            // Check TP1
            if (tp1 && pricePoint.high_price >= tp1) {
                exitDate = pricePoint.price_date;
                exitPrice = tp1;
                exitReason = 'TP1';
                break;
            }
        }

        // If no exit triggered, use last available price
        if (!exitDate || !exitPrice) {
            const lastPrice = priceHistory[priceHistory.length - 1] as TradePricePoint;
            exitDate = lastPrice.price_date;
            exitPrice = lastPrice.close_price;
            exitReason = 'STILL_OPEN';
        }

        // Calculate metrics
        const holdingDays = Math.floor(
            (new Date(exitDate).getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const realizedPnl = (exitPrice - trade.entry_price) * trade.entry_shares;
        const realizedPnlPercent = ((exitPrice - trade.entry_price) / trade.entry_price) * 100;

        let realizedR = 0;
        if (trade.entry_stop_loss) {
            const riskPerShare = trade.entry_price - trade.entry_stop_loss;
            if (riskPerShare > 0) {
                realizedR = (exitPrice - trade.entry_price) / riskPerShare;
            }
        }

        // Calculate improvement vs actual
        const actualPnl = trade.total_realized_pnl || 0;
        const actualR = trade.realized_r || 0;
        const improvementVsActual = realizedPnl - actualPnl;
        const improvementRVsActual = realizedR - actualR;

        return {
            success: true,
            data: {
                scenario,
                exit_date: exitDate,
                exit_price: exitPrice,
                exit_reason: exitReason,
                realized_pnl: realizedPnl,
                realized_pnl_percent: realizedPnlPercent,
                realized_r: realizedR,
                holding_days: holdingDays,
                improvement_vs_actual: improvementVsActual,
                improvement_r_vs_actual: improvementRVsActual,
            },
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Compare multiple scenarios for a trade
 */
export async function compareScenarios(
    tradeId: string,
    scenarios: CounterfactualScenario[]
): Promise<{ success: boolean; data?: CounterfactualResult[]; error?: string }> {
    const results: CounterfactualResult[] = [];

    for (const scenario of scenarios) {
        const result = await runCounterfactual(tradeId, scenario);
        if (result.success && result.data) {
            results.push(result.data);
        }
    }

    // Sort by realized R descending
    results.sort((a, b) => b.realized_r - a.realized_r);

    return { success: true, data: results };
}

/**
 * Find the optimal exit point for a trade
 * Uses price history to determine when the trade could have exited for maximum profit
 */
export async function findOptimalExit(
    tradeId: string
): Promise<{ success: boolean; data?: OptimalExitResult; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Get the trade
        const { data: trade, error: tradeError } = await supabase
            .from('completed_trades')
            .select('*')
            .eq('id', tradeId)
            .eq('user_id', user.id)
            .single();

        if (tradeError || !trade) {
            return { success: false, error: tradeError?.message || 'Trade not found' };
        }

        // Get price history
        const { data: priceHistory, error: priceError } = await supabase
            .from('trade_price_history')
            .select('*')
            .eq('trade_id', tradeId)
            .order('price_date', { ascending: true });

        if (priceError || !priceHistory || priceHistory.length === 0) {
            return { success: false, error: 'No price history available' };
        }

        // Find the maximum high price and its date
        let maxHigh = trade.entry_price;
        let maxHighDate = trade.entry_date;

        for (const point of priceHistory as TradePricePoint[]) {
            if (point.high_price > maxHigh) {
                maxHigh = point.high_price;
                maxHighDate = point.price_date;
            }
        }

        // Calculate optimal metrics
        const maxPossiblePnl = (maxHigh - trade.entry_price) * trade.entry_shares;
        const maxPossiblePnlPercent = ((maxHigh - trade.entry_price) / trade.entry_price) * 100;

        let maxPossibleR = 0;
        if (trade.entry_stop_loss) {
            const riskPerShare = trade.entry_price - trade.entry_stop_loss;
            if (riskPerShare > 0) {
                maxPossibleR = (maxHigh - trade.entry_price) / riskPerShare;
            }
        }

        // Calculate MFE capture (how much of the move was captured)
        let mfeCapturePercent = 0;
        if (trade.blended_exit_price && maxHigh > trade.entry_price) {
            const totalMove = maxHigh - trade.entry_price;
            const capturedMove = trade.blended_exit_price - trade.entry_price;
            mfeCapturePercent = (capturedMove / totalMove) * 100;
        }

        // Gap between actual and optimal
        const actualR = trade.realized_r || 0;
        const actualVsOptimalGap = maxPossibleR - actualR;

        return {
            success: true,
            data: {
                optimal_exit_date: maxHighDate,
                optimal_exit_price: maxHigh,
                max_possible_pnl: maxPossiblePnl,
                max_possible_pnl_percent: maxPossiblePnlPercent,
                max_possible_r: maxPossibleR,
                mfe_capture_percent: mfeCapturePercent,
                actual_vs_optimal_gap: actualVsOptimalGap,
            },
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================
// PRESET SCENARIOS
// ============================================

/**
 * Generate common what-if scenarios based on trade parameters
 */
export function generatePresetScenarios(trade: CompletedTrade): CounterfactualScenario[] {
    const scenarios: CounterfactualScenario[] = [];

    // Base values
    const entryPrice = trade.entry_price;
    const stopLoss = trade.entry_stop_loss;
    const riskPerShare = stopLoss ? entryPrice - stopLoss : entryPrice * 0.05; // Default 5% risk

    // Scenario 1: Tighter stop (1/2 risk)
    if (stopLoss) {
        scenarios.push({
            name: 'Tighter Stop (0.5R)',
            description: 'What if stop loss was half the distance?',
            stop_loss: entryPrice - (riskPerShare * 0.5),
        });
    }

    // Scenario 2: Wider stop (2x risk)
    if (stopLoss) {
        scenarios.push({
            name: 'Wider Stop (2R)',
            description: 'What if stop loss was twice the distance?',
            stop_loss: entryPrice - (riskPerShare * 2),
        });
    }

    // Scenario 3: Different take profit levels
    scenarios.push({
        name: '2R Target Only',
        description: 'Exit at 2R with no partials',
        tp1: entryPrice + (riskPerShare * 2),
        tp2: undefined,
        tp3: undefined,
    });

    scenarios.push({
        name: '3R Target Only',
        description: 'Exit at 3R with no partials',
        tp1: entryPrice + (riskPerShare * 3),
        tp2: undefined,
        tp3: undefined,
    });

    // Scenario 4: Trailing stop variations
    scenarios.push({
        name: '10% Trailing Stop',
        description: 'Use 10% trailing stop from highs',
        trailing_stop_percent: 10,
    });

    scenarios.push({
        name: '15% Trailing (5% activation)',
        description: 'Trailing stop activates after 5% gain',
        trailing_stop_percent: 15,
        trailing_stop_activation: 5,
    });

    // Scenario 5: Time-based exits
    scenarios.push({
        name: '10 Day Hold',
        description: 'Force exit after 10 trading days',
        max_holding_days: 10,
    });

    scenarios.push({
        name: '20 Day Hold',
        description: 'Force exit after 20 trading days',
        max_holding_days: 20,
    });

    return scenarios;
}

/**
 * Run all preset scenarios for a trade
 */
export async function runAllPresetScenarios(
    tradeId: string
): Promise<{ success: boolean; data?: CounterfactualResult[]; bestScenario?: CounterfactualResult; error?: string }> {
    try {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not configured' };
        }
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Get the trade for preset generation
        const { data: trade, error: tradeError } = await supabase
            .from('completed_trades')
            .select('*')
            .eq('id', tradeId)
            .eq('user_id', user.id)
            .single();

        if (tradeError || !trade) {
            return { success: false, error: tradeError?.message || 'Trade not found' };
        }

        // Generate and run scenarios
        const scenarios = generatePresetScenarios(trade as CompletedTrade);
        const result = await compareScenarios(tradeId, scenarios);

        if (!result.success || !result.data) {
            return result;
        }

        // Find best scenario
        const bestScenario = result.data.length > 0 ? result.data[0] : undefined;

        return {
            success: true,
            data: result.data,
            bestScenario,
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
