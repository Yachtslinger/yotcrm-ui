import { NextRequest, NextResponse } from "next/server";
import { getLeadSendHistory, migrateMatchSendLog } from "@/lib/matching/match-send-log";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const leadId = parseInt(req.nextUrl.searchParams.get("leadId") || "0");
  if (!leadId) return NextResponse.json({ history: [] });
  try {
    migrateMatchSendLog();
    const history = getLeadSendHistory(leadId);
    return NextResponse.json({ history });
  } catch {
    return NextResponse.json({ history: [] });
  }
}
