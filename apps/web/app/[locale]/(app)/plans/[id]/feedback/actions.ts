'use server';

import { CATEGORIES } from '@shevent/core/enums';
import { parsePkr } from '@shevent/core/format';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { getAi } from '@/lib/ai';
import { getPlan, planToRequest } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';

export type FeedbackFormState = { status: 'idle' } | { status: 'error'; fields: string[] };

/** Actual spend per category + rating: stored in plan_feedback and sent to /v1/feedback for retraining. */
export async function saveFeedback(planId: string, _previous: FeedbackFormState, formData: FormData): Promise<FeedbackFormState> {
  const supabase = await createClient();
  const { data: auth } = (await supabase?.auth.getClaims()) ?? { data: null };
  if (!supabase || !auth?.claims) redirect('/sign-in');
  const plan = await getPlan(planId); // RLS: owner only

  const fields: string[] = [];
  const actual: Partial<Record<(typeof CATEGORIES)[number], number>> = {};
  for (const category of CATEGORIES) {
    const raw = String(formData.get(`spend_${category}`) ?? '').trim();
    if (!raw) continue;
    const amount = parsePkr(raw);
    if (amount === undefined || amount < 0) fields.push(`spend_${category}`);
    else actual[category] = amount;
  }
  const guestsRaw = String(formData.get('guest_count_actual') ?? '').trim();
  const guests = guestsRaw ? z.coerce.number().int().min(1).max(10_000).safeParse(guestsRaw) : null;
  if (guests && !guests.success) fields.push('guest_count_actual');
  const rating = z.coerce.number().int().min(1).max(5).safeParse(formData.get('rating'));
  if (!rating.success) fields.push('rating');
  if (fields.length || !rating.success) return { status: 'error', fields };

  const feedback = {
    plan_id: plan.id,
    actual_spend_pkr: actual,
    guest_count_actual: guests?.success ? guests.data : null,
    rating: rating.data,
  };
  const { error } = await supabase.from('plan_feedback').upsert(feedback);
  if (error) {
    console.error('Feedback save failed', error.code, error.message);
    return { status: 'error', fields: ['save'] };
  }

  // Retraining data is best-effort: the host's feedback is already saved.
  try {
    await getAi().feedback({ ...feedback, guest_count_actual: feedback.guest_count_actual ?? undefined, plan: planToRequest(plan) });
  } catch (sendError) {
    console.error('Sending feedback to the model server failed', sendError);
  }
  redirect(`/plans/${plan.id}?feedback=1`);
}
