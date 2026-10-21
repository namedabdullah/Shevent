import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AREAS,
  AREA_ALIASES,
  CATEGORIES,
  CATEGORY_UNITS,
  CORE_AREAS,
  EVENT_TYPES,
  PRICE_TIERS,
  PRICE_UNITS,
  VENUE_TYPES,
  areaFromSlug,
  areaSlug,
  categoryFromSlug,
  categorySlug,
  normalizeArea,
} from './index';

const referenceDir = fileURLToPath(new URL('../../../data/reference/', import.meta.url));

function readCsv(name: string): Record<string, string>[] {
  const lines = readFileSync(referenceDir + name, 'utf8').trim().split(/\r?\n/);
  const [header, ...rows] = lines.map(parseCsvLine);
  return rows.map((row) => Object.fromEntries(header!.map((key, i) => [key, row[i] ?? ''])));
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted && char === '"' && line[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

const unique = <T>(values: T[]) => [...new Set(values)];

describe('enums match data/reference/*.csv', () => {
  const categories = readCsv('categories.csv');
  const areas = readCsv('areas.csv');
  const vocab = readCsv('vocab.csv');
  const vocabValues = (field: string) => vocab.filter((r) => r.field === field).map((r) => r.value);

  it('categories', () => {
    expect(categories.map((r) => r.category)).toEqual([...CATEGORIES]);
  });

  it('allowed units per category', () => {
    for (const row of categories) {
      expect(CATEGORY_UNITS[row.category as (typeof CATEGORIES)[number]]).toEqual(row.allowed_units!.split('|'));
    }
  });

  it('venue types', () => {
    const venue = categories.find((r) => r.category === 'venue')!;
    expect(venue.sub_types!.split('|')).toEqual([...VENUE_TYPES]);
  });

  it('areas, core areas and aliases', () => {
    expect(unique(areas.map((r) => r.area))).toEqual([...AREAS]);
    expect(unique(areas.filter((r) => r.core === 'yes').map((r) => r.area))).toEqual([...CORE_AREAS]);
    expect(Object.fromEntries(areas.map((r) => [r.alias, r.area]))).toEqual(AREA_ALIASES);
  });

  it('event types (without the data-only "any")', () => {
    expect(vocabValues('event_type').filter((v) => v !== 'any')).toEqual([...EVENT_TYPES]);
  });

  it('units and price tiers', () => {
    expect(vocabValues('unit')).toEqual([...PRICE_UNITS]);
    expect(vocabValues('price_tier')).toEqual([...PRICE_TIERS]);
  });
});

describe('area helpers', () => {
  it('normalizes free-text aliases', () => {
    expect(normalizeArea('dha phase 5')).toBe('DHA');
    expect(normalizeArea('  Gulberg-III ')).toBe('Gulberg');
    expect(normalizeArea('Iqbal Town')).toBe('Allama Iqbal Town');
    expect(normalizeArea('Karachi')).toBeUndefined();
  });

  it('round-trips slugs', () => {
    for (const area of AREAS) expect(areaFromSlug(areaSlug(area))).toBe(area);
    for (const category of CATEGORIES) expect(categoryFromSlug(categorySlug(category))).toBe(category);
    expect(areaSlug('Johar Town')).toBe('johar-town');
    expect(categorySlug('dj_sound')).toBe('dj-sound');
  });
});
