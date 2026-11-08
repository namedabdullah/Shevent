import { formatPkrRange, UNIT_LABELS } from '@shevent/core/format';
import { AI_ESTIMATE_LABEL, FAIRNESS_LABELS, type FairnessLevel } from '@shevent/core/labels';
import type { QuoteCheckResponse } from '@shevent/core/schemas';
import { useTranslations } from 'next-intl';
import { Icon, type IconName } from '@/components/icons';

// Status colours (good / warning / critical) always come with an icon and a label, never colour alone.
const STYLE: Record<FairnessLevel, { icon: IconName; box: string; mark: string }> = {
  green: { icon: 'check', box: 'border-success-line bg-success-soft text-success-ink', mark: 'bg-success text-on-solid' },
  yellow: { icon: 'info', box: 'border-warning-line bg-warning-soft text-warning-ink', mark: 'bg-warning text-on-solid' },
  red: { icon: 'alert', box: 'border-danger-line bg-danger-soft text-danger-ink', mark: 'bg-danger text-on-solid' },
};

const FAR_BELOW_PERCENT = 30;

/**
 * #5 verdict for a quote: guidance wording and an "ask about" checklist, never an accusation.
 * Not async, so the vendor's live preview (a Client Component) shows exactly what the host sees.
 */
export function FairnessBadge({ check }: { check: QuoteCheckResponse }) {
  const t = useTranslations('Quote');
  const label = FAIRNESS_LABELS[check.level];
  const style = STYLE[check.level];
  // A little under the range is just a good price; well under it is worth a second look.
  const below = check.percent_below_low ?? 0;
  const farBelow = below >= FAR_BELOW_PERCENT;
  return (
    <div className={`flex animate-enter flex-col gap-3 rounded-2xl border p-4 ${style.box}`}>
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-semibold">
        <span aria-hidden className={`inline-flex size-7 items-center justify-center rounded-full ${style.mark}`}>
          <Icon name={style.icon} className="size-4" />
        </span>
        {label.title}
        {check.percent_above_high !== null && <span className="font-normal">{t('aboveBy', { percent: check.percent_above_high })}</span>}
        {farBelow && <span className="font-normal">{t('belowBy', { percent: below })}</span>}
      </p>
      <p className="text-sm leading-relaxed">{farBelow ? t('belowNote') : label.guidance}</p>
      <p className="text-sm">
        {t(check.compared_with === 'same_tier' ? 'typicalSameTier' : 'typical', {
          range: formatPkrRange(check.typical_range[0], check.typical_range[1]),
          unit: UNIT_LABELS[check.unit],
        })}{' '}
        <span className="opacity-80">({AI_ESTIMATE_LABEL})</span>
      </p>
      <ItemList title={t('chargedExtra')} items={check.charged_extra} />
      <ItemList title={t('askAbout')} items={check.ask_about} />
    </div>
  );
}

function ItemList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl bg-surface/70 p-3 text-sm">
      <p className="font-semibold">{title}</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-60" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
