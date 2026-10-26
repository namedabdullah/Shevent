import { CATEGORY_LABELS } from '@shevent/core/enums';
import { formatPkr } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SubmitButton } from '@/components/submit-button';
import { TrackEvent } from '@/components/track-event';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import { completeBooking } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Booking');
  return { title: t('metaTitle') };
}

export default async function BookingPage({ params, searchParams }: PageProps<'/[locale]/bookings/[id]'>) {
  const [{ id }, query, t, user] = await Promise.all([params, searchParams, getTranslations('Booking'), requireUser()]);
  if (!isUuid(id)) notFound();

  const supabase = (await createClient())!;
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, amount_pkr, plan_id, inquiry_id, host_id, vendors(name, category)')
    .eq('id', id)
    .maybeSingle();
  if (!booking || !booking.vendors) notFound();
  const isHost = booking.host_id === user.id;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      {query.booked && <TrackEvent event="booking_simulated" />}
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-green-800">✓ {t(`status.${booking.status}`)}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{t('title', { vendor: booking.vendors.name })}</h1>
        <p className="text-sand-700">{CATEGORY_LABELS[booking.vendors.category]}</p>
      </header>

      <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="text-sand-600">{t('amount')}</dt>
        <dd className="font-medium tabular-nums">{formatPkr(booking.amount_pkr)}</dd>
        <dt className="text-sand-600">{t('payment')}</dt>
        <dd>{t('simulated')}</dd>
      </dl>

      <div className="flex flex-wrap gap-3">
        <Link href={`/inquiries/${booking.inquiry_id}`} className="min-h-11 rounded-lg border border-sand-400 px-4 py-2.5 text-sm font-medium hover:bg-sand-100">
          {t('openChat')}
        </Link>
        {isHost && (
          <Link href={`/plans/${booking.plan_id}`} className="min-h-11 rounded-lg border border-sand-400 px-4 py-2.5 text-sm font-medium hover:bg-sand-100">
            {t('backToPlan')}
          </Link>
        )}
      </div>

      {isHost &&
        (booking.status === 'confirmed' ? (
          <form action={completeBooking.bind(null, booking.id)} className="flex flex-col items-start gap-1">
            <SubmitButton className="min-h-11 rounded-lg bg-brand-700 px-5 font-medium text-white hover:bg-brand-800 disabled:opacity-60">
              {t('complete')}
            </SubmitButton>
            <p className="text-xs text-sand-600">{t('completeHint')}</p>
          </form>
        ) : booking.status === 'completed' ? (
          <Link href={`/plans/${booking.plan_id}/feedback`} className="min-h-11 self-start rounded-lg bg-brand-700 px-5 py-2.5 font-medium text-white hover:bg-brand-800">
            {t('giveFeedback')}
          </Link>
        ) : null)}
    </main>
  );
}
