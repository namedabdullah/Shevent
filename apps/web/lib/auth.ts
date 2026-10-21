import type { Database } from '@shevent/core/database';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export type UserRole = Database['public']['Enums']['user_role'];

export interface CurrentUser {
  id: string;
  email: string | undefined;
  role: UserRole;
}

/**
 * The signed-in user, or null. Reads the session cookie, so call it inside a <Suspense> boundary
 * (Cache Components). Deduplicated per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', claims.sub).maybeSingle();
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : undefined, role: profile?.role ?? 'host' };
});

/** Defence in depth behind proxy.ts, which already redirects signed-out visitors. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  return user;
}

export async function requireVendor(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== 'vendor' && user.role !== 'admin') redirect('/vendor/onboarding');
  return user;
}
