import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { accessCookie, refreshCookie } from "@/lib/session";

/**
 * The only place tokens touch a cookie. The browser never sees a bearer token:
 * it gets HttpOnly cookies and every later call is signed on the server.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const locale = new URL(request.url).searchParams.get("locale") ?? "ar";
  const res = await fetch(`${API_URL}/api/v1/auth/email/verify?locale=${locale}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  const response = NextResponse.json({ ok: true, user: data.user, isNewUser: data.isNewUser });
  response.cookies.set(accessCookie(data.accessToken, data.expiresIn));
  response.cookies.set(refreshCookie(data.refreshToken));
  return response;
}
