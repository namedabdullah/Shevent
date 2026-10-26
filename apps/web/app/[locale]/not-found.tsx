import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('NotFound');
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <Link href="/" className="inline-flex min-h-11 items-center self-start rounded-full bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800">
        {t('back')}
      </Link>
    </main>
  );
}
