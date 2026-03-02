import { NextResponse } from "next/server";
import { listBatches } from "@/lib/matches/storage";

export async function GET() {
  try {
    const batches = listBatches();
    return NextResponse.json(batches);
  } catch (err: any) {
    console.error("[matches/batches] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
