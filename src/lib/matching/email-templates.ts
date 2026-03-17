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
  year:         number | string;
  make:         string;
  model:        string;
  loa?:         string;       // "34m / 111ft"
  price?:       string;       // "$4,250,000"
  location?:    string;       // "Fort Lauderdale, FL"
  listingUrl?:  string;       // direct link if available (BoatWizard/Denison/YW)
  heroImageUrl?: string;
  features?:    string;       // raw features text from parsed listing
  brokerNotes?: string;       // notes from listing broker
  brokerage?:   string;       // listing brokerage name
  vesselType?:  string;

  // Client
  clientFirstName: string;

  // Broker
  brokerName:  string;
  brokerFull:  string;
  brokerTitle: string;
  brokerEmail: string;
  brokerPhone: string;
  brokerCompany: string;

  // Optional personal note the broker writes before sending
  personalNote?: string;
}

// ── URL builders ──────────────────────────────────────────────────────────────

function denisonSearchUrl(make: string): string {
  const slug = make.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return slug
    ? `https://www.denisonyachtsales.com/used-${slug}-yachts-for-sale/`
    : `https://www.denisonyachtsales.com/yachts-for-sale/`;
}

function yachtWorldSearchUrl(make: string, year: number | string): string {
  const m = encodeURIComponent(make || "");
  const y = year ? parseInt(String(year), 10) - 2 : "";
  const params = [m ? `make=${m}` : "", y ? `year_built_min=${y}` : ""].filter(Boolean).join("&");
  return `https://www.yachtworld.com/boats-for-sale/${params ? "?" + params : ""}`;
}

// ── Subject lines ─────────────────────────────────────────────────────────────

export function buildSubjectLine(data: MatchEmailData, tone: MatchEmailTone): string {
  const vessel = `${data.year} ${data.make} ${data.model}`.trim();
  switch (tone) {
    case "search":      return `Found something worth your time — ${vessel}`;
    case "mls":         return `This one caught my eye — ${vessel}`;
    case "new-listing": return `Just listed: ${vessel}${data.location ? ` · ${data.location}` : ""}`;
    case "price-drop":  return `Price reduced — ${vessel}${data.price ? `, now ${data.price}` : ""}`;
  }
}

// ── Opening paragraphs ────────────────────────────────────────────────────────

