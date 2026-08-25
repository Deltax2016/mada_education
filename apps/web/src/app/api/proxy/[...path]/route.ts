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

  // Read as bytes, not text. File uploads pass through here and text() would
  // mangle every one of them.
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  const contentType = request.headers.get("content-type") ?? "application/json";

  const res = await fetch(target, {
    method: request.method,
    headers: {
      "Content-Type": contentType,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(request.headers.get("accept-language")
        ? { "Accept-Language": request.headers.get("accept-language") as string }
        : {}),
      ...(request.headers.get("x-request-id")
        ? { "X-Request-Id": request.headers.get("x-request-id") as string }
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
export async function PATCH(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await ctx.params).path);
}
export async function DELETE(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await ctx.params).path);
}
