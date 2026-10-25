// Preference flags the planner offers (README §4.1, §9). Draft list: extend it together with the
// #1 Budget Allocator's features.

export const PREFERENCES = ['decor_heavy', 'premium_food', 'live_dhol'] as const;
export type Preference = (typeof PREFERENCES)[number];

export const PREFERENCE_LABELS: Record<Preference, string> = {
  decor_heavy: 'Decor is a priority',
  premium_food: 'Premium food',
  live_dhol: 'Live dhol',
};

export function isPreference(value: string): value is Preference {
  return (PREFERENCES as readonly string[]).includes(value);
}
