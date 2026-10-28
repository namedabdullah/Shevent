import { formatPkrRange, UNIT_LABELS } from '@shevent/core/format';
import { AI_ESTIMATE_LABEL, FAIRNESS_LABELS, type FairnessLevel } from '@shevent/core/labels';
import type { QuoteCheckResponse } from '@shevent/core/schemas';
import { useTranslations } from 'next-intl';
import { Icon, type IconName } from '@/components/icons';

// Status colours (good / warning / critical) always come with an icon and a label, never colour alone.
const STYLE: Record<FairnessLevel, { icon: IconName; box: string; mark: string }> = {
  green: { icon: 'check', box: 'border-green-600/40 bg-green-50 text-green-950', mark: 'bg-green-700 text-white' },
  yellow: { icon: 'info', box: 'border-amber-400/70 bg-amber-50 text-amber-950', mark: 'bg-amber-500 text-amber-950' },
  red: { icon: 'alert', box: 'border-red-300 bg-red-50 text-red-950', mark: 'bg-red-700 text-white' },
};

/**
 * #5 verdict for a quote: guidance wording and an "ask about" checklist, never an accusation.
 * Not async, so the vendor's live preview (a Client Component) shows exactly what the host sees.
 */
export function FairnessBadge({ check }: { check: QuoteCheckResponse }) {
  const t = useTranslations('Quote');
  const label = FAIRNESS_LABELS[check.level];
  const style = STYLE[check.level];
  return (
    <div className={`flex animate-enter flex-col gap-3 rounded-2xl border p-4 ${style.box}`}>
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-semibold">
        <span aria-hidden className={`inline-flex size-7 items-center justify-center rounded-full ${style.mark}`}>
          <Icon name={style.icon} className="size-4" />
        </span>
        {label.title}
        {check.percent_above_high !== null && <span className="font-normal">{t('aboveBy', { percent: check.percent_above_high })}</span>}
      </p>
      <p className="text-sm leading-relaxed">{label.guidance}</p>
      <p className="text-sm">
        {t('typical', { range: formatPkrRange(check.typical_range[0], check.typical_range[1]), unit: UNIT_LABELS[check.unit] })}{' '}
        <span className="opacity-80">({AI_ESTIMATE_LABEL})</span>
      </p>
      {check.ask_about.length > 0 && (
        <div className="rounded-xl bg-white/70 p-3 text-sm">
          <p className="font-semibold">{t('askAbout')}</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {check.ask_about.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-60" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
