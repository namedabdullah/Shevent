import { CATEGORIES, CATEGORY_LABELS, categorySlug } from '@shevent/core/enums';
import { formatPkrCompact, formatPkrRange } from '@shevent/core/format';
import { AI_ESTIMATE_LABEL } from '@shevent/core/labels';
import type { EstimateResponse } from '@shevent/core/schemas';
import { getTranslations } from 'next-intl/server';
import { BudgetSplitBar } from '@/components/budget-split-bar';
import { Link } from '@/i18n/navigation';

/** #1 split + #2 ranges: the chart, then the same numbers as a table (the chart's table view). */
export async function BudgetSplit({ planId, estimate }: { planId: string; estimate: EstimateResponse }) {
  const t = await getTranslations('PlanDashboard');
  const rows = CATEGORIES.map((category) => ({ category, label: CATEGORY_LABELS[category], ...estimate.allocation[category] }));

  return (
    <div className="flex flex-col gap-5">
      <BudgetSplitBar
        title={t('splitTitle')}
        items={rows.map((row) => ({ category: row.category, label: row.label, share: row.share, amount: formatPkrCompact(row.pkr) }))}
      />

      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{t('splitTitle')}</caption>
        <thead>
          <tr className="border-b border-zinc-200 text-start text-zinc-600">
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t('category')}</th>
            <th scope="col" className="py-2 pe-3 text-end font-medium">{t('share')}</th>
            <th scope="col" className="py-2 pe-3 text-end font-medium">{t('yourBudget')}</th>
            <th scope="col" className="py-2 text-end font-medium">
              {t('typicalPrice')}
              <span className="block text-xs font-normal text-zinc-500">{AI_ESTIMATE_LABEL}</span>
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((row) => (
            <tr key={row.category} className="border-b border-zinc-100">
              <th scope="row" className="py-3 pe-3 text-start font-medium">
                <Link href={`/plans/${planId}/${categorySlug(row.category)}`} className="inline-flex items-center gap-2 underline-offset-4 hover:underline">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: `var(--series-${row.category})` }} />
                  {row.label}
                </Link>
              </th>
              <td className="py-3 pe-3 text-end">{Math.round(row.share * 100)}%</td>
              <td className="whitespace-nowrap py-3 pe-3 text-end">{formatPkrCompact(row.pkr)}</td>
              <td className="py-3 text-end">
                {formatPkrRange(row.range[0], row.range[1])}
                {row.pkr < row.range[0] && (
                  <span className="mt-0.5 flex items-center justify-end gap-1 text-xs text-amber-800">
                    <span aria-hidden>⚠</span>
                    {t('belowRange')}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-zinc-600">{t('seeVendorsHint')}</p>
    </div>
  );
}
