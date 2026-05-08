/**
 * src/lib/comms/eml-parser.ts
 * Parses raw .eml content into a structured object.
 * Uses the same MIME logic as parseEmails.js but typed for TypeScript.
 */

export type ParsedEmail = {
  messageId: string;
  inReplyTo: string;
  references: string[];
  from: { address: string; name: string };
  to: { address: string; name: string }[];
  cc: { address: string; name: string }[];
  subject: string;
  date: string;    // ISO string
  bodyPlain: string;
  bodyHtml: string;
  direction: "inbound" | "bcc";
};

function extractHeader(lines: string[], name: string): string {
  const lower = name.toLowerCase();
  let result = "";
  let capturing = false;
  for (const line of lines) {
    if (line.toLowerCase().startsWith(lower + ":")) {
      result = line.substring(line.indexOf(":") + 1).trim();
      capturing = true;
    } else if (capturing && (line.startsWith(" ") || line.startsWith("\t"))) {
      result += " " + line.trim();
    } else if (capturing) {
      break;
    }
  }
  return result;
}

function parseAddressList(raw: string): { address: string; name: string }[] {
  if (!raw) return [];
  return raw.split(/,(?![^<]*>)/).map(part => {
    part = part.trim();
    const match = part.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
    if (match) return { name: match[1].trim(), address: match[2].trim().toLowerCase() };
    if (part.includes("@")) return { name: "", address: part.toLowerCase() };
    return { name: part, address: "" };
  }).filter(a => a.address);
}

function decodeQP(str: string): string {
  return str.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function decodeB64(str: string): string {
  try { return Buffer.from(str.replace(/[\r\n\s]/g, ""), "base64").toString("utf-8"); } catch { return str; }
}

function extractBodies(raw: string): { plain: string; html: string } {
  let plain = "";
  let html = "";
  const boundaries = [...raw.matchAll(/boundary="?([^"\r\n;]+)"?/gi)].map(m => m[1]);
  if (!boundaries.length) {
    const idx = raw.search(/\r?\n\r?\n/);
    const headers = idx > 0 ? raw.substring(0, idx) : "";
    let body = idx > 0 ? raw.substring(idx + 2) : raw;
    if (/Content-Transfer-Encoding:\s*base64/i.test(headers)) body = decodeB64(body);
    else if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(headers)) body = decodeQP(body);
    return { plain: body, html: "" };
  }
  for (const boundary of boundaries) {
    const esc = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`--${esc}\\s*\\r?\\n([\\s\\S]*?)(?=--${esc})`, "g");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(raw)) !== null) {
      const part = m[1];
      const bIdx = part.search(/\r?\n\r?\n/);
      if (bIdx === -1) continue;
      const ph = part.substring(0, bIdx);
      let pb = part.substring(bIdx).replace(/^\r?\n\r?\n/, "").replace(/\r?\n--[^\r\n]+--?\s*$/, "");
      if (/Content-Transfer-Encoding:\s*base64/i.test(ph)) pb = decodeB64(pb);
      else if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(ph)) pb = decodeQP(pb);
      if (/Content-Type:\s*text\/plain/i.test(ph) && pb.length > plain.length) plain = pb;
      if (/Content-Type:\s*text\/html/i.test(ph) && pb.length > html.length) html = pb;
    }
  }
  return { plain, html };
}

const YOTBOT_ADDRESSES = (process.env.YOTBOT_EMAIL || "yotbot@denisonyachting.com").toLowerCase().split(",").map(s => s.trim());

export function parseEml(raw: string): ParsedEmail {
  const headerEnd = raw.search(/\r?\n\r?\n/);
  const headerBlock = headerEnd > 0 ? raw.substring(0, headerEnd) : raw;
  const lines = headerBlock.split(/\r?\n/);
  const msgId = extractHeader(lines, "Message-ID").replace(/[<>]/g, "").trim();
  const inReplyTo = extractHeader(lines, "In-Reply-To").replace(/[<>]/g, "").trim();
  const refs = extractHeader(lines, "References").split(/\s+/).map(r => r.replace(/[<>]/g, "").trim()).filter(Boolean);
  const fromRaw = extractHeader(lines, "From");
  const from = parseAddressList(fromRaw)[0] ?? { address: "", name: "" };
  const to = parseAddressList(extractHeader(lines, "To"));
  const cc = parseAddressList(extractHeader(lines, "CC"));
  const subject = extractHeader(lines, "Subject");
  const dateRaw = extractHeader(lines, "Date");
  let date = "";
  try { date = new Date(dateRaw).toISOString(); } catch { date = new Date().toISOString(); }
  const { plain, html } = extractBodies(raw);
  // Detect BCC: if YotBot address appears in raw headers but not in To/CC
  const allVisible = [...to, ...cc].map(a => a.address.toLowerCase());
  const isBcc = YOTBOT_ADDRESSES.some(yb => !allVisible.includes(yb) && raw.toLowerCase().includes(yb));
  return { messageId: msgId, inReplyTo, references: refs, from, to, cc, subject, date, bodyPlain: plain.trim(), bodyHtml: html.trim(), direction: isBcc ? "bcc" : "inbound" };
}

/** Compute a stable thread key from subject line (strips Re:/Fwd: noise) */
export function computeThreadKey(subject: string, references: string[]): string {
  if (references.length) return references[0]; // most reliable — same thread chain
  const clean = subject.replace(/^(?:Re|Fwd?|Fw):\s*/gi, "").trim().toLowerCase();
  return `subj:${clean}`;
}
