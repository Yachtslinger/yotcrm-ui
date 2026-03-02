import { NextResponse } from "next/server";
import { promises as fs } from "fs";

export const runtime = "nodejs";

const CONFIG_PATH = process.env.CONFIG_PATH || "/app/data/config.json";

type Config = {
  paolo: {
    email: string;
    phone: string;
  };
};

type Mode = "email" | "text" | "both";

const DEFAULT_CONFIG: Config = {
  paolo: {
    email: "",
    phone: "",
  },
};

function isValidMode(value: unknown): value is Mode {
  return value === "email" || value === "text" || value === "both";
}

function isValidConfig(value: unknown): value is Config {
  if (!value || typeof value !== "object") return false;
  const paolo = (value as { paolo?: unknown }).paolo;
  if (!paolo || typeof paolo !== "object") return false;
  const email = (paolo as { email?: unknown }).email;
  const phone = (paolo as { phone?: unknown }).phone;
  return typeof email === "string" && typeof phone === "string";
}

async function ensureConfigFile(): Promise<void> {
  try {
    await fs.access(CONFIG_PATH);
  } catch {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  }
}

async function readConfig(): Promise<Config> {
  await ensureConfigFile();
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (isValidConfig(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn("[share/paolo] Failed to read config", err);
  }
  return DEFAULT_CONFIG;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = body as { id?: unknown; mode?: unknown };
  if (typeof payload.id !== "string" || !isValidMode(payload.mode)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const config = await readConfig();
  const needsEmail = payload.mode === "email" || payload.mode === "both";
  const needsText = payload.mode === "text" || payload.mode === "both";

  if (needsEmail && !config.paolo.email.trim()) {
    return NextResponse.json("Set Paolo email in /settings", { status: 400 });
  }
  if (needsText && !config.paolo.phone.trim()) {
    return NextResponse.json("Set Paolo phone in /settings", { status: 400 });
  }

  return NextResponse.json(
    { ok: false, error: "not implemented (sending)", configOk: true },
    { status: 501 }
  );
}
