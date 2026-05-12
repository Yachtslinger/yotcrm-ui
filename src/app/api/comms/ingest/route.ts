/**
 * POST /api/comms/ingest
 * Accepts raw .eml or JSON. Parses, deduplicates, matches contacts, stores, triggers extraction.
 * Protected by INGEST_SECRET header.
 */
import { NextRequest, NextResponse } from "next/server";
import { parseEml, computeThreadKey } from "@/lib/comms/eml-parser";
import { matchContact, createLeadFromComm } from "@/lib/comms/contact-matcher";
import {
  findMessageByMessageId, findThreadByKey, createThread,
  createMessage, updateThreadActivity, createExtraction, logContactMatch,
  isUntracked,
} from "@/lib/comms/storage";
import { runExtraction } from "@/lib/comms/extractor";

export const runtime = "nodejs";

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.INGEST_SECRET;
  const commsSecret = process.env.COMMS_INGEST_SECRET || "yotcrm-comms-ingest-2026";
  const provided = req.headers.get("x-ingest-secret") ?? req.headers.get("x-api-key") ?? "";
  if (!provided) return false;
  return provided === commsSecret || (!!secret && provided === secret);
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let emlContent = "";
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    emlContent = body.eml ?? body.content ?? "";
  } else {
    emlContent = await req.text();
  }
  if (!emlContent || emlContent.length < 30) {
    return NextResponse.json({ ok: false, error: "Missing or empty content" }, { status: 400 });
  }

  // 1. Parse
  const parsed = parseEml(emlContent);

  // 1b. Untracked check — if sender or any recipient is on the do-not-track list, reject
  const allParties = [
    parsed.from.address,
    ...parsed.to.map(a => a.address),
    ...parsed.cc.map(a => a.address),
  ].filter(Boolean);
  for (const addr of allParties) {
    if (isUntracked(addr)) {
      return NextResponse.json({ ok: true, status: "untracked", reason: `${addr} is on do-not-track list` }, { status: 200 });
    }
  }

  // 2. Deduplicate
  if (parsed.messageId && findMessageByMessageId(parsed.messageId)) {
    return NextResponse.json({ ok: true, status: "duplicate", messageId: parsed.messageId }, { status: 409 });
  }

  // 3. Thread grouping
  const threadKey = computeThreadKey(parsed.subject, parsed.references.concat(parsed.inReplyTo ? [parsed.inReplyTo] : []));
  let thread = findThreadByKey(threadKey);
  if (!thread) thread = createThread({ thread_key: threadKey, subject: parsed.subject });

  // 4. Contact match (deterministic)
  const nameParts = parsed.from.name.trim().split(/\s+/);
  const matchResult = matchContact({
    email: parsed.from.address,
    first_name: nameParts[0],
    last_name: nameParts.slice(1).join(" "),
  });

  let leadId: number | null = matchResult.lead_id;

  // Create new lead if no match
  if (!leadId && parsed.from.address && !parsed.from.address.includes("denisonyacht")) {
    leadId = createLeadFromComm({
      email: parsed.from.address,
      first_name: nameParts[0] ?? "",
      last_name: nameParts.slice(1).join(" ") ?? "",
      source: "comms_capture",
    });
    matchResult.match_method = "created_new";
    matchResult.confidence = 1;
  }

  // 5. Store message
  const message = createMessage({
    thread_id: thread.id,
    message_id: parsed.messageId || `auto-${Date.now()}`,
    in_reply_to: parsed.inReplyTo,
    from_address: parsed.from.address,
    from_name: parsed.from.name,
    to_addresses: parsed.to.map(a => a.address),
    cc_addresses: parsed.cc.map(a => a.address),
    subject: parsed.subject,
    body_plain: parsed.bodyPlain,
    body_html: parsed.bodyHtml,
    sent_at: parsed.date,
    direction: parsed.direction,
    raw_eml: emlContent,
  });

  // 6. Log contact match
  logContactMatch({ message_id: message.id, lead_id: leadId, match_method: matchResult.match_method, confidence: matchResult.confidence });

  // 7. Update thread
  updateThreadActivity(thread.id, leadId);

  // 8. Create extraction record
  const extraction = createExtraction(message.id);

  // 9. Fire-and-forget extraction (async)
  runExtraction(message.id).catch(err => console.error("[comms/ingest] extraction error:", err));

  return NextResponse.json({
    ok: true,
    status: "ingested",
    messageDbId: message.id,
    threadId: thread.id,
    leadId,
    matchMethod: matchResult.match_method,
    extractionId: extraction.id,
  });
}
