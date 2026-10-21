'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Turns the signed-in account into a vendor account. The database function checks the caller. */
export async function becomeVendor(): Promise<void> {
  const supabase = await createClient();
  if (!supabase) redirect('/vendor/onboarding?error=unavailable');

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/sign-in?next=/vendor/onboarding');

  const { error } = await supabase.rpc('become_vendor');
  if (error) {
    console.error('become_vendor failed', error.code, error.message);
    redirect('/vendor/onboarding?error=failed');
  }
  redirect('/vendor');
}
