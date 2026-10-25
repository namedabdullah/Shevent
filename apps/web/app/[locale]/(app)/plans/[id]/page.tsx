import { CATEGORY_LABELS, EVENT_TYPE_LABELS, VENUE_TYPE_LABELS } from '@shevent/core/enums';
import { formatEventDate, formatPkrCompact } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BudgetSplit } from '@/components/budget-split';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { TrackEvent } from '@/components/track-event';
import { Link } from '@/i18n/navigation';
import { getPlan, planEstimate } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import { retryEstimate } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('PlanDashboard');
  return { title: t('metaTitle') };
}

export default async function PlanPage({ params, searchParams }: PageProps<'/[locale]/plans/[id]'>) {
  const [{ id }, query, t, tStatus] = await Promise.all([
    params,
    searchParams,
    getTranslations('PlanDashboard'),
    getTranslations('InquiryStatus'),
  ]);
  const plan = await getPlan(id);
  const estimate = planEstimate(plan);

  const supabase = await createClient();
  const { data: inquiries } = (await supabase
    ?.from('inquiries')
    .select('id, status, vendors(name, category)')
    .eq('plan_id', plan.id)
    .order('updated_at', { ascending: false })) ?? { data: null };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      {query.created && <TrackEvent event="plan_created" />}

      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t('title', { event: EVENT_TYPE_LABELS[plan.event_type], area: plan.area })}
        </h1>
        <p className="text-zinc-700">
          {[
            formatEventDate(plan.event_date),
            t('guests', { count: plan.guest_count }),
            plan.venue_type ? VENUE_TYPE_LABELS[plan.venue_type] : null,
            t('budget', { amount: formatPkrCompact(plan.total_budget_pkr) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      {query.inquiry === 'failed' && <p role="alert" className="text-red-700">{t('inquiryFailed')}</p>}
      {query.feedback && <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-emerald-900">{t('feedbackThanks')}</p>}
      <SampleDataNotice response={estimate} />

      <section aria-labelledby="split-heading" className="flex flex-col gap-4">
        <h2 id="split-heading" className="text-xl font-semibold">{t('splitTitle')}</h2>
        {estimate ? (
          <>
            <BudgetSplit planId={plan.id} estimate={estimate} />
            {estimate.explanations.length > 0 && (
              <div>
                <h3 className="font-medium">{t('why')}</h3>
                <ul className="mt-1 list-disc ps-5 text-zinc-700">
                  {estimate.explanations.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            )}
            {estimate.warnings.length > 0 && (
              <ul className="flex flex-col gap-2">
                {estimate.warnings.map((line) => (
                  <li key={line} className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
                    <span aria-hidden>⚠</span>
                    <span><span className="font-medium">{t('warning')}:</span> {line}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-zinc-200 px-4 py-4">
            <p>{query.estimate === 'failed' ? t('estimateStillFailing') : t('noEstimate')}</p>
            <form action={retryEstimate.bind(null, plan.id)}>
              <button type="submit" className="min-h-11 rounded-lg bg-zinc-900 px-5 font-medium text-white hover:bg-zinc-700">
                {t('retry')}
              </button>
            </form>
          </div>
        )}
      </section>

      <section aria-labelledby="next-heading" className="flex flex-col gap-3">
        <h2 id="next-heading" className="text-xl font-semibold">{t('nextSteps')}</h2>
        <ul className="flex flex-col gap-2">
          <li><Link href={`/plans/${plan.id}/packages`} className="underline underline-offset-4">{t('packagesLink')}</Link></li>
          <li><Link href={`/plans/${plan.id}/feedback`} className="underline underline-offset-4">{t('feedbackLink')}</Link></li>
        </ul>
      </section>

      <section aria-labelledby="inquiries-heading" className="flex flex-col gap-3">
        <h2 id="inquiries-heading" className="text-xl font-semibold">{t('inquiries')}</h2>
        {inquiries?.length ? (
          <ul className="flex flex-col gap-2">
            {inquiries.map((inquiry) => (
              <li key={inquiry.id}>
                <Link href={`/inquiries/${inquiry.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-4 py-3 hover:bg-zinc-50">
                  <span>
                    <span className="font-medium">{inquiry.vendors?.name}</span>
                    {inquiry.vendors && <span className="text-zinc-600"> · {CATEGORY_LABELS[inquiry.vendors.category]}</span>}
                  </span>
                  <span className="text-sm text-zinc-700">{tStatus(inquiry.status)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-700">{t('noInquiries')}</p>
        )}
      </section>
    </main>
  );
}
