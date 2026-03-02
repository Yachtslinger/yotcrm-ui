import { NextRequest, NextResponse } from "next/server";
import { enrichLead } from "@/lib/intel/orchestrator";

export const runtime = "nodejs";

/**
 * POST /api/emails — accepts raw .eml content, parses inline, stores lead.
 * Body: { eml: "<raw eml string>" } or raw text/plain body
 */
export async function POST(req: NextRequest) {
  try {
    // Simple API key check for unauthenticated endpoint
    const API_KEY = process.env.EMAIL_API_KEY || "yotcrm-email-intake-2026";
    const authHeader = req.headers.get("x-api-key") || "";
    const urlKey = req.nextUrl.searchParams.get("key") || "";
    if (authHeader !== API_KEY && urlKey !== API_KEY) {
      return NextResponse.json({ ok: false, error: "Invalid API key" }, { status: 403 });
    }

    let emlContent: string;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      emlContent = body.eml || body.content || "";
    } else {
      emlContent = await req.text();
    }

    if (!emlContent || emlContent.length < 50) {
      return NextResponse.json(
        { ok: false, error: "Missing or empty .eml content" },
        { status: 400 }
      );
    }

    // Import the parser (CommonJS module)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const parser = require("../../../../scripts/parseEmails");
    const result = parser.processOneEmail(emlContent);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, emailType: result.emailType },
        { status: 422 }
      );
    }

    // Fire-and-forget: auto-enrich new leads via Lighthouse
    if (result.result.isNew && result.result.leadId) {
      enrichLead(result.result.leadId).catch(err =>
        console.error("[Lighthouse] Auto-enrich failed for email lead", result.result.leadId, err)
      );
    }

    return NextResponse.json({
      ok: true,
      emailType: result.emailType,
      lead: result.lead,
      isNew: result.result.isNew,
      boatAdded: result.result.boatAdded,
      leadId: result.result.leadId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/emails] Error:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
