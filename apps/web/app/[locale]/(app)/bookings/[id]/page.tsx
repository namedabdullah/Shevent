import { CATEGORY_LABELS } from '@shevent/core/enums';
import { formatPkr } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/icons';
import { ArchWindow } from '@/components/ornaments';
import { SubmitButton } from '@/components/submit-button';
import { TrackEvent } from '@/components/track-event';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { buttonStyles } from '@/components/ui/button';
import { cardStyles, Page } from '@/components/ui/page';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import { completeBooking } from './actions';

const STATUS_TONE: Record<string, BadgeTone> = { confirmed: 'success', completed: 'success', cancelled: 'muted' };

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
    <Page width="narrow">
      {query.booked && <TrackEvent event="booking_simulated" />}
      {/* The confirmation as a keepsake ticket: the arch on the stub, the details on the body. */}
      <article className={`${cardStyles} grid overflow-hidden sm:grid-cols-[11rem_1fr]`}>
        <div className="relative hidden border-e border-dashed border-sand-300 bg-brand-950 p-5 sm:flex sm:items-center sm:justify-center">
          <ArchWindow className="aspect-[4/5] w-full" />
        </div>
        <div className="flex flex-col gap-6 p-6 sm:p-8">
          <header className="flex flex-col gap-3">
            <Badge tone={STATUS_TONE[booking.status] ?? 'neutral'} icon={booking.status === 'cancelled' ? 'info' : 'check'} className="self-start">
              {t(`status.${booking.status}`)}
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t('title', { vendor: booking.vendors.name })}</h1>
            <p className="text-sand-700">{CATEGORY_LABELS[booking.vendors.category]}</p>
          </header>

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 border-y border-dashed border-sand-300 py-5">
            <dt className="text-sand-600">{t('amount')}</dt>
            <dd className="font-display text-2xl font-semibold text-sand-900 tabular-nums">{formatPkr(booking.amount_pkr)}</dd>
            <dt className="text-sand-600">{t('payment')}</dt>
            <dd className="text-sand-800">{t('simulated')}</dd>
          </dl>

          {isHost &&
            (booking.status === 'confirmed' ? (
              <form action={completeBooking.bind(null, booking.id)} className="flex flex-col items-start gap-2">
                <SubmitButton className={buttonStyles({ size: 'lg' })}>{t('complete')}</SubmitButton>
                <p className="text-sm text-sand-600">{t('completeHint')}</p>
              </form>
            ) : booking.status === 'completed' ? (
              <Link href={`/plans/${booking.plan_id}/feedback`} className={buttonStyles({ size: 'lg', className: 'self-start' })}>
                <Icon name="star" className="size-4" />
                {t('giveFeedback')}
              </Link>
            ) : null)}

          <div className="flex flex-wrap gap-2">
            <Link href={`/inquiries/${booking.inquiry_id}`} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              <Icon name="message" className="size-4" />
              {t('openChat')}
            </Link>
            {isHost && (
              <Link href={`/plans/${booking.plan_id}`} className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
                <Icon name="arrowLeft" className="size-4" />
                {t('backToPlan')}
              </Link>
            )}
          </div>
        </div>
      </article>
    </Page>
  );
}
