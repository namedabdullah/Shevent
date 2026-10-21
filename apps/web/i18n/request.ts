import { hasLocale, type AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import en from '../messages/en.json';
import { routing } from './routing';

export default getRequestConfig(async ({ locale: explicitLocale }) => {
  // Server Actions and Route Handlers can't read root params, so there the locale must be passed
  // explicitly, e.g. getTranslations({ locale, namespace }).
  const requested = explicitLocale ?? (await rootLocale());
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  if (locale === 'en') return { locale, messages: en };

  // Anything not translated yet falls back to English.
  const translated = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages: mergeMessages(en, translated) };
});

function mergeMessages(base: AbstractIntlMessages, override: AbstractIntlMessages): AbstractIntlMessages {
  const merged: AbstractIntlMessages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key];
    merged[key] =
      typeof value === 'object' && typeof baseValue === 'object' ? mergeMessages(baseValue, value) : value;
  }
  return merged;
}
