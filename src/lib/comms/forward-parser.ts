/**
 * src/lib/comms/forward-parser.ts
 * Pulls the ORIGINAL sender out of a forwarded ("FW:") email.
 *
 * When the broker forwards a client email to the capture box, the message's
 * own From becomes the broker (internal) and the real client is buried in the
 * quoted forward block. This extracts the forwarded "From:" line(s) so the
 * pipeline can attribute the capture to the actual client. Handles Gmail/Apple
 * ("--- Forwarded message ---") and Outlook ("From:/Sent:/To:/Subject:") styles,
 * in both plain-text and HTML bodies.
 */
export type FwdSender = { address: string; name: string };

const EMAIL_RE = /([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/;

function stripHtml(html: string): string {
  return (html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'");
}

function isForwardish(subject: string, text: string): boolean {
  if (/^\s*(fwd?|fw)\s*:/i.test(subject || "")) return true;
  return /-+\s*forwarded message\s*-+|begin forwarded message|-+\s*original message\s*-+/i.test(text || "");
}

function parseFromValue(value: string): FwdSender | null {
  const m = value.match(EMAIL_RE);
  if (!m || m.index === undefined) return null;
  const address = m[1].trim();
  let name = value.slice(0, m.index)
    .replace(/mailto:/gi, "")
    .replace(/[<\["']/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[,;]+\s*$/, "")
    .trim();
  return { address, name };
}

/** Forwarded "From:" candidates, in document order, de-duplicated by address. */
export function extractForwardedSenders(subject: string, bodyPlain: string, bodyHtml: string): FwdSender[] {
  const text = (bodyPlain && bodyPlain.trim()) ? bodyPlain : stripHtml(bodyHtml);
  if (!text || !isForwardish(subject, text)) return [];
  const out: FwdSender[] = [];
  const seen = new Set<string>();
  const lineRe = /^[ \t>*]*From:\s*(.+)$/gim;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(text)) !== null) {
    const parsed = parseFromValue(match[1]);
    if (parsed && !seen.has(parsed.address.toLowerCase())) {
      seen.add(parsed.address.toLowerCase());
      out.push(parsed);
    }
    if (out.length >= 5) break;
  }
  return out;
}
