import { CATEGORY_LABELS, EVENT_TYPE_LABELS, VENUE_TYPE_LABELS } from '@shevent/core/enums';
import { formatEventDate, formatPkrCompact } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BudgetSplit } from '@/components/budget-split';
import { Icon, type IconName } from '@/components/icons';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { InquiryStatusBadge } from '@/components/status-badge';
import { SubmitButton } from '@/components/submit-button';
import { TrackEvent } from '@/components/track-event';
import { buttonStyles } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';
import { cardStyles, MetaList, Page, PageHeader } from '@/components/ui/page';
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

  const nextSteps: { href: string; label: string; body: string; icon: IconName }[] = [
    { href: `/plans/${plan.id}/packages`, label: t('packagesLink'), body: t('packagesBody'), icon: 'package' },
    { href: `/plans/${plan.id}/feedback`, label: t('feedbackLink'), body: t('feedbackBody'), icon: 'star' },
  ];

  return (
    <Page>
      {query.created && <TrackEvent event="plan_created" />}

      <PageHeader
        back={{ href: '/plans', label: t('backToPlans') }}
        eyebrow={t('eyebrow')}
        title={t('title', { event: EVENT_TYPE_LABELS[plan.event_type], area: plan.area })}
      >
        <MetaList
          items={[
            { icon: 'calendar', label: t('dateLabel'), text: formatEventDate(plan.event_date) },
            { icon: 'users', label: t('guestsLabel'), text: t('guests', { count: plan.guest_count }) },
            ...(plan.venue_type ? [{ icon: 'venue' as const, label: t('venueLabel'), text: VENUE_TYPE_LABELS[plan.venue_type] }] : []),
            { icon: 'wallet', label: t('budgetLabel'), text: t('budget', { amount: formatPkrCompact(plan.total_budget_pkr) }) },
          ]}
        />
      </PageHeader>

      {query.inquiry === 'failed' && (
        <Notice tone="error" role="alert">
          {t('inquiryFailed')}
        </Notice>
      )}
      {query.feedback && (
        <Notice tone="success" role="status">
          {t('feedbackThanks')}
        </Notice>
      )}
      <SampleDataNotice response={estimate} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section aria-labelledby="split-heading" className={`${cardStyles} flex flex-col gap-6 p-4 sm:p-7`}>
          <div className="flex flex-col gap-1">
            <h2 id="split-heading" className="text-2xl font-semibold tracking-tight">
              {t('splitTitle')}
            </h2>
            {estimate && <p className="text-sm text-sand-600">{t('seeVendorsHint')}</p>}
          </div>
          {estimate ? (
            <>
              <BudgetSplit planId={plan.id} estimate={estimate} />
              {estimate.explanations.length > 0 && (
                <div className="rounded-2xl bg-sand-50 p-4 sm:p-5">
                  <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <Icon name="sparkles" className="size-4 text-gold-500" />
                    {t('why')}
                  </h3>
                  <ul className="mt-2 flex flex-col gap-1.5 text-sand-700">
                    {estimate.explanations.map((line) => (
                      <li key={line} className="flex gap-2.5">
                        <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-gold-400" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {estimate.warnings.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {estimate.warnings.map((line) => (
                    <li key={line}>
                      <Notice tone="warning">
                        <span className="font-semibold">{t('warning')}:</span> {line}
                      </Notice>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <EmptyState
              icon="wallet"
              compact
              action={
                <form action={retryEstimate.bind(null, plan.id)}>
                  <SubmitButton className={buttonStyles()}>{t('retry')}</SubmitButton>
                </form>
              }
            >
              {query.estimate === 'failed' ? t('estimateStillFailing') : t('noEstimate')}
            </EmptyState>
          )}
        </section>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="next-heading" className="flex flex-col gap-3">
            <h2 id="next-heading" className="text-xl font-semibold">
              {t('nextSteps')}
            </h2>
            <ul className="flex flex-col gap-2">
              {nextSteps.map((step) => (
                <li key={step.href}>
                  <Link
                    href={step.href}
                    className="group flex items-start gap-3 rounded-2xl border border-sand-200 bg-white p-4 transition-[border-color,box-shadow] hover:border-brand-200 hover:shadow-card"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                      <Icon name={step.icon} className="size-4.5" />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold text-sand-900 group-hover:text-brand-700">{step.label}</span>
                      <span className="text-sm text-sand-600">{step.body}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="inquiries-heading" className="flex flex-col gap-3">
            <h2 id="inquiries-heading" className="text-xl font-semibold">
              {t('inquiries')}
            </h2>
            {inquiries?.length ? (
              <ul className="flex flex-col divide-y divide-sand-100 overflow-hidden rounded-2xl border border-sand-200 bg-white">
                {inquiries.map((inquiry) => (
                  <li key={inquiry.id}>
                    <Link href={`/inquiries/${inquiry.id}`} className="flex flex-col items-start gap-1.5 px-4 py-3.5 transition-colors hover:bg-brand-50/60">
                      <span>
                        <span className="font-semibold text-sand-900">{inquiry.vendors?.name}</span>
                        {inquiry.vendors && <span className="text-sand-600"> · {CATEGORY_LABELS[inquiry.vendors.category]}</span>}
                      </span>
                      <InquiryStatusBadge status={inquiry.status} label={tStatus(inquiry.status)} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="message" compact>
                {t('noInquiries')}
              </EmptyState>
            )}
          </section>
        </div>
      </div>
    </Page>
  );
}
