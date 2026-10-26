import { CATEGORY_LABELS, EVENT_TYPE_LABELS } from '@shevent/core/enums';
import { formatEventDate } from '@shevent/core/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { TrackEvent } from '@/components/track-event';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireListing } from '@/lib/vendor';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Vendor');
  return { title: t('dashboardTitle') };
}

export default function VendorDashboardPage({ searchParams }: PageProps<'/[locale]/vendor'>) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <Suspense fallback={null}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
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
      <header className="flex flex-col gap-2">
        <p className="text-sm text-zinc-600">{tVendor('dashboardTitle')}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{vendor.name}</h1>
        <p className="flex flex-wrap items-center gap-2 text-zinc-700">
          {CATEGORY_LABELS[vendor.category]} · {vendor.base_area}
          <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs">{vendor.verified ? `✓ ${t('verified')}` : t('notVerified')}</span>
          <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs">{vendor.public_consent ? t('publicOn') : t('publicOff')}</span>
        </p>
        <Link href="/vendor/profile" className="text-sm underline underline-offset-4">
          {t('editListing')}
        </Link>
      </header>

      {query.onboarded && (
        <p role="status" className="rounded-lg border border-green-600 bg-green-50 px-4 py-3 text-green-950">
          {t('onboarded')}
        </p>
      )}

      <dl className="grid grid-cols-3 gap-3">
        {(['open', 'quoted', 'booked'] as const).map((status) => (
          <div key={status} className="flex flex-col gap-1 rounded-lg border border-zinc-200 px-4 py-3">
            <dt className="text-sm text-zinc-600">{t(status === 'open' ? 'waiting' : status)}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{count(status)}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="waiting-heading" className="flex flex-col gap-3">
        <h2 id="waiting-heading" className="text-xl font-semibold">{t('needsQuote')}</h2>
        {waiting.length === 0 ? (
          <p className="text-zinc-700">{t('noneWaiting')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200">
            {waiting.map((row) => (
              <li key={row.inquiry_id}>
                <Link href={`/vendor/inquiries/${row.inquiry_id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50">
                  <span className="font-medium">{EVENT_TYPE_LABELS[row.event_type]}</span>
                  <span className="text-sm text-zinc-600">
                    {formatEventDate(row.event_date)} · {tInbox('guestCount', { count: row.guest_count })} · {row.area}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/vendor/inquiries" className="text-sm underline underline-offset-4">
          {t('allInquiries')}
        </Link>
      </section>
    </>
  );
}
