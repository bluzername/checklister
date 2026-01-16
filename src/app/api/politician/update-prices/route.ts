import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getQuote } from '@/lib/data-services/price-provider';

/**
 * Cron job endpoint to update prices for all open positions
 *
 * This should be called hourly during market hours
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
        message: 'No open positions to update',
        updated: 0,
      });
    }

    let updatedCount = 0;
    let errorCount = 0;
    const updates: Array<{ ticker: string; oldPrice: number; newPrice: number; change: number }> = [];

    // Update each position
    for (const position of positions) {
      try {
        // Fetch current price
        const quote = await getQuote(position.ticker);

        if (!quote?.price) {
          errorCount++;
          continue;
        }

        const currentPrice = quote.price;
        const oldPrice = position.current_price || position.entry_price;
        const unrealizedPnl = (currentPrice - position.entry_price) * position.shares;
        const unrealizedR = position.initial_risk
          ? (currentPrice - position.entry_price) / position.initial_risk
          : null;

        const entryDate = new Date(position.entry_date);
        const holdingDays = Math.floor((Date.now() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

        const highWaterMark = Math.max(position.high_water_mark || position.entry_price, currentPrice);

        const { error: updateError } = await supabase
          .from('politician_positions')
          .update({
            current_price: currentPrice,
            unrealized_pnl: unrealizedPnl,
            unrealized_r: unrealizedR,
            holding_days: holdingDays,
            high_water_mark: highWaterMark,
          })
          .eq('id', position.id);

        if (!updateError) {
          updatedCount++;
          updates.push({
            ticker: position.ticker,
            oldPrice,
            newPrice: currentPrice,
            change: ((currentPrice - oldPrice) / oldPrice) * 100,
          });
        }

        // Rate limit: 100ms between API calls
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error updating position ${position.id} (${position.ticker}):`, error);
        errorCount++;
      }
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      errors: errorCount,
      updates: updates.slice(0, 10), // Return first 10 updates as sample
    });
  } catch (error) {
    console.error('Error in update-prices cron:', error);
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
