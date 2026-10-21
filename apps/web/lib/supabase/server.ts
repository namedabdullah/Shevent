import type { Database } from '@shevent/core/database';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseEnv } from './env';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers, acting as the
 * signed-in user (or anon). Returns undefined until the Supabase env vars are set, so the site
 * still builds and deploys before the project exists.
 */
export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) return undefined;

  const cookieStore = await cookies();
  return createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. proxy.ts refreshes sessions.
        }
      },
    },
  });
}
