import { EVENT_TYPE_LABELS } from '@shevent/core/enums';
import { formatEventDate, formatPkr } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireListing } from '@/lib/vendor';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('VendorInbox');
  return { title: t('title') };
}

export default async function VendorInboxPage() {
  const t = await getTranslations('VendorInbox');
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-xl text-sand-700">{t('intro')}</p>
      </header>
      <Suspense fallback={null}>
        <Inbox />
      </Suspense>
    </main>
  );
}

// vendor_inbox() returns the event for each inquiry but never the host's budget.
async function Inbox() {
  await requireListing();
  const [t, tStatus, supabase] = await Promise.all([getTranslations('VendorInbox'), getTranslations('VendorInquiryStatus'), createClient()]);
  const { data: rows } = await supabase!.rpc('vendor_inbox');
  if (!rows?.length) return <p className="text-sand-700">{t('empty')}</p>;

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.inquiry_id}>
          <article className="flex flex-col gap-3 rounded-xl border border-sand-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold">{EVENT_TYPE_LABELS[row.event_type]}</h2>
              <p className="text-sm text-sand-700">
                {formatEventDate(row.event_date)} · {t('guestCount', { count: row.guest_count })} · {row.area}
              </p>
              <p className="text-sm">
                <span className="font-medium">{tStatus(row.status)}</span>
                <span className="text-sand-600">
                  {' · '}
                  {t('quote')}: {row.quote_total_pkr === null ? t('noQuote') : formatPkr(row.quote_total_pkr)}
                </span>
              </p>
            </div>
            <Link
              href={`/vendor/inquiries/${row.inquiry_id}`}
              aria-label={`${t('open')}: ${EVENT_TYPE_LABELS[row.event_type]}, ${formatEventDate(row.event_date)}`}
              className="inline-flex min-h-11 items-center self-start rounded-lg border border-sand-400 px-4 text-sm font-medium hover:bg-sand-100 sm:self-auto"
            >
              {t('open')}
            </Link>
          </article>
        </li>
      ))}
    </ul>
  );
}
