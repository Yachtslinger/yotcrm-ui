// src/app/api/todos/note/route.ts
// GET  /api/todos/note         — fetch shared team scratchpad
// POST /api/todos/note         — save shared team scratchpad
// Body: { content: string }

import { NextRequest, NextResponse } from "next/server";
import { getSharedNote, setSharedNote } from "@/lib/todos/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const content = getSharedNote();
    return NextResponse.json({ ok: true, content });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { content } = await req.json();
    if (typeof content !== "string") {
      return NextResponse.json({ ok: false, error: "content must be string" }, { status: 400 });
    }
    setSharedNote(content);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
