import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

// ── GET: fetch bot queue with optional status filter ──────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending"; // pending | approved | sent | all
    const db = new Database(DB_PATH);
    try {
      // Safe migrations
      try { db.exec("ALTER TABLE todos ADD COLUMN bot_status TEXT DEFAULT 'pending'"); } catch {}
      try { db.exec("ALTER TABLE todos ADD COLUMN sent_at TEXT"); } catch {}
      try { db.exec("ALTER TABLE todos ADD COLUMN send_error TEXT"); } catch {}

      let where = "t.queue = 'bot' AND t.completed = 0";
      if (status !== "all") where += ` AND (t.bot_status = '${status}' OR t.bot_status IS NULL)`;

      const todos = db.prepare(`
        SELECT t.*,
          CASE WHEN t.lead_id IS NOT NULL THEN (l.first_name || ' ' || l.last_name) ELSE NULL END as lead_name,
          CASE WHEN t.lead_id IS NOT NULL THEN l.email ELSE NULL END as lead_email,
          CASE WHEN t.lead_id IS NOT NULL THEN l.phone ELSE NULL END as lead_phone
        FROM todos t
        LEFT JOIN leads l ON t.lead_id = l.id
        WHERE ${where}
        ORDER BY t.priority = 'high' DESC, t.created_at DESC
        LIMIT 200
      `).all() as any[];

      const counts = db.prepare(`
        SELECT bot_status, COUNT(*) as cnt FROM todos WHERE queue='bot' AND completed=0 GROUP BY bot_status
      `).all() as any[];

      return NextResponse.json({ ok: true, todos, counts });
    } finally { db.close(); }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// ── POST: approve, unapprove, or execute approved items ──────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ids, id } = body;
    const db = new Database(DB_PATH);
    try {
      try { db.exec("ALTER TABLE todos ADD COLUMN bot_status TEXT DEFAULT 'pending'"); } catch {}
      try { db.exec("ALTER TABLE todos ADD COLUMN sent_at TEXT"); } catch {}
      try { db.exec("ALTER TABLE todos ADD COLUMN send_error TEXT"); } catch {}

      // Approve one or many
      if (action === "approve") {
        const targets = ids || (id ? [id] : []);
        for (const tid of targets) {
          db.prepare("UPDATE todos SET bot_status='approved' WHERE id=?").run(tid);
        }
        return NextResponse.json({ ok: true, approved: targets.length });
      }

      // Unapprove (move back to pending)
      if (action === "unapprove") {
        const targets = ids || (id ? [id] : []);
        for (const tid of targets) {
          db.prepare("UPDATE todos SET bot_status='pending' WHERE id=?").run(tid);
        }
        return NextResponse.json({ ok: true });
      }

      // Execute: send all approved items via Resend
      if (action === "execute") {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) return NextResponse.json({ ok: false, error: "RESEND_API_KEY not set" }, { status: 500 });

        const approved = db.prepare(`
          SELECT t.*, l.email as lead_email, l.first_name, l.last_name
          FROM todos t LEFT JOIN leads l ON t.lead_id = l.id
          WHERE t.queue='bot' AND t.bot_status='approved' AND t.completed=0
          LIMIT 50
        `).all() as any[];

        let sent = 0; let failed = 0;
        const results: { id: number; name: string; status: string; error?: string }[] = [];

        for (const todo of approved) {
          if (!todo.email_draft) {
            db.prepare("UPDATE todos SET bot_status='error', send_error='No email draft' WHERE id=?").run(todo.id);
            failed++;
            results.push({ id: todo.id, name: todo.lead_name || "?", status: "error", error: "No email draft" });
            continue;
          }

          // Parse the email draft
          const lines = (todo.email_draft as string).split("\n");
          const toLine = lines.find(l => l.startsWith("To:"))?.replace("To:", "").trim();
          const subjLine = lines.find(l => l.startsWith("Subject:"))?.replace("Subject:", "").trim();
          const bodyStart = lines.findIndex(l => l.startsWith("Hi "));
          const emailBody = bodyStart >= 0 ? lines.slice(bodyStart).join("\n") : lines.slice(3).join("\n");
          const recipientEmail = toLine === "[client email]" ? null : toLine;

          if (!recipientEmail) {
            db.prepare("UPDATE todos SET bot_status='error', send_error='No recipient email' WHERE id=?").run(todo.id);
            failed++;
            results.push({ id: todo.id, name: todo.lead_name || "?", status: "error", error: "No recipient email" });
            continue;
          }

          const html = `<div style="font-family:Georgia,serif;font-size:15px;line-height:1.8;color:#111;max-width:600px">${
            emailBody.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")
              .replace(/📄 ([^<:]+): (https?:\/\/[^\s<]+)/g,'📄 <a href="$2" style="color:#0a2e5c">$1</a>')
              .replace(/🔗 ([^<:]+): (https?:\/\/[^\s<]+)/g,'🔗 <a href="$2" style="color:#0a2e5c">$1</a>')
          }</div>`;

          try {
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: "Will Noftsinger <will@mail.theyachtcache.com>",
                to: [recipientEmail],
                subject: subjLine || todo.text.slice(0, 80),
                html,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Resend error");

            const now = new Date().toISOString();
            db.prepare("UPDATE todos SET bot_status='sent', sent_at=?, completed=1, completed_at=? WHERE id=?").run(now, now, todo.id);
            sent++;
            results.push({ id: todo.id, name: todo.lead_name || "?", status: "sent" });
          } catch (e: any) {
            db.prepare("UPDATE todos SET bot_status='error', send_error=? WHERE id=?").run(e.message, todo.id);
            failed++;
            results.push({ id: todo.id, name: todo.lead_name || "?", status: "error", error: e.message });
          }
        }

        return NextResponse.json({ ok: true, sent, failed, results });
      }

      return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    } finally { db.close(); }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
