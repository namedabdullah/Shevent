import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';
import { AccountMenu } from '@/components/account-menu';
import { Link } from '@/i18n/navigation';

/**
 * Layout for signed-in areas. The header renders in the static shell; everything that reads the
 * session (account menu, the `gate` and the page itself) streams in behind <Suspense>.
 */
export async function AppShell({ gate: Gate, children }: { gate: (props: { children: ReactNode }) => Promise<ReactNode>; children: ReactNode }) {
  const t = await getTranslations();
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <nav className="flex items-center gap-5">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            {t('Metadata.siteName')}
          </Link>
          <Link href="/plans" className="text-sm underline-offset-4 hover:underline">
            {t('App.plans')}
          </Link>
        </nav>
        <Suspense fallback={null}>
          <AccountMenu />
        </Suspense>
      </header>
      <Suspense fallback={<p className="mx-auto w-full max-w-5xl px-4 py-8 text-zinc-600 sm:px-6">{t('App.loading')}</p>}>
        <Gate>{children}</Gate>
      </Suspense>
    </>
  );
}
