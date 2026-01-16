import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { WebhookSignalPayload, WebhookResponse, SignalStrength } from '@/lib/politician/types';

/**
 * Webhook endpoint for automated signal ingestion (Phase 2)
 *
 * POST /api/politician/signals
 *
 * Body: {
 *   api_key: string,     // User's API key
 *   ticker: string,
 *   politician_name: string,
 *   transaction_type: 'BUY' | 'SELL',
 *   amount_range?: string,
 *   signal_date: string, // ISO date
 *   source: string,
 *   raw_message?: string
 * }
 */
export async function POST(request: Request): Promise<NextResponse<WebhookResponse>> {
  try {
    const body: WebhookSignalPayload = await request.json();

    // Validate required fields
    if (!body.api_key) {
      return NextResponse.json({ success: false, error: 'Missing api_key' }, { status: 400 });
    }
    if (!body.ticker) {
      return NextResponse.json({ success: false, error: 'Missing ticker' }, { status: 400 });
    }
    if (!body.transaction_type || !['BUY', 'SELL'].includes(body.transaction_type)) {
      return NextResponse.json({ success: false, error: 'Invalid transaction_type' }, { status: 400 });
    }
    if (!body.signal_date) {
      return NextResponse.json({ success: false, error: 'Missing signal_date' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Lookup user by API key
    // Note: You'll need to create an api_keys table or store keys in user metadata
    // For now, we'll use a simple environment variable for the demo
    const validApiKey = process.env.POLITICIAN_WEBHOOK_API_KEY;

    if (!validApiKey || body.api_key !== validApiKey) {
      // In production, you'd lookup the API key in a database
      return NextResponse.json({ success: false, error: 'Invalid api_key' }, { status: 401 });
    }

    // For demo, use a default user ID from env or the first admin user
    const userId = process.env.POLITICIAN_DEFAULT_USER_ID;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error: no default user' },
        { status: 500 }
      );
    }

    // Determine signal strength based on amount (heuristic)
    let strength: SignalStrength = 'MODERATE';
    if (body.amount_range) {
      if (body.amount_range.includes('$500K') || body.amount_range.includes('$1M') || body.amount_range.includes('$5M')) {
        strength = 'STRONG';
      } else if (body.amount_range.includes('$1K-$15K')) {
        strength = 'WEAK';
      }
    }

    // Insert the signal
    const { data, error } = await supabase
      .from('politician_signals')
      .insert({
        user_id: userId,
        ticker: body.ticker.toUpperCase(),
        signal_date: body.signal_date,
        politician_name: body.politician_name || null,
        transaction_type: body.transaction_type,
        amount_range: body.amount_range || null,
        source: body.source || 'WEBHOOK',
        raw_message: body.raw_message || null,
        strength,
        processed: false,
      })
      .select('id')
      .single();

    if (error) {
      // Check for duplicate
      if (error.code === '23505') {
        return NextResponse.json({
          success: false,
          error: 'Duplicate signal: already exists for this ticker, date, and politician',
        }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Log the signal received event
    await supabase.from('politician_trade_log').insert({
      user_id: userId,
      signal_id: data.id,
      event_type: 'SIGNAL_RECEIVED',
      event_data: {
        ticker: body.ticker,
        politician_name: body.politician_name,
        transaction_type: body.transaction_type,
        amount_range: body.amount_range,
        source: body.source || 'WEBHOOK',
      },
    });

    return NextResponse.json({
      success: true,
      signal_id: data.id,
    });
  } catch (error) {
    console.error('Error in webhook signal route:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check webhook health
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/politician/signals',
    method: 'POST',
    requiredFields: ['api_key', 'ticker', 'transaction_type', 'signal_date'],
    optionalFields: ['politician_name', 'amount_range', 'source', 'raw_message'],
  });
}
