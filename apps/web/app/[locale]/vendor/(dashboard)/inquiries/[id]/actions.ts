'use server';

import { CATEGORY_UNITS } from '@shevent/core/enums';
import { parsePkr, todayInLahore } from '@shevent/core/format';
import { quoteTotalPkr, splitList, vendorQuoteSchema } from '@shevent/core/schemas';
import { redirect } from 'next/navigation';
import { isUuid } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import { invalidFields } from '@/lib/vendor';

export type QuoteFormState =
  | { status: 'idle' }
  | { status: 'error'; error: 'invalid' | 'failed'; fields: string[] };

const MAX_TOTAL_PKR = 500_000_000;

/**
 * The vendor sends (or revises) a quote. The total is worked out here from the inquiry's guest
 * count, never taken from the form; RLS only accepts quotes on open or quoted inquiries sent to a
 * listing the caller owns.
 */
export async function sendQuote(inquiryId: string, _previous: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const supabase = await createClient();
  const { data: auth } = (await supabase?.auth.getClaims()) ?? { data: null };
  if (!supabase || !auth?.claims) redirect('/sign-in');
  if (!isUuid(inquiryId)) return { status: 'error', error: 'failed', fields: [] };

  const text = (name: string) => String(formData.get(name) ?? '').trim();
  const parsed = vendorQuoteSchema.safeParse({
    amount_pkr: parsePkr(text('amount')) ?? Number.NaN,
    unit: text('unit'),
    hours: text('unit') === 'per_hour' && text('hours') !== '' ? Number(text('hours')) : undefined,
    inclusions: splitList(text('inclusions')),
    exclusions: splitList(text('exclusions')),
    notes: text('notes') || undefined,
    valid_until: text('valid_until') || undefined,
  });
  if (!parsed.success) return { status: 'error', error: 'invalid', fields: invalidFields(parsed.error) };
  const quote = parsed.data;
  if (quote.valid_until && quote.valid_until < todayInLahore()) return { status: 'error', error: 'invalid', fields: ['valid_until'] };

  const [{ data: inquiry }, { data: brief }] = await Promise.all([
    supabase.from('inquiries').select('id, vendors!inner(category, owner_id)').eq('id', inquiryId).maybeSingle(),
    supabase.rpc('inquiry_brief', { target: inquiryId }).maybeSingle(),
  ]);
  if (!inquiry || !brief || inquiry.vendors.owner_id !== auth.claims.sub) return { status: 'error', error: 'failed', fields: [] };
  if (!CATEGORY_UNITS[inquiry.vendors.category].includes(quote.unit)) return { status: 'error', error: 'invalid', fields: ['unit'] };

  const total = quoteTotalPkr(quote.amount_pkr, quote.unit, brief.guest_count, quote.hours);
  if (total < 1 || total > MAX_TOTAL_PKR) return { status: 'error', error: 'invalid', fields: ['amount_pkr'] };

  const { error } = await supabase.from('quotes').insert({
    inquiry_id: inquiryId,
    amount_pkr: quote.amount_pkr,
    unit: quote.unit,
    hours: quote.hours ?? null,
    total_pkr: total,
    inclusions: quote.inclusions,
    exclusions: quote.exclusions,
    notes: quote.notes ?? null,
    valid_until: quote.valid_until ?? null,
  });
  if (error) {
    console.error('Quote insert failed', error.code, error.message);
    return { status: 'error', error: 'failed', fields: [] };
  }
  redirect(`/vendor/inquiries/${inquiryId}?quoted=1`);
}

/** The vendor can't take the event. RLS allows vendors to set only "declined", and only before booking. */
export async function declineInquiry(inquiryId: string): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = (await supabase?.auth.getClaims()) ?? { data: null };
  if (!supabase || !auth?.claims) redirect('/sign-in');
  if (!isUuid(inquiryId)) redirect('/vendor/inquiries');

  const { data, error } = await supabase.from('inquiries').update({ status: 'declined' }).eq('id', inquiryId).select('id');
  if (error || !data?.length) {
    console.error('Decline failed', error?.code, error?.message);
    redirect(`/vendor/inquiries/${inquiryId}?action=failed`);
  }
  redirect(`/vendor/inquiries/${inquiryId}?declined=1`);
}
