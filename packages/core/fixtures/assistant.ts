// A rule-based stand-in for #8's parameter extraction, so the assistant chat behaves like the
// real one (asks for what is missing, then estimates) until the Ollama-backed server is live.
// It only reads the host's own words; every number it returns is either one the host typed or
// one from the #1/#2 estimate, which is the same rule the real assistant's output checker enforces.

import { AREA_ALIASES, EVENT_TYPES, type Area, type EventType, type VenueType } from '../enums';
import { parseIsoDate, parsePkr } from '../format';
import type { ChatLanguage, EstimateRequest } from '../schemas';

export type ExtractedPlan = Partial<EstimateRequest>;

/** The fields #1/#2 need, in the order the assistant asks for them. */
export const REQUIRED_PLAN_FIELDS = ['event_type', 'guest_count', 'area', 'event_date', 'total_budget_pkr'] as const;
export type RequiredPlanField = (typeof REQUIRED_PLAN_FIELDS)[number];

const URDU_SCRIPT = /[\u0600-\u06FF]/;
const LATIN_WORD = /[a-z]{3,}/i;
const ROMAN_URDU_WORDS =
  /\b(hai|hain|ka|ki|ke|ko|chahiye|chahye|chaheye|karni|karna|krni|mein|main|liye|log|logon|mehmaan|mehman|shaadi|shadi|kitna|kitne|taqreeban|takreeban|lagbhag|tak|aur|wala|wali)\b/i;

// Most specific first, so "corporate dinner" wins over "corporate".
const EVENT_KEYWORDS: [EventType, RegExp][] = [
  ['wedding_mehndi', /\b(mehndi|mehendi|mehandi|mayun|mayoun|maiyun|dholki)\b|مہندی|مایوں|ڈھولکی/i],
  ['wedding_baraat', /\b(baraat|barat|baraat)\b|بارات|برات/i],
  ['wedding_walima', /\b(walima|valima|waleema)\b|ولیمہ|ولیمے/i],
  ['engagement', /\b(engagement|mangni|nikah|nikkah|nikaah)\b|منگنی|نکاح/i],
  ['birthday', /\b(birthday|b-day|bday|salgirah|saalgirah|salgira)\b|سالگرہ/i],
  ['corporate_dinner', /\b(corporate|company|annual|office)\s+(dinner|gala)\b|\bgala dinner\b/i],
  ['university_gala', /\b(university|uni|college|farewell|convocation)\b/i],
  ['concert', /\b(concert|music night|musical night|qawwali)\b|قوالی/i],
  ['corporate_other', /\b(conference|seminar|product launch|launch event|corporate|office event)\b/i],
  ['private_party', /\b(party|dawat|get-together|get together)\b|دعوت|پارٹی/i],
];

const VENUE_KEYWORDS: [VenueType, RegExp][] = [
  ['marquee', /\b(marquee|marquees|marqee)\b|مارکی/i],
  ['banquet', /\b(banquet|hall|shadi hall|wedding hall)\b|ہال/i],
  ['farmhouse', /\b(farmhouse|farm house)\b|فارم ہاؤس/i],
  ['rooftop', /\b(rooftop|roof top)\b/i],
  ['lawn', /\b(lawn|garden)\b|لان/i],
  ['hotel', /\bhotel\b|ہوٹل/i],
];

const URDU_AREAS: [string, Area][] = [
  ['گلبرگ', 'Gulberg'],
  ['ڈیفنس', 'DHA'],
  ['ڈی ایچ اے', 'DHA'],
  ['جوہر ٹاؤن', 'Johar Town'],
  ['کینٹ', 'Cantt'],
  ['ماڈل ٹاؤن', 'Model Town'],
  ['رائیونڈ', 'Raiwind Road'],
  ['بحریہ ٹاؤن', 'Bahria Town'],
  ['واپڈا ٹاؤن', 'Wapda Town'],
  ['گارڈن ٹاؤن', 'Garden Town'],
  ['فیصل ٹاؤن', 'Faisal Town'],
  ['اقبال ٹاؤن', 'Allama Iqbal Town'],
  ['ٹاؤن شپ', 'Township'],
  ['لیک سٹی', 'Lake City'],
  ['شادمان', 'Shadman'],
];

// Longest alias first, so "Model Town Extension" is found before "Model Town".
const LATIN_AREAS = Object.entries(AREA_ALIASES)
  .filter(([, area]) => area !== 'Other')
  .sort(([a], [b]) => b.length - a.length)
  .map(([alias, area]) => [new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s-]*')}\\b`, 'i'), area] as const);

const MONTHS: [RegExp, number][] = [
  [/^(jan|january)$|^جنوری$/, 1],
  [/^(feb|february)$|^فروری$/, 2],
  [/^(mar|march)$|^مارچ$/, 3],
  [/^(apr|april)$|^اپریل$/, 4],
  [/^may$|^مئی$/, 5],
  [/^(jun|june)$|^جون$/, 6],
  [/^(jul|july)$|^جولائی$/, 7],
  [/^(aug|august)$|^اگست$/, 8],
  [/^(sep|sept|september)$|^ستمبر$/, 9],
  [/^(oct|october)$|^اکتوبر$/, 10],
  [/^(nov|november)$|^نومبر$/, 11],
  [/^(dec|december)$|^دسمبر$/, 12],
];
const MONTH_WORD = '([a-z]{3,9}|جنوری|فروری|مارچ|اپریل|مئی|جون|جولائی|اگست|ستمبر|اکتوبر|نومبر|دسمبر)';

const GUESTS =
  /(\d[\d,]*)\s*\+?\s*(?:guests?|people|persons?|pax|heads?|log|logon|logo|loug|mehmaan|mehman|mehmanon|mehmaanon|مہمانوں|مہمان|لوگوں|لوگ|افراد)/i;
const GUESTS_AFTER = /\b(?:guests?|guest count|people|mehmaan|mehman)\s*[:=-]?\s*(\d[\d,]*)/i;
const BUDGET_UNIT = /(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|laakh|million|mn|thousand|hazaa?r|k|m)\b/i;
const BUDGET_PREFIX = /\b(?:rs\.?|pkr)\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(crores?|cr|lakhs?|lacs?|million|mn|k|m)\b)?/i;
const BUDGET_KEYWORD = /\b(?:budget|bajat)\s*(?:is|of|hai|:|=|-|around|about|approx\.?|taqreeban|takreeban)?\s*(?:rs\.?|pkr)?\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(crores?|cr|lakhs?|lacs?|million|mn|k|m)\b)?/i;

