import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
export const runtime = "nodejs";

/**
 * GET /api/clients/import-contacts?q=searchTerm
 * Search Apple Contacts via osascript (local Mac only).
 * Returns array of { firstName, lastName, email, phone }
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ contacts: [], error: "Search term must be at least 2 characters" });
  }

  // Escape single quotes for AppleScript
  const safe = q.replace(/'/g, "'\\''");

  const script = `
tell application "Contacts"
  set matchList to every person whose name contains "${safe}"
  set output to ""
  repeat with p in matchList
    set fn to first name of p as text
    set ln to last name of p as text
    set em to ""
    try
      set em to value of first email of p as text
    end try
    set ph to ""
    try
      set ph to value of first phone of p as text
    end try
    set output to output & fn & "\\t" & ln & "\\t" & em & "\\t" & ph & "\\n"
  end repeat
  return output
end tell`;

  try {
    const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 10000 });
    const lines = stdout.trim().split("\n").filter(Boolean);
    const contacts = lines.map(line => {
      const [firstName = "", lastName = "", email = "", phone = ""] = line.split("\t");
      return {
        firstName: firstName.replace(/^missing value$/i, "").trim(),
        lastName: lastName.replace(/^missing value$/i, "").trim(),
        email: email.replace(/^missing value$/i, "").trim(),
        phone: phone.replace(/^missing value$/i, "").trim(),
      };
    }).filter(c => c.firstName || c.lastName || c.email);

    return NextResponse.json({ contacts });
  } catch (err: any) {
    // osascript not available (Railway) or Contacts access denied
    if (err.message?.includes("osascript") || err.message?.includes("not found")) {
      return NextResponse.json({
        contacts: [],
        error: "Apple Contacts search is only available when running locally on Mac"
      });
    }
    console.error("[import-contacts] Error:", err.message);
    return NextResponse.json({ contacts: [], error: err.message || "Search failed" });
  }
}
