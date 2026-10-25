/** Signed-in areas (WEB_APP_PLAN §4.2, §4.3). Public vendor profiles live under /vendors, not /vendor. */
export const PROTECTED_PATHS = ['/plan', '/plans', '/inquiries', '/bookings', '/assistant', '/vendor'] as const;

export const DEFAULT_AFTER_SIGN_IN = '/plans';

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Only same-site relative paths are allowed after sign-in, so the link can't send people elsewhere. */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  return value;
}
