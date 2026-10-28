import { CATEGORY_LABELS, EVENT_TYPE_LABELS } from '@shevent/core/enums';
import { formatEventDate, formatPkr } from '@shevent/core/format';
import type { QuoteCheckResponse } from '@shevent/core/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { ChatPanel } from '@/components/chat-panel';
import { FairnessBadge } from '@/components/fairness-badge';
import { Icon } from '@/components/icons';
import { QuoteDetails } from '@/components/quote-details';
import { QuoteListener } from '@/components/quote-listener';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { InquiryStatusBadge } from '@/components/status-badge';
import { SubmitButton } from '@/components/submit-button';
import { TrackEvent } from '@/components/track-event';
import { buttonStyles } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';
import { cardStyles, MetaList, Page, PageHeader } from '@/components/ui/page';
import { Link } from '@/i18n/navigation';
import { getAi } from '@/lib/ai';
import { requireUser } from '@/lib/auth';
import { isUuid, planToSpec } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import { bookQuote } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Inquiry');
  return { title: t('metaTitle') };
}

// The host's side of an inquiry: the chat, the quote with its fairness label, and Book. The vendor
// answers from /vendor/inquiries/[id]. Neither side sees the host's budget here.
export default async function InquiryPage({ params, searchParams }: PageProps<'/[locale]/inquiries/[id]'>) {
  const [{ id }, query, t, tStatus, user] = await Promise.all([
    params,
    searchParams,
    getTranslations('Inquiry'),
    getTranslations('InquiryStatus'),
    requireUser(),
  ]);
  if (!isUuid(id)) notFound();
  const supabase = (await createClient())!;

  const { data: inquiry } = await supabase
    .from('inquiries')
    .select('id, status, plan_id, host_id, vendors(name, category)')
    .eq('id', id)
    .maybeSingle();
  if (!inquiry || !inquiry.vendors) notFound();
  if (inquiry.host_id !== user.id) redirect(`/vendor/inquiries/${id}`);

  const [{ data: brief }, { data: messages }, { data: quote }, { data: booking }] = await Promise.all([
    supabase.rpc('inquiry_brief', { target: id }).maybeSingle(),
    supabase.from('messages').select('id, sender_id, body, created_at').eq('inquiry_id', id).order('created_at'),
    supabase.from('quotes').select('*').eq('inquiry_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('bookings').select('id').eq('inquiry_id', id).maybeSingle(),
  ]);

  const vendor = inquiry.vendors;

  let check: QuoteCheckResponse | null = null;
  if (quote && brief) {
    try {
      check = await getAi().quoteCheck({
        plan: planToSpec(brief),
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

  return (
    <Page>
      {query.sent && <TrackEvent event="inquiry_sent" />}
      {(inquiry.status === 'open' || inquiry.status === 'quoted') && <QuoteListener inquiryId={inquiry.id} />}
      <PageHeader back={{ href: `/plans/${inquiry.plan_id}`, label: t('backToPlan') }} eyebrow={CATEGORY_LABELS[vendor.category]} title={vendor.name}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <InquiryStatusBadge status={inquiry.status} label={tStatus(inquiry.status)} />
          {brief && (
            <MetaList
              items={[
                { icon: 'sparkles', label: t('eventLabel'), text: EVENT_TYPE_LABELS[brief.event_type] },
                { icon: 'calendar', label: t('dateLabel'), text: formatEventDate(brief.event_date) },
                { icon: 'users', label: t('guestsLabel'), text: t('guests', { count: brief.guest_count }) },
                { icon: 'mapPin', label: t('areaLabel'), text: brief.area },
              ]}
            />
          )}
        </div>
      </PageHeader>

      {query.book === 'failed' && (
        <Notice tone="error" role="alert">
          {t('bookFailed')}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <ChatPanel inquiryId={inquiry.id} currentUserId={user.id} otherName={vendor.name} initialMessages={messages ?? []} />

        <section aria-labelledby="quote-heading" className={`${cardStyles} flex flex-col gap-4 p-5 sm:p-6 lg:sticky lg:top-24`}>
          <h2 id="quote-heading" className="flex items-center gap-2 text-xl font-semibold">
            <Icon name="receipt" className="size-5 text-muted" />
            {t('quote')}
          </h2>
          {!quote ? (
            <EmptyState icon="receipt" compact>
              {t('noQuoteHost')}
            </EmptyState>
          ) : (
            <>
              <QuoteDetails quote={quote} />
              <SampleDataNotice response={check} />
              {check ? <FairnessBadge check={check} /> : <p className="text-sm text-muted">{t('checkUnavailable')}</p>}

              {booking ? (
                <Link href={`/bookings/${booking.id}`} className={buttonStyles({ variant: 'secondary' })}>
                  {t('viewBooking')}
                  <Icon name="arrowRight" className="size-4" />
                </Link>
              ) : (
                inquiry.status === 'quoted' && (
                  <form action={bookQuote.bind(null, inquiry.id, quote.id)} className="flex flex-col gap-2 border-t border-line pt-4">
                    <SubmitButton className={buttonStyles({ size: 'lg', block: true })}>{t('book', { total: formatPkr(quote.total_pkr) })}</SubmitButton>
                    <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
                      <Icon name="info" className="size-3.5" />
                      {t('simulated')}
                    </p>
                  </form>
                )
              )}
            </>
          )}
        </section>
      </div>
    </Page>
  );
}
