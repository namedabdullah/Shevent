import { CATEGORY_LABELS, EVENT_TYPE_LABELS } from '@shevent/core/enums';
import { formatEventDate, formatPkr, formatPkrPerUnit } from '@shevent/core/format';
import type { QuoteCheckResponse } from '@shevent/core/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ChatPanel } from '@/components/chat-panel';
import { FairnessBadge } from '@/components/fairness-badge';
import { SampleDataNotice } from '@/components/sample-data-notice';
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

// Both participants use this page: the host sees the fairness label and can book; the vendor sees
// the same chat. Neither side sees the host's budget here.
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

  const [{ data: brief }, { data: messages }, { data: quote }, { data: booking }] = await Promise.all([
    supabase.rpc('inquiry_brief', { target: id }).maybeSingle(),
    supabase.from('messages').select('id, sender_id, body, created_at').eq('inquiry_id', id).order('created_at'),
    supabase.from('quotes').select('*').eq('inquiry_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('bookings').select('id').eq('inquiry_id', id).maybeSingle(),
  ]);

  const isHost = inquiry.host_id === user.id;
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
      <header className="flex flex-col gap-2">
        {isHost && (
          <Link href={`/plans/${inquiry.plan_id}`} className="text-sm underline underline-offset-4">
            ← {t('backToPlan')}
          </Link>
        )}
        <h1 className="text-3xl font-semibold tracking-tight">{vendor.name}</h1>
        <p className="text-zinc-700">
          {CATEGORY_LABELS[vendor.category]} · {tStatus(inquiry.status)}
          {brief && <> · {EVENT_TYPE_LABELS[brief.event_type]}, {formatEventDate(brief.event_date)}, {t('guests', { count: brief.guest_count })}, {brief.area}</>}
        </p>
      </header>

      {query.book === 'failed' && <p role="alert" className="text-red-700">{t('bookFailed')}</p>}

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <ChatPanel
          inquiryId={inquiry.id}
          currentUserId={user.id}
          otherName={isHost ? vendor.name : t('host')}
          initialMessages={messages ?? []}
        />

        <section aria-labelledby="quote-heading" className="flex flex-col gap-3">
          <h2 id="quote-heading" className="text-xl font-semibold">{t('quote')}</h2>
          {!quote ? (
            <p className="text-zinc-700">{isHost ? t('noQuoteHost') : t('noQuoteVendor')}</p>
          ) : (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-zinc-600">{t('price')}</dt>
                <dd className="font-medium tabular-nums">{formatPkrPerUnit(quote.amount_pkr, quote.unit)}</dd>
                <dt className="text-zinc-600">{t('total')}</dt>
                <dd className="font-medium tabular-nums">{formatPkr(quote.total_pkr)}</dd>
                {quote.inclusions.length > 0 && (
                  <>
                    <dt className="text-zinc-600">{t('includes')}</dt>
                    <dd>{quote.inclusions.join(', ')}</dd>
                  </>
                )}
                {quote.exclusions.length > 0 && (
                  <>
                    <dt className="text-zinc-600">{t('excludes')}</dt>
                    <dd>{quote.exclusions.join(', ')}</dd>
                  </>
                )}
                {quote.notes && (
                  <>
                    <dt className="text-zinc-600">{t('notes')}</dt>
                    <dd className="whitespace-pre-wrap">{quote.notes}</dd>
                  </>
                )}
              </dl>

              <SampleDataNotice response={check} />
              {check ? <FairnessBadge check={check} /> : <p className="text-sm text-zinc-600">{t('checkUnavailable')}</p>}

              {booking ? (
                <Link href={`/bookings/${booking.id}`} className="min-h-11 self-start rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-50">
                  {t('viewBooking')}
                </Link>
              ) : (
                isHost &&
                inquiry.status === 'quoted' && (
                  <form action={bookQuote.bind(null, inquiry.id, quote.id)} className="flex flex-col gap-1">
                    <button type="submit" className="min-h-11 self-start rounded-lg bg-zinc-900 px-5 font-medium text-white hover:bg-zinc-700">
                      {t('book', { total: formatPkr(quote.total_pkr) })}
                    </button>
                    <p className="text-xs text-zinc-600">{t('simulated')}</p>
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
