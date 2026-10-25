import { isArea, isEventType, VENUE_TYPES } from '@shevent/core/enums';
import { todayInLahore } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PlanForm, type PlanFormDefaults } from '@/components/plan-form';

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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-2xl text-zinc-700">{t('intro')}</p>
      </div>
      <PlanForm defaults={defaults} today={todayInLahore()} />
    </main>
  );
}
