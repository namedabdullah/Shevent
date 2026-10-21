'use server';

import { leadSchema } from '@shevent/core/schemas';
import { createClient } from '@/lib/supabase/server';

export type LeadFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; error: 'invalid' | 'unavailable' | 'failed'; fields?: string[] };

const LEAD_FIELDS = [
  'type',
  'name',
  'contact',
  'category',
  'area',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'referrer',
  'landing_path',
] as const;

/**
 * Waitlist and vendor-join forms. Public on purpose (no sign-in): RLS lets anyone insert a lead,
 * and only admins can read leads back.
 */
export async function submitLead(_previous: LeadFormState, formData: FormData): Promise<LeadFormState> {
  // Honeypot: the "website" field is hidden from people, so only bots fill it in.
  if (formData.get('website')) return { status: 'success' };

  const input: Record<string, string> = {};
  for (const field of LEAD_FIELDS) {
    const value = formData.get(field);
    if (typeof value === 'string' && value.trim() !== '') input[field] = value;
  }

  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    return { status: 'error', error: 'invalid', fields };
  }

  const supabase = await createClient();
  if (!supabase) return { status: 'error', error: 'unavailable' };

  const { error } = await supabase.from('leads').insert(parsed.data);
  if (error) {
    console.error('Lead insert failed', error.code, error.message);
    return { status: 'error', error: 'failed' };
  }
  return { status: 'success' };
}
