import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { becomeVendor } from './actions';

// Placeholder: the data lead adds the business-details form; it should call becomeVendor first,
// then insert the vendors row.
export default async function VendorOnboardingPage({ searchParams }: PageProps<'/[locale]/vendor/onboarding'>) {
  const t = await getTranslations('Vendor');
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('onboardingTitle')}</h1>
      <p className="max-w-xl text-zinc-700">{t('onboardingIntro')}</p>
      <Suspense fallback={null}>
        <Onboarding searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Onboarding({ searchParams }: Pick<PageProps<'/[locale]/vendor/onboarding'>, 'searchParams'>) {
  const [t, user, params] = await Promise.all([getTranslations('Vendor'), getCurrentUser(), searchParams]);
  if (user?.role === 'vendor' || user?.role === 'admin') redirect('/vendor');
  return (
    <form action={becomeVendor} className="flex flex-col items-start gap-2">
      <button type="submit" className="min-h-11 rounded-lg bg-zinc-900 px-5 font-medium text-white hover:bg-zinc-700">
        {t('becomeVendor')}
      </button>
      {params.error && <p className="text-sm text-red-700">{t('error')}</p>}
    </form>
  );
}
