import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api";

export async function POST(request: Request) {
  const body = await request.json();
  const locale = new URL(request.url).searchParams.get("locale") ?? "ar";
  const res = await fetch(`${API_URL}/api/v1/auth/email/code?locale=${locale}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
