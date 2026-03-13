import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const UPLOAD_DIR = process.env.LISTING_FILES_DIR
  || path.join(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/app/data", "listing-files");

export async function POST(req: NextRequest) {
  try {
    const { to, cc, subject, body, pdf_urls, from_name, from_email } = await req.json();

    if (!to || !subject || !body) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "RESEND_API_KEY not set" }, { status: 500 });

    // Build attachments array from stored PDF files
    const attachments: { filename: string; content: string }[] = [];
    const skipped: string[] = [];

    for (const pdf of (pdf_urls || [])) {
      try {
        const rawUrl = pdf.url || "";
        // Handle both "/api/listings/files/foo.pdf" and full URLs
        const filename = decodeURIComponent(rawUrl.split("/").pop() || "");
        if (!filename || filename.includes("..") || filename.includes("/")) {
          skipped.push(`bad-filename:${rawUrl}`);
          continue;
        }
        const filepath = path.join(UPLOAD_DIR, filename);
        console.log(`[listings/send] checking file: ${filepath}`);
        if (fs.existsSync(filepath)) {
          const buffer = fs.readFileSync(filepath);
          const attachFilename = pdf.label
            ? `${pdf.label.replace(/[^a-zA-Z0-9 _-]/g, "")}.pdf`
            : filename;
          attachments.push({ filename: attachFilename, content: buffer.toString("base64") });
          console.log(`[listings/send] attached: ${attachFilename} (${buffer.length} bytes)`);
        } else {
          skipped.push(`not-found:${filepath}`);
          console.warn(`[listings/send] file not found: ${filepath}`);
          // List what IS in the upload dir for debugging
          try {
            const dirFiles = fs.readdirSync(UPLOAD_DIR);
            console.log(`[listings/send] UPLOAD_DIR contents (${dirFiles.length}):`, dirFiles.slice(0, 10));
          } catch (e) {
            console.warn(`[listings/send] UPLOAD_DIR not readable: ${UPLOAD_DIR}`);
          }
        }
      } catch (e: any) {
        skipped.push(`error:${e.message}`);
        console.error(`[listings/send] attachment error:`, e.message);
      }
    }

    // Convert plain text body to simple HTML
    const htmlBody = body
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>")
      .replace(/📄 ([^<:]+): (https?:\/\/[^\s<]+)/g,
        '📄 <a href="$2" style="color:#0a2e5c">$1</a>')
      .replace(/🔗 ([^<:]+): (https?:\/\/[^\s<]+)/g,
        '🔗 <a href="$2" style="color:#0a2e5c">$1</a>');

    const html = `<div style="font-family:Georgia,serif;font-size:15px;line-height:1.7;color:#111;max-width:600px">${htmlBody}</div>`;

    const payload: Record<string, unknown> = {
      from: `${from_name || "Will Noftsinger"} <${from_email || process.env.RESEND_FROM_EMAIL || "will@mail.theyachtcache.com"}>`,
      reply_to: "WN@DenisonYachting.com",
      to: [to],
      subject,
      html,
      ...(attachments.length > 0 ? { attachments } : {}),
    };
    if (cc) payload.cc = [cc];

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) return NextResponse.json({ ok: false, error: data.message || "Resend error" }, { status: 500 });

    return NextResponse.json({ ok: true, id: data.id, attachments: attachments.length, skipped });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
