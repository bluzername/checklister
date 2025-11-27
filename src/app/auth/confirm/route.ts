import { type NextRequest, NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/';

    if (!isSupabaseConfigured()) {
        return NextResponse.redirect(`${origin}/?error=auth_not_configured`);
    }

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        
        if (!error) {
            return NextResponse.redirect(`${origin}${next}`);
        }
    }

    // Return the user to the home page on error
    return NextResponse.redirect(`${origin}/?error=auth_code_error`);
}

