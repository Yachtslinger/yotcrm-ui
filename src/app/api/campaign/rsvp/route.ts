// src/app/api/campaign/rsvp/route.ts
// Branded boat-show RSVP: a form (GET) + submit handler (POST) that saves the
// RSVP, emails Will (Paolo + yotbot always cc'd), and books a calendar event
// when the guest picks a time so it lands on the YotCRM calendar feed.
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { createEvent } from "@/lib/calendar/storage";

export const runtime = "nodejs";
const DB = process.env.DB_PATH || "/data/yotcrm.db";
const BASE = process.env.YOTCRM_BASE_URL || "https://yotcrm-production.up.railway.app";
const YOTBOT = process.env.YOTBOT_EMAIL || "theyotbot@gmail.com";

// A proper iCalendar INVITE (METHOD:REQUEST). Emailed to theyotbot@gmail.com
// (a real Gmail) it auto-lands on that Google Calendar; Will/Paolo get an
// accept card. Floating local time keeps the wall-clock the guest picked.
function icsDT(s: string) { return s.replace(/[-:]/g, "").replace(/\.\d+Z?$/, "").replace(/Z$/, ""); }
function buildInviteICS(event: { id: number; title: string; start_at: string; end_at: string; location: string; notes: string }, guestName: string, guestEmail: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z?$/, "Z");
  const desc = (event.notes || "").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//YotCRM//RSVP//EN", "METHOD:REQUEST", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:yotcrm-rsvp-${event.id}@denisonyachting.com`, `DTSTAMP:${stamp}`,
    `DTSTART:${icsDT(event.start_at)}`, `DTEND:${icsDT(event.end_at)}`,
    `SUMMARY:${event.title.replace(/\n/g, "\\n")}`,
    event.location ? `LOCATION:${event.location.replace(/\n/g, "\\n")}` : "",
    desc ? `DESCRIPTION:${desc}` : "",
    "ORGANIZER;CN=Denison Yachting:mailto:theyotbot@gmail.com",
    "ATTENDEE;CN=Will Noftsinger;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:WN@DenisonYachting.com",
    "ATTENDEE;CN=Paolo Ameglio;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:PGA@DenisonYachting.com",
    "ATTENDEE;CN=YotBot:mailto:theyotbot@gmail.com",
    guestEmail ? `ATTENDEE;CN=${guestName.replace(/[,:;]/g, " ")};RSVP=TRUE:mailto:${guestEmail}` : "",
    "STATUS:CONFIRMED", "SEQUENCE:0", "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

const NAVY = "#0b2a55", GOLD = "#c9a24b", INK = "#334155";
const WILL = { name: "Will Noftsinger", title: "Yacht Broker, Denison Yachting", email: "WN@DenisonYachting.com", cell: "+18504613342", cellD: "(850) 461-3342", photo: "https://cdn.denisonyachtsales.com/images/denison-update/users/photos/69af22d913e91.jpg" };
const PAOLO = { name: "Paolo Ameglio", title: "Yacht Broker, Denison Yachting", email: "PGA@DenisonYachting.com", cell: "+17862512588", cellD: "(786) 251-2588", photo: "https://cdn.denisonyachtsales.com/images/denison-update/users/photos/699c8a181e92f.jpg" };

