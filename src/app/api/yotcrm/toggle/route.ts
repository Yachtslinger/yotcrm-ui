import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const state = body?.state;

    if (state !== "on" && state !== "off") {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }

    const scriptPath =
      state === "on"
        ? "/app/scripts/yotcrm_on.sh"
        : "/app/scripts/yotcrm_off.sh";

    await execFileAsync(scriptPath);

    return NextResponse.json({ ok: true, state }, { status: 200 });
  } catch (error) {
    console.error("Failed to toggle YotCRM services", error);
    return NextResponse.json(
      { error: "Failed to toggle YotCRM services" },
      { status: 500 }
    );
  }
}
