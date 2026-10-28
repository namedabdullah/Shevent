import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Page, PageHeader } from '@/components/ui/page';
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
    <Page>
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
      <Suspense fallback={null}>
        <ListingForm />
      </Suspense>
    </Page>
  );
}

async function ListingForm() {
  const { vendor } = await requireListing();
  return <VendorProfileForm action={updateListing} mode="edit" defaults={vendor} />;
}
