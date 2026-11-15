import type { Database } from '@shevent/core/database';
import { createClient } from '@supabase/supabase-js';
import { cacheLife, cacheTag } from 'next/cache';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { isVendorSlug } from '@/lib/vendor-slug';
import type { VendorRow } from '@/lib/vendor';

// Public vendor profiles (/vendors/[slug], WEB_APP_PLAN §4.1). Everything here is public under RLS
// (vendors, reviews without author_id), so it's read without the visitor's session and cached:
// the page is the same for everyone. A vendor's own edits expire it (updateTag in the profile action).

/** Cache tag for every public profile; expired whenever a vendor saves their listing. */
export const VENDOR_PROFILES_TAG = 'vendor-profiles';

/**
 * Which listings may have a public page (PostgREST filter). A vendor account that didn't agree to a
 * public profile is shown to signed-in hosts only (the onboarding form promises this). Seeded and
 * demo listings, which have no owner yet, are shown with noindex (WEB_APP_PLAN §6).
 */
export const PUBLIC_LISTING_FILTER = 'public_consent.eq.true,owner_id.is.null,is_demo.eq.true';

const COLUMNS =
  'id, slug, name, category, sub_type, base_area, areas_served, capacity_min, capacity_max, price_tier, event_types, description, inclusions, years_active, verified, is_demo, public_consent';

export type ProfileVendor = Pick<
  VendorRow,
  | 'id'
  | 'slug'
  | 'name'
  | 'category'
  | 'sub_type'
  | 'base_area'
  | 'areas_served'
  | 'capacity_min'
  | 'capacity_max'
  | 'price_tier'
  | 'event_types'
  | 'description'
  | 'inclusions'
  | 'years_active'
  | 'verified'
  | 'is_demo'
  | 'public_consent'
>;

export type ProfileReview = { id: string; rating: number; body: string; source: 'booking' | 'imported'; created_at: string };

export type VendorProfileData = {
  vendor: ProfileVendor;
  /** Average of every review, to one decimal, or null with no reviews. */
  rating: number | null;
  reviewCount: number;
  /** How many reviews gave 5, 4, 3, 2 and 1 stars (index 0 is 5 stars). */
  distribution: [number, number, number, number, number];
  /** The newest reviews that have words in them. */
  reviews: ProfileReview[];
};

const LATEST_REVIEWS = 6;

function publicClient() {
  const env = getSupabaseEnv();
  if (!env) return undefined;
  return createClient<Database>(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** Cached per slug. Throws when the database can't be reached, so a failure is never cached. */
async function loadProfile(slug: string): Promise<VendorProfileData | null | 'unavailable'> {
  'use cache';
  cacheLife('hours');
  cacheTag(VENDOR_PROFILES_TAG);

  const supabase = publicClient();
  if (!supabase) return 'unavailable';

  const { data: vendor, error } = await supabase.from('vendors').select(COLUMNS).eq('slug', slug).or(PUBLIC_LISTING_FILTER).maybeSingle();
  if (error) throw error;
  if (!vendor) return null;

  const [ratings, latest] = await Promise.all([
    supabase.from('reviews').select('rating').eq('vendor_id', vendor.id).limit(5000),
    supabase
      .from('reviews')
      .select('id, rating, body, source, created_at')
      .eq('vendor_id', vendor.id)
      .not('body', 'is', null)
      .neq('body', '')
      .order('created_at', { ascending: false })
      .limit(LATEST_REVIEWS),
  ]);
  if (ratings.error) throw ratings.error;
  if (latest.error) throw latest.error;

  const distribution: VendorProfileData['distribution'] = [0, 0, 0, 0, 0];
  let total = 0;
  for (const { rating } of ratings.data) {
    if (rating >= 1 && rating <= 5) {
      distribution[5 - rating]! += 1;
      total += rating;
    }
  }
  const reviewCount = distribution.reduce((sum, count) => sum + count, 0);

  return {
    vendor,
    rating: reviewCount > 0 ? Math.round((total / reviewCount) * 10) / 10 : null,
    reviewCount,
    distribution,
    reviews: latest.data.map((review) => ({ ...review, body: review.body ?? '' })),
  };
}

/**
 * A vendor's public profile: the listing, its rating summary and latest reviews. null when no
 * vendor has this slug; `unavailable` when Supabase isn't configured or can't be reached.
 */
export async function getVendorProfile(slug: string): Promise<VendorProfileData | null | 'unavailable'> {
  if (!isVendorSlug(slug)) return null;
  try {
    return await loadProfile(slug);
  } catch (error) {
    console.error('Vendor profile failed', error);
    return 'unavailable';
  }
}

/** Slugs of the vendors that agreed to an indexable profile (consent gate, WEB_APP_PLAN §6). */
async function loadIndexableSlugs(): Promise<{ slug: string; updated_at: string }[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(VENDOR_PROFILES_TAG);
  const supabase = publicClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('vendors').select('slug, updated_at').eq('public_consent', true).eq('is_demo', false).limit(5000);
  if (error) throw error;
  return data;
}

/** For the sitemap. Empty when the database can't be reached. */
export async function getIndexableVendorSlugs() {
  try {
    return await loadIndexableSlugs();
  } catch (error) {
    console.error('Sitemap vendors failed', error);
    return [];
  }
}

/** Indexable only with the vendor's consent, and never for demo listings (WEB_APP_PLAN §6). */
export function isIndexableProfile(vendor: Pick<VendorRow, 'public_consent' | 'is_demo'>) {
  return vendor.public_consent && !vendor.is_demo;
}
