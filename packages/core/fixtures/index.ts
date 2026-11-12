// Mock API responses that follow README §9, shared by web and mobile until the model server is
// live. The numbers and vendors are placeholders, not market data: every fixture response has
// model_version "fixture" so the UI can show SAMPLE_DATA_LABEL.

import { CATEGORIES, CATEGORY_LABELS, EVENT_TYPE_LABELS, type Category } from '../enums';
import { formatEventDate, formatPkrCompact, formatPkrRange, todayInLahore } from '../format';
import type { FairnessLevel } from '../labels';
import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantIntent,
  EstimateRequest,
  EstimateResponse,
  FeedbackResponse,
  Match,
  PackageKind,
  PackagesRequest,
  PackagesResponse,
  PortfolioCheckResponse,
  PriceRange,
  QuoteCheckRequest,
  QuoteCheckResponse,
  RecommendRequest,
  RecommendResponse,
  ReviewInsightsResponse,
  VendorSummary,
} from '../schemas';
import { estimateRequestSchema } from '../schemas';
import { detectLanguage, extractPlanParams, missingPlanFields, type ExtractedPlan, type RequiredPlanField } from './assistant';
import estimateRequestJson from './estimate.request.json';
import estimateResponseJson from './estimate.response.json';
import vendorsJson from './vendors.json';

export const FIXTURE_MODEL_VERSION = 'fixture';

export { detectLanguage, extractPlanParams, missingPlanFields, REQUIRED_PLAN_FIELDS, type ExtractedPlan, type RequiredPlanField } from './assistant';

export const estimateRequestFixture = estimateRequestJson as EstimateRequest;
export const estimateResponseFixture = estimateResponseJson as EstimateResponse;

interface FixtureVendor extends VendorSummary {
  areas_served: string[];
  capacity_max: number | null;
  event_types: string[];
  /** Price relative to the category budget (1 = exactly the budget). */
  price_factor: number;
  fixture_score: number;
  sponsored: boolean;
}

/** Fictional "Demo …" vendors, one or more per category. */
export const fixtureVendors = vendorsJson as FixtureVendor[];

export function isFixtureResponse(response: { model_version: string }): boolean {
  return response.model_version === FIXTURE_MODEL_VERSION;
}

const roundTo1000 = (value: number) => Math.round(value / 1000) * 1000;
const floorTo1000 = (value: number) => Math.floor(value / 1000) * 1000;

function toSummary(vendor: FixtureVendor): VendorSummary {
  const { vendor_id, slug, name, category, base_area, price_tier, verified, rating, review_count } = vendor;
  return { vendor_id, slug, name, category, base_area, price_tier, verified, rating, review_count };
}

/**
 * #1 + #2: the estimate fixture rescaled to the request's budget, so the try widget reacts to its
 * inputs. The fixture's warning and explanation describe its own Gulberg / December event, so
 * they are swapped for neutral sample text.
 */
export function fixtureEstimate(request: EstimateRequest): EstimateResponse {
  const base = estimateResponseFixture;
  // Like the real allocator, only the chosen services share the budget, in the same proportions.
  const chosen = CATEGORIES.filter((category) => !request.categories || request.categories.includes(category));
  const total = chosen.reduce((sum, category) => sum + base.allocation[category]!.share, 0);
  const allocation = Object.fromEntries(
    chosen.map((category) => {
      const item = base.allocation[category]!;
      const share = item.share / total;
      const pkr = roundTo1000(share * request.total_budget_pkr);
      // The typical price doesn't depend on which other services were chosen.
      const fullShare = roundTo1000(item.share * request.total_budget_pkr);
      const [low, high] = item.range.map((bound) => roundTo1000((bound / item.pkr) * fullShare)) as PriceRange;
      return [category, { share, pkr, range: [low, high] }];
    }),
  ) as EstimateResponse['allocation'];
  return {
    ...base,
    allocation,
    season_factor: null,
    warnings: ['Sample warning: date and area risks (such as smog season) appear here'],
    explanations: ['Sample explanation: the reasons behind each share appear here'],
  };
}

