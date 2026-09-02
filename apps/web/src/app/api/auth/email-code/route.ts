import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";

export async function POST(request: Request) {
  const body = await request.json();
  const locale = new URL(request.url).searchParams.get("locale") ?? "ar";
  const res = await fetch(apiUrl("/auth/email/code", { locale }), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
