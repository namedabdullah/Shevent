import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

// Magic links and Google sign-in land here with a one-time code (PKCE). Exchanging it sets the
// session cookies; then the visitor continues to where they were going.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = (await supabase?.auth.exchangeCodeForSession(code)) ?? { error: true };
    if (!error) return NextResponse.redirect(new URL(safeNext(searchParams.get('next')), origin));
  }
  return NextResponse.redirect(new URL('/sign-in?error=link', origin));
}
