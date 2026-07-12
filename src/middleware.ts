import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "yotcrm_session";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/api/sync", "/api/clients/recent", "/api/emails", "/api/cards/leads", "/api/cards/views", "/card", "/api/matches/ingest", "/api/public", "/home", "/listing", "/api/listings/files", "/api/listings/debug", "/api/brochures", "/email/", "/bookmarklet", "/api/brochures/ingest", "/api/comms/ingest", "/api/comms/untracked", "/api/comms/cleanup", "/api/comms/heartbeat", "/api/comms/watchdog", "/api/campaign/unsubscribe", "/api/campaign/quick"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return true;
  // Individual brochure pages (/brochures/[slug]) are public; /brochures index requires auth
  if (pathname.match(/^\/brochures\/[^/]+$/)) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.match(/^\/brochures\/[^/]+$/) ||   // individual brochure pages are public
    pathname.match(/^\/api\/clients\/\d+\/vcard$/) ||
    pathname.match(/^\/api\/cards\/[^/]+/) ||  // all /api/cards/* routes are public
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname === "/favicon.ico" ||
    pathname === "/reset.html"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token && token.length > 10) {
    // Token validation is done server-side in the login route
    // Middleware just checks for presence + basic format
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
