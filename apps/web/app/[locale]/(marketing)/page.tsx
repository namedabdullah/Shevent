import { CATEGORIES, CATEGORY_LABELS, CATEGORY_UNITS, categorySlug, type Category } from '@shevent/core/enums';
import { UNIT_LABELS } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ViewTransition, type ReactNode } from 'react';
import { CategoryOrbit, CategoryRow, HeroEventProvider, HeroEventWord } from '@/components/hero';
import { Icon, type IconName } from '@/components/icons';
import { GlowCard } from '@/components/motion';
import { SectionLink } from '@/components/smooth-scroll';
import { TryWidget } from '@/components/try-widget';
import { buttonStyles } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/page';
import { WaitlistForm } from '@/components/waitlist-form';
import { getPathname, Link } from '@/i18n/navigation';
import { PAGE_TRANSITION } from '@/lib/transitions';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { alternates: { canonical: getPathname({ href: '/', locale }) } };
}

const TRUST_ICONS: IconName[] = ['lock', 'scale', 'message', 'tag'];

// For each word in Home.rotating (same order): its icon, and the categories that kind of event
// usually leans on, which light up in the hero's orbit while the word is showing. The first word is
// the generic "an event", so nothing is singled out.
const EVENT_ICONS: IconName[] = ['sparkles', 'heart', 'cake', 'briefcase', 'wine', 'mic', 'rocket'];
const EVENT_FOCUS: Category[][] = [
  [],
  ['venue', 'catering', 'decor', 'photography'],
  ['venue', 'catering', 'decor'],
  ['venue', 'catering', 'dj_sound'],
  ['venue', 'catering', 'lighting'],
  ['dj_sound', 'lighting', 'venue'],
  ['venue', 'lighting', 'photography'],
];

/** Eyebrow, title and an optional one-line intro, the same on every section. */
function SectionHeading({ id, eyebrow, title, intro }: { id: string; eyebrow: string; title: string; intro?: ReactNode }) {
  return (
    <div className="reveal flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-12">
      <div className="flex flex-col gap-3">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={id} className="text-headline font-semibold text-balance">
          {title}
        </h2>
      </div>
      {intro && <p className="max-w-sm text-lg leading-relaxed text-pretty text-ink-soft">{intro}</p>}
    </div>
  );
}

const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6';

