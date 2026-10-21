import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'ur'],
  defaultLocale: 'en',
  // English lives at /, Urdu at /ur/...
  localePrefix: 'as-needed',
  // Only the key marketing pages get Urdu, so never redirect by browser language.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

export const RTL_LOCALES: readonly Locale[] = ['ur'];
