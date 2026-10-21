/** Absolute site URL for canonical links, the sitemap and share previews (no trailing slash). */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  // Set by Vercel on every deployment.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}

/** Only production deployments may be indexed; previews and local builds are not. */
export function isIndexable(): boolean {
  return process.env.VERCEL_ENV === undefined || process.env.VERCEL_ENV === 'production';
}