function esc(s: string) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function attr(s: string) { return esc(s).replace(/'/g, "&#39;"); }

function shell(inner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Denison Yachting</title>
  <style>body{margin:0;background:#eef2f6;font-family:Georgia,'Times New Roman',serif;color:${INK}}
  .wrap{max-width:600px;margin:0 auto;background:#fff}
  .pad{padding:26px 30px}
  input,textarea,select{width:100%;box-sizing:border-box;padding:12px 12px;border:1px solid #d7dee7;border-radius:8px;font-size:15px;font-family:inherit;margin-top:6px;background:#fff;color:${INK}}
  label{display:block;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#7b8aa0;margin-top:16px;font-family:Arial,Helvetica,sans-serif}
  .btn{display:inline-block;background:${GOLD};color:#0b1f3a;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:8px;border:0;font-size:16px;cursor:pointer;font-family:Arial,Helvetica,sans-serif}
  .btn.nav{background:${NAVY};color:#fff}
  .btn.ghost{background:#fff;color:${NAVY};border:2px solid ${NAVY}}
  .chip{display:inline-block;background:#fff;border:2px solid ${NAVY};color:${NAVY};border-radius:8px;padding:10px 16px;text-decoration:none;font-weight:bold;font-family:Arial,Helvetica,sans-serif;font-size:14px;margin:4px 6px 4px 0}
  .card{border-top:1px solid #e6eaf0;padding:16px 30px;display:flex;gap:14px;align-items:center}
  .card img{width:64px;height:64px;border-radius:50%;object-fit:cover}
  a{color:${NAVY}}
  </style></head><body><div class="wrap">
  <div style="font-size:0"><img src="${BASE}/denison-header.png" alt="Denison Yachting" width="600" style="width:100%;display:block"></div>
  <div style="background:${GOLD};height:4px"></div>
  ${inner}
  <div class="card"><img src="${WILL.photo}" alt="${attr(WILL.name)}"><div><div style="font-weight:bold;color:${NAVY};font-size:16px">${esc(WILL.name)}</div><div style="font-size:13px;font-family:Arial,Helvetica,sans-serif">${esc(WILL.title)}</div><div style="font-size:13px;font-family:Arial,Helvetica,sans-serif">${esc(WILL.email)} &middot; ${esc(WILL.cellD)}</div></div></div>
  <div class="card"><img src="${PAOLO.photo}" alt="${attr(PAOLO.name)}"><div><div style="font-weight:bold;color:${NAVY};font-size:16px">${esc(PAOLO.name)}</div><div style="font-size:13px;font-family:Arial,Helvetica,sans-serif">${esc(PAOLO.title)}</div><div style="font-size:13px;font-family:Arial,Helvetica,sans-serif">${esc(PAOLO.email)} &middot; ${esc(PAOLO.cellD)}</div></div></div>
  <div style="text-align:center;color:#8aa;font-size:11px;padding:16px;font-family:Arial,Helvetica,sans-serif">Denison Yachting &middot; 1550 SE 17th Street, Fort Lauderdale, FL</div>
  </div></body></html>`;
}

function contactButtons(showName: string, email: string): string {
  const subj = encodeURIComponent(`${showName || "Boat show"} - let's connect`);
  const body = encodeURIComponent(`Hi Will and Paolo,\n\nI'd like to connect about ${showName || "the show"}.\n\n`);
  const mailto = `mailto:${WILL.email}?cc=${PAOLO.email},${YOTBOT}&subject=${subj}&body=${body}`;
  const sms = `sms:${WILL.cell},${PAOLO.cell}`;
  return `<div style="margin-top:18px">
    <a class="chip" href="${mailto}">Email Will &amp; Paolo</a>
    <a class="chip" href="${sms}">Text Will's cell</a>
    <div style="font-size:11px;color:#9aa6b6;margin-top:6px;font-family:Arial,Helvetica,sans-serif">Paolo and YotBot are copied automatically.</div>
  </div>`;
}

// ─── GET: render the RSVP form ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const email = (q.get("e") || "").trim();
  const show = (q.get("show") || "").trim().slice(0, 120);
  const showName = (q.get("sn") || "").trim().slice(0, 160);
  const showDates = (q.get("sd") || "").trim().slice(0, 120);
  const showLoc = (q.get("sl") || "").trim().slice(0, 160);

  const hdr = `<div class="pad" style="text-align:center">
    <div style="font-size:11px;letter-spacing:3px;color:${GOLD};font-weight:bold;font-family:Arial,Helvetica,sans-serif">YOU'RE INVITED</div>
    <div style="font-size:26px;color:${NAVY};font-weight:bold;margin-top:6px">${esc(showName || "Join us at the show")}</div>
    ${showDates ? `<div style="font-size:14px;color:${INK};margin-top:4px;font-family:Arial,Helvetica,sans-serif">${esc(showDates)}${showLoc ? " &middot; " + esc(showLoc) : ""}</div>` : ""}
    <div style="font-size:14px;color:${INK};margin-top:12px">Let us know you're coming and we'll set aside time to walk a few boats together.</div>
  </div>`;

  const form = `<form method="POST" class="pad" style="padding-top:0">
    <input type="hidden" name="e" value="${attr(email)}">
    <input type="hidden" name="show" value="${attr(show)}">
    <input type="hidden" name="sn" value="${attr(showName)}">
    <input type="hidden" name="sd" value="${attr(showDates)}">
    <label>Your name</label>
    <input name="name" required placeholder="First and last name">
    <label>Email</label>
    <input name="email2" type="email" value="${attr(email)}" placeholder="you@example.com">
    <label>Will you be there?</label>
    <select name="attending"><option value="Yes">Yes, I'll be there</option><option value="Maybe">Maybe / still deciding</option></select>
    <label>Which day(s) will you attend?${showDates ? ` <span style="text-transform:none;letter-spacing:0;color:#9aa6b6">(${esc(showDates)})</span>` : ""}</label>
    <input name="days" placeholder="e.g. Friday and Saturday">
    <label>Pick a time to meet (optional - adds it to Will's calendar)</label>
    <input name="meet_time" type="datetime-local">
    <label>Boats of interest (optional)</label>
    <textarea name="boats" rows="3" placeholder="Builders, sizes, or specific yachts you'd like to see"></textarea>
    <label>Anything else? (optional)</label>
    <textarea name="message" rows="2" placeholder="A note for Will and Paolo"></textarea>
    <div style="margin-top:22px"><button class="btn nav" type="submit">Send my RSVP</button></div>
    <div style="border-top:1px solid #e6eaf0;margin-top:22px;padding-top:8px">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#7b8aa0;font-family:Arial,Helvetica,sans-serif">Prefer to reach out directly?</div>
      ${contactButtons(showName, email)}
    </div>
  </form>`;

  return new NextResponse(shell(hdr + form), { headers: { "Content-Type": "text/html" } });
}

// ─── POST: save + notify + calendar + thank-you ──────────────────────────────
function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

async function sendNotify(subject: string, html: string, replyTo: string, ics?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const body: any = {
    from: `Denison Yachting <${process.env.RESEND_FROM_EMAIL || "will@mail.theyachtcache.com"}>`,
    to: [WILL.email],
    cc: [PAOLO.email, YOTBOT],
    reply_to: replyTo || WILL.email,
    subject,
    html,
  };
  if (ics) body.attachments = [{ filename: "invite.ics", content: Buffer.from(ics).toString("base64"), content_type: "text/calendar; method=REQUEST; charset=utf-8" }];
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch { /* non-fatal */ }
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); } catch { return new NextResponse(shell(`<div class="pad">Something went wrong. Please reply to the invitation email.</div>`), { headers: { "Content-Type": "text/html" } }); }
  const g = (k: string) => String(form.get(k) || "").trim();

  const email = (g("email2") || g("e")).toLowerCase();
  const show = g("show");
  const showName = g("sn");
  const showDates = g("sd");
  const name = g("name") || "A guest";
  const attending = g("attending") || "Yes";
  const days = g("days");
  const meetTime = g("meet_time");
  const boats = g("boats");
  const message = g("message");

  // Save
  try {
    const db = new Database(DB);
    db.exec(`CREATE TABLE IF NOT EXISTS campaign_rsvps (email TEXT NOT NULL, show TEXT NOT NULL DEFAULT '', response TEXT NOT NULL DEFAULT 'yes', created_at TEXT NOT NULL, PRIMARY KEY (email, show))`);
    for (const col of ["name TEXT", "attending TEXT", "days TEXT", "meet_time TEXT", "boats TEXT", "message TEXT"]) {
      try { db.exec(`ALTER TABLE campaign_rsvps ADD COLUMN ${col}`); } catch { /* exists */ }
    }
    db.prepare(`INSERT INTO campaign_rsvps (email, show, response, name, attending, days, meet_time, boats, message, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(email, show) DO UPDATE SET response=excluded.response, name=excluded.name, attending=excluded.attending,
        days=excluded.days, meet_time=excluded.meet_time, boats=excluded.boats, message=excluded.message, created_at=excluded.created_at`)
      .run(email, show, attending.toLowerCase(), name, attending, days, meetTime, boats, message);
    db.close();
  } catch { /* non-fatal */ }

  // Calendar event if a time was chosen
  let ics: string | undefined;
  let meetLabel = "";
  if (meetTime) {
    try {
      const start = new Date(meetTime);
      if (!isNaN(start.getTime())) {
        const end = new Date(start.getTime() + 30 * 60000);
        const notesLines = [`Guest: ${name} <${email}>`, days ? `At show: ${days}` : "", boats ? `Boats of interest: ${boats}` : "", message ? `Note: ${message}` : ""].filter(Boolean).join("\n");
        const { event } = createEvent({
          title: `Show meeting: ${name} (${showName || show})`,
          event_type: "showing",
          start_at: localIso(start),
          end_at: localIso(end),
          location: [showName, showDates].filter(Boolean).join(" - "),
          notes: notesLines,
          assigned_users: ["will", "paolo"],
          actor: "rsvp",
        });
        ics = buildInviteICS(event, name, email);
        meetLabel = start.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      }
    } catch { /* calendar optional */ }
  }

  // Notify Will + Paolo + yotbot
  const rows = [
    ["Guest", `${esc(name)} &lt;${esc(email)}&gt;`],
    ["Show", esc(showName || show)],
    ["Attending", esc(attending)],
    ["Day(s)", esc(days) || "-"],
    ["Meeting", meetLabel ? esc(meetLabel) + " (added to calendar)" : "-"],
    ["Boats of interest", esc(boats) || "-"],
    ["Note", esc(message) || "-"],
  ].map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:${GOLD};font-size:12px;font-weight:bold;white-space:nowrap;vertical-align:top;font-family:Arial,Helvetica,sans-serif">${k}</td><td style="padding:6px 0;color:${INK};font-size:14px;font-family:Arial,Helvetica,sans-serif">${v}</td></tr>`).join("");
  const notifyHtml = `<div style="font-family:Arial,Helvetica,sans-serif"><h2 style="color:${NAVY}">New RSVP${meetLabel ? " + meeting booked" : ""}</h2><table>${rows}</table>
    <p style="margin-top:14px"><a href="mailto:${esc(email)}">Reply to ${esc(name)}</a></p></div>`;
  await sendNotify(`RSVP: ${name} - ${showName || show}${meetLabel ? " (meeting " + meetLabel + ")" : ""}`, notifyHtml, email, ics);

  // Thank-you page
  const gcal = meetTime && !isNaN(new Date(meetTime).getTime()) ? (() => {
    const s = new Date(meetTime); const e = new Date(s.getTime() + 30 * 60000);
    const fmt = (d: Date) => localIso(d).replace(/[-:]/g, "");
    const text = encodeURIComponent(`Meet Will Noftsinger - ${showName || "boat show"}`);
    const det = encodeURIComponent(`Denison Yachting. ${boats ? "Boats: " + boats : ""}`);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmt(s)}/${fmt(e)}&details=${det}`;
  })() : "";

  const ty = `<div class="pad" style="text-align:center">
    <div style="font-size:11px;letter-spacing:3px;color:${GOLD};font-weight:bold;font-family:Arial,Helvetica,sans-serif">RSVP RECEIVED</div>
    <div style="font-size:26px;color:${NAVY};font-weight:bold;margin-top:8px">Thank you, ${esc(name.split(" ")[0] || name)}.</div>
    <div style="font-size:15px;color:${INK};margin-top:12px">Will and Paolo have your RSVP for <strong>${esc(showName || "the show")}</strong>${meetLabel ? ` and your meeting on <strong>${esc(meetLabel)}</strong> is on the calendar.` : "."} We'll be in touch to line up the yachts worth your time.</div>
    ${gcal ? `<div style="margin-top:18px"><a class="btn" href="${gcal}" target="_blank">Add the meeting to your calendar</a></div>` : ""}
    <div style="border-top:1px solid #e6eaf0;margin-top:22px;padding-top:8px;text-align:left">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#7b8aa0;font-family:Arial,Helvetica,sans-serif">Reach us anytime</div>
      ${contactButtons(showName, email)}
    </div>
  </div>`;
  return new NextResponse(shell(ty), { headers: { "Content-Type": "text/html" } });
}
