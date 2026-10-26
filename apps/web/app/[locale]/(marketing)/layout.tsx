import { getTranslations } from 'next-intl/server';
import { Logo, LogoMark } from '@/components/logo';
import { Link } from '@/i18n/navigation';

// Public header and footer. The footer never repeats "Sign in", so the header link stays unique.
export default async function MarketingLayout({ children }: LayoutProps<'/[locale]'>) {
  const t = await getTranslations();
  return (
    <>
      <header className="border-b border-sand-200/70">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo name={t('Metadata.siteName')} />
          <Link
            href="/sign-in"
            className="inline-flex min-h-11 items-center rounded-full border border-brand-700 px-5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-700 hover:text-white"
          >
            {t('Nav.signIn')}
          </Link>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="bg-brand-900 text-brand-100">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <LogoMark className="size-9" />
            <div>
              <p className="font-display text-xl font-semibold text-white">{t('Metadata.siteName')}</p>
              <p className="text-sm">{t('Footer.note')}</p>
            </div>
          </div>
          <nav aria-label={t('Footer.label')}>
            <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <li>
                <Link href="/plan/new" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-white hover:underline">
                  {t('Footer.planEvent')}
                </Link>
              </li>
              <li>
                <Link href="/vendor/onboarding" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-white hover:underline">
                  {t('Footer.forVendors')}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </>
  );
}
