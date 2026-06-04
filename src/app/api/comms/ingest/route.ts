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
  isUntracked, updateThreadStatus,
} from "@/lib/comms/storage";
import { runExtraction } from "@/lib/comms/extractor";
import { classifySender } from "@/lib/comms/sender-classifier";

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
  const threadIsNew = !thread;
  if (!thread) thread = createThread({ thread_key: threadKey, subject: parsed.subject });

  // 4. Contact match (deterministic)
  // For outbound emails (broker is sender), the "client" is the recipient — match against that instead.
  // We detect outbound by checking if the sender's domain is a known internal broker domain.
  const INTERNAL_DOMAINS = (process.env.INTERNAL_DOMAINS || "denisonyachting.com,denisonyachts.com,denison.com").split(",").map(s => s.trim().toLowerCase());
  const fromDomain = parsed.from.address.split("@")[1]?.toLowerCase() ?? "";
  const isOutbound = INTERNAL_DOMAINS.some(d => fromDomain === d || fromDomain.endsWith("." + d));

  // Determine which party is the actual client (for matching purposes)
  // Outbound: first non-internal recipient. Inbound: the sender.
  let clientAddress = parsed.from.address;
  let clientName = parsed.from.name;
  if (isOutbound) {
    const externalRecipient = parsed.to.find(t => {
      const d = t.address.split("@")[1]?.toLowerCase() ?? "";
      return d && !INTERNAL_DOMAINS.some(intd => d === intd || d.endsWith("." + intd))
        // Also exclude the YotBot capture address itself
        && !t.address.toLowerCase().includes("yotbot")
        && !t.address.toLowerCase().includes("theyotbot");
    });
    if (externalRecipient) {
      clientAddress = externalRecipient.address;
      clientName = externalRecipient.name || "";
    }
  }

  const clientNameParts = clientName.trim().split(/\s+/);
  const matchResult = matchContact({
    email: clientAddress,
    first_name: clientNameParts[0],
    last_name: clientNameParts.slice(1).join(" "),
  });

  let leadId: number | null = matchResult.lead_id;

  // Create new lead if no match — and the client address is external
  const clientDomain = clientAddress.split("@")[1]?.toLowerCase() ?? "";
  const clientIsInternal = INTERNAL_DOMAINS.some(d => clientDomain === d || clientDomain.endsWith("." + d));

  // Classify the sender BEFORE creating a lead. We always store the message
  // (over-capture by design); this only gates lead creation so automated /
  // no-reply / bulk senders never become CRM contacts.
  const classification = classifySender(emlContent, clientAddress, clientName);
  let leadSkippedReason: string | null = null;

  if (!leadId && clientAddress && !clientIsInternal && !clientAddress.toLowerCase().includes("yotbot")) {
    if (classification.kind === "automated") {
      // Captured, but deliberately NOT promoted to a lead.
      leadSkippedReason = classification.reasons.join("; ");
      matchResult.match_method = "automated_no_lead";
      matchResult.confidence = 0;
    } else {
      leadId = createLeadFromComm({
        email: clientAddress,
        first_name: clientNameParts[0] ?? "",
        last_name: clientNameParts.slice(1).join(" ") ?? "",
        source: "comms_capture",
      });
      // Flag role-address leads so they can be triaged later.
      matchResult.match_method = classification.kind === "review" ? "created_new_review" : "created_new";
      matchResult.confidence = classification.kind === "review" ? 0.5 : 1;
    }
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

  // 7b. Automated, lead-less captures: keep the message (over-capture) but auto-dismiss
  // a brand-new thread so the Needs Review queue only holds things a human should act on.
  // Guarded to new threads only, so an automated message landing in a real conversation
  // never dismisses that conversation.
  if (classification.kind === "automated" && !leadId && threadIsNew) {
    updateThreadStatus(thread.id, "dismissed");
  }

  // 8 & 9. Run AI extraction only when this became a lead — skip automated/no-lead
  // captures so we don't spend Claude API calls classifying robot mail.
  let extractionId: number | null = null;
  if (leadId) {
    const extraction = createExtraction(message.id);
    extractionId = extraction.id;
    runExtraction(message.id).catch(err => console.error("[comms/ingest] extraction error:", err));
  }

  return NextResponse.json({
    ok: true,
    status: leadId ? "ingested" : "captured_no_lead",
    messageDbId: message.id,
    threadId: thread.id,
    leadId,
    matchMethod: matchResult.match_method,
    senderKind: classification.kind,
    senderReasons: classification.reasons,
    leadSkippedReason,
    extractionId,
  });
}
