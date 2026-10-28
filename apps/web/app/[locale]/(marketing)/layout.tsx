import { getTranslations } from 'next-intl/server';
import { Logo, LogoMark, Wordmark } from '@/components/logo';
import { SectionLink, SectionNav, SmoothScroll } from '@/components/smooth-scroll';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { buttonStyles } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

const footerLink = 'inline-flex min-h-10 items-center text-ink-soft transition-colors hover:text-ink';

// Public header and footer. The footer never repeats "Sign in", so the header link stays unique.
// Section links glide to the landing page's sections, and also work from /sign-in.
export default async function MarketingLayout({ children }: LayoutProps<'/[locale]'>) {
  const t = await getTranslations();
  const sections = (['how', 'try', 'vendors', 'faq'] as const).map((hash) => ({
    hash,
    label: t(`Nav.${hash === 'try' ? 'planner' : hash}`),
  }));
  return (
    <>
      <SmoothScroll />
      <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo name={t('Metadata.siteName')} />
          <SectionNav label={t('Nav.label')} links={sections} />
          <div className="ms-auto flex items-center gap-1.5">
            <ThemeSwitcher />
            <Link href="/sign-in" className={buttonStyles({ variant: 'outline', size: 'sm' })}>
              {t('Nav.signIn')}
            </Link>
          </div>
        </div>
        {/* How far down the page you are. */}
        <div aria-hidden className="scroll-progress absolute inset-x-0 -bottom-px h-px bg-accent" />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="border-t border-line">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.6fr_1fr]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5 text-xl text-ink">
              <LogoMark className="size-7" />
              <Wordmark />
            </div>
            <p className="text-sm text-muted">{t('Footer.note')}</p>
            <p className="max-w-xs text-sm text-muted">{t('Footer.estimateNote')}</p>
          </div>
          <nav aria-label={t('Footer.label')} className="grid grid-cols-2 gap-6 text-sm">
            <div className="flex flex-col gap-1">
              <p className="mb-1 text-xs font-semibold tracking-[0.14em] text-muted uppercase">{t('Footer.planTitle')}</p>
              <ul>
                <li>
                  <SectionLink hash="try" className={footerLink}>
                    {t('Footer.planner')}
                  </SectionLink>
                </li>
                <li>
                  <SectionLink hash="how" className={footerLink}>
                    {t('Footer.how')}
                  </SectionLink>
                </li>
                <li>
                  <Link href="/plan/new" className={footerLink}>
                    {t('Footer.planEvent')}
                  </Link>
                </li>
              </ul>
            </div>
            <div className="flex flex-col gap-1">
              <p className="mb-1 text-xs font-semibold tracking-[0.14em] text-muted uppercase">{t('Footer.vendorsTitle')}</p>
              <ul>
                <li>
                  <Link href="/vendor/onboarding" className={footerLink}>
                    {t('Footer.listBusiness')}
                  </Link>
                </li>
                <li>
                  <SectionLink hash="vendors" className={footerLink}>
                    {t('Footer.forVendors')}
                  </SectionLink>
                </li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-5 text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
            <p>{t('Footer.preview')}</p>
            <p>{t('Footer.made')}</p>
          </div>
        </div>
      </footer>
    </>
  );
}