/** #3: the category's demo vendors, ranked by their fixed sample score. */
export function fixtureRecommend(request: RecommendRequest): RecommendResponse {
  const { plan, category, budget_pkr } = request;
  const label = CATEGORY_LABELS[category].toLowerCase();

  const toMatch = (vendor: FixtureVendor): Match => {
    const centre = budget_pkr * vendor.price_factor;
    const price_range: PriceRange = [roundTo1000(centre * 0.85), roundTo1000(centre * 1.1)];
    const reasons = [
      price_range[1] <= budget_pkr
        ? `Within your ${label} budget`
        : price_range[0] <= budget_pkr
          ? `Can fit your ${label} budget at the lower end`
          : `Above your ${label} budget`,
    ];
    if (vendor.areas_served.includes(plan.area)) reasons.push(`Serves ${plan.area}`);
    if (vendor.capacity_max !== null && vendor.capacity_max >= plan.guest_count) reasons.push(`Fits ${plan.guest_count} guests`);
    if (vendor.event_types.includes(plan.event_type)) reasons.push('Has done similar events');
    return { ...toSummary(vendor), score: vendor.fixture_score, price_range, reasons, is_new: vendor.review_count === 0 };
  };

  const candidates = fixtureVendors.filter((vendor) => vendor.category === category);
  const byScore = (a: Match, b: Match) => b.score - a.score;
  return {
    category,
    matches: candidates.filter((v) => !v.sponsored).map(toMatch).sort(byScore).slice(0, request.limit),
    sponsored: candidates.filter((v) => v.sponsored).map(toMatch),
    model_version: FIXTURE_MODEL_VERSION,
  };
}

const PACKAGE_SPEND: Record<PackageKind, number> = { cheapest: 0.75, balanced: 0.9, highest_quality: 1 };

/** #4: three bundles that spend 75%, 90% and 100% of each category's allocation. */
export function fixturePackages(request: PackagesRequest): PackagesResponse {
  const estimate = fixtureEstimate({ ...request.plan, categories: request.categories });
  const unavailable = new Set(request.unavailable_vendor_ids);
  const options = (category: Category) =>
    fixtureVendors.filter((v) => v.category === category && !v.sponsored && !unavailable.has(v.vendor_id));
  const filled = request.categories.filter((category) => options(category).length > 0);
  const pick = (kind: PackageKind, category: Category) => {
    const rank = (v: FixtureVendor) =>
      kind === 'cheapest' ? -v.price_factor : kind === 'highest_quality' ? (v.rating ?? 0) : v.fixture_score;
    return options(category).reduce((best, v) => (rank(v) > rank(best) ? v : best));
  };

  const packages = filled.length === 0 ? [] : (Object.keys(PACKAGE_SPEND) as PackageKind[]).map((kind) => {
    const items = filled.map((category) => {
      const vendor = pick(kind, category);
      const price_pkr = floorTo1000(estimate.allocation[category]!.pkr * PACKAGE_SPEND[kind]);
      return {
        vendor: toSummary(vendor),
        price_pkr,
        price_is_estimate: vendor.review_count === 0,
        price_range: [floorTo1000(price_pkr * 0.85), Math.ceil((price_pkr * 1.15) / 1000) * 1000] as PriceRange,
        score: vendor.fixture_score,
      };
    });
    return { kind, total_pkr: items.reduce((sum, item) => sum + item.price_pkr, 0), items };
  });

  return {
    budget_pkr: request.plan.total_budget_pkr,
    packages,
    unfilled_categories: request.categories.filter((category) => !filled.includes(category)),
    cheapest_total_pkr: null,
    model_version: FIXTURE_MODEL_VERSION,
  };
}

/**
 * #5's inclusion checklist, identical to data/reference/quote_checklist.csv (a test checks it). The model server
 * also reads cue words ("not included", "extra") and wants a number for some items; the fixture only matches keywords.
 */
