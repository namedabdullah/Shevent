'use server';

import { lahoreDateTime, todayInLahore } from '@shevent/core/format';
import { redirect } from 'next/navigation';
import { contactBlock } from '@/lib/contact-guard';
import { isUuid } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import { VISIT_TIMES, type VisitFormState } from '@/lib/visits';

// Venue visits. The database functions check who may do what, the times and the contact rules; these
// actions read the forms and turn refusals into field errors.

const NOTE_MAX = 300;

async function signedIn(next: string) {
  const supabase = await createClient();
  const { data: auth } = (await supabase?.auth.getClaims()) ?? { data: null };
  if (!supabase || !auth?.claims) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return supabase;
}

function refusal(error: { code?: string; details?: string | null; hint?: string | null }, fallbackField: string): VisitFormState {
  const blocked = contactBlock(error);
  if (blocked) return { status: 'error', error: 'contact', fields: [blocked.field], reason: blocked.reason };
  if (error.code === '22023') return { status: 'error', error: 'invalid', fields: [error.hint || fallbackField] };
  if (error.code === '23505') return { status: 'error', error: 'taken', fields: [] };
  return { status: 'error', error: 'failed', fields: [] };
}

/** The host asks to see the venue at a Lahore date and time. */
export async function requestVisit(inquiryId: string, _previous: VisitFormState, formData: FormData): Promise<VisitFormState> {
  const page = `/inquiries/${inquiryId}`;
  const supabase = await signedIn(page);
  if (!isUuid(inquiryId)) return { status: 'error', error: 'failed', fields: [] };

  const date = String(formData.get('date') ?? '').trim();
  const time = String(formData.get('time') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const fields = [
    ...(lahoreDateTime(date, '12:00') && date >= todayInLahore() ? [] : ['date']),
    ...(VISIT_TIMES.includes(time) ? [] : ['time']),
    ...(note.length <= NOTE_MAX ? [] : ['note']),
  ];
  if (fields.length) return { status: 'error', error: 'invalid', fields };

  const { error } = await supabase.rpc('request_visit', { target: inquiryId, starts_at: lahoreDateTime(date, time)!, note: note || undefined });
  if (error) {
    if (!contactBlock(error)) console.error('Visit request failed', error.code, error.message);
    return refusal(error, 'date');
  }
  redirect(`${page}?visit=requested`);
}

/** The venue confirms a requested visit with the address. */
export async function confirmVisit(inquiryId: string, visitId: string, _previous: VisitFormState, formData: FormData): Promise<VisitFormState> {
  const page = `/vendor/inquiries/${inquiryId}`;
  const supabase = await signedIn(page);
  if (!isUuid(inquiryId) || !isUuid(visitId)) return { status: 'error', error: 'failed', fields: [] };

  const address = String(formData.get('address') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const fields = [...(address.length >= 5 && address.length <= 200 ? [] : ['address']), ...(note.length <= NOTE_MAX ? [] : ['note'])];
  if (fields.length) return { status: 'error', error: 'invalid', fields };

  const { error } = await supabase.rpc('answer_visit', { target: visitId, accept: true, address, note: note || undefined });
  if (error) {
    if (!contactBlock(error)) console.error('Visit confirm failed', error.code, error.message);
    return refusal(error, 'address');
  }
  redirect(`${page}?visit=confirmed`);
}

/** The venue can't do the requested time. */
export async function declineVisit(inquiryId: string, visitId: string): Promise<void> {
  const page = `/vendor/inquiries/${inquiryId}`;
  const supabase = await signedIn(page);
  const { error } = isUuid(visitId) ? await supabase.rpc('answer_visit', { target: visitId, accept: false }) : { error: true };
  if (error) console.error('Visit decline failed', error);
  redirect(`${page}?visit=${error ? 'failed' : 'declined'}`);
}

/** Either side calls the visit off. */
export async function cancelVisit(inquiryId: string, visitId: string, side: 'host' | 'vendor'): Promise<void> {
  const page = side === 'host' ? `/inquiries/${inquiryId}` : `/vendor/inquiries/${inquiryId}`;
  const supabase = await signedIn(page);
  const { error } = isUuid(visitId) ? await supabase.rpc('cancel_visit', { target: visitId }) : { error: true };
  if (error) console.error('Visit cancel failed', error);
  redirect(`${page}?visit=${error ? 'failed' : 'cancelled'}`);
}
