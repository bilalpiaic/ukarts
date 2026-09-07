import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/session";

const PUBLIC_PAGES = ["/login"];
const PUBLIC_API = ["/api/auth/login", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (/\.(?:svg|png|jpe?g|gif|webp|ico|txt|woff2?)$/i.test(pathname)) {
    return NextResponse.next();
  }

  const isPublic =
    PUBLIC_PAGES.includes(pathname) ||
    PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;

  const embed =
    req.nextUrl.searchParams.get("embed") === "1" ||
    req.headers.get("sec-fetch-dest") === "iframe";
  const requestHeaders = new Headers(req.headers);
  if (embed) requestHeaders.set("x-ukarts-embed", "1");
  const passHeaders = { request: { headers: requestHeaders } };

  if (isPublic) {
    if (pathname === "/login" && session) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next(passHeaders);
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/workspace") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next(passHeaders);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|logo.svg|logo.png|brand/).*)"],
};
