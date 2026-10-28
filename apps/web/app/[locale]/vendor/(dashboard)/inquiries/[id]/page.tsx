import { EVENT_TYPE_LABELS, PREFERENCE_LABELS, VENUE_TYPE_LABELS, isPreference } from '@shevent/core/enums';
import { formatEventDate, todayInLahore } from '@shevent/core/format';
import type { QuoteCheckResponse } from '@shevent/core/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ChatPanel } from '@/components/chat-panel';
import { FairnessBadge } from '@/components/fairness-badge';
import { Icon } from '@/components/icons';
import { QuoteDetails } from '@/components/quote-details';
import { QuoteForm } from '@/components/quote-form';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { InquiryStatusBadge } from '@/components/status-badge';
import { SubmitButton } from '@/components/submit-button';
import { TrackEvent } from '@/components/track-event';
import { buttonStyles } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { cardStyles, MetaList, Page, PageHeader } from '@/components/ui/page';
import { PageSkeleton } from '@/components/ui/skeleton';
import { getAi } from '@/lib/ai';
import { isUuid, planToSpec } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import { requireListing } from '@/lib/vendor';
import { declineInquiry, sendQuote } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('VendorInquiry');
  return { title: t('metaTitle') };
}

export default async function VendorInquiryPage({ params, searchParams }: PageProps<'/[locale]/vendor/inquiries/[id]'>) {
  const t = await getTranslations('App');
  return (
    <Suspense fallback={<PageSkeleton label={t('loading')} />}>
      <Inquiry params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// The vendor's side of an inquiry: the event (never the host's budget), the chat, and the quote
// form with a live fairness preview.
async function Inquiry({ params, searchParams }: PageProps<'/[locale]/vendor/inquiries/[id]'>) {
  const [{ id }, query, t, tStatus, { user, vendor }] = await Promise.all([
    params,
    searchParams,
    getTranslations('VendorInquiry'),
    getTranslations('VendorInquiryStatus'),
    requireListing(),
  ]);
  if (!isUuid(id)) notFound();
  const supabase = (await createClient())!;

  const { data: inquiry } = await supabase.from('inquiries').select('id, status, vendor_id').eq('id', id).eq('vendor_id', vendor.id).maybeSingle();
  if (!inquiry) notFound();

  const [{ data: brief }, { data: messages }, { data: quote }, tInquiry] = await Promise.all([
    supabase.rpc('inquiry_brief', { target: id }).maybeSingle(),
    supabase.from('messages').select('id, sender_id, body, created_at').eq('inquiry_id', id).order('created_at'),
    supabase.from('quotes').select('*').eq('inquiry_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    getTranslations('Inquiry'),
  ]);
  if (!brief) notFound();
  const spec = planToSpec(brief);

  let check: QuoteCheckResponse | null = null;
  if (quote) {
    try {
      check = await getAi().quoteCheck({
        plan: spec,
        category: vendor.category,
        quoted_pkr: quote.amount_pkr,
        unit: quote.unit,
        hours: quote.hours ?? undefined,
        inclusions: quote.inclusions,
        notes: quote.notes ?? undefined,
      });
    } catch (error) {
      console.error('Quote check failed', error);
    }
  }

  const canQuote = inquiry.status === 'open' || inquiry.status === 'quoted';
  const preferences = brief.preferences.filter(isPreference).map((value) => PREFERENCE_LABELS[value]);

  return (
    <Page>
      {query.quoted && <TrackEvent event="quote_sent" />}
      <PageHeader back={{ href: '/vendor/inquiries', label: t('backToInbox') }} title={t('title', { event: EVENT_TYPE_LABELS[brief.event_type], area: brief.area })}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <InquiryStatusBadge status={inquiry.status} label={tStatus(inquiry.status)} />
            <MetaList
              items={[
                { icon: 'calendar', label: tInquiry('dateLabel'), text: formatEventDate(brief.event_date) },
                { icon: 'users', label: tInquiry('guestsLabel'), text: tInquiry('guests', { count: brief.guest_count }) },
                { icon: 'venue', label: tInquiry('venueLabel'), text: brief.venue_type ? VENUE_TYPE_LABELS[brief.venue_type] : t('anyVenue') },
              ]}
            />
          </div>
          {preferences.length > 0 && <p className="text-sm text-ink-soft">{t('preferences', { list: preferences.join(', ') })}</p>}
        </div>
      </PageHeader>

      {query.quoted && (
        <Notice tone="success" role="status">
          {t('quoteSent')}
        </Notice>
      )}
      {query.action === 'failed' && (
        <Notice tone="error" role="alert">
          {t('actionFailed')}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start">
        <ChatPanel inquiryId={inquiry.id} currentUserId={user.id} otherName={tInquiry('host')} initialMessages={messages ?? []} />

        <section aria-labelledby="quote-heading" className={`${cardStyles} flex flex-col gap-5 p-5 sm:p-6`}>
          <h2 id="quote-heading" className="flex items-center gap-2 text-xl font-semibold">
            <Icon name="receipt" className="size-5 text-muted" />
            {tInquiry('quote')}
          </h2>
          {quote && (
            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold">{t('yourQuote')}</h3>
              <QuoteDetails quote={quote} />
              <p className="text-sm font-semibold text-ink">{t('hostSees')}</p>
              <SampleDataNotice response={check} />
              {check ? <FairnessBadge check={check} /> : <p className="text-sm text-muted">{tInquiry('checkUnavailable')}</p>}
            </div>
          )}

          {inquiry.status === 'booked' && (
            <Notice tone="success" role="status">
              {t('booked')}
            </Notice>
          )}
          {inquiry.status === 'declined' && <Notice>{t('declined')}</Notice>}
          {inquiry.status === 'closed' && <Notice>{t('closed')}</Notice>}

          {canQuote && (
            <div className={`flex flex-col gap-4 ${quote ? 'border-t border-line pt-5' : ''}`}>
              <h3 className="text-lg font-semibold">{quote ? t('reviseQuote') : t('sendQuote')}</h3>
              <QuoteForm
                action={sendQuote.bind(null, inquiry.id)}
                category={vendor.category}
                spec={spec}
                today={todayInLahore()}
                defaults={quote ?? undefined}
              />
            </div>
          )}

          {canQuote && (
            <form action={declineInquiry.bind(null, inquiry.id)} className="flex flex-col gap-1.5 border-t border-line pt-4">
              <SubmitButton className={buttonStyles({ variant: 'ghost', size: 'sm', className: '-ms-4 self-start' })}>{t('decline')}</SubmitButton>
              <p className="text-xs text-muted">{t('declineHint')}</p>
            </form>
          )}
        </section>
      </div>
    </Page>
  );
}
