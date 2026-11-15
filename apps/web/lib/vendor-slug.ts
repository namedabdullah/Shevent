const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The vendors.slug format (the database's own check), so malformed /vendors/ URLs can 404 without a
 * lookup. Its own module because proxy.ts imports it.
 */
export function isVendorSlug(value: string) {
  return value.length <= 80 && SLUG.test(value);
}
