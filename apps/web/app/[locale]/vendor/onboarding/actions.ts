'use server';

import { slugify } from '@shevent/core/format';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { invalidFields, listingColumns, parseVendorProfile, type VendorProfileState } from '@/lib/vendor';

/**
 * Onboarding: switches the account to a vendor account, then creates its listing. The database
 * checks both steps (become_vendor() only promotes the caller; RLS allows one listing per owner).
 */
export async function createListing(_previous: VendorProfileState, formData: FormData): Promise<VendorProfileState> {
  const supabase = await createClient();
  const { data: auth } = (await supabase?.auth.getClaims()) ?? { data: null };
  if (!supabase || !auth?.claims) redirect('/sign-in?next=%2Fvendor%2Fonboarding');

  const parsed = parseVendorProfile(formData);
  if (!parsed.success) return { status: 'error', error: 'invalid', fields: invalidFields(parsed.error) };
  const profile = parsed.data;

  const { error: roleError } = await supabase.rpc('become_vendor');
  if (roleError) {
    console.error('become_vendor failed', roleError.code, roleError.message);
    return { status: 'error', error: 'failed', fields: [] };
  }

  // A short random suffix keeps slugs unique without a lookup ("demo-caterers-4f9k2a").
  const slug = `${slugify(profile.name) || 'vendor'}-${crypto.randomUUID().slice(0, 6)}`;
  const { error } = await supabase
    .from('vendors')
    .insert({ owner_id: auth.claims.sub, slug, category: profile.category, ...listingColumns(profile) });
  // 23505: this account already has a listing (a second tab, or a double submit).
  if (error && error.code !== '23505') {
    console.error('Listing insert failed', error.code, error.message);
    return { status: 'error', error: 'failed', fields: [] };
  }
  redirect(error ? '/vendor' : '/vendor?onboarded=1');
}
