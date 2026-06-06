import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { createSource, listSources } from "@/lib/market-analysis/governance/sources";

export const runtime = "nodejs";

const notFound = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

export async function GET(req: NextRequest) {
  if (!isGovernanceEnabled()) return notFound();
  const kind = req.nextUrl.searchParams.get("kind") || undefined;
  return NextResponse.json({ ok: true, sources: listSources({ kind }) });
}

export async function POST(req: NextRequest) {
  if (!isGovernanceEnabled()) return notFound();
  try {
    const body = await req.json();
    const source = createSource({
      kind: body?.kind,
      label: body?.label,
      content_text: body?.content_text,
      createdBy: body?.createdBy,
    });
    return NextResponse.json({ ok: true, source });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
