import { type NextRequest, NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { type EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    
    // Get params for both PKCE (code) and email OTP (token_hash) flows
    const code = searchParams.get('code');
    const token_hash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;
    const next = searchParams.get('next') ?? '/';
    const error = searchParams.get('error');
    const error_description = searchParams.get('error_description');

    // If there's an error in the URL, redirect with error info
    if (error) {
        const errorMessage = error_description || error;
        return NextResponse.redirect(
            `${origin}/?auth_error=${encodeURIComponent(errorMessage)}`
        );
    }

    if (!isSupabaseConfigured()) {
        return NextResponse.redirect(`${origin}/?auth_error=Authentication+is+not+configured`);
    }

    const supabase = await createClient();

    // Handle PKCE code exchange flow
    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        
        if (!error) {
            return NextResponse.redirect(`${origin}${next}`);
        }
        
        // Handle specific error cases
        if (error.message.includes('expired')) {
            return NextResponse.redirect(
                `${origin}/?auth_error=${encodeURIComponent('Email link has expired. Please request a new one.')}`
            );
        }
        
        return NextResponse.redirect(
            `${origin}/?auth_error=${encodeURIComponent(error.message)}`
        );
    }

    // Handle email OTP token_hash flow (for email verification links)
    if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        });
        
        if (!error) {
            return NextResponse.redirect(`${origin}${next}`);
        }
        
        // Handle specific error cases
        if (error.message.includes('expired') || error.code === 'otp_expired') {
            return NextResponse.redirect(
                `${origin}/?auth_error=${encodeURIComponent('Email link has expired. Please request a new verification email.')}`
            );
        }
        
        return NextResponse.redirect(
            `${origin}/?auth_error=${encodeURIComponent(error.message)}`
        );
    }

    // No valid auth params found
    return NextResponse.redirect(
        `${origin}/?auth_error=${encodeURIComponent('Invalid confirmation link. Please try signing up again.')}`
    );
}
