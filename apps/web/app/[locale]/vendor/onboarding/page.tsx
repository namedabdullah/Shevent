import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('onboardingTitle')}</h1>
        <p className="max-w-xl text-zinc-700">{t('onboardingIntro')}</p>
      </header>
      <Suspense fallback={null}>
        <Onboarding />
      </Suspense>
    </main>
  );
}

async function Onboarding() {
  const user = await getCurrentUser();
  if (user && (await getOwnListing(user.id))) redirect('/vendor');
  return <VendorProfileForm action={createListing} mode="create" />;
}