export default async function HomePage() {
  const [t, locale] = await Promise.all([getTranslations('Home'), getLocale()]);
  const steps = t.raw('steps') as { title: string; body: string }[];
  const trust = t.raw('trust') as { title: string; body: string }[];
  const faq = t.raw('faq') as { q: string; a: string }[];
  const vendorPoints = t.raw('vendorsPoints') as string[];
  const occasions = t.raw('occasions') as string[];
  const rotating = t.raw('rotating') as string[];
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
      {/* Slides out when a category chip or card opens its directory page, and back in on return. */}
      <ViewTransition {...PAGE_TRANSITION}>
        <div className="flex flex-col">
          {/* Hero: a centred headline with the six budget categories orbiting it. Each category links to its
              directory page (/lahore/[category]). */}
          <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
            <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 -z-10" />
            <div aria-hidden className="pointer-events-none absolute top-[18%] left-1/2 -z-10 h-[34rem] w-[min(60rem,120vw)] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--accent-soft),transparent)]" />
            <HeroEventProvider>
              <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center px-4 sm:px-6 xl:h-[52rem] xl:justify-center">
                <div className="hero-copy relative flex w-full max-w-4xl flex-col items-center gap-7 pt-16 pb-16 text-center md:pt-24 xl:py-0">
                  <p className="flex animate-enter items-center gap-2.5 rounded-full border border-line bg-surface/80 py-1 ps-1 pe-3.5 text-sm text-ink-soft backdrop-blur">
                    <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-ink">
                      <span aria-hidden className="size-1.5 animate-pulse-dot rounded-full bg-accent" />
                      {t('badge')}
                    </span>
                    {t('badgeNote')}
                  </p>
                  <h1 id="hero-title" className="animate-enter text-display font-semibold [animation-delay:60ms]">
                    {t.rich('title', {
                      // The tag holds what follows the changing word ("?"), so the two never wrap apart.
                      event: (chunks) => (
                        <HeroEventWord words={rotating} icons={EVENT_ICONS}>
                          {chunks}
                        </HeroEventWord>
                      ),
                      line: (chunks) => <span className="mt-[0.12em] block text-[0.66em] leading-[1.08] font-normal tracking-[-0.03em] text-balance text-muted">{chunks}</span>,
                    })}
                  </h1>
                  <p className="max-w-xl animate-enter text-lg leading-relaxed text-pretty text-ink-soft [animation-delay:120ms]">{t('subtitle')}</p>
                  <div className="flex w-full animate-enter flex-col items-center gap-3 [animation-delay:180ms]">
                    <WaitlistForm />
                    <SectionLink hash="try" className="group inline-flex min-h-11 items-center gap-2 font-semibold text-ink">
                      {t('tryLink')}
                      <Icon name="arrowRight" className="size-4 text-accent-ink transition-transform duration-300 group-hover:translate-x-1" />
                    </SectionLink>
                  </div>
                  <div className="animate-enter pt-2 [animation-delay:240ms] xl:hidden">
                    <CategoryRow focus={EVENT_FOCUS} label={t('orbitLabel')} />
                  </div>
                </div>
                {/* After the copy, so keyboard users reach the headline's form before the six links. */}
                <CategoryOrbit focus={EVENT_FOCUS} label={t('orbitLabel')} />
              </div>
            </HeroEventProvider>

            {/* Every kind of event, quietly, where the hero meets the page. */}
            <div className="border-t border-line">
              <div className={`flex flex-col items-center gap-3 py-5 lg:flex-row lg:justify-center lg:gap-8 ${container}`}>
                <p className="shrink-0 text-xs font-semibold tracking-[0.14em] text-muted uppercase">{t('occasionsLabel')}</p>
                <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-sm font-medium text-ink-soft lg:gap-x-3.5">
                  {occasions.map((occasion, index) => (
                    <li key={occasion} className="flex items-center gap-3.5">
                      {index > 0 && <span aria-hidden className="hidden size-1 rounded-full bg-line-strong lg:block" />}
                      {occasion}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Budget planner (#1 + #2 with no sign-up) */}
          <section id="try" aria-labelledby="try-title" className="scroll-mt-20">
            <div className={`flex flex-col gap-10 py-20 md:py-28 ${container}`}>
              <SectionHeading id="try-title" eyebrow={t('tryEyebrow')} title={t('tryTitle')} intro={t('tryIntro')} />
              <TryWidget />
            </div>
          </section>

          {/* How it works */}
          <section id="how" aria-labelledby="steps-title" className="scroll-mt-20 border-t border-line">
            <div className={`flex flex-col gap-12 py-20 md:py-28 ${container}`}>
              <SectionHeading id="steps-title" eyebrow={t('stepsEyebrow')} title={t('stepsTitle')} />
              <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
                {steps.map((step, index) => (
                  <li key={step.title} className="reveal flex flex-col gap-10 bg-surface p-7 sm:p-8">
                    <span aria-hidden className="font-mono text-sm text-accent-ink tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="flex flex-col gap-2">
                      <h3 className="text-xl font-semibold">{step.title}</h3>
                      <p className="leading-relaxed text-ink-soft">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Categories */}
          <section id="categories" aria-labelledby="categories-title" className="scroll-mt-20 border-t border-line">
            <div className={`flex flex-col gap-12 py-20 md:py-28 ${container}`}>
              <SectionHeading id="categories-title" eyebrow={t('categoriesEyebrow')} title={t('categoriesTitle')} />
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CATEGORIES.map((category) => (
                  <li key={category} className="reveal">
                    <Link
                      href={`/lahore/${categorySlug(category)}`}
                      transitionTypes={['nav-forward']}
                      className="group flex h-full flex-col gap-6 rounded-2xl border border-line bg-surface p-6 transition-[border-color,translate,box-shadow] duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <span className="relative flex size-11 items-center justify-center rounded-xl bg-subtle text-ink transition-colors duration-300 group-hover:bg-accent-soft group-hover:text-accent-ink">
                        <Icon name={category} className="size-5" />
                        <span aria-hidden className="absolute -end-1 -top-1 size-3 rounded-full border-2 border-surface" style={{ background: `var(--series-${category})` }} />
                      </span>
                      <span className="flex flex-col gap-1.5">
                        <span className="font-display text-lg font-semibold text-ink">{CATEGORY_LABELS[category]}</span>
                        <span className="text-sm leading-relaxed text-ink-soft">{details[category]}</span>
                      </span>
                      <span className="mt-auto flex items-end justify-between gap-3 text-xs text-muted">
                        {t('categoryUnits', { units: units.format(CATEGORY_UNITS[category].map((unit) => UNIT_LABELS[unit])) })}
                        <span className="flex items-center gap-1 text-sm font-semibold whitespace-nowrap text-accent-ink">
                          {t('categoryBrowse')}
                          <Icon name="arrowRight" className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Principles: the opposite palette, so the page has one strong change of tone */}
          <section aria-labelledby="trust-title" className="scope-inverse relative overflow-hidden bg-canvas text-ink">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(48rem_24rem_at_50%_0%,var(--accent-soft),transparent_70%)]" />
            <div className={`relative flex flex-col gap-12 py-20 md:py-28 ${container}`}>
              <SectionHeading id="trust-title" eyebrow={t('trustEyebrow')} title={t('trustTitle')} />
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {trust.map((item, index) => (
                  <li key={item.title} className="reveal">
                    <GlowCard className="flex flex-col gap-8">
                      <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                        <Icon name={TRUST_ICONS[index] ?? 'check'} className="size-4.5" />
                      </span>
                      <div className="flex flex-col gap-1.5">
                        <h3 className="text-lg font-semibold">{item.title}</h3>
                        <p className="text-sm leading-relaxed text-ink-soft">{item.body}</p>
                      </div>
                    </GlowCard>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* FAQ */}
          <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20">
            <div className={`grid gap-10 py-20 md:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 ${container}`}>
              <div className="reveal flex flex-col gap-3">
                <Eyebrow>{t('faqEyebrow')}</Eyebrow>
                <h2 id="faq-title" className="text-headline font-semibold">
                  {t('faqTitle')}
                </h2>
              </div>
              <div className="divide-y divide-line border-y border-line">
                {faq.map((item) => (
                  <details key={item.q} className="accordion group">
                    <summary className="flex min-h-16 list-none items-center justify-between gap-4 py-4 text-lg font-semibold text-ink transition-colors hover:text-accent-ink [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink-soft transition-transform duration-300 group-open:rotate-45">
                        <Icon name="plus" className="size-4" />
                      </span>
                    </summary>
                    <p className="max-w-xl pe-12 pb-5 leading-relaxed text-ink-soft">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          {/* For vendors */}
          <section id="vendors" aria-labelledby="vendors-title" className="scroll-mt-20 pb-20 md:pb-28">
            <div className={container}>
              <div className="reveal grid gap-10 overflow-hidden rounded-[2rem] border border-line bg-surface p-7 sm:p-10 md:grid-cols-[1.1fr_0.9fr] md:items-center lg:p-14">
                <div className="flex flex-col items-start gap-5">
                  <Eyebrow>{t('vendorsEyebrow')}</Eyebrow>
                  <h2 id="vendors-title" className="text-headline font-semibold text-balance">
                    {t('vendorsTitle')}
                  </h2>
                  <p className="max-w-md text-lg leading-relaxed text-ink-soft">{t('vendorsBody')}</p>
                  <Link href="/vendor/onboarding" className={buttonStyles({ size: 'lg', className: 'group mt-2' })}>
                    {t('vendorsCta')}
                    <Icon name="arrowRight" className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </div>
                <ul className="flex flex-col gap-2">
                  {vendorPoints.map((point) => (
                    <li key={point} className="flex items-center gap-3 rounded-xl bg-subtle px-4 py-3.5 text-ink">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                        <Icon name="check" className="size-3.5" />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>
      </ViewTransition>
    </main>
  );
}
