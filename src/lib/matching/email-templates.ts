/**
 * email-templates.ts  —  match email templates
 * src/lib/matching/email-templates.ts
 *
 * Personal, broker-voice emails. Warm and direct.
 * Never reads like a blast. Always has a clear next step.
 */

export type MatchEmailTone = "search" | "mls" | "new-listing" | "price-drop";

export interface MatchEmailData {
  // Vessel
  year:          number | string;
  make:          string;
  model:         string;
  vesselName?:   string;       // optional display name, e.g. "M/Y Serenity"
  loa?:          string;       // "34m / 111ft"
  price?:        string;       // "$4,250,000"
  location?:     string;       // "Fort Lauderdale, FL"
  listingUrl?:   string;       // direct listing link
  brochureUrl?:  string;       // optional PDF brochure link
  heroImageUrl?: string;
  features?:     string;       // raw features text from parsed listing
  brokerNotes?:  string;
  brokerage?:    string;
  vesselType?:   string;

  // Match reasons — AI-generated bullets tied to buyer preferences
  matchReasons?: string[];     // ["Reason 1", "Reason 2", "Reason 3"]

  // Client
  clientFirstName: string;

  // Broker
  brokerName:    string;
  brokerFull:    string;
  brokerTitle:   string;
  brokerEmail:   string;
  brokerPhone:   string;
  brokerCompany: string;

  // Optional personal note the broker writes before sending
  personalNote?: string;
}

// ── Subject lines ─────────────────────────────────────────────────────────────

export function buildSubjectLine(data: MatchEmailData, tone: MatchEmailTone): string {
  const vessel = `${data.year} ${data.make} ${data.model}`.trim();
  switch (tone) {
    case "new-listing": return "A new listing that may fit what you've been looking for";
    case "price-drop":  return `Price reduced — ${vessel}${data.price ? `, now ${data.price}` : ""}`;
    case "search":      return `Found something worth your time — ${vessel}`;
    case "mls":         return `This one caught my eye — ${vessel}`;
  }
}

// ── Opening paragraphs ────────────────────────────────────────────────────────

function openingParagraph(data: MatchEmailData, tone: MatchEmailTone): string {
  switch (tone) {
    case "new-listing":
    case "search":
      return `A boat just hit the market that I thought was worth putting in front of you based on what you've been looking for.`;
    case "mls":
      return `I was combing through the MLS and this one genuinely caught my eye. I thought of you immediately.`;
    case "price-drop":
      return `The ${data.year} ${data.make} ${data.model} we've been watching had a meaningful price adjustment${data.price ? ` — now listed at ${data.price}` : ""}. That changes the story and I think it's worth revisiting.`;
  }
}

// ── Vessel descriptor line ────────────────────────────────────────────────────

function vesselLine(data: MatchEmailData): string {
  const name   = data.vesselName ? `<em>${data.vesselName}</em> is a` : "She's a";
  const price  = data.price    ? ` currently asking ${data.price}` : "";
  const loc    = data.location ? ` and located in ${data.location}` : "";
  return `${name} ${data.year} ${data.make} ${data.model}${price}${loc}.`;
}

// ── Feature bullets (clean up raw features text) ─────────────────────────────

function parseFeatures(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,;|·•]+/)
    .map(f => f.trim())
    .filter(f => f.length > 2 && f.length < 80)
    .slice(0, 6);
}

// ── HTML email ────────────────────────────────────────────────────────────────

