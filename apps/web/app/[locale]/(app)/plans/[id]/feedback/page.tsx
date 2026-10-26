import { CATEGORIES, EVENT_TYPE_LABELS, type Category } from '@shevent/core/enums';
import { formatNumber, formatPkrCompact } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FeedbackForm } from '@/components/feedback-form';
import { Link } from '@/i18n/navigation';
import { getPlan, planEstimate } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import { saveFeedback } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Feedback');
  return { title: t('title') };
}

export default async function FeedbackPage({ params }: PageProps<'/[locale]/plans/[id]/feedback'>) {
  const [{ id }, t] = await Promise.all([params, getTranslations('Feedback')]);
  const plan = await getPlan(id);
  const estimate = planEstimate(plan);
  const supabase = (await createClient())!;
  const { data: existing } = await supabase.from('plan_feedback').select('*').eq('plan_id', plan.id).maybeSingle();

  const saved = (existing?.actual_spend_pkr ?? {}) as Partial<Record<Category, number>>;
  const budgets: Partial<Record<Category, string>> = {};
  const spend: Partial<Record<Category, string>> = {};
  for (const category of CATEGORIES) {
    if (estimate) budgets[category] = formatPkrCompact(estimate.allocation[category].pkr);
    if (saved[category] !== undefined) spend[category] = formatNumber(saved[category]);
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link href={`/plans/${plan.id}`} className="text-sm underline underline-offset-4">
          ← {t('backToPlan')}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-2xl text-sand-700">{t('intro', { event: EVENT_TYPE_LABELS[plan.event_type] })}</p>
      </header>
      <FeedbackForm
        action={saveFeedback.bind(null, plan.id)}
        budgets={budgets}
        defaults={{ spend, guests: existing?.guest_count_actual?.toString(), rating: existing?.rating }}
      />
    </main>
  );
}
