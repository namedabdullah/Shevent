import { CATEGORIES, CATEGORY_LABELS } from '@shevent/core/enums';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Icon, type IconName } from '@/components/icons';
import { LogoMark } from '@/components/logo';
import { TryWidget } from '@/components/try-widget';
import { WaitlistForm } from '@/components/waitlist-form';
import { getPathname, Link } from '@/i18n/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { alternates: { canonical: getPathname({ href: '/', locale }) } };
}

const TRUST_ICONS: IconName[] = ['lock', 'scale', 'message'];

export default async function HomePage() {
  const t = await getTranslations('Home');
  const highlights = t.raw('highlights') as string[];
  const steps = t.raw('steps') as { title: string; body: string }[];
  const trust = t.raw('trust') as { title: string; body: string }[];
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-40 -end-40 size-[28rem] rounded-full bg-gold-100/60 blur-3xl" />
        <div className="relative mx-auto grid w-full max-w-5xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.25fr_1fr] md:items-center md:py-20">
          <div className="flex flex-col gap-6">
            <p className="flex items-center gap-2 text-sm font-semibold tracking-wide text-gold-700 uppercase">
              <span aria-hidden className="h-px w-8 bg-gold-500" />
              {t('eyebrow')}
            </p>
            <h1 className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">{t('title')}</h1>
            <p className="max-w-xl text-lg leading-relaxed text-sand-700">{t('subtitle')}</p>
            <WaitlistForm />
            <a href="#try" className="inline-flex min-h-11 items-center gap-2 self-start font-semibold text-brand-700 underline-offset-4 hover:underline">
              {t('tryLink')}
              <Icon name="arrowRight" className="size-4" />
            </a>
          </div>
          <div className="relative rounded-3xl bg-brand-800 p-7 text-brand-100 shadow-xl shadow-brand-900/20 sm:p-8">
            <div aria-hidden className="absolute -top-6 -end-6 opacity-90">
              <LogoMark className="size-20" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-white">{t('highlightsTitle')}</h2>
            <ul className="mt-6 flex flex-col gap-4">
              {highlights.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-0.5 flex size-6 items-center justify-center rounded-full bg-gold-300 text-brand-900">
                    <Icon name="check" className="size-4" />
                  </span>
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Try it (#1 + #2 with no sign-up) */}
      <section id="try" aria-labelledby="try-title" className="scroll-mt-4 border-t border-sand-200 bg-sand-50">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-14 sm:px-6">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 id="try-title" className="text-3xl font-semibold tracking-tight">
              {t('tryTitle')}
            </h2>
            <p className="leading-relaxed text-sand-700">{t('tryIntro')}</p>
          </div>
          <TryWidget />
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="steps-title" className="border-y border-sand-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
          <h2 id="steps-title" className="text-3xl font-semibold tracking-tight">
            {t('stepsTitle')}
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-3 rounded-2xl border border-sand-200 bg-cream p-6">
                <span aria-hidden className="font-display text-4xl font-semibold text-gold-500">
                  {index + 1}
                </span>
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="leading-relaxed text-sand-700">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Categories */}
      <section aria-labelledby="categories-title" className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
        <h2 id="categories-title" className="text-3xl font-semibold tracking-tight">
          {t('categoriesTitle')}
        </h2>
        <p className="mt-2 max-w-2xl text-sand-700">{t('categoriesIntro')}</p>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {CATEGORIES.map((category) => (
            <li key={category} className="flex flex-col items-center gap-3 rounded-2xl border border-sand-200 bg-white px-3 py-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <Icon name={category} className="size-6" />
              </span>
              <span className="font-medium text-sand-900">{CATEGORY_LABELS[category]}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Trust */}
      <section aria-labelledby="trust-title" className="mx-auto w-full max-w-5xl px-4 pb-14 sm:px-6">
        <h2 id="trust-title" className="text-3xl font-semibold tracking-tight">
          {t('trustTitle')}
        </h2>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {trust.map((item, index) => (
            <li key={item.title} className="flex gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-700">
                <Icon name={TRUST_ICONS[index] ?? 'check'} className="size-5" />
              </span>
              <div>
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-1 leading-relaxed text-sand-700">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* For vendors */}
      <section aria-labelledby="vendors-title" className="px-4 pb-16 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-5 rounded-3xl bg-gold-50 px-6 py-10 sm:px-10 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 id="vendors-title" className="text-3xl font-semibold tracking-tight">
              {t('vendorsTitle')}
            </h2>
            <p className="mt-2 leading-relaxed text-sand-700">{t('vendorsBody')}</p>
          </div>
          <Link
            href="/vendor/onboarding"
            className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-brand-700 px-6 font-semibold text-white transition-colors hover:bg-brand-800"
          >
            {t('vendorsCta')}
            <Icon name="arrowRight" className="size-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
