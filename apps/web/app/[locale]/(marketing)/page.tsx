import { CATEGORIES, CATEGORY_LABELS, CATEGORY_UNITS, type Category } from '@shevent/core/enums';
import { UNIT_LABELS } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { EventStack, type EventCard } from '@/components/event-stack';
import { Icon, type IconName } from '@/components/icons';
import { CelebrationSparks, GlowCard, RotatingWord, WordMarquee } from '@/components/motion';
import { SectionLink } from '@/components/smooth-scroll';
import { TryWidget } from '@/components/try-widget';
import { buttonStyles } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/page';
import { WaitlistForm } from '@/components/waitlist-form';
import { getPathname, Link } from '@/i18n/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { alternates: { canonical: getPathname({ href: '/', locale }) } };
}

const TRUST_ICONS: IconName[] = ['lock', 'scale', 'message', 'tag'];

// The hero's card stack: one card per kind of event, with the categories that usually matter most.
const STACK: { icon: IconName; categories: Category[] }[] = [
  { icon: 'heart', categories: ['venue', 'catering', 'photography'] },
  { icon: 'cake', categories: ['venue', 'catering', 'dj_sound'] },
  { icon: 'briefcase', categories: ['venue', 'catering', 'lighting'] },
  { icon: 'graduation', categories: ['venue', 'decor', 'dj_sound'] },
  { icon: 'mic', categories: ['dj_sound', 'lighting', 'venue'] },
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
  const stack = t.raw('stack') as { title: string; note: string }[];
  const details = t.raw('categoryDetails') as Record<Category, string>;
  const units = new Intl.ListFormat(locale, { type: 'disjunction' });
  const cards: EventCard[] = stack.map((card, index) => ({ ...card, ...STACK[index]! }));

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
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(56rem_28rem_at_78%_0%,var(--accent-soft),transparent_65%)]" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--line-strong)_1px,transparent_1.2px)] bg-size-[26px_26px] opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
        />
        <CelebrationSparks>
          <div className={`relative grid items-center gap-14 pt-14 pb-20 md:grid-cols-[1.1fr_0.9fr] md:pt-24 md:pb-28 lg:gap-20 ${container}`}>
            <div className="flex flex-col gap-8">
              <Eyebrow className="animate-enter">{t('eyebrow')}</Eyebrow>
              <h1 className="animate-enter text-display font-semibold [animation-delay:60ms]">
                {t.rich('title', {
                  event: () => <RotatingWord words={rotating} className="text-accent-ink" />,
                  line: (chunks) => <span className="block text-balance">{chunks}</span>,
                })}
              </h1>
              <p className="max-w-lg animate-enter text-lg leading-relaxed text-pretty text-ink-soft [animation-delay:120ms]">{t('subtitle')}</p>
              <div className="flex animate-enter flex-col gap-4 [animation-delay:180ms]">
                <WaitlistForm />
                <SectionLink hash="try" className="group inline-flex min-h-11 items-center gap-2 self-start font-semibold text-ink">
                  {t('tryLink')}
                  <Icon name="arrowRight" className="size-4 text-accent-ink transition-transform duration-300 group-hover:translate-x-1" />
                </SectionLink>
              </div>
            </div>
            <div className="animate-enter [animation-delay:240ms]">
              <EventStack cards={cards} />
            </div>
          </div>
        </CelebrationSparks>
      </section>

      {/* Every kind of event, and the five categories, drifting with the scroll (decorative). */}
      <div className="border-y border-line py-6 text-ink md:py-8">
        <WordMarquee rows={[occasions, CATEGORIES.map((category) => CATEGORY_LABELS[category])]} />
      </div>

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
      <section aria-labelledby="categories-title" className="border-t border-line">
        <div className={`flex flex-col gap-12 py-20 md:py-28 ${container}`}>
          <SectionHeading id="categories-title" eyebrow={t('categoriesEyebrow')} title={t('categoriesTitle')} />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((category) => (
              <li
                key={category}
                className="reveal group flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 transition-[border-color,translate] duration-300 hover:-translate-y-1 hover:border-line-strong"
              >
                <span className="relative flex size-11 items-center justify-center rounded-xl bg-subtle text-ink transition-colors duration-300 group-hover:bg-accent-soft group-hover:text-accent-ink">
                  <Icon name={category} className="size-5" />
                  <span aria-hidden className="absolute -end-1 -top-1 size-3 rounded-full border-2 border-surface" style={{ background: `var(--series-${category})` }} />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-lg font-semibold">{CATEGORY_LABELS[category]}</h3>
                  <p className="text-sm leading-relaxed text-ink-soft">{details[category]}</p>
                </div>
                <p className="mt-auto text-xs text-muted">
                  {t('categoryUnits', { units: units.format(CATEGORY_UNITS[category].map((unit) => UNIT_LABELS[unit])) })}
                </p>
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
    </main>
  );
}