export const INCLUSION_CHECKLIST: Record<Category, { item: string; label: string; keywords: string[] }[]> = {
  venue: [
    { item: 'generator_fuel', label: 'Generator fuel', keywords: ['generator', 'genset', 'fuel', 'diesel'] },
    { item: 'service_tax', label: 'Service tax', keywords: ['tax', 'gst', 'pst'] },
    { item: 'overtime', label: 'Overtime charges', keywords: ['overtime', 'extra hour', 'extra time'] },
  ],
  catering: [
    { item: 'serving_staff', label: 'Serving staff', keywords: ['staff', 'waiter', 'bearer'] },
    { item: 'crockery', label: 'Crockery and cutlery', keywords: ['crockery', 'cutlery', 'plates'] },
    { item: 'service_tax', label: 'Service tax', keywords: ['tax', 'gst', 'pst'] },
    { item: 'transport', label: 'Transport', keywords: ['transport', 'delivery', 'carriage'] },
  ],
  decor: [
    {
      item: 'setup_teardown',
      label: 'Setup and teardown',
      keywords: ['setup', 'set up', 'set-up', 'teardown', 'dismantl', 'installation'],
    },
    { item: 'transport', label: 'Transport', keywords: ['transport', 'delivery', 'carriage'] },
  ],
  dj_sound: [
    { item: 'overtime', label: 'Overtime charges', keywords: ['overtime', 'extra hour', 'extra time'] },
    { item: 'sound_permit', label: 'Sound permit', keywords: ['permit', 'noc'] },
    { item: 'generator_fuel', label: 'Generator fuel', keywords: ['generator', 'genset', 'fuel', 'diesel'] },
  ],
  lighting: [
    { item: 'generator_fuel', label: 'Generator fuel', keywords: ['generator', 'genset', 'fuel', 'diesel'] },
    {
      item: 'setup_teardown',
      label: 'Setup and teardown',
      keywords: ['setup', 'set up', 'set-up', 'teardown', 'dismantl', 'installation'],
    },
    { item: 'transport', label: 'Transport', keywords: ['transport', 'delivery', 'carriage'] },
  ],
  photography: [
    { item: 'edited_photos', label: 'Number of edited photos', keywords: ['edited', 'photos', 'pictures', 'pics', 'images'] },
    { item: 'delivery_time', label: 'Delivery time', keywords: ['deliver', 'turnaround', 'days', 'weeks'] },
    { item: 'album_prints', label: 'Album or prints', keywords: ['album', 'print'] },
    { item: 'overtime', label: 'Overtime charges', keywords: ['overtime', 'extra hour', 'extra time'] },
  ],
};

/**
 * #5: the 🟢 / 🟡 up to 25% above / 🔴 rule applied to the fixture's range, scaled by guest count
 * (the request carries no budget). The fixture ignores the vendor's tier.
 */
export function fixtureQuoteCheck(request: QuoteCheckRequest): QuoteCheckResponse {
  const base = estimateResponseFixture.allocation[request.category]!.range;
  const scale = request.plan.guest_count / estimateRequestFixture.guest_count;
  const [low, high] = base.map((bound) => bound * scale) as PriceRange;
  const divisor =
    request.unit === 'per_head' ? request.plan.guest_count : request.unit === 'per_hour' ? (request.hours ?? 4) : 1;
  const typical_range: PriceRange = [Math.round(low / divisor), Math.round(high / divisor)];

  const above = request.quoted_pkr > typical_range[1] ? (request.quoted_pkr / typical_range[1] - 1) * 100 : null;
  const below = request.quoted_pkr < typical_range[0] ? (1 - request.quoted_pkr / typical_range[0]) * 100 : null;
  const level: FairnessLevel = above === null ? 'green' : above <= 25 ? 'yellow' : 'red';

  const checklist = INCLUSION_CHECKLIST[request.category];
  const exclusions = request.exclusions ?? [];
  const mentions = (text: string, keywords: string[]) => keywords.some((keyword) => text.toLowerCase().includes(keyword));
  const excluded = (keywords: string[]) => exclusions.some((text) => mentions(text, keywords));
  const mentioned = [...request.inclusions, request.notes ?? ''].join(' ');

  return {
    level,
    typical_range,
    unit: request.unit,
    percent_above_high: above === null ? null : Math.round(above),
    percent_below_low: below === null ? null : Math.round(below),
    ask_about: checklist
      .filter((item) => !excluded(item.keywords) && !mentions(mentioned, item.keywords))
      .map((item) => item.label),
    charged_extra: [
      ...checklist.filter((item) => excluded(item.keywords)).map((item) => item.label),
      ...exclusions.filter((text) => !checklist.some((item) => mentions(text, item.keywords))),
    ],
    compared_with: 'all_vendors',
    model_version: FIXTURE_MODEL_VERSION,
  };
}

