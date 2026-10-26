import type { Database } from '@shevent/core/database';
import { splitList, vendorProfileSchema, type VendorProfile } from '@shevent/core/schemas';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { requireVendor, type CurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type VendorRow = Database['public']['Tables']['vendors']['Row'];

/** The listing owned by this account (one per account), or null. Deduplicated per request. */
export const getOwnListing = cache(async (userId: string): Promise<VendorRow | null> => {
  const supabase = await createClient();
  const { data } = (await supabase?.from('vendors').select('*').eq('owner_id', userId).maybeSingle()) ?? { data: null };
  return data;
});

/** Vendor pages need a vendor account and a listing; without one, onboarding creates it. */
export async function requireListing(): Promise<{ user: CurrentUser; vendor: VendorRow }> {
  const user = await requireVendor();
  const vendor = await getOwnListing(user.id);
  if (!vendor) redirect('/vendor/onboarding');
  return { user, vendor };
}

export type VendorProfileState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'error'; error: 'invalid' | 'failed'; fields: string[] };

/** Reads the listing form. `category` comes from the caller on edit, because it can't change. */
export function parseVendorProfile(formData: FormData, category?: string) {
  const text = (name: string) => String(formData.get(name) ?? '').trim();
  const optionalInt = (name: string) => (text(name) === '' ? undefined : Number(text(name)));
  const chosenCategory = category ?? text('category');
  return vendorProfileSchema.safeParse({
    name: text('name'),
    category: chosenCategory,
    sub_type: chosenCategory === 'venue' ? text('sub_type') || undefined : undefined,
    base_area: text('base_area'),
    areas_served: formData.getAll('areas_served').map(String),
    capacity_min: optionalInt('capacity_min'),
    capacity_max: optionalInt('capacity_max'),
    price_tier: text('price_tier') || undefined,
    event_types: formData.getAll('event_types').map(String),
    description: text('description') || undefined,
    inclusions: splitList(text('inclusions')),
    years_active: optionalInt('years_active'),
    public_consent: formData.get('public_consent') === 'on',
  });
}

export function invalidFields(error: { issues: { path: PropertyKey[] }[] }): string[] {
  return [...new Set(error.issues.map((issue) => String(issue.path[0])))];
}

/** Columns the vendor may write (the rest, such as `verified`, are set by Shevent). */
export function listingColumns(profile: VendorProfile) {
  return {
    name: profile.name,
    sub_type: profile.sub_type ?? null,
    base_area: profile.base_area,
    // The base area is always served.
    areas_served: [...new Set([profile.base_area, ...profile.areas_served])],
    capacity_min: profile.capacity_min ?? null,
    capacity_max: profile.capacity_max ?? null,
    price_tier: profile.price_tier ?? null,
    event_types: profile.event_types,
    description: profile.description ?? null,
    inclusions: profile.inclusions,
    years_active: profile.years_active ?? null,
    public_consent: profile.public_consent,
  };
}
