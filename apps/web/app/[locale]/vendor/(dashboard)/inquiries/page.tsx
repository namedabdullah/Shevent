import { EVENT_TYPE_LABELS } from '@shevent/core/enums';
import { formatEventDate, formatPkr } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { DateLeaf } from '@/components/date-leaf';
import { InquiryStatusBadge } from '@/components/status-badge';
import { buttonStyles } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { cardStyles, Page, PageHeader } from '@/components/ui/page';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireListing } from '@/lib/vendor';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('VendorInbox');
  return { title: t('title') };
}

export default async function VendorInboxPage() {
  const [t, tApp] = await Promise.all([getTranslations('VendorInbox'), getTranslations('App')]);
  return (
    <Page>
      <PageHeader title={t('title')} description={t('intro')} />
      <Suspense fallback={<ListSkeleton label={tApp('loading')} />}>
        <Inbox />
      </Suspense>
    </Page>
  );
}

// vendor_inbox() returns the event for each inquiry but never the host's budget.
async function Inbox() {
  await requireListing();
  const [t, tStatus, supabase] = await Promise.all([getTranslations('VendorInbox'), getTranslations('VendorInquiryStatus'), createClient()]);
  const { data: rows } = await supabase!.rpc('vendor_inbox');
  if (!rows?.length)
    return (
      <EmptyState icon="inbox" title={t('emptyTitle')}>
        {t('empty')}
      </EmptyState>
    );

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.inquiry_id}>
          <article className={`${cardStyles} flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5`}>
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <DateLeaf date={row.event_date} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <h2 className="text-lg font-semibold">{EVENT_TYPE_LABELS[row.event_type]}</h2>
                <p className="text-sm text-sand-700">
                  {formatEventDate(row.event_date)} · {t('guestCount', { count: row.guest_count })} · {row.area}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                  <InquiryStatusBadge status={row.status} label={tStatus(row.status)} />
                  <span className="text-sand-600">
                    {t('quote')}: <span className="font-semibold text-sand-800 tabular-nums">{row.quote_total_pkr === null ? t('noQuote') : formatPkr(row.quote_total_pkr)}</span>
                  </span>
                </div>
              </div>
            </div>
            <Link
              href={`/vendor/inquiries/${row.inquiry_id}`}
              aria-label={`${t('open')}: ${EVENT_TYPE_LABELS[row.event_type]}, ${formatEventDate(row.event_date)}`}
              className={buttonStyles({ variant: row.status === 'open' ? 'primary' : 'secondary', size: 'sm', className: 'self-start sm:self-auto' })}
            >
              {t('open')}
            </Link>
          </article>
        </li>
      ))}
    </ul>
  );
}