/** #6 */
export function fixtureReviewInsights(vendorId: string): ReviewInsightsResponse {
  return {
    vendor_id: vendorId,
    review_count: 24,
    aspects: [
      { aspect: 'food_quality', positive: 15, negative: 2 },
      { aspect: 'punctuality', positive: 6, negative: 5 },
      { aspect: 'staff_behaviour', positive: 9, negative: 1 },
      { aspect: 'value_for_money', positive: 7, negative: 3 },
      { aspect: 'hidden_charges', positive: 0, negative: 2 },
    ],
    pros: ['Sample pro: guests praised the food', 'Sample pro: polite serving staff'],
    cons: ['Sample con: sometimes arrives late', 'Sample con: extra charges mentioned twice'],
    model_version: FIXTURE_MODEL_VERSION,
  };
}

/** #7 */
export const portfolioCheckFixture: PortfolioCheckResponse = {
  tags: [
    { label: 'stage', score: 0.91 },
    { label: 'floral', score: 0.84 },
    { label: 'fairy lights', score: 0.62 },
  ],
  duplicate: { status: 'unique', matches: [] },
  phash: '0000000000000000',
  model_version: FIXTURE_MODEL_VERSION,
};

export const feedbackFixture: FeedbackResponse = { accepted: true };

const FIELD_QUESTIONS: Record<RequiredPlanField, string> = {
  event_type: 'what the event is (for example a mehndi, baraat, walima or birthday)',
  guest_count: 'how many guests',
  area: 'the area in Lahore',
  event_date: 'the date',
  total_budget_pkr: 'your total budget',
};

const listWithAnd = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** "a mehndi / mayun / dholki for 300 guests in Gulberg on Sat, 19 Dec 2026 with a budget of Rs 25 lakh" */
function describePlan(plan: ExtractedPlan): string {
  const parts = [plan.event_type ? `a ${EVENT_TYPE_LABELS[plan.event_type].toLowerCase()}` : 'an event'];
  if (plan.guest_count) parts.push(`for ${plan.guest_count} guests`);
  if (plan.area) parts.push(`in ${plan.area}`);
  if (plan.event_date) parts.push(`on ${formatEventDate(plan.event_date)}`);
  if (plan.total_budget_pkr) parts.push(`with a budget of ${formatPkrCompact(plan.total_budget_pkr)}`);
  return parts.join(' ');
}

