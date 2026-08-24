import { headers } from "next/headers";

import { getAccessToken } from "./session";
import type { Locale } from "./i18n";

export const API_URL =
  process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8010";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public meta: Record<string, unknown> | null = null,
  ) {
    super(code);
  }
}

type Options = {
  locale?: Locale;
  method?: string;
  body?: unknown;
  token?: string | null;
  cache?: RequestCache;
  revalidate?: number;
};

/**
 * Server-side call into the API. The browser never talks to FastAPI directly:
 * the access token stays in an HttpOnly cookie and is attached here.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { locale, method = "GET", body, cache, revalidate } = options;
  const token = options.token !== undefined ? options.token : await getAccessToken();

  const url = new URL(`/api/v1${path}`, API_URL);
  if (locale && !url.searchParams.has("locale")) {
    url.searchParams.set("locale", locale);
  }

  // Carried through so one browser action reads as one chain across both
  // services rather than two unrelated log lines.
  const requestId = await headers()
    .then((h) => h.get("x-request-id"))
    .catch(() => null);

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(locale ? { "Accept-Language": locale } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(requestId ? { "X-Request-Id": requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: cache ?? (revalidate !== undefined ? undefined : "no-store"),
    ...(revalidate !== undefined ? { next: { revalidate } } : {}),
  });

  if (!res.ok) {
    let payload: Record<string, unknown> = {};
    try {
      payload = await res.json();
    } catch {
      /* non JSON error body */
    }
    throw new ApiError(
      (payload.code as string) ?? "request.failed",
      res.status,
      (payload.meta as Record<string, unknown>) ?? null,
    );
  }

  return res.json() as Promise<T>;
}
