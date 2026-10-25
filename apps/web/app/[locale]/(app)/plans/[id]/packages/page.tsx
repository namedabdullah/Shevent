import { CATEGORIES, CATEGORY_LABELS } from '@shevent/core/enums';
import { formatPkr, formatPkrCompact } from '@shevent/core/format';
import { AI_ESTIMATE_LABEL } from '@shevent/core/labels';
import { PACKAGE_KIND_LABELS, type PackagesResponse } from '@shevent/core/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SampleDataNotice } from '@/components/sample-data-notice';
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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link href={`/plans/${plan.id}`} className="text-sm underline underline-offset-4">
          ← {t('backToPlan')}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-2xl text-zinc-700">{t('intro', { budget: formatPkrCompact(plan.total_budget_pkr) })}</p>
      </header>

      <SampleDataNotice response={result} />

      {!result ? (
        <p role="alert" className="text-red-700">{t('unavailable')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {result.packages.map((pkg) => (
            <article key={pkg.kind} className="flex flex-col gap-4 rounded-lg border border-zinc-200 px-4 py-4">
              <header>
                <h2 className="text-xl font-semibold">{PACKAGE_KIND_LABELS[pkg.kind]}</h2>
                <p className="tabular-nums">
                  <span className="font-medium">{formatPkr(pkg.total_pkr)}</span>{' '}
                  <span className="text-sm text-zinc-600">
                    {t('ofBudget', { percent: Math.round((pkg.total_pkr / result.budget_pkr) * 100) })}
                  </span>
                </p>
              </header>
              <ul className="flex flex-col gap-3">
                {pkg.items.map((item) => {
                  const inquiryId = inquiryFor.get(item.vendor.vendor_id);
                  return (
                    <li key={item.vendor.vendor_id} className="flex flex-col gap-1 border-t border-zinc-100 pt-3 text-sm">
                      <span className="flex items-center gap-2 text-zinc-600">
                        <span aria-hidden className="size-2.5 rounded-sm" style={{ background: `var(--series-${item.vendor.category})` }} />
                        {CATEGORY_LABELS[item.vendor.category]}
                      </span>
                      <span className="font-medium">{item.vendor.name}</span>
                      <span className="tabular-nums">
                        {formatPkr(item.price_pkr)}
                        {item.price_is_estimate && <span className="text-zinc-600"> ({AI_ESTIMATE_LABEL})</span>}
                      </span>
                      {inquiryId ? (
                        <Link href={`/inquiries/${inquiryId}`} className="inline-flex min-h-11 items-center self-start underline underline-offset-4">{t('openChat')}</Link>
                      ) : (
                        <form action={sendInquiry.bind(null, plan.id, item.vendor.vendor_id)}>
                          <button type="submit" className="inline-flex min-h-11 items-center underline underline-offset-4">{t('sendInquiry')}</button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
