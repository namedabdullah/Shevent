import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';
import { getIndexableVendorSlugs } from '@/lib/vendor-profile';

// Grows with the public pages: marketing pages, directory and price guides, and vendor profiles
// with public_consent = true only (WEB_APP_PLAN §6 consent gate). Directory pages stay out while
// they're noindex (they can list vendors without consent).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const vendors = await getIndexableVendorSlugs();
  return [
    { url: `${site}/`, changeFrequency: 'weekly', priority: 1 },
    ...vendors.map((vendor) => ({ url: `${site}/vendors/${vendor.slug}`, lastModified: vendor.updated_at, changeFrequency: 'weekly' as const, priority: 0.6 })),
  ];
}
