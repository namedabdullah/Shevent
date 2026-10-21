import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

// Placeholder shell for the public pages; the data lead replaces it with the real header/footer.
export default async function MarketingLayout({ children }: LayoutProps<'/[locale]'>) {
  const t = await getTranslations();
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {t('Metadata.siteName')}
        </Link>
        <Link href="/sign-in" className="text-sm underline-offset-4 hover:underline">
          {t('Nav.signIn')}
        </Link>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="mx-auto w-full max-w-5xl px-4 py-8 text-sm text-zinc-600 sm:px-6">{t('Footer.note')}</footer>
    </>
  );
}