// #8's question types, read with a short version of the server's rules (server/app/assistant/intent.py).
const INTENT_CUES: [AssistantIntent, RegExp][] = [
  ['budget_split', /\b(split|divide|allocate|allocation|break ?down|distribute|taqseem|baant)\b|تقسیم/i],
  ['quote_check', /\b(quote|quoted|asking|charging|fair|reasonable|too much|overpriced|mehnga)\b|مہنگا/i],
  ['vendors', /\b(suggest|recommend|find|looking for|best|top|options|batao|koi)\b|بتائیں/i],
  ['prices', /\b(how much|cost|costs|price|prices|rate|rates|kitna|kitne|kitni|kharcha)\b|کتنا|کتنے|قیمت|خرچ/i],
];
const GREETING = /^\s*(hi|hello|hey|salam|salaam|aoa|thanks|thank you|shukriya)\b[\s!.,?]*$/i;
const SERVICE_WORDS: Record<Category, RegExp> = {
  venue: /\b(venue|venues|hall|marquee|banquet|lawn|farmhouse)\b|ہال|مارکی/i,
  catering: /\b(catering|caterers?|food|menu|khana)\b|کھانا/i,
  decor: /\b(decor|decoration|decorators?|stage|flowers)\b|سجاوٹ/i,
  dj_sound: /\b(dj|sound|music|dhol)\b|ڈی جے/i,
  lighting: /\b(lighting|lights)\b|روشنی/i,
  photography: /\b(photographers?|photography|photos?|video|videographer)\b|فوٹو/i,
};
const QUOTED = /\b(rs\.?\s*\d|\d[\d,.]*\s*(lakh|lac|k|crore)\b|\d[\d,]*\s*(per|\/|a)\s*(head|person|plate))/i;
const VENDOR_WORDS: Record<Category, string> = {
  venue: 'venues', catering: 'caterers', decor: 'decorators', dj_sound: 'DJs', lighting: 'lighting providers', photography: 'photographers',
};
const FIXTURE_HELLO =
  'Sample reply: hello! I can tell you typical prices, suggest vendors, check a quote you received, or split your budget. What are you planning?';
const FIXTURE_ADVICE =
  'Sample reply: book the venue first, settle the guest count before asking for quotes, and get every quote in writing with what it includes.';

function messageIntent(text: string): AssistantIntent | undefined {
  if (GREETING.test(text)) return 'greeting';
  const named = servicesNamed(text).length > 0;
  for (const [intent, cue] of INTENT_CUES) {
    if (!cue.test(text)) continue;
    if (intent === 'quote_check' && !QUOTED.test(text)) continue;
    if (intent === 'vendors' && !named) continue;
    return intent;
  }
  return undefined;
}

function servicesNamed(text: string): Category[] {
  return CATEGORIES.filter((category) => SERVICE_WORDS[category].test(text));
}

/** A plan the price fixtures accept: the host's details, with sample values for the rest. */
function samplePlan(plan: ExtractedPlan, today: string): EstimateRequest {
  return estimateRequestSchema.parse({
    area: 'Gulberg',
    event_date: today,
    total_budget_pkr: 2_500_000,
    ...plan,
    categories: undefined,
  });
}

/**
 * #8: reads what the host asks for with simple rules (a message without a cue continues the one
 * before), asks for what that answer needs, and answers it from the other fixtures. Only a request
 * to split the budget gets an estimate; after three messages that add nothing to one, it hands over
 * to the planner form, as the real assistant does.
 */
