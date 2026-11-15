import { CATEGORY_LABELS } from '@shevent/core/enums';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense, ViewTransition } from 'react';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { VendorProfile } from '@/components/vendor-profile';
import { buttonStyles } from '@/components/ui/button';
import { getPathname, Link } from '@/i18n/navigation';
import { PAGE_TRANSITION } from '@/lib/transitions';
import { getVendorProfile, isIndexableProfile } from '@/lib/vendor-profile';

// Public vendor profile (WEB_APP_PLAN §4.1, /vendors/[slug]): the listing, its rating summary and
// latest reviews, reached from the directory cards. Contact goes through a plan (inquiries belong
// to a plan), so the call to action opens the planner with this service ticked.
// Not built yet: the portfolio (#7, no approved photos exist) and review insights (#6).
// Layout in components/vendor-profile.tsx.

export async function generateMetadata({ params }: PageProps<'/[locale]/vendors/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const [profile, t, locale] = await Promise.all([getVendorProfile(slug), getTranslations('PublicProfile'), getLocale()]);
  if (profile === null) return { title: t('notFoundTitle'), robots: { index: false } };
  if (profile === 'unavailable') return { robots: { index: false } };
  const { vendor } = profile;
  const category = CATEGORY_LABELS[vendor.category].toLowerCase();
  const description = vendor.description?.trim() || t('metaDescription', { name: vendor.name, category, area: vendor.base_area });
  return {
    title: t('metaTitle', { name: vendor.name, category: CATEGORY_LABELS[vendor.category] }),
    description: description.length > 160 ? `${description.slice(0, 157).trimEnd()}…` : description,
    alternates: { canonical: getPathname({ href: `/vendors/${vendor.slug}`, locale }) },
    // Consent gate (WEB_APP_PLAN §6): indexed only when the vendor agreed, never for demo listings.
    // Otherwise the layout's robots apply (previews and local builds are never indexed).
    ...(isIndexableProfile(vendor) ? {} : { robots: { index: false, follow: true } }),
  };
}

const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6';

export default async function VendorProfilePage({ params }: PageProps<'/[locale]/vendors/[slug]'>) {
  const t = await getTranslations('PublicProfile');
  return (
    <main id="main" className="flex flex-1 flex-col">
      <ViewTransition {...PAGE_TRANSITION}>
        <div className={`flex flex-col gap-8 pt-6 pb-20 md:pt-8 md:pb-28 ${container}`}>
          <Suspense fallback={<ProfileSkeleton label={t('loading')} />}>
            <Profile params={params} />
          </Suspense>
        </div>
      </ViewTransition>
    </main>
  );
}

async function Profile({ params }: Pick<PageProps<'/[locale]/vendors/[slug]'>, 'params'>) {
  const { slug } = await params;
  const [profile, t, tDir] = await Promise.all([getVendorProfile(slug), getTranslations('PublicProfile'), getTranslations('Directory')]);
  if (profile === null) notFound();
  if (profile === 'unavailable') {
    return (
      <Notice
        tone="warning"
        title={t('unavailableTitle')}
        action={
          <Link href="/#categories" transitionTypes={['nav-back']} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
            {tDir('back')}
          </Link>
        }
      >
        {t('unavailable')}
      </Notice>
    );
  }
  return <VendorProfile profile={profile} />;
}

function ProfileSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-8">
      <p className="sr-only">{label}</p>
      <Skeleton className="h-5 w-40 rounded-full" />
      <div className="flex flex-col">
        <Skeleton className="h-36 rounded-[1.75rem] sm:h-48 md:h-56" />
        <div className="flex items-end gap-6 px-6">
          <Skeleton className="-mt-12 size-24 rounded-[1.75rem] border-4 border-canvas sm:size-28" />
          <div className="flex flex-1 flex-col gap-3 pb-1">
            <Skeleton className="h-10 w-2/3 rounded-xl" />
            <Skeleton className="h-4 w-48 rounded-full" />
          </div>
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
