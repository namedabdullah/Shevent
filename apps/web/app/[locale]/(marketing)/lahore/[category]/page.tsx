import { CATEGORIES, CATEGORY_LABELS, CATEGORY_UNITS, categoryFromSlug, categorySlug, type Category } from '@shevent/core/enums';
import { UNIT_LABELS } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense, ViewTransition } from 'react';
import { Icon } from '@/components/icons';
import { buttonStyles } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';
import { Eyebrow } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/skeleton';
import { VendorCard } from '@/components/vendor-card';
import { getPathname, Link } from '@/i18n/navigation';
import { getDirectory } from '@/lib/directory';
import { PAGE_TRANSITION } from '@/lib/transitions';

// Directory page (WEB_APP_PLAN §4.1, /lahore/[category]): every listed vendor in one category. The
// hero's category chips land here; the chip morphs into this page's category pill.

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category: categorySlug(category) }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/lahore/[category]'>): Promise<Metadata> {
  const { category: slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) return {};
  const [t, locale] = await Promise.all([getTranslations('Directory'), getLocale()]);
  return {
    title: t(`titles.${category}`),
    description: t('metaDescription', { category: CATEGORY_LABELS[category].toLowerCase() }),
    alternates: { canonical: getPathname({ href: `/lahore/${slug}`, locale }) },
    // Consent gate (WEB_APP_PLAN §6): not indexed while it can list vendors without public consent.
    robots: { index: false, follow: true },
  };
}

const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6';

export default async function DirectoryPage({ params }: PageProps<'/[locale]/lahore/[category]'>) {
  const { category: slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) notFound();

  const [t, tHome, locale] = await Promise.all([getTranslations('Directory'), getTranslations('Home'), getLocale()]);
  const details = tHome.raw('categoryDetails') as Record<Category, string>;
  const units = new Intl.ListFormat(locale, { type: 'disjunction' }).format(CATEGORY_UNITS[category].map((unit) => UNIT_LABELS[unit]));

  return (
    <main id="main" className="flex flex-1 flex-col">
      <ViewTransition {...PAGE_TRANSITION}>
        <div className="flex flex-col">
          <section aria-labelledby="directory-title" className="relative isolate overflow-hidden border-b border-line">
            <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 -z-10" />
            <div className={`flex flex-col items-start gap-6 pt-10 pb-10 md:pt-14 md:pb-12 ${container}`}>
              <Link
                href="/#categories"
                transitionTypes={['nav-back']}
                className="group -ms-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-sm font-semibold text-accent-ink"
              >
                <Icon name="arrowLeft" className="size-4 transition-transform group-hover:-translate-x-0.5" />
                {t('back')}
              </Link>
              {/* The same pill as the hero's chip, so the chip can morph into it. */}
              <ViewTransition name={`category-${category}`} share="morph" default="none">
                <span className="flex items-center gap-2.5 rounded-full border border-accent-line bg-accent-soft py-1.5 ps-1.5 pe-4 text-base font-semibold text-accent-ink shadow-card">
                  <span className="relative flex size-9 items-center justify-center rounded-full bg-surface text-ink">
                    <Icon name={category} className="size-4.5" />
                    <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-surface" style={{ background: `var(--series-${category})` }} />
                  </span>
                  {CATEGORY_LABELS[category]}
                </span>
              </ViewTransition>
              <div className="flex flex-col gap-3">
                <h1 id="directory-title" className="text-display font-semibold text-balance">
                  {t(`titles.${category}`)}
                </h1>
                <p className="max-w-xl text-lg leading-relaxed text-pretty text-ink-soft">
                  {details[category]} {t('priced', { units })}
                </p>
              </div>
            </div>
            <nav aria-label={t('switcherLabel')} className={`pb-8 ${container}`}>
              {/* One segmented bar: the current category is the raised pill. */}
              <ul className="flex w-max max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-subtle p-1">
                {CATEGORIES.map((other) => (
                  <li key={other} className="shrink-0">
                    <Link
                      href={`/lahore/${categorySlug(other)}`}
                      aria-current={other === category ? 'page' : undefined}
                      className="flex min-h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap text-ink-soft transition-[background-color,color,box-shadow] duration-200 hover:text-ink aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:shadow-card"
                    >
                      <Icon name={other} className="size-4" />
                      {CATEGORY_LABELS[other]}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </section>

          <section aria-labelledby="directory-list" className={`flex flex-col gap-6 py-12 md:py-16 ${container}`}>
            <h2 id="directory-list" className="sr-only">
              {t('listTitle')}
            </h2>
            <Suspense fallback={<DirectorySkeleton label={t('loading')} />}>
              <VendorList category={category} />
            </Suspense>
          </section>

          <section className={`pb-20 md:pb-28 ${container}`}>
            <div className="scope-inverse flex flex-col items-start gap-5 rounded-[2rem] bg-canvas p-7 text-ink sm:p-10 md:flex-row md:items-center md:justify-between lg:p-12">
              <div className="flex max-w-xl flex-col gap-2">
                <Eyebrow>{t('ctaEyebrow')}</Eyebrow>
                <h2 className="text-headline font-semibold text-balance">{t('ctaTitle')}</h2>
                <p className="leading-relaxed text-ink-soft">{t('ctaBody')}</p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <Link href="/plan/new" className={buttonStyles({ size: 'lg' })}>
                  {t('ctaPlan')}
                </Link>
                <Link href="/#try" transitionTypes={['nav-back']} className={buttonStyles({ variant: 'secondary', size: 'lg' })}>
                  {t('ctaTry')}
                </Link>
              </div>
            </div>
          </section>
        </div>
      </ViewTransition>
    </main>
  );
}

function DirectorySkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="sr-only">{label}</p>
      <Skeleton className="h-5 w-48 rounded-full" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-80 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

async function VendorList({ category }: { category: Category }) {
  const [t, vendors] = await Promise.all([getTranslations('Directory'), getDirectory(category)]);

  if (vendors === 'unavailable') {
    return (
      <Notice tone="warning" title={t('unavailableTitle')}>
        {t('unavailable')}
      </Notice>
    );
  }

  if (vendors.length === 0) {
    return (
      <EmptyState
        icon={category}
        title={t('emptyTitle')}
        action={
          <Link href="/vendor/onboarding" className={buttonStyles({ variant: 'secondary' })}>
            {t('emptyAction')}
          </Link>
        }
      >
        {t('empty')}
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-ink">{t('count', { count: vendors.length })}</span>
        <span className="text-muted">{t('order')}</span>
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {vendors.map((vendor) => (
          <li key={vendor.id} className="reveal">
            <VendorCard vendor={vendor} />
          </li>
        ))}
      </ul>
    </div>
  );
}