export function fixtureAssistantChat(request: AssistantChatRequest, today: string = todayInLahore()): AssistantChatResponse {
  const userMessages = request.messages.filter((message) => message.role === 'user').map((message) => message.content);
  const perMessage = userMessages.map((message) => extractPlanParams(message, today));
  const extracted: ExtractedPlan = Object.assign({}, ...perMessage);
  const last = userMessages[userMessages.length - 1] ?? '';
  const asking = [...userMessages].reverse().findIndex((message) => messageIntent(message) !== undefined);
  const askedAt = asking === -1 ? -1 : userMessages.length - 1 - asking;
  const intent: AssistantIntent = askedAt === -1 ? 'advice' : messageIntent(userMessages[askedAt]!)!;
  const asked = askedAt === -1 ? last : userMessages.slice(askedAt).join('\n');
  const services = servicesNamed(last).length > 0 ? servicesNamed(last) : servicesNamed(asked);
  const base = {
    language: detectLanguage(last),
    intent,
    extracted,
    missing: [] as string[],
    estimate: null,
    recommendations: null,
    fallback_to_form: false,
    model_version: FIXTURE_MODEL_VERSION,
  };
  const ask = (why: string, missing: string[]) => {
    const understood = Object.keys(extracted).length > 0 ? `Got it: ${describePlan(extracted)}. ` : '';
    const questions = missing.map((field) =>
      field === 'category' ? 'which service' : field === 'quote' ? 'the price you were quoted' : FIELD_QUESTIONS[field as RequiredPlanField],
    );
    return { ...base, missing, reply: `Sample reply: ${understood}${why} I still need ${listWithAnd(questions)}.` };
  };
  const needs = (fields: string[]) =>
    fields.filter((field) => (field === 'category' ? services.length === 0 : field === 'quote' ? !QUOTED.test(asked) : !(field in extracted)));

  switch (intent) {
    case 'greeting':
      return { ...base, reply: FIXTURE_HELLO };
    case 'budget_split': {
      const missing = missingPlanFields(extracted);
      if (missing.length > 0) {
        const stuck = perMessage.length >= 3 && perMessage.slice(-3).every((plan) => Object.keys(plan).length === 0);
        if (stuck) {
          return {
            ...base,
            missing,
            reply: "Sample reply: I couldn't work out the rest from our chat. The planner form will ask for it, with what I understood already filled in.",
            fallback_to_form: true,
          };
        }
        return ask('To work out your budget split', missing);
      }
      // A venue type ("in a marquee") isn't a choice of services; the word "venue" is.
      const chosen = servicesNamed(asked).filter((category) => category !== 'venue' || /\bvenues?\b/i.test(asked));
      const plan = estimateRequestSchema.parse({ ...extracted, categories: chosen.length > 0 ? chosen : undefined });
      const estimate = fixtureEstimate(plan);
      const [top] = Object.entries(estimate.allocation).sort(([, a], [, b]) => b.share - a.share);
      return {
        ...base,
        extracted: plan,
        estimate,
        reply:
          `Sample reply: here is a budget split for ${describePlan(plan)}. ` +
          `The biggest share goes to ${CATEGORY_LABELS[top![0] as Category].toLowerCase()}, about ${formatPkrCompact(top![1].pkr)}. ` +
          'Save it as a plan to see vendors that fit.',
      };
    }
    case 'vendors': {
      const missing = needs(['category', 'event_type', 'guest_count', 'area']);
      if (missing.length > 0) return ask('To suggest vendors that fit', missing);
      const category = services[0]!;
      const plan = samplePlan(extracted, today);
      const budget = fixtureEstimate(plan).allocation[category]!.pkr;
      const { matches } = fixtureRecommend({ plan, category, budget_pkr: budget, limit: 3 });
      const list = matches.map((match, index) => `${index + 1}. ${match.name} (${match.base_area})`).join('\n');
      return {
        ...base,
        recommendations: { category, matches },
        reply: `Sample reply: here are ${VENDOR_WORDS[category]} that fit ${describePlan(extracted)}:\n${list}`,
      };
    }
    case 'prices': {
      const missing = needs(['event_type', 'guest_count']);
      if (missing.length > 0) return ask('To estimate typical prices', missing);
      const estimate = fixtureEstimate(samplePlan(extracted, today));
      const shown = services.length > 0 ? services : CATEGORIES;
      const lines = shown.map((category) => `- ${CATEGORY_LABELS[category]}: ${formatPkrRange(...estimate.allocation[category]!.range)}`);
      return { ...base, reply: `Sample reply: typical prices for ${describePlan(extracted)}:\n${lines.join('\n')}` };
    }
    case 'quote_check': {
      const missing = needs(['category', 'quote', 'event_type', 'guest_count']);
      if (missing.length > 0) return ask('To check that quote', missing);
      return { ...base, reply: `Sample reply: that ${CATEGORY_LABELS[services[0]!].toLowerCase()} quote is within the usual range for this event.` };
    }
    default:
      return { ...base, reply: FIXTURE_ADVICE };
  }
}
