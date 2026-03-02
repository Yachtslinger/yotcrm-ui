import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "yotcrm_session";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/api/sync", "/api/clients/recent", "/api/emails"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.match(/^\/api\/clients\/\d+\/vcard$/) ||
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
