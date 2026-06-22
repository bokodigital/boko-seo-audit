import { NextResponse } from "next/server";
import { checkApp } from "@/lib/auth";
import { buildGaReport } from "@/lib/ga";
import { resolveRange } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  if (!checkApp(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (!body.propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });
  try {
    const range = resolveRange(body.start, body.end);
    const report = await buildGaReport(String(body.propertyId), range);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 502 });
  }
}
