import { NextResponse } from "next/server";
import { checkApp } from "@/lib/auth";
import { googleConfigured } from "@/lib/google";
import { topKeywords } from "@/lib/gsc";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  if (!checkApp(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!googleConfigured()) return NextResponse.json({ error: "Google service account not configured." }, { status: 400 });
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (!body.siteUrl) return NextResponse.json({ error: "siteUrl required" }, { status: 400 });
  try {
    const data = await topKeywords(body.siteUrl, 30);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 502 });
  }
}
