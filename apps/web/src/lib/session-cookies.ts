/**
 * Cookie shapes, kept free of `next/headers` so middleware can use them too.
 *
 * Tokens live in HttpOnly cookies rather than localStorage: script on the page
 * cannot read them, and the browser attaches them to server rendering without
 * the app having to think about it.
 */
export const ACCESS_COOKIE = "mada_at";
export const REFRESH_COOKIE = "mada_rt";

const secure = process.env.NODE_ENV === "production";

export function accessCookie(token: string, maxAge: number) {
  return {
    name: ACCESS_COOKIE,
    value: token,
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/**
 * Site wide path, because the refresh happens in middleware on ordinary page
 * requests. Scoped to /api/auth it was never sent with a navigation, so nothing
 * could renew a session and every visit after fifteen minutes landed on the
 * sign-in screen.
 */
export function refreshCookie(token: string, maxAge = 60 * 60 * 24 * 90) {
  return {
    name: REFRESH_COOKIE,
    value: token,
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function clearedRefreshCookie() {
  return { ...refreshCookie(""), maxAge: 0 };
}
