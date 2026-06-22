import { NextResponse } from "next/server";
import { checkApp } from "@/lib/auth";
import { googleConfigured } from "@/lib/google";
import { gscReport, listSites } from "@/lib/gsc";
import { resolveRange } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  if (!checkApp(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!googleConfigured()) return NextResponse.json({ configured: false, sites: [] });
  try {
    const sites = await listSites();
    return NextResponse.json({ configured: true, sites });
  } catch (e) {
    return NextResponse.json({ configured: true, sites: [], error: e.message || String(e) }, { status: 502 });
  }
}

export async function POST(request) {
  if (!checkApp(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!googleConfigured()) return NextResponse.json({ error: "Google service account not configured." }, { status: 400 });
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (!body.siteUrl) return NextResponse.json({ error: "siteUrl required" }, { status: 400 });
  try {
    const range = resolveRange(body.start, body.end);
    const data = await gscReport(body.siteUrl, range);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 502 });
  }
}
