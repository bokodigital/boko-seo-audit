import { NextResponse } from "next/server";
import { checkApp } from "@/lib/auth";
import { llmReadiness } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  if (!checkApp(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (!body.url) return NextResponse.json({ error: "url required" }, { status: 400 });
  try {
    const data = await llmReadiness(body.url);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 400 });
  }
}
