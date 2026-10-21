import { getTranslations } from 'next-intl/server';

// Placeholder: the data lead builds the dashboard (profile, portfolio, inbox, quotes) here.
export default async function VendorDashboardPage() {
  const t = await getTranslations('Vendor');
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('dashboardTitle')}</h1>
      <p className="text-zinc-700">{t('dashboardIntro')}</p>
    </main>
  );
}
