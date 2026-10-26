'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnListing, invalidFields, listingColumns, parseVendorProfile, type VendorProfileState } from '@/lib/vendor';

/** Saves the listing. RLS lets owners update only their own row and only the columns they may set. */
export async function updateListing(_previous: VendorProfileState, formData: FormData): Promise<VendorProfileState> {
  const supabase = await createClient();
  const { data: auth } = (await supabase?.auth.getClaims()) ?? { data: null };
  if (!supabase || !auth?.claims) redirect('/sign-in?next=%2Fvendor%2Fprofile');

  const vendor = await getOwnListing(auth.claims.sub);
  if (!vendor) redirect('/vendor/onboarding');

  const parsed = parseVendorProfile(formData, vendor.category);
  if (!parsed.success) return { status: 'error', error: 'invalid', fields: invalidFields(parsed.error) };

  const { error } = await supabase.from('vendors').update(listingColumns(parsed.data)).eq('id', vendor.id);
  if (error) {
    console.error('Listing update failed', error.code, error.message);
    return { status: 'error', error: 'failed', fields: [] };
  }
  return { status: 'saved' };
}
