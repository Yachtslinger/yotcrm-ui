import { NextResponse } from "next/server";
import { readContacts, createContact } from "@/lib/clients/storage";
import { enrichLead } from "@/lib/intel/orchestrator";

export const runtime = "nodejs";

export async function GET() {
  try {
    const contacts = await readContacts();
    return NextResponse.json({ contacts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[API Error] GET /api/clients:", message);
    return NextResponse.json({ error: "Failed to load clients", detail: message }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const contact = await createContact({
      first_name: body.first_name ?? body.firstName ?? "",
      last_name: body.last_name ?? body.lastName ?? "",
      email: body.email || undefined,
      phone: body.phone,
      status: body.status,
      notes: body.notes,
      source: body.source ?? "manual",
      boat: body.boat,
    });

    // Fire-and-forget: auto-enrich new lead via Lighthouse
    const leadId = Number(contact.id);
    if (leadId) {
      enrichLead(leadId).catch(err => console.error("[Lighthouse] Auto-enrich failed for lead", leadId, err));
    }

    return NextResponse.json(contact, { status: 201 });
  } catch (error: any) {
    if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return NextResponse.json({ error: "A lead with this email already exists" }, { status: 409 });
    }
    console.error("Failed to create client", error);
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}
