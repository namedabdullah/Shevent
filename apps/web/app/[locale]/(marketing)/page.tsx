import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { WaitlistForm } from '@/components/waitlist-form';
import { getPathname } from '@/i18n/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { alternates: { canonical: getPathname({ href: '/', locale }) } };
}

export default async function HomePage() {
  const t = await getTranslations('Home');
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-6">
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-600">{t('eyebrow')}</p>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{t('title')}</h1>
      <p className="max-w-2xl text-lg text-zinc-700">{t('subtitle')}</p>
      <WaitlistForm />
    </main>
  );
}
