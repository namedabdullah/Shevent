import { EVENT_TYPE_LABELS, PREFERENCE_LABELS, VENUE_TYPE_LABELS, isPreference } from '@shevent/core/enums';
import { formatEventDate, todayInLahore } from '@shevent/core/format';
import type { QuoteCheckResponse } from '@shevent/core/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ChatPanel } from '@/components/chat-panel';
import { FairnessBadge } from '@/components/fairness-badge';
import { QuoteDetails } from '@/components/quote-details';
import { QuoteForm } from '@/components/quote-form';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { SubmitButton } from '@/components/submit-button';
import { TrackEvent } from '@/components/track-event';
import { Link } from '@/i18n/navigation';
import { getAi } from '@/lib/ai';
import { isUuid, planToSpec } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import { requireListing } from '@/lib/vendor';
import { declineInquiry, sendQuote } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('VendorInquiry');
  return { title: t('metaTitle') };
}

export default function VendorInquiryPage({ params, searchParams }: PageProps<'/[locale]/vendor/inquiries/[id]'>) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={null}>
        <Inquiry params={params} searchParams={searchParams} />
      </Suspense>
    </main>
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
    <>
      {query.quoted && <TrackEvent event="quote_sent" />}
      <header className="flex flex-col gap-2">
        <Link href="/vendor/inquiries" className="text-sm underline underline-offset-4">
          ← {t('backToInbox')}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t('title', { event: EVENT_TYPE_LABELS[brief.event_type], area: brief.area })}</h1>
        <p className="text-zinc-700">
          {tStatus(inquiry.status)} ·{' '}
          {t('details', {
            date: formatEventDate(brief.event_date),
            guests: tInquiry('guests', { count: brief.guest_count }),
            venue: brief.venue_type ? VENUE_TYPE_LABELS[brief.venue_type] : t('anyVenue'),
          })}
        </p>
        {preferences.length > 0 && <p className="text-sm text-zinc-700">{t('preferences', { list: preferences.join(', ') })}</p>}
      </header>

      {query.quoted && (
        <p role="status" className="rounded-lg border border-green-600 bg-green-50 px-4 py-3 text-green-950">
          {t('quoteSent')}
        </p>
      )}
      {query.action === 'failed' && <p role="alert" className="text-red-700">{t('actionFailed')}</p>}

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <ChatPanel inquiryId={inquiry.id} currentUserId={user.id} otherName={tInquiry('host')} initialMessages={messages ?? []} />

        <section aria-labelledby="quote-heading" className="flex flex-col gap-4">
          <h2 id="quote-heading" className="text-xl font-semibold">{tInquiry('quote')}</h2>
          {quote && (
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">{t('yourQuote')}</h3>
              <QuoteDetails quote={quote} />
              <p className="text-sm font-medium">{t('hostSees')}</p>
              <SampleDataNotice response={check} />
              {check ? <FairnessBadge check={check} /> : <p className="text-sm text-zinc-600">{tInquiry('checkUnavailable')}</p>}
            </div>
          )}

          {inquiry.status === 'booked' && <p className="rounded-lg border border-green-600 bg-green-50 px-4 py-3 text-green-950">{t('booked')}</p>}
          {inquiry.status === 'declined' && <p className="text-zinc-700">{t('declined')}</p>}
          {inquiry.status === 'closed' && <p className="text-zinc-700">{t('closed')}</p>}

          {canQuote && (
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">{quote ? t('reviseQuote') : t('sendQuote')}</h3>
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
            <form action={declineInquiry.bind(null, inquiry.id)} className="flex flex-col gap-1 border-t border-zinc-200 pt-4">
              <SubmitButton className="min-h-11 self-start rounded-lg border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60">
                {t('decline')}
              </SubmitButton>
              <p className="text-xs text-zinc-600">{t('declineHint')}</p>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
