import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
export const runtime = "nodejs";

/**
 * GET /api/clients/apple-search?q=John
 * Search Apple Contacts via osascript (local Mac only).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ contacts: [], error: "Query must be at least 2 characters" });
  }

  const safe = q.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const script = `
set output to ""
tell application "Contacts"
  set matchedPeople to every person whose name contains "${safe}"
  if (count of matchedPeople) > 50 then
    set matchedPeople to items 1 thru 50 of matchedPeople
  end if
  repeat with p in matchedPeople
    set fn to ""
    set ln to ""
    set em to ""
    set ph to ""
    try
      set fn to first name of p as text
      if fn is "missing value" then set fn to ""
    end try
    try
      set ln to last name of p as text
      if ln is "missing value" then set ln to ""
    end try
    try
      set em to value of first email of p as text
    end try
    try
      set ph to value of first phone of p as text
    end try
    set output to output & fn & tab & ln & tab & em & tab & ph & linefeed
  end repeat
end tell
return output`;

  try {
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const tmpFile = path.join(os.tmpdir(), `yotcrm-contacts-${Date.now()}.scpt`);
    fs.writeFileSync(tmpFile, script);
    const { stdout } = await execAsync(`osascript "${tmpFile}"`, { timeout: 15000 });
    try { fs.unlinkSync(tmpFile); } catch {}

    const contacts = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line: string) => {
        const [firstName = "", lastName = "", email = "", phone = ""] = line.split("\t");
        return {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
        };
      })
      .filter((c: any) => c.firstName || c.lastName || c.email);

    return NextResponse.json({ contacts });
  } catch (err: any) {
    if (err.message?.includes("osascript") || err.message?.includes("ENOENT")) {
      return NextResponse.json({
        contacts: [],
        error: "Apple Contacts only available on local Mac",
        unavailable: true,
      });
    }
    console.error("[apple-search]", err.message);
    return NextResponse.json({ contacts: [], error: err.message }, { status: 500 });
  }
}
