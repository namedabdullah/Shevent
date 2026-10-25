import type { Database } from '@shevent/core/database';
import { estimateResponseSchema, type EstimateRequest, type EstimateResponse, type EventSpec } from '@shevent/core/schemas';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type PlanRow = Database['public']['Tables']['plans']['Row'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** The signed-in host's plan, or a 404. RLS hides other hosts' plans, so they 404 too. */
export async function getPlan(id: string): Promise<PlanRow> {
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data } = (await supabase?.from('plans').select('*').eq('id', id).maybeSingle()) ?? { data: null };
  if (!data) notFound();
  return data;
}

export function planToRequest(plan: PlanRow): EstimateRequest {
  return {
    event_type: plan.event_type,
    guest_count: plan.guest_count,
    area: plan.area,
    venue_type: plan.venue_type ?? undefined,
    event_date: plan.event_date,
    total_budget_pkr: plan.total_budget_pkr,
    preferences: plan.preferences,
  };
}

/** The event without the budget: what #5 prices and what vendors may see. */
export function planToSpec(plan: Pick<PlanRow, 'event_type' | 'guest_count' | 'area' | 'venue_type' | 'event_date' | 'preferences'>): EventSpec {
  return {
    event_type: plan.event_type,
    guest_count: plan.guest_count,
    area: plan.area,
    venue_type: plan.venue_type ?? undefined,
    event_date: plan.event_date,
    preferences: plan.preferences,
  };
}

/** The stored /v1/estimate answer, if it is present and still matches the contract. */
export function planEstimate(plan: PlanRow): EstimateResponse | null {
  const parsed = estimateResponseSchema.safeParse(plan.estimate);
  return parsed.success ? parsed.data : null;
}
