import { routing } from '@/i18n/routing';

/** Signed-in areas (WEB_APP_PLAN §4.2, §4.3). Public vendor profiles live under /vendors, not /vendor. */
export const PROTECTED_PATHS = ['/plan', '/plans', '/inquiries', '/bookings', '/assistant', '/vendor'] as const;

export const DEFAULT_AFTER_SIGN_IN = '/plans';

const nonDefaultLocales = routing.locales.filter((locale) => locale !== routing.defaultLocale);

/** Splits "/ur/plans/1" into { prefix: "/ur", path: "/plans/1" }. */
export function splitLocale(pathname: string): { prefix: string; path: string } {
  for (const locale of nonDefaultLocales) {
    if (pathname === `/${locale}`) return { prefix: `/${locale}`, path: '/' };
    if (pathname.startsWith(`/${locale}/`)) return { prefix: `/${locale}`, path: pathname.slice(locale.length + 1) };
  }
  return { prefix: '', path: pathname };
}

export function isProtectedPath(pathname: string): boolean {
  const { path } = splitLocale(pathname);
  return PROTECTED_PATHS.some((protectedPath) => path === protectedPath || path.startsWith(`${protectedPath}/`));
}

/** Only same-site relative paths are allowed after sign-in, so the link can't send people elsewhere. */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  return value;
}
