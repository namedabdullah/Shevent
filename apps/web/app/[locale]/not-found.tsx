import { getTranslations } from 'next-intl/server';
import { buttonStyles } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('NotFound');
  return (
    <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 animate-enter flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:px-6">
      <p aria-hidden className="font-display text-[7rem] leading-none font-semibold tracking-[-0.06em] text-muted">404</p>
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="leading-relaxed text-ink-soft">{t('body')}</p>
      </div>
      <Link href="/" className={buttonStyles({ size: 'lg' })}>
        {t('back')}
      </Link>
    </main>
  );
}
