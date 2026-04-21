import { NextResponse } from "next/server";
import {
  getSentEmailByMessageId,
  createSentEmail,
  findLeadByEmail,
  createIngestFailure,
} from "@/lib/emails/storage";

export const runtime = "nodejs";

// Secret used by the local agent — must match INGEST_SECRET env var
function checkAuth(req: Request): boolean {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return true; // not configured → allow (local dev)
  const auth = req.headers.get("x-ingest-secret") || "";
  return auth === secret;
}

/**
 * POST /api/emails/ingest
 *
 * Called by the local email-watcher agent.
 * Body: {
 *   message_id: string,       // RFC 2822 Message-ID
 *   subject: string,
 *   body_plain: string,
 *   to_addresses: string[],   // primary recipient email addresses
 *   cc_addresses?: string[],
 *   from_address: string,
 *   sent_at: string,          // ISO 8601
 * }
 */
export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const { message_id, subject, body_plain, to_addresses, cc_addresses, from_address, sent_at } = payload;

  if (!message_id || !sent_at) {
    return NextResponse.json({ ok: false, error: "message_id and sent_at required" }, { status: 400 });
  }

  // Deduplicate — if already ingested, return the existing record
  const existing = getSentEmailByMessageId(message_id);
  if (existing) {
    return NextResponse.json({ ok: true, status: "duplicate", emailId: existing.id });
  }

  const toList: string[] = Array.isArray(to_addresses) ? to_addresses : [to_addresses].filter(Boolean);
  const ccList: string[] = Array.isArray(cc_addresses) ? cc_addresses : [];
  const primaryTo = toList[0] || "";

  // Try to match a lead by the first recipient's email address
  const matchedLead = primaryTo ? findLeadByEmail(primaryTo) : null;

  if (matchedLead) {
    // High-confidence match — auto-attach
    const email = createSentEmail({
      messageId: message_id,
      leadId: matchedLead.id,
      subject: subject || "(no subject)",
      bodyPlain: body_plain || "",
      toAddresses: toList,
      ccAddresses: ccList,
      fromAddress: from_address || "",
      sentAt: sent_at,
      matchConfidence: "high",
    });

    console.log(`[ingest] Matched to lead #${matchedLead.id} (${matchedLead.first_name} ${matchedLead.last_name}) — ${message_id}`);
    return NextResponse.json({ ok: true, status: "matched", emailId: email.id, leadId: matchedLead.id });

  } else {
    // No match — store in failure queue for manual review
    createIngestFailure({
      messageId: message_id,
      subject: subject || "(no subject)",
      toAddress: primaryTo,
      reason: primaryTo
        ? `No lead found with email: ${primaryTo}`
        : "No recipient email address in message",
      rawPayload: payload,
    });

    console.log(`[ingest] No match for ${primaryTo} — sent to failure queue`);
    return NextResponse.json({ ok: true, status: "review_queue", toAddress: primaryTo });
  }
}
