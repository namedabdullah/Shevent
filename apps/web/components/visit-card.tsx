import { formatVisitTime, todayInLahore } from '@shevent/core/format';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/icons';
import { SubmitButton } from '@/components/submit-button';
import { buttonStyles } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { cardStyles } from '@/components/ui/page';
import { VisitConfirmForm, VisitRequestForm } from '@/components/visit-forms';
import { cancelVisit, declineVisit } from '@/lib/visit-actions';
import { isActiveVisit, type Visit } from '@/lib/visits';

/**
 * A venue visit on an inquiry, for both sides. The host requests a time; the venue confirms it with the
 * address or says it can't; either side cancels. It replaces arranging visits in the chat, which keeps
 * meeting plans out until a booking (lib/contact-guard.ts), so the visit stays on record.
 */
export async function VisitCard({
  side,
  inquiryId,
  visit,
  canRequest,
  venueName,
  currentUserId,
  now,
}: {
  side: 'host' | 'vendor';
  inquiryId: string;
  /** The latest visit on the inquiry, if any. */
  visit: Visit | null;
  /** The inquiry is open or quoted, so a new visit can be arranged. */
  canRequest: boolean;
  venueName: string;
  currentUserId: string;
  now: Date;
}) {
  const t = await getTranslations('Visit');
  const active = isActiveVisit(visit, now) ? visit : null;
  if (!active && !canRequest) return null;

  const time = (value: string) => formatVisitTime(value);
  const cancel = active && (
    <form action={cancelVisit.bind(null, inquiryId, active.id, side)}>
      <SubmitButton className={buttonStyles({ variant: 'ghost', size: 'sm', className: '-ms-3' })}>{t('cancel')}</SubmitButton>
    </form>
  );
  // Why the last visit isn't happening, when the other side said so.
  const ended =
    !active && visit
      ? visit.status === 'declined' && side === 'host'
        ? t('declinedBefore', { venue: venueName, time: time(visit.starts_at) })
        : visit.status === 'cancelled' && visit.cancelled_by && visit.cancelled_by !== currentUserId
          ? side === 'host'
            ? t('cancelledByVenue', { venue: venueName, time: time(visit.starts_at) })
            : t('cancelledByHost', { time: time(visit.starts_at) })
          : null
      : null;

  return (
    <section aria-labelledby="visit-heading" className={`${cardStyles} flex flex-col gap-4 p-5 sm:p-6`}>
      <h2 id="visit-heading" className="flex items-center gap-2 text-xl font-semibold">
        <Icon name="venue" className="size-5 text-muted" />
        {t('title')}
      </h2>

      {active?.status === 'requested' && (
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-2 font-semibold text-ink">
            <Icon name="calendar" className="mt-0.5 size-4.5 shrink-0 text-muted" />
            {side === 'host' ? t('requested', { time: time(active.starts_at) }) : t('vendorRequested', { time: time(active.starts_at) })}
          </p>
          {active.host_note && (
            <p className="text-sm text-ink-soft">
              <span className="font-medium text-muted">{side === 'host' ? t('yourNote') : t('hostNote')}: </span>
              {active.host_note}
            </p>
          )}
          {side === 'host' ? (
            <>
              <p className="text-sm text-muted">{t('waiting', { venue: venueName })}</p>
              {cancel}
            </>
          ) : (
            <>
              <VisitConfirmForm inquiryId={inquiryId} visitId={active.id} />
              <form action={declineVisit.bind(null, inquiryId, active.id)} className="border-t border-line pt-3">
                <SubmitButton className={buttonStyles({ variant: 'ghost', size: 'sm', className: '-ms-3' })}>{t('decline')}</SubmitButton>
              </form>
            </>
          )}
        </div>
      )}

      {active?.status === 'confirmed' && (
        <div className="flex flex-col gap-3">
          <Notice tone="success" title={t('confirmed', { time: time(active.starts_at) })}>
            <p>
              <span className="font-medium">{t('address')}: </span>
              {active.venue_address}
            </p>
            {active.venue_note && (
              <p className="mt-1">
                <span className="font-medium">{side === 'host' ? t('venueNote', { venue: venueName }) : t('yourNote')}: </span>
                {active.venue_note}
              </p>
            )}
          </Notice>
          <p className="text-sm text-muted">{t('confirmedChat')}</p>
          {cancel}
        </div>
      )}

      {!active && (
        <div className="flex flex-col gap-4">
          {ended && <Notice tone="warning">{ended}</Notice>}
          {side === 'host' ? (
            <>
              <p className="text-sm text-ink-soft">{t('intro', { venue: venueName })}</p>
              <VisitRequestForm inquiryId={inquiryId} today={todayInLahore(now)} />
            </>
          ) : (
            <p className="text-sm text-ink-soft">{t('vendorIntro')}</p>
          )}
        </div>
      )}
    </section>
  );
}
