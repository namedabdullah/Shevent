/**
 * URL slug for a vendor listing: "Demo DJ & Dhol Cantt" → "demo-dj-dhol-cantt". Matches the
 * vendors.slug check (lowercase letters and digits joined by single dashes, at most 80 characters).
 * Returns an empty string when nothing usable is left (a name written only in Urdu script, say).
 */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}
