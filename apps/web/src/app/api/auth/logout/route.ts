import { NextResponse } from "next/server";
import { ACCESS_COOKIE, clearedRefreshCookie } from "@/lib/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: ACCESS_COOKIE, value: "", path: "/", maxAge: 0 });
  response.cookies.set(clearedRefreshCookie());
  return response;
}
