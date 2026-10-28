import { isArea, isEventType, VENUE_TYPES } from '@shevent/core/enums';
import { todayInLahore } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/icons';
import { PlanForm, type PlanFormDefaults } from '@/components/plan-form';
import { buttonStyles } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/ui/page';
import { Link } from '@/i18n/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Planner');
  return { title: t('title') };
}

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);

// Pre-filled from the URL so the landing page's "try it" widget can hand over its inputs:
// /plan/new?event_type=wedding_mehndi&guests=300&area=Gulberg&date=2026-12-19&budget=25+lakh
export default async function NewPlanPage({ searchParams }: PageProps<'/[locale]/plan/new'>) {
  const [t, params] = await Promise.all([getTranslations('Planner'), searchParams]);
  const eventType = one(params.event_type);
  const area = one(params.area);
  const venueType = one(params.venue_type);
  const defaults: PlanFormDefaults = {
    event_type: eventType && isEventType(eventType) ? eventType : undefined,
    guest_count: one(params.guests),
    area: area && isArea(area) ? area : undefined,
    venue_type: venueType && (VENUE_TYPES as readonly string[]).includes(venueType) ? venueType : undefined,
    event_date: one(params.date),
    budget: one(params.budget),
  };
  const next = t.raw('next') as string[];

  return (
    <Page>
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <PlanForm defaults={defaults} today={todayInLahore()} />
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <div className="scope-inverse rounded-2xl bg-canvas p-6 text-ink">
            <Icon name="sparkles" className="size-5 text-accent-ink" />
            <h2 className="mt-3 text-lg font-semibold">{t('assistantTitle')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t('assistantBody')}</p>
            <Link href="/assistant" className={buttonStyles({ size: 'sm', className: 'mt-4' })}>
              {t('assistantLink')}
            </Link>
          </div>
          <div className="rounded-2xl border border-line p-6">
            <h2 className="text-lg font-semibold">{t('nextTitle')}</h2>
            <ol className="mt-3 flex flex-col gap-3 text-sm text-ink-soft">
              {next.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong font-display text-sm text-accent-ink italic">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </Page>
  );
}
