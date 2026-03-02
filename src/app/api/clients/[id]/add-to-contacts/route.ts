import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { readContacts, type Contact } from "@/lib/clients/storage";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = process.env.SCRIPTS_DIR ? process.env.SCRIPTS_DIR + "/add_lead_to_contacts.sh" : "/app/scripts/add_lead_to_contacts.sh";

export const runtime = "nodejs";

function findContact(contacts: Contact[], id: string): Contact | undefined {
  return contacts.find(
    (c) => String(c.id) === id || String(c.created_at) === id
  );
}

function deriveStatus(contact: Contact): string {
  const tagStatus =
    contact.tags?.find((t) =>
      ["hot", "warm", "cold", "other", "nurture"].includes(
        (t || "").toLowerCase()
      )
    ) || "";
  return tagStatus || "";
}

export async function POST(
  _req: Request, 
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const contacts = await readContacts();
    const contact = findContact(contacts, id);

    if (!contact) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const status = deriveStatus(contact);

    await execFileAsync(SCRIPT_PATH, [
      contact.first_name ?? "",
      contact.last_name ?? "",
      contact.email ?? "",
      contact.phone ?? "",
      status,
      contact.notes ?? "",
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to add contact", error);
    return NextResponse.json(
      { error: "Failed to add contact" },
      { status: 500 }
    );
  }
}