function openingParagraph(data: MatchEmailData, tone: MatchEmailTone): string {
  const vessel = `${data.year} ${data.make} ${data.model}`.trim();
  switch (tone) {
    case "search":
      return `I was running a search with your criteria in mind and this ${vessel} stopped me. It checks a lot of the boxes we've talked about${data.location ? ` and it's sitting in ${data.location}` : ""}, so I wanted to get it in front of you before you see it somewhere else.`;
    case "mls":
      return `I was combing through the MLS and this ${vessel} genuinely caught my eye. It doesn't make a lot of noise — but the specs and the price point make it worth a serious look. I thought of you immediately.`;
    case "new-listing":
      return `This ${vessel} just came to market and I wanted you to be one of the first to see it. Based on what you've told me, I think it warrants a conversation.`;
    case "price-drop":
      return `The ${vessel} we've been watching had a meaningful price adjustment${data.price ? ` — now listed at ${data.price}` : ""}. That changes the story a bit and I think it's worth revisiting.`;
  }
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
  const vessel   = `${data.year} ${data.make} ${data.model}`.trim();
  const subject  = buildSubjectLine(data, tone);
  const opening  = openingParagraph(data, tone);
  const features = parseFeatures(data.features || "");

  const denisonUrl  = denisonSearchUrl(data.make);
  const ywUrl       = yachtWorldSearchUrl(data.make, data.year);
  const directUrl   = data.listingUrl || "";

  // Hero image (linked if we have a direct URL)
  const heroBlock = data.heroImageUrl ? `
    <a href="${directUrl || denisonUrl}" style="display:block;text-decoration:none;margin-bottom:24px">
      <img src="${data.heroImageUrl}" alt="${vessel}"
           style="width:100%;max-height:320px;object-fit:cover;border-radius:6px;display:block">
    </a>` : "";

  // Specs strip
  const specs = [
    data.loa      && `LOA: ${data.loa}`,
    data.price    && `${data.price}`,
    data.location && `📍 ${data.location}`,
    data.brokerage && `Listed by ${data.brokerage}`,
  ].filter(Boolean);

  const specsHtml = specs.length ? `
    <div style="background:#f5f5f5;border-radius:6px;padding:12px 16px;margin-bottom:20px">
      ${specs.map(s => `<span style="display:inline-block;font-size:13px;color:#444;margin-right:20px;margin-bottom:4px">${s}</span>`).join("")}
    </div>` : "";

  // Features
  const featuresHtml = features.length ? `
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;color:#b8933a;text-transform:uppercase;margin-bottom:8px">Key features</div>
      <ul style="margin:0;padding:0 0 0 18px">
        ${features.map(f => `<li style="font-size:14px;color:#333;line-height:1.7;margin-bottom:2px">${f}</li>`).join("")}
      </ul>
    </div>` : "";

  // Personal note
  const noteHtml = data.personalNote ? `
    <p style="font-size:15px;line-height:1.7;color:#222;margin:0 0 20px;padding:14px 16px;background:#fafaf7;border-left:3px solid #b8933a;border-radius:0 4px 4px 0">${data.personalNote}</p>
    ` : "";

  // Next steps block
  const nextStepsHtml = `
    <div style="background:#f8f8f8;border-radius:8px;padding:20px 24px;margin-bottom:24px">
      <div style="font-size:13px;font-weight:600;color:#050d1a;margin-bottom:12px">A few ways I can help from here:</div>
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="padding:7px 0;font-size:14px;color:#333;line-height:1.5">
            <span style="color:#b8933a;font-weight:700;margin-right:8px">→</span>
            <strong>Schedule a call</strong> — I can walk you through everything I know about this one and answer any questions
          </td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:14px;color:#333;line-height:1.5">
            <span style="color:#b8933a;font-weight:700;margin-right:8px">→</span>
            <strong>Get videos or a virtual tour</strong> — I can reach out to the listing broker and request footage or set up a live walkthrough
          </td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:14px;color:#333;line-height:1.5">
            <span style="color:#b8933a;font-weight:700;margin-right:8px">→</span>
            <strong>Arrange a showing</strong> — if you want to get eyes on her in person, let's set it up
          </td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:14px;color:#333;line-height:1.5">
            <span style="color:#b8933a;font-weight:700;margin-right:8px">→</span>
            <strong>Dig deeper</strong> — I can pull survey history, request full specs, or reach out to the broker for anything specific
          </td>
        </tr>
      </table>
      <p style="font-size:13px;color:#777;margin:12px 0 0">Just reply and let me know what you'd like to do — no pressure at all.</p>
    </div>`;

  // Links block
  const linksHtml = `
    <div style="margin-bottom:28px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;color:#b8933a;text-transform:uppercase;margin-bottom:10px">Find the listing</div>
      <table cellpadding="0" cellspacing="0">
        ${directUrl ? `<tr><td style="padding:4px 0">
          <a href="${directUrl}" style="font-size:14px;color:#050d1a;text-decoration:none;font-weight:500">
            🔗 View listing directly →
          </a>
        </td></tr>` : ""}
        <tr><td style="padding:4px 0">
          <a href="${denisonUrl}" style="font-size:14px;color:#1a2b4a;text-decoration:none">
            🏢 Search <strong>${data.make}</strong> on Denison Yachting →
          </a>
        </td></tr>
        <tr><td style="padding:4px 0">
          <a href="${ywUrl}" style="font-size:14px;color:#666;text-decoration:none">
            ⚓ Search ${data.make} on YachtWorld →
          </a>
        </td></tr>
      </table>
    </div>`;

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

      <p style="font-size:15px;line-height:1.7;color:#222;margin:0 0 24px">${opening}</p>

      ${heroBlock}

      <div style="font-size:10px;font-weight:700;letter-spacing:.12em;color:#b8933a;text-transform:uppercase;margin-bottom:5px">${data.make} &middot; ${data.year}</div>
      <div style="font-size:22px;font-weight:600;color:#050d1a;margin-bottom:14px">${data.model}</div>

      ${specsHtml}
      ${featuresHtml}
      ${noteHtml}
      ${nextStepsHtml}
      ${linksHtml}

      <p style="font-size:15px;color:#222;margin:0 0 32px">— ${data.brokerName}</p>
    </td>
  </tr>

  <!-- Broker card -->
  <tr>
    <td style="background:#f8f8f8;border-top:1px solid #eee;padding:18px 32px">
      <div style="font-size:13px;font-weight:600;color:#0a0a0a;margin-bottom:2px">${data.brokerFull}</div>
      <div style="font-size:12px;color:#666;margin-bottom:7px">${data.brokerTitle}</div>
      <div style="font-size:12px;color:#444">
        <a href="mailto:${data.brokerEmail}" style="color:#b8933a;text-decoration:none">${data.brokerEmail}</a>
        &nbsp;&middot;&nbsp;
        <a href="tel:${data.brokerPhone.replace(/\D/g,"")}" style="color:#444;text-decoration:none">${data.brokerPhone}</a>
      </div>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:14px 32px;background:#050d1a">
      <p style="font-size:11px;color:#555;margin:0;line-height:1.6">
        You are receiving this because ${data.brokerFull} has you on file as a client actively searching.
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
  const vessel    = `${data.year} ${data.make} ${data.model}`.trim();
  const opening   = openingParagraph(data, tone);
  const features  = parseFeatures(data.features || "");
  const denisonUrl = denisonSearchUrl(data.make);
  const ywUrl      = yachtWorldSearchUrl(data.make, data.year);

  return [
    `Hi ${data.clientFirstName},`,
    "",
    opening,
    "",
    `${vessel}`,
    data.price    ? `Price: ${data.price}`       : "",
    data.loa      ? `Length: ${data.loa}`         : "",
    data.location ? `Location: ${data.location}`  : "",
    data.brokerage ? `Listed by: ${data.brokerage}` : "",
    features.length ? `\nFeatures:\n${features.map(f => `  · ${f}`).join("\n")}` : "",
    "",
    data.personalNote || "",
    data.personalNote ? "" : "",
    "A few ways I can help from here:",
    "→ Schedule a call — happy to walk you through everything I know about this one",
    "→ Get videos or a virtual tour — I can reach out to the listing broker and request footage",
    "→ Arrange a showing — if you want to get eyes on her in person, let's set it up",
    "→ Dig deeper — survey history, full specs, anything specific — just ask",
    "",
    "Just reply and let me know what you'd like to do.",
    "",
    "Links:",
    data.listingUrl ? `View listing: ${data.listingUrl}` : "(No direct listing link available)",
    `Search ${data.make} on Denison: ${denisonUrl}`,
    `Search ${data.make} on YachtWorld: ${ywUrl}`,
    "",
    `— ${data.brokerName}`,
    "",
    `${data.brokerFull}  ·  ${data.brokerTitle}`,
    `${data.brokerEmail}  ·  ${data.brokerPhone}`,
  ].filter(s => s !== null).join("\n");
}
