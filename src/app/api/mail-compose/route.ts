import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { exec } from "child_process";
import os from "os";

export const runtime = "nodejs";

// Only works when running on macOS locally
const IS_MAC = os.platform() === "darwin";
const TMP_DIR = path.join(os.tmpdir(), "yotcrm-attachments");

if (IS_MAC && !fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function download(url: string, dest: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fullUrl = url.startsWith("http") ? url : `https://yotcrm-production.up.railway.app${url}`;
    const mod = fullUrl.startsWith("https") ? https : http;
    const file = fs.createWriteStream(dest);
    const req = (mod as any).get(fullUrl, (res: any) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 308) {
        file.close();
        fs.unlink(dest, () => {});
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(dest); });
    });
    req.on("error", (e: Error) => { file.close(); fs.unlink(dest, () => {}); reject(e); });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Download timeout")); });
  });
}

function esc(s: string) {
  return (s || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function composeInMail(opts: {
  to: string; cc: string; subject: string; body: string; attachments: string[];
}): Promise<void> {
  const { to, cc, subject, body, attachments } = opts;

  const aliasLines = attachments.map((p, i) =>
    `  set attach${i} to (POSIX file "${p}") as alias`
  );
  const attachLines = attachments.map((_, i) =>
    `  tell content of newMessage to make new attachment with properties {file name:attach${i}} at after last paragraph`
  );

  const script = [
    'tell application "Mail"',
    "  activate",
    `  set newMessage to make new outgoing message with properties {subject:"${esc(subject)}", content:"${esc(body)}", visible:true}`,
    "  tell newMessage",
    `    make new to recipient with properties {address:"${esc(to)}"}`,
    cc ? `    make new cc recipient with properties {address:"${esc(cc)}"}` : "",
    "  end tell",
    ...aliasLines,
    ...attachLines,
    "end tell",
  ].filter(Boolean).join("\n");

  const tmpScript = path.join(os.tmpdir(), `yotcrm_compose_${Date.now()}.applescript`);
  fs.writeFileSync(tmpScript, script);

  return new Promise((resolve, reject) => {
    exec(`osascript "${tmpScript}"`, (err, _stdout, stderr) => {
      fs.unlink(tmpScript, () => {});
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}

export async function POST(req: NextRequest) {
  if (!IS_MAC) {
    return NextResponse.json({ ok: false, error: "mail-compose only available on macOS" }, { status: 501 });
  }

  try {
    const { to, cc, subject, body, pdf_urls = [] } = await req.json();
    if (!subject || !body) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // Download each PDF to /tmp/yotcrm-attachments
    const localPaths: string[] = [];
    const skipped: string[] = [];

    for (const pdf of pdf_urls as { url: string; label?: string }[]) {
      const raw = pdf.url || "";
      const filename = decodeURIComponent(raw.split("/").pop() || "attachment.pdf");
      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const dest = path.join(TMP_DIR, safeFilename);
      try {
        await download(raw, dest);
        localPaths.push(dest);
      } catch (e: any) {
        console.warn(`[mail-compose] download failed: ${raw} — ${e.message}`);
        skipped.push(raw);
      }
    }

    await composeInMail({ to: to || "", cc: cc || "", subject, body, attachments: localPaths });

    return NextResponse.json({ ok: true, attached: localPaths.length, skipped });
  } catch (err: any) {
    console.error("[mail-compose] error:", err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
