// Mirrors data/reference/areas.csv (checked by enums.test.ts).

export const AREAS = [
  'Gulberg',
  'DHA',
  'Johar Town',
  'Cantt',
  'Model Town',
  'Raiwind Road',
  'Bahria Town',
  'Wapda Town',
  'Garden Town',
  'Faisal Town',
  'Allama Iqbal Town',
  'Township',
  'Lake City',
  'Valencia',
  'Shadman',
  'Other',
] as const;
export type Area = (typeof AREAS)[number];

/** The six key areas from the proposal (`core = yes`). */
export const CORE_AREAS = ['Gulberg', 'DHA', 'Johar Town', 'Cantt', 'Model Town', 'Raiwind Road'] as const satisfies readonly Area[];

export const AREA_ALIASES: Record<string, Area> = {
  'Gulberg': 'Gulberg',
  'Gulberg I': 'Gulberg',
  'Gulberg II': 'Gulberg',
  'Gulberg III': 'Gulberg',
  'Gulberg 3': 'Gulberg',
  'Gulberg V': 'Gulberg',
  'MM Alam Road': 'Gulberg',
  'Main Boulevard Gulberg': 'Gulberg',
  'DHA': 'DHA',
  'Defence': 'DHA',
  'DHA Lahore': 'DHA',
  'DHA Phase 1': 'DHA',
  'DHA Phase 2': 'DHA',
  'DHA Phase 3': 'DHA',
  'DHA Phase 4': 'DHA',
  'DHA Phase 5': 'DHA',
  'DHA Phase 6': 'DHA',
  'DHA Phase 7': 'DHA',
  'DHA Phase 8': 'DHA',
  'DHA Phase 9': 'DHA',
  'Johar Town': 'Johar Town',
  'Johar Town Phase 1': 'Johar Town',
  'Johar Town Phase 2': 'Johar Town',
  'Expo Centre': 'Johar Town',
  'Cantt': 'Cantt',
  'Lahore Cantt': 'Cantt',
  'Cantonment': 'Cantt',
  'Fortress Stadium': 'Cantt',
  'Model Town': 'Model Town',
  'Model Town Extension': 'Model Town',
  'Model Town Link Road': 'Model Town',
  'Raiwind Road': 'Raiwind Road',
  'Raiwind': 'Raiwind Road',
  'Bahria Town': 'Bahria Town',
  'Wapda Town': 'Wapda Town',
  'Garden Town': 'Garden Town',
  'Faisal Town': 'Faisal Town',
  'Allama Iqbal Town': 'Allama Iqbal Town',
  'Iqbal Town': 'Allama Iqbal Town',
  'Township': 'Township',
  'Lake City': 'Lake City',
  'Valencia': 'Valencia',
  'Shadman': 'Shadman',
  'Other': 'Other',
};

const aliasLookup = new Map(
  Object.entries(AREA_ALIASES).map(([alias, area]) => [normalizeKey(alias), area]),
);

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isArea(value: string): value is Area {
  return (AREAS as readonly string[]).includes(value);
}

/** Maps free text such as "dha phase 5" or "Gulberg-III" to a standard area, if known. */
export function normalizeArea(input: string): Area | undefined {
  return aliasLookup.get(normalizeKey(input));
}

/** URL slug for directory and price-guide pages: `Johar Town` → `johar-town`. */
export function areaSlug(area: Area): string {
  return normalizeKey(area).replace(/ /g, '-');
}

export function areaFromSlug(slug: string): Area | undefined {
  return AREAS.find((area) => areaSlug(area) === slug);
}
