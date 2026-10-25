import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import en from '../messages/en.json';
import { routing } from './routing';

export default getRequestConfig(async ({ locale: explicitLocale }) => {
  // Server Actions and Route Handlers can't read root params, so there the locale must be passed
  // explicitly, e.g. getTranslations({ locale, namespace }).
  const requested = explicitLocale ?? (await rootLocale());
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: en };
});
