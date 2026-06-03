/**
 * src/lib/comms/sender-classifier.ts
 * Decides whether an UNMATCHED sender should become a lead.
 *
 * Design intent: we still STORE every message (over-capture by design).
 * This classifier only gates LEAD creation, so automated / no-reply / bulk
 * senders don't pollute the CRM. No AI — fast deterministic heuristics on
 * the From address plus the machine-mail headers a human never sends.
 *
 * Returns a 3-way verdict:
 *   "automated" -> capture, never create a lead
 *   "review"    -> capture + create lead (over-grab) but flag for triage
 *   "human"     -> capture + create lead normally
 */

export type SenderKind = "human" | "review" | "automated";
export type SenderClassification = { kind: SenderKind; score: number; reasons: string[] };

// Local-parts that are almost always machine/system mailboxes — never a buyer typing to you.
const HARD_AUTOMATED_LOCALPARTS = [
  "no-reply", "noreply", "no_reply", "donotreply", "do-not-reply", "do_not_reply",
  "mailer-daemon", "mailerdaemon", "postmaster", "bounce", "bounces", "mailer",
  "notification", "notifications", "notify", "alert", "alerts", "automated", "auto",
  "auto-confirm", "system", "daemon", "root", "cron", "feedback", "unsubscribe",
  "receipt", "receipts", "noreplies",
];

// Softer role addresses — could be a real person at a small brokerage, so -> review.
const SOFT_ROLE_LOCALPARTS = [
  "info", "sales", "support", "help", "contact", "admin", "office", "team", "hello",
  "marketing", "newsletter", "news", "updates", "billing", "accounts", "service",
  "inquiries", "inquiry", "leads", "webmaster", "careers", "hr",
];

// Domain fragments that indicate bulk-mail / ESP / transactional senders.
const BULK_DOMAIN_FRAGMENTS = [
  "mailchimp", "mcsv.net", "rsgsv.net", "sendgrid", "sendgrid.net", "amazonses",
  "mailgun", "mg.", "sparkpostmail", "mandrillapp", "mailjet", "mtasv.net",
  "constantcontact", "hubspot", "hubspotemail", "exacttarget", "createsend",
  "cmail19.com", "cmail20.com", "sendinblue", "klaviyo", "postmarkapp",
  "accounts.google.com", "facebookmail", "docusign", "calendly",
  "bounces.", "reply.", "notifications.", "notify.",
];

function getHeader(headerBlock: string, name: string): string {
  const re = new RegExp(`^${name}:(.*(?:\\r?\\n[ \\t].*)*)`, "im");
  const m = headerBlock.match(re);
  return m ? m[1].replace(/\r?\n[ \t]+/g, " ").trim() : "";
}

export function classifySender(rawEml: string, fromAddress: string, fromName: string): SenderClassification {
  const reasons: string[] = [];
  const addr = (fromAddress || "").toLowerCase().trim();
  const local = addr.split("@")[0] || "";
  const domain = addr.split("@")[1] || "";
  const headerEnd = rawEml.search(/\r?\n\r?\n/);
  const headers = headerEnd > 0 ? rawEml.substring(0, headerEnd) : rawEml;

  let auto = 0;

  // ── Strongest signals: machine-generated mail headers ──
  if (getHeader(headers, "List-Unsubscribe")) { auto += 2; reasons.push("List-Unsubscribe header (bulk mail)"); }
  if (getHeader(headers, "List-Id")) { auto += 2; reasons.push("List-Id header (mailing list)"); }
  if (getHeader(headers, "Feedback-ID") || getHeader(headers, "X-CSA-Complaints")) { auto += 2; reasons.push("ESP feedback header (bulk sender)"); }
  const precedence = getHeader(headers, "Precedence").toLowerCase();
  if (/\b(bulk|list|junk)\b/.test(precedence)) { auto += 2; reasons.push(`Precedence: ${precedence}`); }
  const autoSubmitted = getHeader(headers, "Auto-Submitted").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") { auto += 2; reasons.push(`Auto-Submitted: ${autoSubmitted}`); }

  // ── Local-part signals ──
  const localNorm = local.replace(/[._-]/g, "");
  if (HARD_AUTOMATED_LOCALPARTS.some(p => local === p || localNorm === p.replace(/[._-]/g, "") || local.startsWith(p))) {
    auto += 3; reasons.push(`local-part "${local}" is a no-reply/system mailbox`);
  }

  // ── Domain signals ──
  if (BULK_DOMAIN_FRAGMENTS.some(f => domain === f || domain.endsWith(f) || domain.includes(f))) {
    auto += 2; reasons.push(`domain "${domain}" is a bulk/ESP/transactional sender`);
  }

  if (auto >= 3) return { kind: "automated", score: auto, reasons };

  // ── Soft role address → review (capture + lead under over-grab, but flagged) ──
  if (SOFT_ROLE_LOCALPARTS.includes(local)) {
    reasons.push(`role address "${local}@" — lead created but flagged for triage`);
    return { kind: "review", score: auto, reasons };
  }

  // ── Human signal: a real display name ──
  const nameTokens = (fromName || "").trim().split(/\s+/).filter(Boolean);
  const looksAutomatedName = /no-?reply|notification|team|support|alert|do-?not/i.test(fromName || "");
  if (nameTokens.length >= 2 && /[a-z]/i.test(fromName) && !looksAutomatedName) {
    reasons.push(`display name "${fromName}" looks like a person`);
    return { kind: "human", score: auto, reasons };
  }

  // No automated signals and no clear name: per over-grab bias, default to a lead.
  reasons.push("no automated signals; defaulting to lead (over-capture bias)");
  return { kind: "human", score: auto, reasons };
}
