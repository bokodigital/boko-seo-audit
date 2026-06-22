import { NextResponse } from "next/server";
import { checkApp } from "@/lib/auth";
import { ahrefsConfigured, domainRating } from "@/lib/ahrefs";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request) {
  if (!checkApp(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ahrefsConfigured()) return NextResponse.json({ configured: false });
  const target = new URL(request.url).searchParams.get("target");
  if (!target) return NextResponse.json({ error: "target required" }, { status: 400 });
  try {
    const data = await domainRating(target);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ configured: true, error: e.message || String(e) }, { status: 502 });
  }
}
