import { cookies } from "next/headers";

export const ACCESS_COOKIE = "mada_at";
export const REFRESH_COOKIE = "mada_rt";

const secure = process.env.NODE_ENV === "production";

export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value ?? null;
}

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
 * The refresh token is scoped to the auth path so it is not attached to every
 * request the browser makes.
 */
export function refreshCookie(token: string) {
  return {
    name: REFRESH_COOKIE,
    value: token,
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge: 60 * 60 * 24 * 30,
  };
}
