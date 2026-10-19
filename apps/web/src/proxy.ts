import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlProxy = createMiddleware(routing);

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/ar';
    return NextResponse.redirect(url);
  }
  return intlProxy(request);
}

export const config = {
  // Match all pathnames except for API routes, Next internals, Vercel internals,
  // and static files such as favicons or images.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