/** Eastern Arabic and Urdu digits to ASCII, and Urdu money words to the ones parsePkr reads. */
function normalize(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/کروڑ/g, ' crore ')
    .replace(/لاکھ/g, ' lakh ')
    .replace(/ہزار/g, ' hazar ');
}

const isoDate = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function monthNumber(word: string): number | undefined {
  const lower = word.toLowerCase();
  return MONTHS.find(([pattern]) => pattern.test(lower))?.[1];
}

/** A date written without a year means its next occurrence from today. */
function resolveDate(day: number, month: number, year: number | undefined, today: string): string | undefined {
  const thisYear = Number(today.slice(0, 4));
  const candidate = isoDate(year ?? thisYear, month, day);
  if (!parseIsoDate(candidate)) return undefined;
  if (year === undefined && candidate < today) return parseIsoDate(isoDate(thisYear + 1, month, day)) ? isoDate(thisYear + 1, month, day) : undefined;
  return candidate;
}

function extractDate(text: string, today: string): string | undefined {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso && parseIsoDate(iso[0])) return iso[0];

  // Day first, as written in Pakistan: 19/12/2026, 19-12-26.
  const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(text);
  if (numeric) {
    const year = Number(numeric[3]!.length === 2 ? `20${numeric[3]}` : numeric[3]);
    return resolveDate(Number(numeric[1]), Number(numeric[2]), year, today);
  }

  // 19 December (2026), 19th Dec. Every candidate is tried, since words like "log" look like months.
  for (const match of text.matchAll(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?${MONTH_WORD}(?![a-z])(?:,?\s*(\d{4}))?`, 'gi'))) {
    const month = monthNumber(match[2]!);
    if (month) return resolveDate(Number(match[1]), month, match[3] ? Number(match[3]) : undefined, today);
  }

  // December 19(th)(, 2026)
  for (const match of text.matchAll(new RegExp(String.raw`${MONTH_WORD}\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?`, 'gi'))) {
    const month = monthNumber(match[1]!);
    if (month) return resolveDate(Number(match[2]), month, match[3] ? Number(match[3]) : undefined, today);
  }
  return undefined;
}

function extractBudget(text: string): number | undefined {
  for (const pattern of [BUDGET_KEYWORD, BUDGET_PREFIX, BUDGET_UNIT]) {
    const match = pattern.exec(text);
    if (!match) continue;
    const amount = parsePkr(`${match[1]!.replace(/,/g, '')} ${match[2] ?? ''}`.trim());
    if (amount !== undefined && amount >= 10_000 && amount <= 500_000_000) return amount;
  }
  return undefined;
}

function extractGuests(text: string): number | undefined {
  const match = GUESTS.exec(text) ?? GUESTS_AFTER.exec(text);
  if (!match) return undefined;
  const count = Number(match[1]!.replace(/,/g, ''));
  return Number.isInteger(count) && count >= 10 && count <= 5000 ? count : undefined;
}

/**
 * Reads one message. Only what is clearly stated is returned; anything unclear stays missing so
 * the assistant asks instead of guessing. Dates in the past are ignored for the same reason.
 */
export function extractPlanParams(message: string, today: string): ExtractedPlan {
  const text = normalize(message);
  const plan: ExtractedPlan = {};

  const eventType = EVENT_KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0];
  if (eventType && (EVENT_TYPES as readonly string[]).includes(eventType)) plan.event_type = eventType;

  const guests = extractGuests(text);
  if (guests !== undefined) plan.guest_count = guests;

  const area = LATIN_AREAS.find(([pattern]) => pattern.test(text))?.[1] ?? URDU_AREAS.find(([name]) => text.includes(name))?.[1];
  if (area) plan.area = area;

  const venue = VENUE_KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0];
  if (venue) plan.venue_type = venue;

  const date = extractDate(text, today);
  if (date && date >= today) plan.event_date = date;

  const budget = extractBudget(text);
  if (budget !== undefined) plan.total_budget_pkr = budget;

  return plan;
}

export function detectLanguage(message: string): ChatLanguage {
  const urdu = URDU_SCRIPT.test(message);
  if (urdu) return LATIN_WORD.test(message.replace(/\b(rs|pkr|dha|lakh|crore)\b/gi, '')) ? 'mixed' : 'ur';
  return ROMAN_URDU_WORDS.test(message) ? 'roman_ur' : 'en';
}

export function missingPlanFields(plan: ExtractedPlan): RequiredPlanField[] {
  return REQUIRED_PLAN_FIELDS.filter((field) => plan[field] === undefined);
}
