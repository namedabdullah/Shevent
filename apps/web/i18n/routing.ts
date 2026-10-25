import { defineRouting } from 'next-intl/routing';

// English only. Page text lives in messages/en.json so another language can be added later by
// adding it here and a matching messages file.
export const routing = defineRouting({
  locales: ['en'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
