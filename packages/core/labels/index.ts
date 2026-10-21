// Required wording (WEB_APP_PLAN §5.4 honesty rules). Web and mobile must use these
// constants instead of retyping the text, so the wording can't drift between clients.

/** Shown next to every AI price, together with its range. */
export const AI_ESTIMATE_LABEL = 'AI estimate, not a vendor quote';

/** Shown on every sponsored or featured listing. Sponsored results always sit in their own block. */
export const SPONSORED_LABEL = 'Sponsored';

export const SPONSORED_NOTE = 'Sponsored listings are paid placements. Payment never changes match, quality or trust scores.';

/** Shown while the apps run on fixtures instead of the model server. */
export const SAMPLE_DATA_LABEL = 'Sample numbers for illustration, not market prices';

/** Quote fairness levels from #5 (🟢 inside the range · 🟡 up to 25% above · 🔴 more than 25% above). */
export const FAIRNESS_LEVELS = ['green', 'yellow', 'red'] as const;
export type FairnessLevel = (typeof FAIRNESS_LEVELS)[number];

// Guidance wording only: never accuse the vendor.
export const FAIRNESS_LABELS: Record<FairnessLevel, { title: string; guidance: string }> = {
  green: {
    title: 'Within the typical range',
    guidance: 'This quote is in line with similar events. Still confirm what is included.',
  },
  yellow: {
    title: 'Above the typical range',
    guidance: 'Ask the vendor what is included. Extras can explain a higher price.',
  },
  red: {
    title: 'Well above the typical range',
    guidance: 'Ask about what is included before you book, and compare with another quote.',
  },
};
