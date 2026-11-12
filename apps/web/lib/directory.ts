import type { Category } from '@shevent/core/enums';
import { createClient } from '@/lib/supabase/server';
import type { VendorRow } from '@/lib/vendor';

// The public directory (/lahore/[category], WEB_APP_PLAN §4.1): every listed vendor in one
// category, straight from the vendors table (public under RLS). No ranking model here; #3 ranks
// vendors for a host's plan once they've planned an event.

const COLUMNS = 'id, name, sub_type, base_area, areas_served, capacity_min, capacity_max, price_tier, event_types, years_active, verified, is_demo, public_consent';

export type DirectoryVendor = Pick<
  VendorRow,
  'id' | 'name' | 'sub_type' | 'base_area' | 'areas_served' | 'capacity_min' | 'capacity_max' | 'price_tier' | 'event_types' | 'years_active' | 'verified' | 'is_demo' | 'public_consent'
> & { rating: number | null; reviewCount: number };

/**
 * Vendors in a category: verified first, then the best reviewed, then by name. `unavailable` when
 * Supabase isn't configured or can't be reached, so the page says so instead of "none listed".
 * Reads cookies (through the client), so call it inside <Suspense>.
 */
export async function getDirectory(category: Category): Promise<DirectoryVendor[] | 'unavailable'> {
  const supabase = await createClient();
  if (!supabase) return 'unavailable';
  try {
    const { data: vendors, error } = await supabase.from('vendors').select(COLUMNS).eq('category', category).limit(200);
    if (error) throw error;
    const ids = vendors.map((vendor) => vendor.id);
    const { data: stats } = ids.length
      ? await supabase.from('vendor_stats').select('vendor_id, rating, review_count').in('vendor_id', ids)
      : { data: [] };
    const byVendor = new Map((stats ?? []).map((row) => [row.vendor_id, row]));
    return vendors
      .map((vendor) => {
        const row = byVendor.get(vendor.id);
        return { ...vendor, rating: row?.rating ?? null, reviewCount: row?.review_count ?? 0 };
      })
      .sort(
        (a, b) =>
          Number(b.verified) - Number(a.verified) ||
          (b.rating ?? 0) - (a.rating ?? 0) ||
          b.reviewCount - a.reviewCount ||
          a.name.localeCompare(b.name),
      );
  } catch (error) {
    console.error('Directory failed', error);
    return 'unavailable';
  }
}
