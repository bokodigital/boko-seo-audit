import { NextResponse } from "next/server";
import { checkApp, appConfigured } from "@/lib/auth";
import { runAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  // lightweight: tells the UI whether a password is required
  if (!checkApp(request)) return NextResponse.json({ authed: false, passwordRequired: true }, { status: 401 });
  return NextResponse.json({ authed: true, passwordRequired: appConfigured() });
}

export async function POST(request) {
  if (!checkApp(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  try {
    const report = await runAudit(body.url);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 400 });
  }
}
