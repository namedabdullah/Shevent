import { EVENT_TYPE_LABELS } from '@shevent/core/enums';
import { formatEventDate, formatPkrCompact } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Plans');
  return { title: t('title') };
}

export default async function PlansPage() {
  const t = await getTranslations('Plans');
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <Link href="/plan/new" className="min-h-11 rounded-lg bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700">
          {t('newPlan')}
        </Link>
      </div>
      <Suspense fallback={null}>
        <PlanList />
      </Suspense>
    </main>
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

  if (error) return <p className="text-red-700">{t('loadError')}</p>;
  if (!plans?.length) return <p className="text-zinc-700">{t('empty')}</p>;

  return (
    <ul className="flex flex-col gap-3">
      {plans.map((plan) => (
        <li key={plan.id}>
          <Link href={`/plans/${plan.id}`} className="block rounded-lg border border-zinc-200 px-4 py-3 hover:bg-zinc-50">
            <p className="font-medium">
              {EVENT_TYPE_LABELS[plan.event_type]} · {plan.area}
            </p>
            <p className="text-sm text-zinc-600">
              {formatEventDate(plan.event_date)} · {t('guests', { count: plan.guest_count })} ·{' '}
              {formatPkrCompact(plan.total_budget_pkr)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
