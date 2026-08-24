import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { getAccessToken } from "@/lib/session";

/**
 * Client components call this instead of the API directly, so the access token
 * stays in an HttpOnly cookie rather than in JavaScript.
 */
async function forward(request: Request, path: string[]) {
  const token = await getAccessToken();
  const incoming = new URL(request.url);
  const target = new URL(`/api/v1/${path.join("/")}`, API_URL);
  incoming.searchParams.forEach((value, key) => target.searchParams.set(key, value));

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  const res = await fetch(target, {
    method: request.method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(request.headers.get("accept-language")
        ? { "Accept-Language": request.headers.get("accept-language") as string }
        : {}),
    },
    body,
    cache: "no-store",
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await ctx.params).path);
}
export async function POST(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await ctx.params).path);
}
export async function PUT(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await ctx.params).path);
}
