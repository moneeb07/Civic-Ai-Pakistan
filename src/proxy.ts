import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/*
 * Fast, optimistic routing only.
 *
 * This checks whether a session cookie is *present* — it does not and cannot
 * validate it. The real guard is `requireSession()` in `src/lib/session.ts`,
 * which every protected page calls and which verifies against the database.
 * This layer exists purely so citizens are not shown a page flash before that
 * check runs. (Next.js 16 renamed the `middleware` convention to `proxy`.)
 */

const PROTECTED_PREFIXES = ["/dashboard", "/home"];
const AUTH_PREFIXES = ["/auth/sign-in", "/auth/sign-up"];

/*
 * /register is deliberately absent from both lists. A citizen part-way through
 * registration has no session yet, so it cannot be protected; and the final
 * step (/register/complete) runs *after* a session exists, so treating it as an
 * auth page would bounce them off their own success screen.
 */

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(getSessionCookie(request));

  if (PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    if (!hasSessionCookie) {
      return NextResponse.redirect(new URL("/auth/sign-in", request.url));
    }
  }

  if (AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    if (hasSessionCookie) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/home/:path*", "/auth/sign-in", "/auth/sign-up"],
};
