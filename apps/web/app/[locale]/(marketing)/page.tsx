import { CATEGORIES, CATEGORY_LABELS, CATEGORY_UNITS, type Category } from '@shevent/core/enums';
import { UNIT_LABELS } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Icon, type IconName } from '@/components/icons';
import { CelebrationSparks, GlowCard, RosetteSeal, StageLights, WordMarquee } from '@/components/motion';
import { ArchWindow, BeadEdge, HeroArt } from '@/components/ornaments';
import { TryWidget } from '@/components/try-widget';
import { buttonStyles, linkStyles } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/page';
import { WaitlistForm } from '@/components/waitlist-form';
import { getPathname, Link } from '@/i18n/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { alternates: { canonical: getPathname({ href: '/', locale }) } };
}

const TRUST_ICONS: IconName[] = ['lock', 'scale', 'message', 'tag'];

const sectionTitle = 'text-headline font-semibold text-balance';

export default async function HomePage() {
  const [t, locale] = await Promise.all([getTranslations('Home'), getLocale()]);
  const highlights = t.raw('highlights') as string[];
  const steps = t.raw('steps') as { title: string; body: string }[];
  const trust = t.raw('trust') as { title: string; body: string }[];
  const faq = t.raw('faq') as { q: string; a: string }[];
  const vendorPoints = t.raw('vendorsPoints') as string[];
  const occasions = t.raw('occasions') as string[];
  const details = t.raw('categoryDetails') as Record<Category, string>;
  const units = new Intl.ListFormat(locale, { type: 'disjunction' });

  // FAQPage structured data (WEB_APP_PLAN §5.1), from the same text as the visible answers.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
  };

  return (
    <main id="main" className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c') }} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(56rem_36rem_at_88%_-8%,var(--color-gold-100),transparent_62%)]" />
        <CelebrationSparks>
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-10 pb-20 sm:px-6 md:grid-cols-[1.15fr_0.85fr] md:pt-16 md:pb-24 lg:gap-20">
            <div className="flex flex-col gap-7">
              <Eyebrow className="animate-enter">{t('eyebrow')}</Eyebrow>
              <h1 className="animate-enter text-display font-semibold text-balance [animation-delay:60ms]">
                {t.rich('title', { em: (chunks) => <em className="font-medium text-brand-700">{chunks}</em> })}
              </h1>
              <p className="max-w-xl animate-enter text-lg leading-relaxed text-pretty text-sand-700 [animation-delay:120ms]">{t('subtitle')}</p>
              <div className="flex animate-enter flex-col gap-3 [animation-delay:180ms]">
                <WaitlistForm />
                <a href="#try" className={`group inline-flex min-h-11 items-center gap-2 self-start ${linkStyles}`}>
                  {t('tryLink')}
                  <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-sm md:max-w-md">
              <RosetteSeal text={t('sealText')} size={128} className="absolute -start-3 top-4 z-10 animate-fade-in [animation-delay:500ms] sm:-start-10 sm:top-10" />
              <HeroArt />
              <div className="relative z-10 -mt-24 ms-6 me-0 animate-enter rounded-2xl border border-gold-200 bg-white/95 p-5 shadow-lift backdrop-blur-sm [animation-delay:350ms] sm:-me-4 sm:ms-16 md:-me-6 xl:-me-12">
                <h2 className="font-display text-lg font-semibold">{t('highlightsTitle')}</h2>
                <ul className="mt-3 flex flex-col gap-2.5 text-sm text-sand-800">
                  {highlights.map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white">
                        <Icon name="check" className="size-3" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </CelebrationSparks>
      </section>

      {/* The occasions and the six categories, drifting with the scroll (decorative; both lists are real) */}
      <div className="relative overflow-hidden bg-brand-950 py-8 text-gold-100 md:py-10">
        <BeadEdge className="absolute inset-x-0 top-0" />
        <WordMarquee rows={[occasions, CATEGORIES.map((category) => CATEGORY_LABELS[category])]} />
        <BeadEdge className="absolute inset-x-0 bottom-0" />
      </div>

      {/* Try it (#1 + #2 with no sign-up) */}
      <section id="try" aria-labelledby="try-title" className="scroll-mt-20 border-y border-sand-200 bg-sand-50">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 md:py-24">
          <div className="reveal grid gap-4 md:grid-cols-2 md:items-end md:gap-12">
            <div className="flex flex-col gap-3">
              <Eyebrow>{t('tryEyebrow')}</Eyebrow>
              <h2 id="try-title" className={sectionTitle}>
                {t('tryTitle')}
              </h2>
            </div>
            <p className="max-w-xl text-lg leading-relaxed text-pretty text-sand-700">{t('tryIntro')}</p>
          </div>
          <TryWidget />
        </div>
      </section>

      {/* How it works */}
      <section id="how" aria-labelledby="steps-title" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="flex max-w-2xl flex-col gap-3">
            <Eyebrow>{t('stepsEyebrow')}</Eyebrow>
            <h2 id="steps-title" className={sectionTitle}>
              {t('stepsTitle')}
            </h2>
          </div>
          <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-10">
            {/* The string that ties the steps together: down on phones, across from md. */}
            <span aria-hidden className="absolute start-7 top-14 bottom-6 border-s-2 border-dotted border-gold-300 md:hidden" />
            {/* From the first numeral's centre to the third's: the third column starts at 2/3 + 2/3 of the gap. */}
            <span aria-hidden className="absolute start-7 top-7 hidden w-[calc(66.667%+1.667rem)] border-t-2 border-dotted border-gold-300 md:block" />
            {steps.map((step, index) => (
              <li key={step.title} className="reveal relative grid grid-cols-[3.5rem_1fr] gap-x-5 gap-y-2 md:flex md:flex-col md:gap-4">
                <span
                  aria-hidden
                  className="row-span-2 flex size-14 items-center justify-center rounded-full border border-gold-300 bg-cream font-display text-2xl font-medium text-brand-700 italic shadow-[0_0_0_6px_var(--color-cream)]"
                >
                  {index + 1}
                </span>
                <h3 className="pt-3 text-2xl font-semibold md:pt-2">{step.title}</h3>
                <p className="max-w-sm leading-relaxed text-sand-700">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Categories */}
      <section aria-labelledby="categories-title" className="border-t border-sand-200 bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="flex flex-col gap-3 lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>{t('categoriesEyebrow')}</Eyebrow>
            <h2 id="categories-title" className={sectionTitle}>
              {t('categoriesTitle')}
            </h2>
            <p className="max-w-md text-lg leading-relaxed text-sand-700">{t('categoriesIntro')}</p>
          </div>
          <ul className="divide-y divide-sand-200 border-y border-sand-200">
            {CATEGORIES.map((category) => (
              <li key={category} className="reveal grid grid-cols-[auto_1fr] items-start gap-x-5 gap-y-1 py-6 sm:grid-cols-[auto_1fr_auto] sm:gap-x-6">
                <span className="relative flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                  <Icon name={category} className="size-5.5" />
                  <span aria-hidden className="absolute -end-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-white" style={{ background: `var(--series-${category})` }} />
                </span>
                <div>
                  <h3 className="text-2xl font-semibold">{CATEGORY_LABELS[category]}</h3>
                  <p className="mt-1 leading-relaxed text-sand-700">{details[category]}</p>
                </div>
                <p className="col-start-2 text-sm text-sand-600 sm:col-start-3 sm:max-w-44 sm:pt-2 sm:text-end">
                  {t('categoryUnits', { units: units.format(CATEGORY_UNITS[category].map((unit) => UNIT_LABELS[unit])) })}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Trust: a night section */}
      <section aria-labelledby="trust-title" className="relative overflow-hidden bg-brand-950 text-brand-100">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,var(--color-gold-200)_1px,transparent_1.5px)] bg-size-[22px_22px] opacity-[0.07]" />
        <div aria-hidden className="pointer-events-none absolute -end-32 -top-40 size-[32rem] rounded-full bg-brand-700/40 blur-3xl" />
        <StageLights />
        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div className="flex flex-col gap-4">
            <Eyebrow tone="night">{t('trustEyebrow')}</Eyebrow>
            <h2 id="trust-title" className={`${sectionTitle} text-white`}>
              {t('trustTitle')}
            </h2>
            <p className="max-w-md text-lg leading-relaxed">{t('trustIntro')}</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {trust.map((item, index) => (
              <li key={item.title} className="reveal">
                <GlowCard className="flex flex-col gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full bg-gold-300/10 ring-1 ring-gold-300/30">
                    <Icon name={TRUST_ICONS[index] ?? 'check'} className="size-5 text-gold-300" />
                  </span>
                  <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                  <p className="leading-relaxed text-brand-100/85">{item.body}</p>
                </GlowCard>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="flex flex-col gap-3">
            <Eyebrow>{t('faqEyebrow')}</Eyebrow>
            <h2 id="faq-title" className={sectionTitle}>
              {t('faqTitle')}
            </h2>
          </div>
          <div className="divide-y divide-sand-200 border-y border-sand-200">
            {faq.map((item) => (
              <details key={item.q} className="accordion group">
                <summary className="flex min-h-16 list-none items-center justify-between gap-4 py-4 font-display text-lg font-semibold text-sand-900 transition-colors hover:text-brand-700 sm:text-xl [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full border border-sand-300 text-brand-700 transition-transform duration-300 group-open:rotate-45">
                    <Icon name="plus" className="size-4" />
                  </span>
                </summary>
                <p className="pe-12 pb-5 leading-relaxed text-sand-700">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* For vendors */}
      <section id="vendors" aria-labelledby="vendors-title" className="scroll-mt-20 px-4 pb-20 sm:px-6 md:pb-28">
        <div className="reveal mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2rem] bg-gold-50 ring-1 ring-gold-200 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col items-start gap-5 p-7 sm:p-10 lg:p-14">
            <Eyebrow>{t('vendorsEyebrow')}</Eyebrow>
            <h2 id="vendors-title" className={sectionTitle}>
              {t('vendorsTitle')}
            </h2>
            <p className="max-w-xl text-lg leading-relaxed text-sand-700">{t('vendorsBody')}</p>
            <ul className="flex flex-col gap-2.5 text-sand-800">
              {vendorPoints.map((point) => (
                <li key={point} className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white">
                    <Icon name="check" className="size-3" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <Link href="/vendor/onboarding" className={buttonStyles({ size: 'lg', className: 'group mt-2' })}>
              {t('vendorsCta')}
              <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          <div className="hidden items-end px-10 pt-12 md:flex lg:px-14">
            <ArchWindow className="aspect-[4/5] w-56 lg:w-64" />
          </div>
        </div>
      </section>
    </main>
  );
}
