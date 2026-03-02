import { NextResponse } from "next/server";
import { getAllMarinas, createMarina, updateMarina, deleteMarina } from "@/lib/marinas/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const marinas = getAllMarinas();
    return NextResponse.json({ ok: true, marinas });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const marina = createMarina(body);
      return NextResponse.json({ ok: true, marina });
    }
    if (action === "update") {
      const marina = updateMarina(body.id, body);
      if (!marina) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, marina });
    }
    if (action === "delete") {
      const ok = deleteMarina(body.id);
      return NextResponse.json({ ok });
    }
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
