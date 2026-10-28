import { CATEGORIES, CATEGORY_LABELS } from '@shevent/core/enums';
import { formatPkr, formatPkrCompact } from '@shevent/core/format';
import { AI_ESTIMATE_LABEL } from '@shevent/core/labels';
import { PACKAGE_KIND_LABELS, type PackagesResponse } from '@shevent/core/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/icons';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { SubmitButton } from '@/components/submit-button';
import { linkStyles } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { cardStyles, Page, PageHeader } from '@/components/ui/page';
import { Link } from '@/i18n/navigation';
import { getAi } from '@/lib/ai';
import { getPlan, planToRequest } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import { sendInquiry } from '../actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Packages');
  return { title: t('title') };
}

export default async function PackagesPage({ params }: PageProps<'/[locale]/plans/[id]/packages'>) {
  const [{ id }, t] = await Promise.all([params, getTranslations('Packages')]);
  const plan = await getPlan(id);

  let result: PackagesResponse | null = null;
  try {
    result = await getAi().packages({ plan: planToRequest(plan), categories: [...CATEGORIES] });
  } catch (error) {
    console.error('Packages failed', error);
  }

  const supabase = (await createClient())!;
  const { data: inquiries } = await supabase.from('inquiries').select('id, vendor_id').eq('plan_id', plan.id);
  const inquiryFor = new Map(inquiries?.map((inquiry) => [inquiry.vendor_id, inquiry.id]));

  return (
    <Page>
      <PageHeader back={{ href: `/plans/${plan.id}`, label: t('backToPlan') }} title={t('title')} description={t('intro', { budget: formatPkrCompact(plan.total_budget_pkr) })} />

      <SampleDataNotice response={result} />

      {!result ? (
        <Notice tone="error" role="alert">
          {t('unavailable')}
        </Notice>
      ) : (
        // Exactly one <article> per package (the e2e suite counts them).
        <div className="grid gap-5 lg:grid-cols-3">
          {result.packages.map((pkg) => {
            const percent = Math.round((pkg.total_pkr / result.budget_pkr) * 100);
            return (
              <article key={pkg.kind} className={`${cardStyles} flex flex-col overflow-hidden`}>
                <header className="flex flex-col gap-1 bg-subtle px-5 pt-5 pb-4">
                  <h2 className="text-xl font-semibold">{PACKAGE_KIND_LABELS[pkg.kind]}</h2>
                  <p className="font-display text-3xl font-semibold text-ink tabular-nums">{formatPkr(pkg.total_pkr)}</p>
                  <p className="text-sm text-muted">{t('ofBudget', { percent })}</p>
                  <span aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(percent, 100)}%` }} />
                  </span>
                </header>
                <ul className="flex flex-col divide-y divide-line px-5">
                  {pkg.items.map((item) => {
                    const inquiryId = inquiryFor.get(item.vendor.vendor_id);
                    return (
                      <li key={item.vendor.vendor_id} className="flex flex-col gap-0.5 py-3.5 text-sm">
                        <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
                          <span aria-hidden className="size-2.5 rounded-sm" style={{ background: `var(--series-${item.vendor.category})` }} />
                          {CATEGORY_LABELS[item.vendor.category]}
                        </span>
                        <span className="font-semibold text-ink">{item.vendor.name}</span>
                        <span className="text-ink-soft tabular-nums">
                          {formatPkr(item.price_pkr)}
                          {item.price_is_estimate && <span className="text-muted"> ({AI_ESTIMATE_LABEL})</span>}
                        </span>
                        {inquiryId ? (
                          <Link href={`/inquiries/${inquiryId}`} className={`inline-flex min-h-11 items-center gap-1.5 self-start ${linkStyles}`}>
                            <Icon name="message" className="size-4" />
                            {t('openChat')}
                          </Link>
                        ) : (
                          <form action={sendInquiry.bind(null, plan.id, item.vendor.vendor_id)}>
                            <SubmitButton className={`inline-flex min-h-11 items-center ${linkStyles} disabled:opacity-60`}>{t('sendInquiry')}</SubmitButton>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </Page>
  );
}
