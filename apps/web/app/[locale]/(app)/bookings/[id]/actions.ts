'use server';

import { redirect } from 'next/navigation';
import { isUuid } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';

/** After the event, the host marks the booking completed (which unlocks feedback and a review). */
export async function completeBooking(bookingId: string): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = (await supabase?.auth.getClaims()) ?? { data: null };
  if (!supabase || !auth?.claims) redirect('/sign-in');
  if (!isUuid(bookingId)) redirect('/plans');

  // RLS: only the host can change their booking, and only to cancelled or completed.
  const { error } = await supabase.from('bookings').update({ status: 'completed' }).eq('id', bookingId);
  if (error) console.error('Completing booking failed', error.code, error.message);
  redirect(`/bookings/${bookingId}`);
}
