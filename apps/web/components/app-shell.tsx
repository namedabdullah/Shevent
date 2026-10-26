import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';
import { AccountMenu } from '@/components/account-menu';
import { Logo } from '@/components/logo';
import { NavLinkList, NavLinks, type NavLink } from '@/components/nav-links';

/**
 * Layout for signed-in areas. The header renders in the static shell; everything that reads the
 * session (account menu, the `gate` and the page itself) or the URL streams in behind <Suspense>.
 * On phones the area's links move to a row of tabs under the logo, so they are never hidden in a menu.
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
  const links: NavLink[] =
    area === 'vendor'
      ? [
          { href: '/vendor', label: t('Vendor.nav.dashboard'), icon: 'dashboard', exact: true },
          { href: '/vendor/inquiries', label: t('Vendor.nav.inquiries'), icon: 'inbox' },
          { href: '/vendor/profile', label: t('Vendor.nav.listing'), icon: 'store' },
        ]
      : [
          { href: '/plans', label: t('App.plans'), icon: 'plans', also: ['/inquiries', '/bookings'] },
          { href: '/plan/new', label: t('App.newPlan'), icon: 'plus' },
          { href: '/assistant', label: t('App.assistant'), icon: 'sparkles' },
        ];
  const navLabel = area === 'vendor' ? t('Vendor.nav.label') : t('App.navLabel');
  const nav = (variant: 'bar' | 'tabs') => (
    <Suspense fallback={<NavLinkList links={links} variant={variant} label={navLabel} />}>
      <NavLinks links={links} variant={variant} label={navLabel} />
    </Suspense>
  );
  return (
    <>
      <header className="z-30 border-b border-sand-200 bg-cream/95 backdrop-blur md:sticky md:top-0">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Logo name={t('Metadata.siteName')} />
          {area === 'vendor' && (
            <span className="rounded-full bg-gold-50 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-gold-700 uppercase">{t('Vendor.nav.badge')}</span>
          )}
          <div className="ms-6 hidden md:block">{nav('bar')}</div>
          <div className="ms-auto">
            <Suspense fallback={null}>
              <AccountMenu area={area} />
            </Suspense>
          </div>
        </div>
        {nav('tabs')}
      </header>
      <Suspense fallback={<p className="mx-auto w-full max-w-5xl px-4 py-8 text-sand-600 sm:px-6">{t('App.loading')}</p>}>
        <Gate>{children}</Gate>
      </Suspense>
    </>
  );
}
