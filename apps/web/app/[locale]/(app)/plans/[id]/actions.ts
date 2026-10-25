'use server';

import type { Json } from '@shevent/core/database';
import { redirect } from 'next/navigation';
import { getAi } from '@/lib/ai';
import { getPlan, isUuid, planToRequest } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';

async function signedIn() {
  const supabase = await createClient();
  const { data } = (await supabase?.auth.getClaims()) ?? { data: null };
  if (!supabase || !data?.claims) redirect('/sign-in');
  return supabase;
}

/** Asks the model server for the budget split again (after it was down when the plan was made). */
export async function retryEstimate(planId: string): Promise<void> {
  const supabase = await signedIn();
  const plan = await getPlan(planId); // RLS: only the owner gets here
  try {
    const estimate = await getAi().estimate(planToRequest(plan));
    await supabase.from('plans').update({ estimate: estimate as Json }).eq('id', plan.id);
  } catch (error) {
    console.error('Estimate retry failed', error);
    redirect(`/plans/${plan.id}?estimate=failed`);
  }
  redirect(`/plans/${plan.id}`);
}

/** Opens (or reopens) the chat with a vendor for this plan. */
export async function sendInquiry(planId: string, vendorId: string): Promise<void> {
  const supabase = await signedIn();
  if (!isUuid(planId) || !isUuid(vendorId)) redirect('/plans');

  const { data, error } = await supabase.from('inquiries').insert({ plan_id: planId, vendor_id: vendorId }).select('id').single();
  if (data) redirect(`/inquiries/${data.id}?sent=1`);

  // Already asked this vendor: go to the existing chat.
  if (error?.code === '23505') {
    const { data: existing } = await supabase
      .from('inquiries')
      .select('id')
      .eq('plan_id', planId)
      .eq('vendor_id', vendorId)
      .maybeSingle();
    if (existing) redirect(`/inquiries/${existing.id}`);
  }
  // 23503: the vendor isn't in the database (e.g. a model answer about an unseeded vendor).
  console.error('Inquiry failed', error?.code, error?.message);
  redirect(`/plans/${planId}?inquiry=failed`);
}
