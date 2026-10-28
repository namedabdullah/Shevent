import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Geist_Mono, Manrope } from 'next/font/google';
import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import Script from 'next/script';
import { AttributionCapture } from '@/components/attribution-capture';
import { routing } from '@/i18n/routing';
import { getSiteUrl, isIndexable } from '@/lib/site';
import { themeScript } from '@/lib/theme';
import '../globals.css';

// One minimal geometric family for everything (headings, body, the wordmark). Variable weight.
const sans = Manrope({
  variable: '--font-manrope',
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
    // suppressHydrationWarning: the inline theme script sets data-theme before React hydrates.
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning className={`${sans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-accent px-5 py-3 font-semibold text-on-accent focus:not-sr-only focus:fixed focus:start-4 focus:top-3"
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
