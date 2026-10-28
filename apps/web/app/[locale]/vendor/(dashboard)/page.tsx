import { CATEGORY_LABELS, EVENT_TYPE_LABELS } from '@shevent/core/enums';
import { formatEventDate } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { DateLeaf } from '@/components/date-leaf';
import { Icon, type IconName } from '@/components/icons';
import { TrackEvent } from '@/components/track-event';
import { Badge } from '@/components/ui/badge';
import { buttonStyles, linkStyles } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';
import { Page, PageHeader, Section } from '@/components/ui/page';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireListing } from '@/lib/vendor';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Vendor');
  return { title: t('dashboardTitle') };
}

const STATS: { status: 'open' | 'quoted' | 'booked'; icon: IconName }[] = [
  { status: 'open', icon: 'inbox' },
  { status: 'quoted', icon: 'receipt' },
  { status: 'booked', icon: 'check' },
];

export default async function VendorDashboardPage({ searchParams }: PageProps<'/[locale]/vendor'>) {
  const t = await getTranslations('App');
  return (
    <Page>
      <Suspense fallback={<ListSkeleton label={t('loading')} />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<'/[locale]/vendor'>, 'searchParams'>) {
  const [{ vendor }, query, t, tVendor, tInbox] = await Promise.all([
    requireListing(),
    searchParams,
    getTranslations('VendorDashboard'),
    getTranslations('Vendor'),
    getTranslations('VendorInbox'),
  ]);
  const supabase = (await createClient())!;
  const { data: inbox } = await supabase.rpc('vendor_inbox');
  const rows = inbox ?? [];
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  const waiting = rows.filter((row) => row.status === 'open').slice(0, 5);

  return (
    <>
      {query.onboarded && <TrackEvent event="vendor_onboarded" />}
      <PageHeader
        eyebrow={tVendor('dashboardTitle')}
        title={vendor.name}
        actions={
          <Link href="/vendor/profile" className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
            <Icon name="store" className="size-4" />
            {t('editListing')}
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-ink-soft">
          <span className="flex items-center gap-1.5">
            <Icon name={vendor.category} className="size-4 text-muted" />
            {CATEGORY_LABELS[vendor.category]}
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="mapPin" className="size-4 text-muted" />
            {vendor.base_area}
          </span>
          <Badge tone={vendor.verified ? 'success' : 'neutral'} icon="shield">
            {vendor.verified ? t('verified') : t('notVerified')}
          </Badge>
          <Badge tone={vendor.public_consent ? 'accent' : 'muted'}>{vendor.public_consent ? t('publicOn') : t('publicOff')}</Badge>
        </div>
      </PageHeader>

      {query.onboarded && (
        <Notice tone="success" role="status">
          {t('onboarded')}
        </Notice>
      )}

      <dl className="grid grid-cols-3 gap-3 sm:gap-4">
        {STATS.map(({ status, icon }, index) => (
          <div
            key={status}
            className={`flex flex-col gap-2 rounded-2xl border p-4 sm:p-5 ${index === 0 ? 'scope-inverse border-transparent bg-canvas text-ink' : 'border-line bg-surface'}`}
          >
            <Icon name={icon} className={`size-5 ${index === 0 ? 'text-accent-ink' : 'text-muted'}`} />
            <dt className="text-sm leading-snug text-muted">{t(status === 'open' ? 'waiting' : status)}</dt>
            <dd className="font-display text-3xl font-semibold text-ink tabular-nums sm:text-4xl">{count(status)}</dd>
          </div>
        ))}
      </dl>

      <Section
        id="waiting-heading"
        title={t('needsQuote')}
        actions={
          <Link href="/vendor/inquiries" className={`inline-flex min-h-11 items-center gap-1.5 text-sm ${linkStyles}`}>
            {t('allInquiries')}
            <Icon name="arrowRight" className="size-4" />
          </Link>
        }
      >
        {waiting.length === 0 ? (
          <EmptyState icon="inbox" compact>
            {t('noneWaiting')}
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {waiting.map((row) => (
              <li key={row.inquiry_id}>
                <Link href={`/vendor/inquiries/${row.inquiry_id}`} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent-soft/60 sm:px-5">
                  <DateLeaf date={row.event_date} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-semibold text-ink">{EVENT_TYPE_LABELS[row.event_type]}</span>
                    <span className="text-sm text-muted">
                      {formatEventDate(row.event_date)} · {tInbox('guestCount', { count: row.guest_count })} · {row.area}
                    </span>
                  </span>
                  <Icon name="chevronRight" className="size-5 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent-ink" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
