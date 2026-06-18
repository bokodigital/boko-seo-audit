import { NextResponse } from "next/server";
import { checkApp } from "@/lib/auth";
import { googleConfigured } from "@/lib/google";
import { listProperties } from "@/lib/ga";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  if (!checkApp(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!googleConfigured()) return NextResponse.json({ configured: false, properties: [] });
  try {
    const properties = await listProperties();
    return NextResponse.json({ configured: true, properties });
  } catch (e) {
    return NextResponse.json({ configured: true, error: e.message || String(e) }, { status: 502 });
  }
}
