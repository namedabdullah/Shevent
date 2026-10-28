'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Icon } from '@/components/icons';
import { buttonStyles } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

// Unexpected errors in any page under [locale] (expected ones, such as a model server that is down,
// are handled on the page itself). Next 16 passes `retry`, which re-fetches the failed segment.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('Error');

  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && 'digest' in error && typeof error.digest === 'string' ? error.digest : undefined;

  return (
    <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 animate-enter flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:px-6">
      <span className="flex size-16 items-center justify-center rounded-full bg-danger-soft text-danger ring-8 ring-danger-soft/60">
        <Icon name="alert" className="size-7" />
      </span>
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="leading-relaxed text-ink-soft">{t('body')}</p>
        {digest && <p className="text-xs text-muted">{t('reference', { digest })}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className={buttonStyles({ size: 'lg' })}>
          {t('retry')}
        </button>
        <Link href="/" className={buttonStyles({ variant: 'secondary', size: 'lg' })}>
          {t('home')}
        </Link>
      </div>
    </main>
  );
}
