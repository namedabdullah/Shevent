import { EVENT_TYPE_LABELS } from '@shevent/core/enums';
import { formatEventDate, formatPkrCompact } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { DateLeaf } from '@/components/date-leaf';
import { Icon } from '@/components/icons';
import { buttonStyles } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';
import { cardLinkStyles, Page, PageHeader } from '@/components/ui/page';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Plans');
  return { title: t('title') };
}

export default async function PlansPage() {
  const [t, tApp] = await Promise.all([getTranslations('Plans'), getTranslations('App')]);
  return (
    <Page>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        actions={
          <Link href="/plan/new" className={buttonStyles()}>
            <Icon name="plus" className="size-4" />
            {t('newPlan')}
          </Link>
        }
      />
      <Suspense fallback={<ListSkeleton label={tApp('loading')} />}>
        <PlanList />
      </Suspense>
    </Page>
  );
}

async function PlanList() {
  const t = await getTranslations('Plans');
  await requireUser();
  const supabase = await createClient();
  // RLS returns only the signed-in host's plans.
  const { data: plans, error } = (await supabase
    ?.from('plans')
    .select('id, event_type, area, event_date, guest_count, total_budget_pkr')
    .order('created_at', { ascending: false })) ?? { data: null, error: true };

  if (error)
    return (
      <Notice tone="error" role="alert">
        {t('loadError')}
      </Notice>
    );
  if (!plans?.length)
    return (
      <EmptyState icon="plans" title={t('emptyTitle')}>
        {t('empty')}
      </EmptyState>
    );

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {plans.map((plan) => (
        <li key={plan.id}>
          <Link href={`/plans/${plan.id}`} className={`${cardLinkStyles} group flex h-full items-start gap-4 p-5`}>
            <DateLeaf date={plan.event_date} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-display text-xl font-semibold text-sand-900">{EVENT_TYPE_LABELS[plan.event_type]}</p>
              <p className="flex items-center gap-1.5 text-sm text-sand-600">
                <Icon name="mapPin" className="size-3.5 text-gold-500" />
                {plan.area}
              </p>
              <p className="mt-2 text-sm text-sand-700">
                {formatEventDate(plan.event_date)} · {t('guests', { count: plan.guest_count })} ·{' '}
                <span className="font-semibold text-sand-900 tabular-nums">{formatPkrCompact(plan.total_budget_pkr)}</span>
              </p>
            </div>
            <Icon name="chevronRight" className="mt-1 size-5 text-sand-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
