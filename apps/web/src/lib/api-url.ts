export const API_URL = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8010";

/**
 * Build an API URL.
 *
 * Always through `new URL`, never string concatenation. The two auth routes
 * used to concatenate, so an API_INTERNAL_URL carrying a path or a trailing
 * slash produced a doubled path and a 404 on sign-in while every other call
 * kept working, which is a miserable thing to debug.
 */
export function apiUrl(path: string, params: Record<string, string> = {}): URL {
  const url = new URL(`/api/v1${path}`, API_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}
