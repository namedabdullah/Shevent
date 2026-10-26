import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';
import { AccountMenu } from '@/components/account-menu';
import { Link } from '@/i18n/navigation';

/**
 * Layout for signed-in areas. The header renders in the static shell; everything that reads the
 * session (account menu, the `gate` and the page itself) streams in behind <Suspense>.
 */
export async function AppShell({
  gate: Gate,
  area = 'host',
  children,
}: {
  gate: (props: { children: ReactNode }) => Promise<ReactNode>;
  /** Which navigation to show: the host app or the vendor dashboard. */
  area?: 'host' | 'vendor';
  children: ReactNode;
}) {
  const t = await getTranslations();
  const links =
    area === 'vendor'
      ? [
          { href: '/vendor', label: t('Vendor.nav.dashboard') },
          { href: '/vendor/inquiries', label: t('Vendor.nav.inquiries') },
          { href: '/vendor/profile', label: t('Vendor.nav.listing') },
        ]
      : [
          { href: '/plans', label: t('App.plans') },
          { href: '/plan/new', label: t('App.newPlan') },
        ];
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-5 sm:px-6">
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            {t('Metadata.siteName')}
          </Link>
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm underline-offset-4 hover:underline">
              {link.label}
            </Link>
          ))}
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
