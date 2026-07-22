import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

// GET /api/calls/audio/[id] — stream a call recording
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const row = db.prepare(`SELECT filename FROM call_recordings WHERE id=?`).get(Number(id)) as { filename: string } | undefined;
    if (!row?.filename) return new Response("not found", { status: 404 });
    const file = path.join(path.dirname(DB_PATH), "calls", row.filename);
    if (!fs.existsSync(file)) return new Response("file missing", { status: 404 });
    const buf = fs.readFileSync(file);
    const type = row.filename.endsWith(".m4a") ? "audio/mp4" : "audio/webm";
    return new Response(new Uint8Array(buf), { headers: { "content-type": type, "content-length": String(buf.length) } });
  } finally { db.close(); }
}
