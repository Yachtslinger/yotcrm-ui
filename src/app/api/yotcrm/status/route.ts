import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const [watcherResult, emailResult] = await Promise.all([
      execAsync("launchctl list | grep com.yotcrm.watcher || true"),
      execAsync("launchctl list | grep com.yotcrm.emailprocessor || true"),
    ]);

    const watcherOutput = watcherResult.stdout ?? "";
    const emailOutput = emailResult.stdout ?? "";

    const isOn =
      watcherOutput.includes("com.yotcrm.watcher") &&
      emailOutput.includes("com.yotcrm.emailprocessor");

    return NextResponse.json({ isOn }, { status: 200 });
  } catch (error) {
    console.error("YotCRM status check failed", error);
    return NextResponse.json(
      { error: "YotCRM status check failed" },
      { status: 500 }
    );
  }
}
