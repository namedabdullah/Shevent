import { CATEGORIES, CATEGORY_LABELS, categorySlug, type Category } from '@shevent/core/enums';
import { formatPkrCompact, formatPkrRange } from '@shevent/core/format';
import { AI_ESTIMATE_LABEL } from '@shevent/core/labels';
import type { EstimateResponse } from '@shevent/core/schemas';
import { useTranslations } from 'next-intl';
import { BudgetSplitBar } from '@/components/budget-split-bar';
import { Icon } from '@/components/icons';
import { Link } from '@/i18n/navigation';

/**
 * #1 split + #2 ranges: the chart, then the same numbers as a table (the chart's table view).
 * Not async, so the landing page's try widget and the assistant (Client Components) can show it.
 * Without a `planId` (nothing saved yet) the categories are not links.
 */
export function BudgetSplit({ planId, estimate }: { planId?: string; estimate: EstimateResponse }) {
  const t = useTranslations('PlanDashboard');
  const rows = CATEGORIES.map((category) => ({ category, label: CATEGORY_LABELS[category], ...estimate.allocation[category] }));

  return (
    <div className="flex flex-col gap-6">
      <BudgetSplitBar
        title={t('splitTitle')}
        items={rows.map((row) => ({ category: row.category, label: row.label, share: row.share, amount: formatPkrCompact(row.pkr) }))}
      />

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{t('splitTitle')}</caption>
          <thead>
            <tr className="border-b border-sand-200 text-xs tracking-wide text-sand-600 uppercase">
              <th scope="col" className="py-2.5 pe-2 sm:pe-3 text-start font-semibold">{t('category')}</th>
              <th scope="col" className="py-2.5 pe-2 sm:pe-3 text-end font-semibold">{t('share')}</th>
              <th scope="col" className="py-2.5 pe-2 sm:pe-3 text-end font-semibold">{t('yourBudget')}</th>
              <th scope="col" className="py-2.5 text-end font-semibold">
                {t('typicalPrice')}
                <span className="block text-[0.6875rem] font-normal tracking-normal text-sand-600 normal-case">{AI_ESTIMATE_LABEL}</span>
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((row) => (
              <tr key={row.category} className="border-b border-sand-100 last:border-b-0">
                <th scope="row" className="py-3.5 pe-2 sm:pe-3 text-start font-semibold text-sand-900">
                  {planId ? (
                    <Link
                      href={`/plans/${planId}/${categorySlug(row.category)}`}
                      className="group -my-2 inline-flex min-h-11 items-center gap-2.5 rounded-lg underline decoration-sand-300 underline-offset-4 transition-colors hover:text-brand-700 hover:decoration-brand-700"
                    >
                      <CategoryLabel category={row.category} label={row.label} />
                      <Icon name="chevronRight" className="hidden size-4 text-sand-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700 sm:block" />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-2.5">
                      <CategoryLabel category={row.category} label={row.label} />
                    </span>
                  )}
                </th>
                <td className="py-3.5 pe-2 sm:pe-3 text-end text-sand-700">{Math.round(row.share * 100)}%</td>
                <td className="py-3.5 pe-2 sm:pe-3 text-end font-semibold whitespace-nowrap text-sand-900">{formatPkrCompact(row.pkr)}</td>
                <td className="py-3.5 text-end text-sand-700">
                  {formatPkrRange(row.range[0], row.range[1])}
                  {row.pkr < row.range[0] && (
                    <span className="mt-1 flex items-center justify-end gap-1 text-xs font-medium text-amber-800">
                      <Icon name="alert" className="size-3.5" />
                      {t('belowRange')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryLabel({ category, label }: { category: Category; label: string }) {
  return (
    <>
      {/* Hidden on phones so six rows fit 360px without scrolling; the bar's legend pairs each colour with its name. */}
      <span aria-hidden className="hidden size-3 shrink-0 rounded-[3px] sm:inline-block" style={{ background: `var(--series-${category})` }} />
      {label}
    </>
  );
}
