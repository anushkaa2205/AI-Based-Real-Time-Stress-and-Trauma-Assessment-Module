/**
 * Proxy (Next.js 16's name for middleware). For staff pages only:
 *  - keeps the 15-minute sliding session alive on each request (NFR-SEC-03)
 *  - sends signed-out visitors to /login (an optimistic check only: real
 *    authorisation happens on the server in every page and route handler).
 */
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!req.auth && !req.nextUrl.pathname.startsWith("/api/")) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/staff/:path*",
    "/operator/:path*",
    "/counsellor/:path*",
    "/district/:path*",
    "/police/:path*",
    "/welfare/:path*",
    "/analytics/:path*",
    "/admin/:path*",
    "/api/v1/staff/((?!auth/).*)",
  ],
};
