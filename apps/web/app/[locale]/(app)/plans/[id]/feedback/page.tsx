import { CATEGORIES, EVENT_TYPE_LABELS, type Category } from '@shevent/core/enums';
import { formatNumber, formatPkrCompact } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FeedbackForm } from '@/components/feedback-form';
import { Page, PageHeader } from '@/components/ui/page';
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
    <Page>
      <PageHeader
        back={{ href: `/plans/${plan.id}`, label: t('backToPlan') }}
        title={t('title')}
        description={t('intro', { event: EVENT_TYPE_LABELS[plan.event_type] })}
      />
      <FeedbackForm
        action={saveFeedback.bind(null, plan.id)}
        budgets={budgets}
        defaults={{ spend, guests: existing?.guest_count_actual?.toString(), rating: existing?.rating }}
      />
    </Page>
  );
}
