import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { DM_Sans, Fraunces, Geist_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import Script from 'next/script';
import { AttributionCapture } from '@/components/attribution-capture';
import { routing } from '@/i18n/routing';
import { getSiteUrl, isIndexable } from '@/lib/site';
import '../globals.css';

// Fraunces (a soft serif) for headings, DM Sans for everything else: warm without hurting legibility.
// Fraunces' italic carries the editorial accents (the emphasis in the landing title, step numbers).
const heading = Fraunces({
  variable: '--font-heading',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['SOFT', 'opsz'],
});

const body = DM_Sans({
  variable: '--font-body',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Metadata');
  return {
    metadataBase: new URL(getSiteUrl()),
    title: { default: t('title'), template: `%s · ${t('siteName')}` },
    description: t('description'),
    applicationName: t('siteName'),
    openGraph: { type: 'website', siteName: t('siteName'), title: t('title'), description: t('description') },
    twitter: { card: 'summary_large_image' },
    robots: isIndexable() ? undefined : { index: false, follow: false },
  };
}

const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const umamiScriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL ?? 'https://cloud.umami.is/script.js';

export default async function RootLayout({ children }: LayoutProps<'/[locale]'>) {
  const locale = await rootLocale();
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations();

  return (
    // data-scroll-behavior: Next turns the CSS smooth scrolling off during route changes (Next 16).
    <html lang={locale} data-scroll-behavior="smooth" className={`${heading.variable} ${body.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-brand-700 px-5 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:start-4 focus:top-3"
        >
          {t('Common.skip')}
        </a>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <AttributionCapture />
        {umamiWebsiteId && <Script src={umamiScriptUrl} data-website-id={umamiWebsiteId} strategy="afterInteractive" />}
      </body>
    </html>
  );
}
