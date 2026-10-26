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
const heading = Fraunces({
  variable: '--font-heading',
  subsets: ['latin'],
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

  return (
    <html lang={locale} className={`${heading.variable} ${body.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <AttributionCapture />
        {umamiWebsiteId && <Script src={umamiScriptUrl} data-website-id={umamiWebsiteId} strategy="afterInteractive" />}
      </body>
    </html>
  );
}