export function buildMatchEmail(data: MatchEmailData, tone: MatchEmailTone): string {
  const subject  = buildSubjectLine(data, tone);
  const opening  = openingParagraph(data, tone);
  const descLine = vesselLine(data);

  // Reasons bullets (AI-generated or fallback to parsed features)
  const reasons: string[] = data.matchReasons?.length
    ? data.matchReasons.slice(0, 3)
    : parseFeatures(data.features || "").slice(0, 3);

  const reasonsHtml = reasons.length ? `
    <p style="font-size:15px;line-height:1.7;color:#222;margin:0 0 8px">A few reasons it stood out to me:</p>
    <ul style="margin:0 0 24px;padding:0 0 0 20px">
      ${reasons.map(r => `<li style="font-size:15px;color:#333;line-height:1.7;margin-bottom:6px">${r}</li>`).join("")}
    </ul>` : "";

  // Listing link
  const listingHtml = data.listingUrl ? `
    <p style="font-size:15px;line-height:1.7;color:#222;margin:0 0 16px">
      You can take a look here:<br>
      <a href="${data.listingUrl}" style="color:#b8933a;font-weight:500;text-decoration:none">${data.listingUrl}</a>
    </p>` : "";

  // Optional brochure line
  const brochureHtml = data.brochureUrl ? `
    <p style="font-size:15px;line-height:1.7;color:#222;margin:0 0 24px">
      I also have the brochure here if you'd like a deeper look:
      <a href="${data.brochureUrl}" style="color:#b8933a;font-weight:500;text-decoration:none">${data.brochureUrl}</a>
    </p>` : `<div style="margin-bottom:24px"></div>`;

  // Personal note
  const noteHtml = data.personalNote ? `
    <p style="font-size:15px;line-height:1.7;color:#222;margin:0 0 20px;padding:14px 16px;background:#fafaf7;border-left:3px solid #b8933a;border-radius:0 4px 4px 0">${data.personalNote}</p>` : "";

  // Hero image
  const heroBlock = data.heroImageUrl ? `
    <a href="${data.listingUrl || "#"}" style="display:block;text-decoration:none;margin-bottom:24px">
      <img src="${data.heroImageUrl}" alt="${data.year} ${data.make} ${data.model}"
           style="width:100%;max-height:300px;object-fit:cover;border-radius:6px;display:block">
    </a>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:28px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden">

  <!-- Header -->
  <tr>
    <td style="background:#050d1a;padding:16px 32px">
      <span style="font-size:12px;font-weight:600;color:#b8933a;letter-spacing:.1em">${data.brokerCompany.toUpperCase()}</span>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:32px 32px 8px">

      <p style="font-size:15px;line-height:1.7;color:#222;margin:0 0 18px">Hi ${data.clientFirstName},</p>

      <p style="font-size:15px;line-height:1.7;color:#222;margin:0 0 20px">${opening}</p>

      ${heroBlock}

      <p style="font-size:15px;line-height:1.7;color:#222;margin:0 0 20px">${descLine}</p>

      ${reasonsHtml}
      ${listingHtml}
      ${brochureHtml}
      ${noteHtml}

      <p style="font-size:15px;line-height:1.7;color:#222;margin:0 0 28px">If it catches your eye, I can give you my quick take on how it stacks up against the other boats in this part of the market and whether it is truly worth pursuing.</p>

      <p style="font-size:15px;color:#222;margin:0 0 32px">Best,<br>${data.brokerName}<br>
        <span style="font-size:13px;color:#666">${data.brokerTitle}</span><br>
        <span style="font-size:13px;color:#666">${data.brokerPhone}</span><br>
        <a href="mailto:${data.brokerEmail}" style="font-size:13px;color:#b8933a;text-decoration:none">${data.brokerEmail}</a>
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:14px 32px;background:#050d1a">
      <p style="font-size:11px;color:#555;margin:0;line-height:1.6">
        You are receiving this because ${data.brokerFull} has you on file as an active buyer.
        Reply "unsubscribe" at any time to stop receiving updates.
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function buildMatchEmailText(data: MatchEmailData, tone: MatchEmailTone): string {
  const opening  = openingParagraph(data, tone);
  const descLine = vesselLine(data).replace(/<em>|<\/em>/g, "");

  const reasons: string[] = data.matchReasons?.length
    ? data.matchReasons.slice(0, 3)
    : parseFeatures(data.features || "").slice(0, 3);

  return [
    `Hi ${data.clientFirstName},`,
    "",
    opening,
    "",
    descLine,
    "",
    reasons.length ? "A few reasons it stood out to me:" : "",
    ...reasons.map(r => `• ${r}`),
    reasons.length ? "" : "",
    data.listingUrl ? `You can take a look here:\n${data.listingUrl}` : "",
    data.listingUrl ? "" : "",
    data.brochureUrl ? `I also have the brochure here if you'd like a deeper look:\n${data.brochureUrl}` : "",
    data.brochureUrl ? "" : "",
    data.personalNote || "",
    data.personalNote ? "" : "",
    "If it catches your eye, I can give you my quick take on how it stacks up against the other boats in this part of the market and whether it is truly worth pursuing.",
    "",
    `Best,`,
    `${data.brokerName}`,
    `${data.brokerTitle}`,
    `${data.brokerPhone}`,
    `${data.brokerEmail}`,
  ].filter(s => s !== null && s !== undefined).join("\n");
}
