import { NextResponse } from "next/server";
import { checkApp } from "@/lib/auth";
import { auditUrls } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  if (!checkApp(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  try {
    const pages = await auditUrls(body.urls || []);
    return NextResponse.json({ pages });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 400 });
  }
}
