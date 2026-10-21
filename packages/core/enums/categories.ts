// Mirrors data/reference/categories.csv (checked by enums.test.ts).

export const CATEGORIES = ['venue', 'catering', 'decor', 'dj_sound', 'lighting'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  venue: 'Venue',
  catering: 'Catering',
  decor: 'Decor',
  dj_sound: 'DJ & Sound',
  lighting: 'Lighting',
};

export const PRICE_UNITS = ['per_head', 'per_event', 'per_hour', 'per_package', 'per_slot', 'per_setup'] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const CATEGORY_UNITS: Record<Category, readonly PriceUnit[]> = {
  venue: ['per_slot', 'per_head', 'per_event', 'per_package'],
  catering: ['per_head', 'per_package', 'per_event'],
  decor: ['per_package', 'per_event', 'per_setup'],
  dj_sound: ['per_event', 'per_hour', 'per_package'],
  lighting: ['per_event', 'per_setup', 'per_package', 'per_hour'],
};

// Venue sub_types in categories.csv
export const VENUE_TYPES = ['marquee', 'banquet', 'farmhouse', 'rooftop', 'lawn', 'hotel', 'other'] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

export const VENUE_TYPE_LABELS: Record<VenueType, string> = {
  marquee: 'Marquee',
  banquet: 'Banquet hall',
  farmhouse: 'Farmhouse',
  rooftop: 'Rooftop',
  lawn: 'Lawn',
  hotel: 'Hotel hall',
  other: 'Other',
};

export const PRICE_TIERS = ['budget', 'mid', 'premium'] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

/** URL slug for directory and price-guide pages: `dj_sound` → `dj-sound`. */
export function categorySlug(category: Category): string {
  return category.replace(/_/g, '-');
}

export function categoryFromSlug(slug: string): Category | undefined {
  const value = slug.replace(/-/g, '_');
  return isCategory(value) ? value : undefined;
}
