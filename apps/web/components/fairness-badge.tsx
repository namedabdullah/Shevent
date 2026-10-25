import { formatPkrRange, UNIT_LABELS } from '@shevent/core/format';
import { AI_ESTIMATE_LABEL, FAIRNESS_LABELS, type FairnessLevel } from '@shevent/core/labels';
import type { QuoteCheckResponse } from '@shevent/core/schemas';
import { getTranslations } from 'next-intl/server';

// Status colours (good / warning / critical) always come with an icon and a label, never colour alone.
const STYLE: Record<FairnessLevel, { icon: string; className: string }> = {
  green: { icon: '✓', className: 'border-green-600 bg-green-50 text-green-950' },
  yellow: { icon: '!', className: 'border-amber-500 bg-amber-50 text-amber-950' },
  red: { icon: '!!', className: 'border-red-600 bg-red-50 text-red-950' },
};

/** #5 verdict for a quote: guidance wording and an "ask about" checklist, never an accusation. */
export async function FairnessBadge({ check }: { check: QuoteCheckResponse }) {
  const t = await getTranslations('Quote');
  const label = FAIRNESS_LABELS[check.level];
  const style = STYLE[check.level];
  return (
    <div className={`flex flex-col gap-2 rounded-lg border-s-4 px-4 py-3 ${style.className}`}>
      <p className="flex items-center gap-2 font-semibold">
        <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-full border border-current text-xs">
          {style.icon}
        </span>
        {label.title}
        {check.percent_above_high !== null && (
          <span className="font-normal">{t('aboveBy', { percent: check.percent_above_high })}</span>
        )}
      </p>
      <p className="text-sm">{label.guidance}</p>
      <p className="text-sm">
        {t('typical', { range: formatPkrRange(check.typical_range[0], check.typical_range[1]), unit: UNIT_LABELS[check.unit] })}{' '}
        <span className="opacity-80">({AI_ESTIMATE_LABEL})</span>
      </p>
      {check.ask_about.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">{t('askAbout')}</p>
          <ul className="list-disc ps-5">
            {check.ask_about.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
