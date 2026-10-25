'use server';

import type { Json } from '@shevent/core/database';
import { isPreference } from '@shevent/core/enums';
import { parsePkr, todayInLahore } from '@shevent/core/format';
import { estimateRequestSchema, type EstimateResponse } from '@shevent/core/schemas';
import { redirect } from 'next/navigation';
import { getAi } from '@/lib/ai';
import { createClient } from '@/lib/supabase/server';

export type PlanFormState =
  | { status: 'idle' }
  | { status: 'error'; error: 'invalid' | 'past_date' | 'failed'; fields: string[] };

export async function createPlan(_previous: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const supabase = await createClient();
  const { data: auth } = (await supabase?.auth.getClaims()) ?? { data: null };
  if (!supabase || !auth?.claims) redirect('/sign-in?next=%2Fplan%2Fnew');

  const text = (name: string) => String(formData.get(name) ?? '').trim();
  const parsed = estimateRequestSchema.safeParse({
    event_type: text('event_type'),
    guest_count: Number(text('guest_count')),
    area: text('area'),
    venue_type: text('venue_type') || undefined,
    event_date: text('event_date'),
    total_budget_pkr: parsePkr(text('budget')) ?? Number.NaN,
    preferences: formData.getAll('preferences').map(String).filter(isPreference),
  });
  if (!parsed.success) {
    return { status: 'error', error: 'invalid', fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
  }
  const request = parsed.data;
  if (request.event_date < todayInLahore()) return { status: 'error', error: 'past_date', fields: ['event_date'] };

  // A failed estimate doesn't lose the plan: the dashboard offers to try again.
  let estimate: EstimateResponse | null = null;
  try {
    estimate = await getAi().estimate(request);
  } catch (error) {
    console.error('Estimate failed', error);
  }

  const { data, error } = await supabase
    .from('plans')
    .insert({
      event_type: request.event_type,
      guest_count: request.guest_count,
      area: request.area,
      venue_type: request.venue_type ?? null,
      event_date: request.event_date,
      total_budget_pkr: request.total_budget_pkr,
      preferences: request.preferences ?? [],
      estimate: estimate as Json | null,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('Plan insert failed', error?.code, error?.message);
    return { status: 'error', error: 'failed', fields: [] };
  }
  redirect(`/plans/${data.id}?created=1`);
}
