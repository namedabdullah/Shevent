'use server';

import { redirect } from 'next/navigation';
import { isUuid } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';

/** The host accepts a quote. book_quote() checks the caller and copies the price from the quote. */
export async function bookQuote(inquiryId: string, quoteId: string): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = (await supabase?.auth.getClaims()) ?? { data: null };
  if (!supabase || !auth?.claims) redirect('/sign-in');
  if (!isUuid(quoteId)) redirect(`/inquiries/${inquiryId}`);

  const { data: bookingId, error } = await supabase.rpc('book_quote', { target: quoteId });
  if (error || !bookingId) {
    console.error('Booking failed', error?.code, error?.message);
    redirect(`/inquiries/${inquiryId}?book=failed`);
  }
  redirect(`/bookings/${bookingId}?booked=1`);
}
