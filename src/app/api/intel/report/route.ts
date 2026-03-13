/**
 * Background Report PDF Generator
 * Generates a professional PDF dossier for any enriched lead.
 * GET /api/intel/report?lead_id=5&format=html|json
 */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { getSourcesByProfile, getProfileByLeadId } from "@/lib/intel/storage";

const DB_PATH = process.env.NODE_ENV === "production"
  ? "/tmp/yotcrm.db"
  : path.join(process.cwd(), "data", "yotcrm.db");

export async function GET(req: NextRequest) {
  try {
    const leadId = parseInt(req.nextUrl.searchParams.get("lead_id") || "0");
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

    const db = new Database(DB_PATH, { readonly: true });
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId) as any;
    db.close();
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const profile = getProfileByLeadId(leadId);
    if (!profile) return NextResponse.json({ error: "No enrichment — run Deep Scan first" }, { status: 404 });

    const sources = getSourcesByProfile(profile.id);
    const parse = (v: string) => { try { return JSON.parse(v || "[]"); } catch { return []; } };

    const verifications = parse(lead.identity_verifications);
    const netWorthBreakdown = parse(lead.net_worth_breakdown);
    const courtRecords = parse(lead.court_records);
    const profHistory = parse(lead.professional_history);
    const relatives = parse(lead.relatives);
    const additionalProps = parse(lead.additional_properties);
    const secondaryAddresses = parse(lead.secondary_addresses);

    const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
    const now = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
    const score = profile.score || 0;
    const band = profile.score_band || "unverified";
    const bandColor = band === "excellent" ? "#059669" : band === "strong" ? "#0ea5e9" : band === "moderate" ? "#f59e0b" : band === "weak" ? "#f97316" : "#6b7280";

    const format = req.nextUrl.searchParams.get("format") || "html";
    if (format === "json") {
      return NextResponse.json({
        lead: { id: lead.id, name: fullName, email: lead.email, phone: lead.phone,
          company: lead.company || lead.employer, city: lead.city, state: lead.state },
        score, band, identity_confidence: lead.identity_confidence || 0,
        estimated_net_worth: lead.estimated_net_worth || null,
        net_worth_breakdown: netWorthBreakdown, verifications, court_records: courtRecords,
        professional_history: profHistory, relatives, additional_properties: additionalProps,
        secondary_addresses: secondaryAddresses, spouse: lead.spouse_name || null,
        age: lead.age || lead.date_of_birth || null, sources_count: sources.length,
      });
    }

    const e = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Build HTML sections
    const verificationRows = verifications.map((v: any) => {
      const icon = v.result === "confirmed" ? "✓" : v.result === "partial" ? "~" : v.result === "mismatch" ? "✗" : "—";
      const cls = v.result === "confirmed" ? "pass" : v.result === "partial" ? "partial" : v.result === "mismatch" ? "fail" : "gray";
      return `<tr><td class="check-${cls}" style="font-weight:700;font-size:12pt;">${icon}</td><td>${e(v.method)}</td><td>${e(v.detail)}</td><td style="text-align:right;">${v.weight > 0 ? '+' : ''}${v.weight}</td></tr>`;
    }).join("");

    const nwRows = netWorthBreakdown.map((c: any) => {
      const low = c.low >= 1000000 ? `$${(c.low/1000000).toFixed(1)}M` : `$${(c.low/1000).toFixed(0)}K`;
      const high = c.high >= 1000000 ? `$${(c.high/1000000).toFixed(1)}M` : `$${(c.high/1000).toFixed(0)}K`;
      const badge = c.confidence === "high" ? "green" : c.confidence === "medium" ? "yellow" : "gray";
      return `<tr><td>${e(c.category)}</td><td>${e(c.label)}</td><td>${low} — ${high}</td><td><span class="badge badge-${badge}">${c.confidence}</span></td><td>${e(c.source)}</td></tr>`;
    }).join("");

    const courtRows = courtRecords.map((cr: any) => {
      const badge = cr.type === "Bankruptcy" || cr.type === "Foreclosure" ? "red" : cr.type === "Lawsuit" ? "yellow" : "gray";
      return `<tr><td><span class="badge badge-${badge}">${e(cr.type)}</span></td><td>${e(cr.description?.substring(0, 120) || "")}</td><td>${e(cr.date || "—")}</td><td>${e(cr.court || "—")}</td></tr>`;
    }).join("");

    const historyRows = profHistory.map((ph: any) =>
      `<tr><td style="font-weight:600;">${e(ph.title)}</td><td>${e(ph.company)}</td><td>${e(ph.years || "—")}</td></tr>`
    ).join("");

    const propRows = additionalProps.map((p: any) =>
      `<tr><td>${e(p.address)}</td><td>${e(p.type || "Residential")}</td><td style="font-weight:600;color:#059669;">${e(p.estimated_value || "—")}</td></tr>`
    ).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Background Report — ${e(fullName)}</title>
<style>
@page{margin:.6in .75in;size:letter}*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a2332;font-size:10pt;line-height:1.45}
.hdr{border-bottom:3px solid #1a2332;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-end}
.hdr h1{font-size:22pt;font-weight:800;letter-spacing:-.5px}.hdr .meta{text-align:right;font-size:8pt;color:#6b7280}
.sec{margin-bottom:14px;page-break-inside:avoid}
.sec-t{font-size:9pt;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#374151;border-bottom:1.5px solid #d1d5db;padding-bottom:3px;margin-bottom:8px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 16px}
.fl{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#9ca3af}
.fv{font-size:10pt;font-weight:600;color:#1a2332}.fv.m{color:#9ca3af;font-weight:400}
.sb{display:inline-block;padding:3px 10px;border-radius:4px;font-weight:800;font-size:11pt;color:#fff}
.badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.badge-green{background:#d1fae5;color:#065f46}.badge-red{background:#fee2e2;color:#991b1b}
.badge-yellow{background:#fef3c7;color:#92400e}.badge-gray{background:#f3f4f6;color:#374151}
table{width:100%;border-collapse:collapse;font-size:9pt}
th{text-align:left;font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;border-bottom:1px solid #e5e7eb;padding:4px 6px}
td{padding:4px 6px;border-bottom:1px solid #f3f4f6}
.check-pass{color:#059669}.check-fail{color:#dc2626}.check-partial{color:#d97706}.check-gray{color:#9ca3af}
.disc{font-size:7pt;color:#9ca3af;margin-top:20px;padding-top:8px;border-top:1px solid #e5e7eb}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>

<div class="hdr"><div><h1>BACKGROUND REPORT</h1>
<div style="font-size:16pt;font-weight:600;margin-top:2px">${e(fullName)}</div></div>
<div class="meta"><div>Generated: ${now}</div><div>Lighthouse Intelligence</div><div>${sources.length} sources</div></div></div>

<div class="sec"><div class="sec-t">Subject Overview</div><div class="g3">
<div><div class="fl">Name</div><div class="fv">${e(fullName)}</div></div>
<div><div class="fl">Email</div><div class="fv">${e(lead.email || '—')}</div></div>
<div><div class="fl">Phone</div><div class="fv">${e(lead.phone || '—')}</div></div>
<div><div class="fl">Company</div><div class="fv">${e(lead.company || lead.employer || '—')}</div></div>
<div><div class="fl">Occupation</div><div class="fv">${e(lead.occupation || '—')}</div></div>
<div><div class="fl">Location</div><div class="fv">${e([lead.city,lead.state,lead.zip].filter(Boolean).join(', ') || '—')}</div></div>
<div><div class="fl">Age / DOB</div><div class="fv">${e(lead.age || lead.date_of_birth || '—')}</div></div>
<div><div class="fl">Spouse</div><div class="fv">${e(lead.spouse_name ? lead.spouse_name + (lead.spouse_employer ? ' — '+lead.spouse_employer : '') : '—')}</div></div>
<div><div class="fl">Lead Status</div><div class="fv" style="text-transform:capitalize">${e(lead.status || 'other')}</div></div>
</div></div>

<div class="sec"><div class="sec-t">Credibility Assessment</div>
<div style="display:flex;gap:24px;align-items:center">
<div><div class="fl">Overall Score</div><div class="sb" style="background:${bandColor}">${score}/100 — ${band.toUpperCase()}</div></div>
<div><div class="fl">Identity Confidence</div><div class="sb" style="background:${(lead.identity_confidence||0)>=60?'#059669':(lead.identity_confidence||0)>=30?'#d97706':'#6b7280'}">${lead.identity_confidence||0}%</div></div>
${lead.estimated_net_worth ? `<div><div class="fl">Est. Net Worth</div><div style="font-size:14pt;font-weight:800;color:#059669">${e(lead.estimated_net_worth)}</div></div>` : ''}
</div></div>

${verifications.length > 0 ? `<div class="sec"><div class="sec-t">Identity Verification (${verifications.filter((v:any)=>v.result==='confirmed').length}/${verifications.length} passed)</div>
<table><thead><tr><th></th><th>Method</th><th>Detail</th><th style="text-align:right">Wt</th></tr></thead><tbody>${verificationRows}</tbody></table></div>` : ''}

${netWorthBreakdown.length > 0 ? `<div class="sec"><div class="sec-t">Net Worth Breakdown</div>
<table><thead><tr><th>Category</th><th>Asset</th><th>Range</th><th>Conf.</th><th>Source</th></tr></thead><tbody>${nwRows}</tbody></table></div>` : ''}

${courtRecords.length > 0 ? `<div class="sec"><div class="sec-t">Court Records &amp; Litigation (${courtRecords.length})</div>
<table><thead><tr><th>Type</th><th>Description</th><th>Date</th><th>Court</th></tr></thead><tbody>${courtRows}</tbody></table></div>`
: `<div class="sec"><div class="sec-t">Court Records</div><p style="font-size:9pt;color:#059669;font-weight:600">✓ No bankruptcy, liens, judgments, or litigation found</p></div>`}

${profHistory.length > 0 ? `<div class="sec"><div class="sec-t">Professional History</div>
<table><thead><tr><th>Title</th><th>Company</th><th>Period</th></tr></thead><tbody>${historyRows}</tbody></table></div>` : ''}

${additionalProps.length > 0 ? `<div class="sec"><div class="sec-t">Properties (${additionalProps.length})</div>
<table><thead><tr><th>Address</th><th>Type</th><th>Est. Value</th></tr></thead><tbody>${propRows}</tbody></table></div>` : ''}

${secondaryAddresses.length > 0 ? `<div class="sec"><div class="sec-t">Known Addresses</div>
<div class="g2">${secondaryAddresses.map((a:string) => `<div><div class="fv">${e(a)}</div></div>`).join('')}
${lead.primary_address ? `<div><div class="fl">Primary</div><div class="fv">${e(lead.primary_address)}</div></div>` : ''}</div></div>` : ''}

${relatives.length > 0 ? `<div class="sec"><div class="sec-t">Known Associates &amp; Relatives (${relatives.length})</div>
<div style="display:flex;flex-wrap:wrap;gap:6px">${relatives.map((r:string) => `<span class="badge badge-gray" style="font-size:9pt;padding:3px 8px">${e(r)}</span>`).join('')}</div></div>` : ''}

<div class="sec"><div class="sec-t">OFAC / Sanctions Check</div>
<p style="font-size:9pt;font-weight:600;color:${lead.sanctions_flag ? '#dc2626' : '#059669'}">
${lead.sanctions_flag ? '⚠️ OFAC SANCTIONS MATCH — COMPLIANCE REVIEW REQUIRED' : '✓ OFAC Clear — No sanctions matches found'}</p></div>

<div class="disc">
<strong>DISCLAIMER:</strong> This report was compiled from publicly available data sources including FEC donation records,
SEC EDGAR filings, USCG vessel registrations, FAA aircraft database, OpenCorporates business registries,
IRS 990 nonprofit filings, DuckDuckGo web search, and social media discovery. Information may be incomplete
or inaccurate. This report does not constitute a formal background check and should not be used as the sole
basis for any financial, legal, or business decision. All data should be independently verified.
Manual corrections applied: ${parse(lead.manual_corrections).length || 0}.
Report ID: LH-${lead.id}-${Date.now().toString(36).toUpperCase()}
</div>

</body></html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
