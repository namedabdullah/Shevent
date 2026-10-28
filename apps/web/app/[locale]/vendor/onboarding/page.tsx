import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ArchWindow } from '@/components/ornaments';
import { Page, PageHeader } from '@/components/ui/page';
import { VendorProfileForm } from '@/components/vendor-profile-form';
import { getCurrentUser } from '@/lib/auth';
import { getOwnListing } from '@/lib/vendor';
import { createListing } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Vendor');
  return { title: t('onboardingTitle') };
}

// Any signed-in account can list a business here; accounts that already have a listing go to
// the dashboard.
export default async function VendorOnboardingPage() {
  const t = await getTranslations('Vendor');
  return (
    <Page>
      <div className="flex items-end justify-between gap-8">
        <PageHeader eyebrow={t('onboardingEyebrow')} title={t('onboardingTitle')} description={t('onboardingIntro')} />
        <ArchWindow className="hidden aspect-[4/5] w-28 shrink-0 md:block" />
      </div>
      <Suspense fallback={null}>
        <Onboarding />
      </Suspense>
    </Page>
  );
}

async function Onboarding() {
  const user = await getCurrentUser();
  if (user && (await getOwnListing(user.id))) redirect('/vendor');
  return <VendorProfileForm action={createListing} mode="create" />;
}
