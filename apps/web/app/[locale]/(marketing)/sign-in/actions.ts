'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { safeNext } from '@/lib/routes';
import { getSiteUrl } from '@/lib/site';
import { createClient } from '@/lib/supabase/server';

export type SignInState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; error: 'invalid_email' | 'unavailable' | 'failed' };

/** Where Supabase sends people back to; the callback exchanges the code for a session. */
async function callbackUrl(next: FormDataEntryValue | null): Promise<string> {
  // Next.js checks that a Server Action's Origin matches the host, so this is our own origin.
  const origin = (await headers()).get('origin') ?? getSiteUrl();
  return `${origin}/api/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
}

// Sign-in is public on purpose: these actions create the session rather than check one.

export async function signInWithEmail(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = z.email().safeParse(String(formData.get('email') ?? '').trim());
  if (!email.success) return { status: 'error', error: 'invalid_email' };

  const supabase = await createClient();
  if (!supabase) return { status: 'error', error: 'unavailable' };

  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: await callbackUrl(formData.get('next')) },
  });
  if (error) {
    console.error('Magic link failed', error.code, error.message);
    return { status: 'error', error: 'failed' };
  }
  return { status: 'sent', email: email.data };
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data, error } = supabase
    ? await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: await callbackUrl(formData.get('next')) },
      })
    : { data: undefined, error: new Error('Supabase is not configured') };
  if (error || !data?.url) {
    console.error('Google sign-in failed', error?.message);
    redirect('/sign-in?error=google');
  }
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect('/');
}
