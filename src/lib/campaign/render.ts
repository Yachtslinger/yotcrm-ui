import { CampaignData } from "./schema";
import { DENISON_BANNER_DATA_URL } from "@/lib/branding/banner";

type RenderResult = { html: string; text: string };

const COLORS = {
  navy: "#0B1A2B",
  navy600: "#13283E",
  orange: "#F36C21",
  slate: "#4A5A6A",
  muted: "#B7C4D1",
  bg: "#F5F7FB",
};

export function renderCampaignHTML(data: CampaignData): RenderResult {
  const specsRows = buildSpecsGrid(data);
  const gallery = buildGallery(data);
  const brokers = buildBrokerBlock(data);
  const features = data.features.map((line) => `<li>${escapeHtml(line)}</li>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(data.title || "Denison Yachting")}</title>
  <style>
    body{margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
    img{border:0;display:block;width:100%;height:auto;}
    table{border-collapse:collapse;}
    .container{width:700px;max-width:100%;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;}
  </style>
</head>
<body>
  <table role="presentation" class="container">
    <tr><td style="background:${COLORS.navy};text-align:center;"><img src="${DENISON_BANNER_DATA_URL}" alt="Denison Banner"/></td></tr>
    ${renderHeroSection(data)}
    ${data.subtitle ? `<tr><td style="background:${COLORS.orange};color:#fff;font-weight:700;text-align:center;padding:12px 16px;">${escapeHtml(data.subtitle)}</td></tr>` : ""}
    <tr><td style="padding:28px;">
      <h1 style="margin:0 0 6px;font-size:28px;color:${COLORS.navy};">${escapeHtml(data.title)}</h1>
      ${data.specs.location ? `<div style="color:${COLORS.slate};font-size:14px;margin-bottom:12px;">${escapeHtml(data.specs.location)}</div>` : ""}
      ${data.specs.raw ? `<p style="font-size:16px;color:${COLORS.navy};line-height:1.5;margin:0 0 16px;">${escapeHtml(data.specs.raw)}</p>` : ""}
      ${renderCTA(data)}
    </td></tr>
    ${specsRows}
    ${gallery}
    ${features ? `<tr><td style="padding:0 28px 28px;"><h2 style="color:${COLORS.navy};font-size:18px;">KEY FEATURES</h2><ul style="padding-left:18px;color:${COLORS.slate};">${features}</ul></td></tr>` : ""}
    ${brokers}
    ${renderFooter(data)}
  </table>
</body>
</html>`;

  return { html, text: stripHtml(html) };
}

function buildSpecsGrid(data: CampaignData): string {
  const rows = [
    ["length", "beam", "draft"],
    ["year", "staterooms", "power"],
    ["builder", "model", "price"],
  ];
  const hasSpecs = rows.flat().some((key) => data.specs[key as keyof typeof data.specs]);
  if (!hasSpecs) return "";
  return `<tr><td style="padding:0;">
    <table role="presentation" width="100%" style="background:${COLORS.navy600};color:#fff;">
      ${rows
        .map(
          (row) =>
            `<tr>${row
              .map((field) => `<td style="width:33%;padding:12px;"><div style="font-size:11px;letter-spacing:.08em;color:${COLORS.muted};text-transform:uppercase;">${field.toUpperCase()}</div><div style="font-size:16px;font-weight:600;color:#fff;">${escapeHtml(
                data.specs[field as keyof typeof data.specs] || ""
              )}</div></td>`)
              .join("")}</tr>`
        )
        .join("")}
    </table>
  </td></tr>`;
}

function buildGallery(data: CampaignData): string {
  if (!data.gallery.length) return "";
  const chunks = chunk(data.gallery, 2);
  return `<tr><td style="padding:0 28px 28px;">
    <table role="presentation" width="100%">
      ${chunks
        .map(
          (row) =>
            `<tr>${row
              .map(
                (asset) =>
                  `<td style="width:50%;padding:6px;"><img src="${asset.src}" alt="${escapeHtml(asset.alt || "")}" style="border-radius:4px;"/></td>`
              )
              .join("")}${row.length === 1 ? '<td style="width:50%;padding:6px;"></td>' : ""}</tr>`
        )
        .join("")}
    </table>
  </td></tr>`;
}

function buildBrokerBlock(data: CampaignData): string {
  if (!data.brokers.length) return "";
  const rows = chunk(data.brokers, 2);
  return `<tr><td style="background:${COLORS.navy};padding:24px;">
    <table role="presentation" width="100%" style="color:#fff;">${rows
      .map(
        (row) => `<tr>${row
          .map(
            (broker) => `<td style="width:${100 / row.length}%;padding:10px;">
              <table role="presentation"><tr>
                ${broker.headshotSrc ? `<td style="width:80px;padding-right:12px;"><img src="${broker.headshotSrc}" width="80" height="80" style="border-radius:6px;object-fit:cover;"/></td>` : ""}
                <td>
                  <div style="font-weight:700;font-size:16px;">${escapeHtml(broker.name)}</div>
                  <div style="font-size:13px;color:${COLORS.muted};margin-bottom:6px;">${escapeHtml(broker.title)}</div>
                  <div style="font-size:13px;color:${COLORS.muted};">Email: ${escapeHtml(broker.email)}${broker.phone ? `<br/>Cell: ${escapeHtml(broker.phone)}` : ""}</div>
                </td>
              </tr></table>
            </td>`
          )
          .join("")}${row.length === 1 ? "<td></td>" : ""}</tr>`
      )
      .join("")}</table>
  </td></tr>`;
}

function renderHeroSection(data: CampaignData): string {
  return `<tr><td><img src="${data.hero.src}" alt="${escapeHtml(data.hero.alt || "Hero Image")}"/></td></tr>`;
}

function renderCTA(data: CampaignData): string {
  return `<table role="presentation" style="margin-top:20px;"><tr><td>
    <a href="${withUtm(data.cta.href, data.utm)}" style="background:${COLORS.navy};color:#fff;padding:12px 28px;border-radius:4px;font-weight:600;text-decoration:none;display:inline-block;">${escapeHtml(
    data.cta.label
  )}</a>
  </td></tr></table>`;
}

function renderFooter(data: CampaignData): string {
  const links = data.footer.links
    .map(
      (link) =>
        `<a href="${link.href}" style="color:${COLORS.muted};text-decoration:none;margin:0 8px;font-size:12px;">${escapeHtml(link.label)}</a>`
    )
    .join("");
  return `<tr><td style="padding:18px;text-align:center;font-size:12px;color:${COLORS.slate};">
    ${escapeHtml(data.footer.disclaimer)}
    ${links ? `<div style="margin-top:6px;">${links}</div>` : ""}
  </td></tr>`;
}

function withUtm(url: string, utm: CampaignData["utm"]): string {
  const u = new URL(url);
  if (utm.source) u.searchParams.set("utm_source", utm.source);
  if (utm.medium) u.searchParams.set("utm_medium", utm.medium);
  if (utm.campaign) u.searchParams.set("utm_campaign", utm.campaign);
  if (utm.content) u.searchParams.set("utm_content", utm.content);
  return u.toString();
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
