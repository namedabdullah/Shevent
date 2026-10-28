import { getTranslations } from 'next-intl/server';
import { Logo, LogoMark } from '@/components/logo';
import { BeadEdge } from '@/components/ornaments';
import { buttonStyles } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

const SECTION_LINKS = [
  { hash: 'how', key: 'how' },
  { hash: 'try', key: 'planner' },
  { hash: 'vendors', key: 'vendors' },
  { hash: 'faq', key: 'faq' },
] as const;

const footerLink = 'inline-flex min-h-11 items-center text-brand-100 underline-offset-4 transition-colors hover:text-white hover:underline';

// Public header and footer. The footer never repeats "Sign in", so the header link stays unique.
// The section links point at the landing page, so they also work from /sign-in.
export default async function MarketingLayout({ children }: LayoutProps<'/[locale]'>) {
  const t = await getTranslations();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-sand-200/70 bg-cream/95 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo name={t('Metadata.siteName')} />
          <nav aria-label={t('Nav.label')} className="hidden md:block">
            <ul className="flex items-center gap-1">
              {SECTION_LINKS.map((link) => (
                <li key={link.hash}>
                  <Link
                    href={{ pathname: '/', hash: link.hash }}
                    className="inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium text-sand-700 transition-colors hover:bg-sand-100 hover:text-sand-900"
                  >
                    {t(`Nav.${link.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Link href="/sign-in" className={buttonStyles({ variant: 'outline', size: 'sm', className: 'ms-auto' })}>
            {t('Nav.signIn')}
          </Link>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="relative bg-brand-950 text-brand-100">
        <BeadEdge className="absolute inset-x-0 -top-1.5" />
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-14 pb-10 sm:px-6 md:grid-cols-[1.5fr_1fr]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <LogoMark className="size-10" />
              <p className="font-display text-2xl font-semibold text-white">{t('Metadata.siteName')}</p>
            </div>
            <p className="text-sm">{t('Footer.note')}</p>
            <p className="max-w-sm text-sm leading-relaxed text-brand-100/80">{t('Footer.estimateNote')}</p>
          </div>
          <nav aria-label={t('Footer.label')} className="grid grid-cols-2 gap-6 text-sm">
            <div className="flex flex-col gap-1">
              <p className="mb-1 text-xs font-semibold tracking-[0.18em] text-gold-200 uppercase">{t('Footer.planTitle')}</p>
              <ul>
                <li>
                  <Link href={{ pathname: '/', hash: 'try' }} className={footerLink}>
                    {t('Footer.planner')}
                  </Link>
                </li>
                <li>
                  <Link href={{ pathname: '/', hash: 'how' }} className={footerLink}>
                    {t('Footer.how')}
                  </Link>
                </li>
                <li>
                  <Link href="/plan/new" className={footerLink}>
                    {t('Footer.planEvent')}
                  </Link>
                </li>
              </ul>
            </div>
            <div className="flex flex-col gap-1">
              <p className="mb-1 text-xs font-semibold tracking-[0.18em] text-gold-200 uppercase">{t('Footer.vendorsTitle')}</p>
              <ul>
                <li>
                  <Link href="/vendor/onboarding" className={footerLink}>
                    {t('Footer.listBusiness')}
                  </Link>
                </li>
                <li>
                  <Link href={{ pathname: '/', hash: 'vendors' }} className={footerLink}>
                    {t('Footer.forVendors')}
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-5 text-xs text-brand-100/80 sm:flex-row sm:justify-between sm:px-6">
            <p>{t('Footer.preview')}</p>
            <p>{t('Footer.made')}</p>
          </div>
        </div>
      </footer>
    </>
  );
}
