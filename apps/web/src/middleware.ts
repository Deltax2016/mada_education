import { NextResponse, type NextRequest } from "next/server";

import { apiUrl } from "@/lib/api-url";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookie,
  clearedRefreshCookie,
  refreshCookie,
} from "@/lib/session-cookies";

type Refreshed = { accessToken: string; refreshToken: string; expiresIn: number };

/**
 * Renew the session before the page runs.
 *
 * The access token lasts fifteen minutes and nothing was renewing it, so a
 * signed in device was thrown back to the sign-in screen a quarter of an hour
 * later even though its refresh token was good for weeks. Middleware is the
 * only place that can both read the cookies and write new ones onto a plain
 * navigation, so the renewal happens here.
 */
async function renew(token: string): Promise<Refreshed | null> {
  try {
    const res = await fetch(apiUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: token }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.accessToken && data.refreshToken ? data : null;
  } catch {
    // The API being briefly unreachable must not sign anybody out.
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID().slice(0, 16);
  const started = Date.now();

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  // Sign-in and sign-out own the cookies; renewing underneath them would race.
  const ownsCookies = request.nextUrl.pathname.startsWith("/api/auth");
  const renewed = !access && refresh && !ownsCookies ? await renew(refresh) : null;

  if (renewed) {
    // Rewritten so this very render is already signed in, rather than the next
    // one. Without it the first page after a renewal still looks logged out.
    const jar = request.cookies
      .getAll()
      .filter((c) => c.name !== ACCESS_COOKIE)
      .map((c) => `${c.name}=${c.value}`);
    jar.push(`${ACCESS_COOKIE}=${renewed.accessToken}`);
    headers.set("cookie", jar.join("; "));
  }

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);

  if (renewed) {
    response.cookies.set(accessCookie(renewed.accessToken, renewed.expiresIn));
    response.cookies.set(refreshCookie(renewed.refreshToken));
  } else if (!access && refresh && !ownsCookies) {
    // The refresh token is spent or revoked. Dropping it stops every later
    // request paying for a renewal that cannot succeed.
    response.cookies.set(clearedRefreshCookie());
  }

  // The path is logged, the query string is not: sign-in codes and signed media
  // URLs travel in query strings.
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      logger: "request",
      msg: `${request.method} ${request.nextUrl.pathname}`,
      method: request.method,
      path: request.nextUrl.pathname,
      durationMs: Date.now() - started,
      requestId,
      ...(renewed ? { renewedSession: true } : {}),
    }),
  );

  return response;
}

export const config = {
  // Static assets would drown the real traffic and gain nothing.
  matcher: ["/((?!_next/static|_next/image|favicon.svg|robots.txt).*)"],
};
