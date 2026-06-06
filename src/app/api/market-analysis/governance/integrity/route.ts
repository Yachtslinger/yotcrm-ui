import { NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { runGovernanceIntegrityCheck } from "@/lib/market-analysis/governance/integrity";
import { GOVERNANCE_SCHEMA_VERSION } from "@/lib/market-analysis/governance/types";

export const runtime = "nodejs";

export async function GET() {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const issues = runGovernanceIntegrityCheck();
  return NextResponse.json({ ok: true, schemaVersion: GOVERNANCE_SCHEMA_VERSION, issues });
}
