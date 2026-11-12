import type { Database } from '@shevent/core/database';
import { CATEGORIES, type Category } from '@shevent/core/enums';
import { estimateResponseSchema, type EstimateRequest, type EstimateResponse, type EventSpec } from '@shevent/core/schemas';
import { notFound } from 'next/navigation';
import { z } from 'zod';
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
  const categories = planCategories(plan);
  return {
    event_type: plan.event_type,
    guest_count: plan.guest_count,
    area: plan.area,
    venue_type: plan.venue_type ?? undefined,
    event_date: plan.event_date,
    total_budget_pkr: plan.total_budget_pkr,
    preferences: plan.preferences,
    categories: categories.length < CATEGORIES.length ? categories : undefined,
  };
}

/**
 * While the model server is down, a new plan's `estimate` column keeps only the services the host
 * chose, so trying again asks for the same ones.
 */
export const pendingServicesSchema = z.object({ categories: z.array(z.enum(CATEGORIES)).min(1) });

/** The services the host needs: those in the budget split (or waiting for one); all six by default. */
export function planCategories(plan: Pick<PlanRow, 'estimate'>): Category[] {
  const parsed = estimateResponseSchema.safeParse(plan.estimate);
  if (parsed.success) return CATEGORIES.filter((category) => category in parsed.data.allocation);
  const pending = pendingServicesSchema.safeParse(plan.estimate);
  if (pending.success) return CATEGORIES.filter((category) => pending.data.categories.includes(category));
  return [...CATEGORIES];
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
