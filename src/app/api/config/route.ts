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

const DEFAULT_CONFIG: Config = {
  paolo: {
    email: "",
    phone: "",
  },
};

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
  const raw = await fs.readFile(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!isValidConfig(parsed)) {
    throw new Error("Invalid config format");
  }
  return parsed;
}

async function writeConfig(config: Config): Promise<void> {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export async function GET(): Promise<NextResponse> {
  try {
    const config = await readConfig();
    return NextResponse.json(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to read config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidConfig(body)) {
    return NextResponse.json({ error: "Invalid config payload" }, { status: 400 });
  }

  try {
    await writeConfig({
      paolo: {
        email: body.paolo.email,
        phone: body.paolo.phone,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to write config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
