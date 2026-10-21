import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { PROTECTED_PATHS } from '@/lib/routes';
import { getSiteUrl, isIndexable } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: '*', disallow: '/' } };

  const localePrefixes = ['', ...routing.locales.filter((l) => l !== routing.defaultLocale).map((l) => `/${l}`)];
  // "/vendor$" and "/vendor/" block the dashboard without blocking public /vendors/ profiles.
  const privatePaths = localePrefixes.flatMap((prefix) => PROTECTED_PATHS.flatMap((path) => [`${prefix}${path}$`, `${prefix}${path}/`]));
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', ...privatePaths] },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
