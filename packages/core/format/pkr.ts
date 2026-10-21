// PKR formatting with lakh / crore, done by hand so web (any browser) and mobile (Hermes)
// print exactly the same text. 1 lakh = 100,000 PKR, 1 crore = 100 lakh.

import type { PriceUnit } from '../enums';

export const LAKH = 100_000;
export const CRORE = 10_000_000;

const CURRENCY = 'Rs';

/** 2500000 → "2,500,000" */
export function formatNumber(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 2500000 → "Rs 2,500,000" */
export function formatPkr(value: number): string {
  return `${CURRENCY} ${formatNumber(value)}`;
}

function trimDecimals(value: number, maxDecimals: number): string {
  return String(Number(value.toFixed(maxDecimals)));
}

type CompactUnit = 'none' | 'lakh' | 'crore';

function compactUnit(value: number): CompactUnit {
  const abs = Math.abs(value);
  if (abs >= CRORE) return 'crore';
  if (abs >= LAKH) return 'lakh';
  return 'none';
}

function compactNumber(value: number, unit: CompactUnit): string {
  if (unit === 'crore') return trimDecimals(value / CRORE, 2);
  if (unit === 'lakh') return trimDecimals(value / LAKH, 2);
  return formatNumber(value);
}

const unitSuffix: Record<CompactUnit, string> = { none: '', lakh: ' lakh', crore: ' crore' };

/** 85000 → "Rs 85,000" · 2500000 → "Rs 25 lakh" · 12500000 → "Rs 1.25 crore" */
export function formatPkrCompact(value: number): string {
  const unit = compactUnit(value);
  return `${CURRENCY} ${compactNumber(value, unit)}${unitSuffix[unit]}`;
}

/** [650000, 880000] → "Rs 6.5–8.8 lakh" · [85000, 120000] → "Rs 85,000 – 1.2 lakh" */
export function formatPkrRange(low: number, high: number): string {
  const lowUnit = compactUnit(low);
  const highUnit = compactUnit(high);
  if (lowUnit === highUnit) {
    return `${CURRENCY} ${compactNumber(low, lowUnit)}–${compactNumber(high, highUnit)}${unitSuffix[highUnit]}`;
  }
  return `${CURRENCY} ${compactNumber(low, lowUnit)}${unitSuffix[lowUnit]} – ${compactNumber(high, highUnit)}${unitSuffix[highUnit]}`;
}

export const UNIT_LABELS: Record<PriceUnit, string> = {
  per_head: 'per head',
  per_event: 'per event',
  per_hour: 'per hour',
  per_package: 'per package',
  per_slot: 'per slot',
  per_setup: 'per setup',
};

/** (1800, "per_head") → "Rs 1,800 per head" */
export function formatPkrPerUnit(value: number, unit: PriceUnit): string {
  return `${formatPkr(value)} ${UNIT_LABELS[unit]}`;
}

const multipliers: [RegExp, number][] = [
  [/^(crore|crores|cr)$/, CRORE],
  [/^(lakh|lakhs|lac|lacs|l)$/, LAKH],
  [/^(million|mn|m)$/, 1_000_000],
  [/^(thousand|hazar|hazaar|k)$/, 1_000],
];

/**
 * Parses how people in Lahore write budgets: "25 lakh", "25 lac", "2.5m", "1 crore",
 * "85k", "85 hazar", "Rs 2,500,000". Returns undefined when the text isn't a single amount.
 */
export function parsePkr(input: string): number | undefined {
  const text = input
    .toLowerCase()
    .trim()
    .replace(/^(rs\.?|pkr)\s*/, '')
    .replace(/,/g, '');
  const match = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/.exec(text);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const word = match[2] ?? '';
  if (word === '') return amount;
  const multiplier = multipliers.find(([pattern]) => pattern.test(word))?.[1];
  return multiplier === undefined ? undefined : Math.round(amount * multiplier);
}
