import { CATEGORIES, CATEGORY_LABELS, categoryFromSlug, categorySlug } from '@shevent/core/enums';
import { formatPkrCompact, formatPkrRange } from '@shevent/core/format';
import { AI_ESTIMATE_LABEL, SPONSORED_LABEL, SPONSORED_NOTE } from '@shevent/core/labels';
import type { RecommendResponse } from '@shevent/core/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/icons';
import { MatchCard } from '@/components/match-card';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';
import { Page, PageHeader } from '@/components/ui/page';
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
    <Page>
      <PageHeader
        back={{ href: `/plans/${plan.id}`, label: t('backToPlan') }}
        title={t('title', { category: label })}
        description={
          allocation && (
            <p>
              {t('budgetLine', { budget: formatPkrCompact(allocation.pkr), range: formatPkrRange(allocation.range[0], allocation.range[1]) })}{' '}
              <span className="text-sand-600">({AI_ESTIMATE_LABEL})</span>
            </p>
          )
        }
      >
        {/* Switch category without going back to the plan. */}
        <nav aria-label={t('categoriesLabel')} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            {CATEGORIES.map((value) => {
              const current = value === category;
              return (
                <li key={value}>
                  <Link
                    href={`/plans/${plan.id}/${categorySlug(value)}`}
                    aria-current={current ? 'page' : undefined}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
                      current ? 'border-brand-700 bg-brand-700 text-white' : 'border-sand-300 bg-white text-sand-800 hover:border-brand-300 hover:text-brand-700'
                    }`}
                  >
                    <Icon name={value} className="size-4" />
                    {CATEGORY_LABELS[value]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </PageHeader>

      <SampleDataNotice response={result} />

      {!allocation ? (
        <EmptyState icon="wallet" compact>
          {t('needEstimate')}
        </EmptyState>
      ) : !result ? (
        <Notice tone="error" role="alert">
          {t('unavailable')}
        </Notice>
      ) : (
        <>
          <section aria-labelledby="matches-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="matches-heading" className="text-2xl font-semibold tracking-tight">
                {t('bestMatches')}
              </h2>
              {result.matches.length > 0 && <p className="text-sm text-sand-600">{t('ranked', { count: result.matches.length })}</p>}
            </div>
            {result.matches.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {result.matches.map((match, index) => (
                  <MatchCard key={match.vendor_id} match={match} rank={index + 1} planId={plan.id} inquiryId={inquiryFor.get(match.vendor_id)} />
                ))}
              </div>
            ) : (
              <EmptyState icon="store">{t('noMatches')}</EmptyState>
            )}
          </section>

          {/* Paid placements live in their own labelled block and never change the ranking above. */}
          {result.sponsored.length > 0 && (
            <section aria-labelledby="sponsored-heading" className="flex flex-col gap-4 rounded-3xl border border-dashed border-gold-300 bg-gold-50/70 p-5 sm:p-6">
              <div className="flex flex-col gap-1.5">
                <h2 id="sponsored-heading" className="flex items-center gap-2 text-xl font-semibold">
                  <Badge tone="gold" icon="tag">
                    {SPONSORED_LABEL}
                  </Badge>
                </h2>
                <p className="text-sm text-sand-700">{SPONSORED_NOTE}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {result.sponsored.map((match) => (
                  <MatchCard key={match.vendor_id} match={match} planId={plan.id} inquiryId={inquiryFor.get(match.vendor_id)} sponsored />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </Page>
  );
}
