import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { updateSession } from './lib/supabase/proxy';

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  return updateSession(request, handleI18nRouting(request));
}

export const config = {
  // Everything except API routes (including the auth callback), Next.js internals and files with
  // an extension (robots.txt, sitemap.xml, favicon.ico…).
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
