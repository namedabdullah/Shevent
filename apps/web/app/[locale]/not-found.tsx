import { getTranslations } from 'next-intl/server';
import { ArchWindow } from '@/components/ornaments';
import { buttonStyles } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('NotFound');
  return (
    <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 animate-enter flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:px-6">
      <ArchWindow className="aspect-[4/5] w-36" />
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="leading-relaxed text-sand-700">{t('body')}</p>
      </div>
      <Link href="/" className={buttonStyles({ size: 'lg' })}>
        {t('back')}
      </Link>
    </main>
  );
}
