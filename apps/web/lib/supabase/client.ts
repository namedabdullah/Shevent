import type { Database } from '@shevent/core/database';
import { createBrowserClient } from '@supabase/ssr';

/** Supabase client for Client Components (live chat). Uses the session cookie set at sign-in. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
