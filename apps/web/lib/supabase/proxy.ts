import type { Database } from '@shevent/core/database';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isProtectedPath, splitLocale } from '@/lib/routes';
import { getSupabaseEnv } from './env';

/**
 * Runs in proxy.ts on every page request: refreshes the Supabase session cookies on the response
 * from next-intl, and sends signed-out visitors from private pages to sign-in.
 */
export async function updateSession(request: NextRequest, response: NextResponse): Promise<NextResponse> {
  const env = getSupabaseEnv();
  if (!env) return response;

  const supabase = createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Validates the JWT (and refreshes it when needed). Don't put code between client creation and
  // this call: a stale session here signs people out at random.
  const { data } = await supabase.auth.getClaims();
  if (data?.claims || !isProtectedPath(request.nextUrl.pathname)) return response;

  const { prefix } = splitLocale(request.nextUrl.pathname);
  const signIn = request.nextUrl.clone();
  signIn.pathname = `${prefix}/sign-in`;
  signIn.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  const redirect = NextResponse.redirect(signIn);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
