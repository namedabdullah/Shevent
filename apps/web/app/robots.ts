import type { MetadataRoute } from 'next';
import { PROTECTED_PATHS } from '@/lib/routes';
import { getSiteUrl, isIndexable } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: '*', disallow: '/' } };

  // "/vendor$" and "/vendor/" block the dashboard without blocking public /vendors/ profiles.
  const privatePaths = PROTECTED_PATHS.flatMap((path) => [`${path}$`, `${path}/`]);
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', ...privatePaths] },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
