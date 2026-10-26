import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { VendorProfileForm } from '@/components/vendor-profile-form';
import { requireListing } from '@/lib/vendor';
import { updateListing } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('VendorProfile');
  return { title: t('title') };
}

export default async function VendorProfilePage() {
  const t = await getTranslations('VendorProfile');
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-xl text-zinc-700">{t('intro')}</p>
      </header>
      <Suspense fallback={null}>
        <ListingForm />
      </Suspense>
    </main>
  );
}

async function ListingForm() {
  const { vendor } = await requireListing();
  return <VendorProfileForm action={updateListing} mode="edit" defaults={vendor} />;
}
