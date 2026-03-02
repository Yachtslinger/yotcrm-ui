import type { CampaignData, MediaAsset, BrokerCard } from "./schema";

const NAVY = "#0b2a55";
const ORANGE = "#e57b2e";
const LABEL = "#94a3b8";
const TEXT = "#0f172a";
const DEFAULT_BANNER = "https://www.denisonyachtsales.com/wp-content/uploads/2023/08/Rectangle-557.png";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function fallbackHero(data: CampaignData): string {
  return data.hero?.src || data.gallery[0]?.src || "https://via.placeholder.com/1200x675/0B1A2B/FFFFFF?text=Denison";
}

function renderGallery(gallery: MediaAsset[]): string {
  if (!gallery.length) return "";
  const cells = gallery.slice(0, 4).map((asset) => {
    return `<td width="50%" style="padding:4px;">
      <img src="${escapeAttr(asset.src)}" alt="${escapeAttr(asset.alt || "")}" style="width:100%;border-radius:6px;display:block;height:auto;" />
    </td>`;
  });
  return `<tr>
    <td style="padding:0 20px 16px;">
      <table role="presentation" width="100%">
        <tr>${cells.join("")}</tr>
      </table>
    </td>
  </tr>`;
}

function renderBrokers(brokers: BrokerCard[]): string {
  if (!brokers.length) return "";
  return brokers
    .map(
      (broker) => `<tr>
        <td style="padding:12px 20px; border-top:1px solid #e2e8f0;">
          <table role="presentation" width="100%">
            <tr>
              <td width="60" valign="top">
                ${broker.headshotSrc ? `<img src="${escapeAttr(broker.headshotSrc)}" alt="${escapeAttr(broker.name)}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;" />` : ""}
              </td>
              <td valign="top" style="font-size:13px; color:${TEXT}; line-height:1.5;">
                <strong>${escapeHtml(broker.name)}</strong><br/>
                ${escapeHtml(broker.title || "")}<br/>
                ${escapeHtml(broker.email)}<br/>
                ${escapeHtml(broker.phone)}
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    )
    .join("");
}

function renderSpecs(specs: CampaignData["specs"]): string {
  const entries = [
    ["Length", specs.length],
    ["Beam", specs.beam],
    ["Draft", specs.draft],
    ["Year", specs.year],
    ["Builder", specs.builder],
    ["Model", specs.model],
    ["Staterooms", specs.staterooms],
    ["Power", specs.power],
  ].filter(([, value]) => value);

  if (!entries.length) return "";

  const rows: string[] = [];
  for (let i = 0; i < entries.length; i += 2) {
    const slice = entries.slice(i, i + 2);
    rows.push(`<tr>
      ${slice
        .map(
          ([label, value]) => `<td width="${100 / slice.length}%" style="padding:12px 0;">
            <div style="color:${LABEL}; font-size:11px; letter-spacing:0.4px; text-transform:uppercase;">${escapeHtml(label)}</div>
            <div style="color:#ffffff; font-size:15px; font-weight:700;">${escapeHtml(value)}</div>
          </td>`
        )
        .join("")}
    </tr>`);
  }

  return `<tr>
    <td style="padding:0 20px 20px;">
      <table role="presentation" width="100%" bgcolor="${NAVY}" style="background:${NAVY}; border-radius:8px; padding:0 20px;">
        <tr><td style="height:14px; line-height:14px; font-size:0;">&nbsp;</td></tr>
        <tr>
          <td style="color:#ffffff; font-size:15px; font-weight:800; letter-spacing:0.3px; border-bottom:1px solid ${ORANGE}; padding-bottom:8px;">
            Specifications
          </td>
        </tr>
        ${rows.join("")}
        <tr><td style="height:14px; line-height:14px; font-size:0;">&nbsp;</td></tr>
      </table>
    </td>
  </tr>`;
}

export function renderCampaignHTML(data: CampaignData): { html: string; text: string } {
  const banner = data.bannerUrl || DEFAULT_BANNER;
  const hero = fallbackHero(data);
  const gallery = renderGallery(data.gallery);
  const specs = renderSpecs(data.specs);
  const brokers = renderBrokers(data.brokers);
  const priceRow = data.specs.price
    ? `<tr><td align="center" style="padding:8px 24px 12px; font-size:18px; color:${ORANGE}; font-weight:800;">${escapeHtml(
        data.specs.price
      )}</td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(data.title || "Denison Yachting")}</title>
  <style>
    img { border:0; line-height:0; outline:none; text-decoration:none; }
    table { border-collapse:collapse; }
    .preheader { display:none !important; visibility:hidden; opacity:0; height:0; width:0; overflow:hidden; mso-hide:all; }
    @media (max-width:620px){ .container { width:100% !important; } .pad { padding-left:16px !important; padding-right:16px !important; } }
  </style>
</head>
<body style="margin:0; background:${NAVY};">
  <div class="preheader">${escapeHtml(data.subtitle || data.cta.label)}</div>
  <table role="presentation" width="100%" bgcolor="${NAVY}" style="background:${NAVY};">
    <tr>
      <td align="center" class="pad" style="padding:0;">
        <div style="width:100%;text-align:center;padding:16px 0;">
          <img src="${escapeAttr(banner)}" alt="Denison Yachting" style="width:560px;max-width:100%;height:auto;display:block;margin:0 auto;" />
        </div>
        <table role="presentation" width="600" class="container" style="width:600px; background:#ffffff;">
          <tr>
            <td>
              <img src="${escapeAttr(hero)}" alt="${escapeAttr(data.hero.alt || data.title || "")}" style="width:100%; display:block; height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 4px; text-align:center;">
              <div style="font-size:24px; color:${NAVY}; font-weight:800;">${escapeHtml(data.title)}</div>
              ${
                data.specs.location
                  ? `<div style="font-size:12px; color:${NAVY}; margin-top:6px;">📍 ${escapeHtml(data.specs.location)}</div>`
                  : ""
              }
              <div style="margin-top:12px;">
                <a href="${escapeAttr(data.cta.href)}" style="font-size:13px; color:${ORANGE}; border:2px solid ${ORANGE}; padding:10px 16px; border-radius:6px; text-decoration:none; display:inline-block; font-weight:700; letter-spacing:0.5px; text-transform:uppercase;">
                  ${escapeHtml(data.cta.label)}
                </a>
              </div>
            </td>
          </tr>
          ${
            data.subtitle
              ? `<tr><td style="padding:0 24px 16px; font-size:14px; color:${TEXT}; line-height:1.6;">${escapeHtml(data.subtitle)}</td></tr>`
              : ""
          }
          ${priceRow}
          ${gallery}
          ${specs}
          ${brokers}
          <tr>
            <td style="padding:16px 24px; font-size:11px; color:${LABEL}; text-align:center;">
              ${escapeHtml(data.footer.disclaimer)}
            </td>
          </tr>
        </table>
        <div style="font-size:11px; color:#cbd5e1; margin:14px 0; text-align:center;">
          © ${new Date().getFullYear()} Denison Yachting — ${escapeHtml(data.brokers[0]?.email || "info@denisonyachting.com")}
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts: string[] = [
    data.title,
    data.subtitle,
    data.specs.location && `Location: ${data.specs.location}`,
    data.specs.length && `Length: ${data.specs.length}`,
    data.specs.beam && `Beam: ${data.specs.beam}`,
    data.specs.draft && `Draft: ${data.specs.draft}`,
    data.specs.price && `Price: ${data.specs.price}`,
    data.cta.href && `CTA: ${data.cta.label} - ${data.cta.href}`,
  ].filter(Boolean) as string[];

  const text = textParts.join("\n");
  return { html, text };
}
