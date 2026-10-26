import { CATEGORY_LABELS, categoryFromSlug } from '@shevent/core/enums';
import { formatPkrCompact, formatPkrRange } from '@shevent/core/format';
import { AI_ESTIMATE_LABEL, SPONSORED_LABEL, SPONSORED_NOTE } from '@shevent/core/labels';
import type { RecommendResponse } from '@shevent/core/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MatchCard } from '@/components/match-card';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { Link } from '@/i18n/navigation';
import { getAi } from '@/lib/ai';
import { getPlan, planEstimate, planToRequest } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Matches');
  return { title: t('metaTitle') };
}

export default async function MatchesPage({ params }: PageProps<'/[locale]/plans/[id]/[category]'>) {
  const { id, category: slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) notFound();

  const [t, plan] = await Promise.all([getTranslations('Matches'), getPlan(id)]);
  const estimate = planEstimate(plan);
  const label = CATEGORY_LABELS[category];
  const allocation = estimate?.allocation[category];

  let result: RecommendResponse | null = null;
  if (allocation) {
    try {
      result = await getAi().recommend({ plan: planToRequest(plan), category, budget_pkr: Math.round(allocation.pkr) });
    } catch (error) {
      console.error('Recommend failed', error);
    }
  }

  const supabase = await createClient();
  const { data: inquiries } = (await supabase?.from('inquiries').select('id, vendor_id').eq('plan_id', plan.id)) ?? { data: null };
  const inquiryFor = new Map(inquiries?.map((inquiry) => [inquiry.vendor_id, inquiry.id]));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link href={`/plans/${plan.id}`} className="text-sm underline underline-offset-4">
          ← {t('backToPlan')}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t('title', { category: label })}</h1>
        {allocation && (
          <p className="text-sand-700">
            {t('budgetLine', { budget: formatPkrCompact(allocation.pkr), range: formatPkrRange(allocation.range[0], allocation.range[1]) })}{' '}
            <span className="text-sand-600">({AI_ESTIMATE_LABEL})</span>
          </p>
        )}
      </header>

      <SampleDataNotice response={result} />

      {!allocation ? (
        <p className="text-sand-700">{t('needEstimate')}</p>
      ) : !result ? (
        <p role="alert" className="text-red-700">{t('unavailable')}</p>
      ) : (
        <>
          <section aria-labelledby="matches-heading" className="flex flex-col gap-3">
            <h2 id="matches-heading" className="text-xl font-semibold">{t('bestMatches')}</h2>
            {result.matches.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {result.matches.map((match) => (
                  <MatchCard key={match.vendor_id} match={match} planId={plan.id} inquiryId={inquiryFor.get(match.vendor_id)} />
                ))}
              </div>
            ) : (
              <p className="text-sand-700">{t('noMatches')}</p>
            )}
          </section>

          {/* Paid placements live in their own labelled block and never change the ranking above. */}
          {result.sponsored.length > 0 && (
            <section aria-labelledby="sponsored-heading" className="flex flex-col gap-3 rounded-lg bg-sand-50 px-4 py-4">
              <h2 id="sponsored-heading" className="text-xl font-semibold">{SPONSORED_LABEL}</h2>
              <p className="text-sm text-sand-600">{SPONSORED_NOTE}</p>
              <div className="grid gap-4 md:grid-cols-2">
                {result.sponsored.map((match) => (
                  <MatchCard key={match.vendor_id} match={match} planId={plan.id} inquiryId={inquiryFor.get(match.vendor_id)} sponsored />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
