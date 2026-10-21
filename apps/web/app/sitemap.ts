import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';

// Grows with the public pages: marketing pages, directory and price guides, and vendor profiles
// with public_consent = true only (WEB_APP_PLAN §6 consent gate). Add Urdu alternates once the
// /ur pages are translated.
export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  return [{ url: `${site}/`, changeFrequency: 'weekly', priority: 1 }];
}
