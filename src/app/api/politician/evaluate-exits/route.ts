import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  evaluatePositionExit,
  getModelInfo,
} from '@/lib/politician/exit-evaluator';
import type { PoliticianPosition } from '@/lib/politician/types';

/**
 * Cron job endpoint to evaluate exit signals for all open positions
 *
 * This should be called daily at market close (4 PM ET)
 * Configure in vercel.json or your cron service
 */
export async function GET(request: Request) {
  // Verify cron secret for Vercel
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow in development without secret
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const supabase = createAdminClient();

    // Get all open positions across all users
    const { data: positions, error: posError } = await supabase
      .from('politician_positions')
      .select('*')
      .eq('status', 'OPEN');

    if (posError) {
      return NextResponse.json({ error: posError.message }, { status: 500 });
    }

    if (!positions || positions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No open positions to evaluate',
        evaluated: 0,
      });
    }

    const today = new Date().toISOString().split('T')[0];
    let evaluatedCount = 0;
    let errorCount = 0;
    const exitRecommendations: string[] = [];

    // Evaluate each position
    for (const position of positions) {
      try {
        const result = await evaluatePositionExit(position as PoliticianPosition);

        // Store evaluation in database
        const { error: evalError } = await supabase
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
          });

        if (!evalError) {
          evaluatedCount++;

          // Track exit recommendations for summary
          if (result.shouldExit) {
            exitRecommendations.push(`${position.ticker} (${(result.exitProbability * 100).toFixed(0)}%)`);

            // Log exit recommendation event
            await supabase.from('politician_trade_log').insert({
              user_id: position.user_id,
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

        // Rate limit: 200ms between API calls
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error evaluating position ${position.id} (${position.ticker}):`, error);
        errorCount++;
      }
    }

    const modelInfo = getModelInfo();

    return NextResponse.json({
      success: true,
      evaluated: evaluatedCount,
      errors: errorCount,
      exitRecommendations,
      model: {
        version: modelInfo.version,
        auc: modelInfo.auc,
      },
    });
  } catch (error) {
    console.error('Error in evaluate-exits cron:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export async function POST(request: Request) {
  return GET(request);
}
