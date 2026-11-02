import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { canonicalRedirect } from "./lib/canonical-redirect";

const intlProxy = createMiddleware(routing);

export function proxy(request: NextRequest) {
  const publicUrl = new URL(request.url);
  const host = request.headers.get("host");
  if (host) {
    // Replacing URL.host alone retains an internal port when Host has none.
    publicUrl.port = "";
    publicUrl.host = host;
  }
  const legacyHosts =
    process.env.LEGACY_WEB_HOSTS ?? "portal.169-58-108-189.sslip.io";
  const canonical = canonicalRedirect(
    publicUrl.toString(),
    process.env.CANONICAL_WEB_ORIGIN ??
      (process.env.NODE_ENV === "production" ? "https://bhi47.app" : undefined),
    legacyHosts,
  );
  if (canonical) return NextResponse.redirect(canonical, 308);
  if (request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/ar";
    return NextResponse.redirect(url);
  }
  return intlProxy(request);
}

export const config = {
  // Match all pathnames except for API routes, Next internals, Vercel internals,
  // and static files such as favicons or images.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
