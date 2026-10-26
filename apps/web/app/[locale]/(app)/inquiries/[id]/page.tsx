import { CATEGORY_LABELS, EVENT_TYPE_LABELS } from '@shevent/core/enums';
import { formatEventDate, formatPkr } from '@shevent/core/format';
import type { QuoteCheckResponse } from '@shevent/core/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { ChatPanel } from '@/components/chat-panel';
import { FairnessBadge } from '@/components/fairness-badge';
import { QuoteDetails } from '@/components/quote-details';
import { QuoteListener } from '@/components/quote-listener';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { SubmitButton } from '@/components/submit-button';
import { TrackEvent } from '@/components/track-event';
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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      {query.sent && <TrackEvent event="inquiry_sent" />}
      {(inquiry.status === 'open' || inquiry.status === 'quoted') && <QuoteListener inquiryId={inquiry.id} />}
      <header className="flex flex-col gap-2">
        <Link href={`/plans/${inquiry.plan_id}`} className="text-sm underline underline-offset-4">
          ← {t('backToPlan')}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{vendor.name}</h1>
        <p className="text-sand-700">
          {CATEGORY_LABELS[vendor.category]} · {tStatus(inquiry.status)}
          {brief && <> · {EVENT_TYPE_LABELS[brief.event_type]}, {formatEventDate(brief.event_date)}, {t('guests', { count: brief.guest_count })}, {brief.area}</>}
        </p>
      </header>

      {query.book === 'failed' && <p role="alert" className="text-red-700">{t('bookFailed')}</p>}

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <ChatPanel inquiryId={inquiry.id} currentUserId={user.id} otherName={vendor.name} initialMessages={messages ?? []} />

        <section aria-labelledby="quote-heading" className="flex flex-col gap-3">
          <h2 id="quote-heading" className="text-xl font-semibold">{t('quote')}</h2>
          {!quote ? (
            <p className="text-sand-700">{t('noQuoteHost')}</p>
          ) : (
            <>
              <QuoteDetails quote={quote} />
              <SampleDataNotice response={check} />
              {check ? <FairnessBadge check={check} /> : <p className="text-sm text-sand-600">{t('checkUnavailable')}</p>}

              {booking ? (
                <Link href={`/bookings/${booking.id}`} className="min-h-11 self-start rounded-lg border border-sand-400 px-4 py-2.5 text-sm font-medium hover:bg-sand-100">
                  {t('viewBooking')}
                </Link>
              ) : (
                inquiry.status === 'quoted' && (
                  <form action={bookQuote.bind(null, inquiry.id, quote.id)} className="flex flex-col gap-1">
                    <SubmitButton className="min-h-11 self-start rounded-lg bg-brand-700 px-5 font-medium text-white hover:bg-brand-800 disabled:opacity-60">
                      {t('book', { total: formatPkr(quote.total_pkr) })}
                    </SubmitButton>
                    <p className="text-xs text-sand-600">{t('simulated')}</p>
                  </form>
                )
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
