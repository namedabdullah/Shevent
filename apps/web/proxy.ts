import { categoryFromSlug } from '@shevent/core/enums';
import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { updateSession } from './lib/supabase/proxy';

const handleI18nRouting = createMiddleware(routing);

// /lahore/[category] directory pages. An unknown category goes to the catch-all not-found page here:
// with Partial Prefetching, the route's shared shell would otherwise answer the first request with a
// 200 before the page's notFound() runs.
const DIRECTORY = /^\/(?:([a-z]{2})\/)?lahore\/([^/]+)\/?$/;

export default async function proxy(request: NextRequest) {
  const directory = request.nextUrl.pathname.match(DIRECTORY);
  if (directory && !categoryFromSlug(directory[2]!)) {
    return NextResponse.rewrite(new URL(`/${directory[1] ?? routing.defaultLocale}/not-found${request.nextUrl.pathname}`, request.url));
  }
  return updateSession(request, handleI18nRouting(request));
}

export const config = {
  // Everything except API routes (including the auth callback), Next.js internals and files with
  // an extension (robots.txt, sitemap.xml, favicon.ico…).
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
