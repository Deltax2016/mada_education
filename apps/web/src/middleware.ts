import { NextResponse, type NextRequest } from "next/server";

/**
 * Request logging for the web container.
 *
 * A Next standalone server prints nothing per request, so a production
 * deployment looks silent even while it is serving traffic. This writes one line
 * per request to stdout, which is what Coolify collects.
 *
 * The request id is generated here and forwarded to the API, so a page render
 * and the API calls behind it share one id in the logs.
 */
export function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID().slice(0, 16);
  const started = Date.now();

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);

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
    }),
  );

  return response;
}

export const config = {
  // Static assets would drown the real traffic and gain nothing.
  matcher: ["/((?!_next/static|_next/image|favicon.svg|robots.txt).*)"],
};
