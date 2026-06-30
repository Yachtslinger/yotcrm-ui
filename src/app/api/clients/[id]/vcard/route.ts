import { NextResponse } from "next/server";
import { readContact } from "@/lib/clients/storage";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const contact = await readContact(id);

    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:${contact.last_name || ""};${contact.first_name || ""};;;`,
      `FN:${[contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unknown"}`,
    ];

    if (contact.email) lines.push(`EMAIL:${contact.email}`);
    if (contact.phone) lines.push(`TEL;TYPE=CELL:${contact.phone}`);

    // Add boat info to note if available
    const boat = [contact.boat_year, contact.boat_length ? contact.boat_length + "'" : "", contact.boat_make, contact.boat_model]
      .filter(Boolean).join(" ");
    
    const noteParts: string[] = [];
    if (contact.source) noteParts.push(`Source: ${contact.source}`);
    if (boat) noteParts.push(`Boat: ${boat}`);
    if (contact.boat_price) {
      const price = Number(contact.boat_price);
      if (price > 0) noteParts.push(`Price: $${price.toLocaleString()}`);
    }
    if (contact.listing_url) noteParts.push(`Listing: ${contact.listing_url}`);

    // ── Buyer search criteria (fills in as the lead is qualified) ──
    const money = (v: unknown) => { const n = Number(v); return n > 0 ? "$" + n.toLocaleString() : ""; };
    const budget = [money(contact.budget_min), money(contact.budget_max)].filter(Boolean);
    if (budget.length) noteParts.push(`Budget: ${budget.join("–")}`);
    const loa = [contact.loa_min, contact.loa_max].filter(Boolean);
    if (loa.length) noteParts.push(`Length: ${loa.join("–")} ft`);
    const yr = [contact.year_min, contact.year_max].filter(Boolean);
    if (yr.length) noteParts.push(`Year: ${yr.join("–")}`);
    if (contact.vessel_type_pref) noteParts.push(`Type: ${contact.vessel_type_pref}`);
    if (contact.make_preference) noteParts.push(`Make wanted: ${contact.make_preference}`);
    if (contact.preferred_location) noteParts.push(`Area: ${contact.preferred_location}`);
    if (contact.min_cabins) noteParts.push(`Cabins: ${contact.min_cabins}+`);
    if (contact.engine_type_pref) noteParts.push(`Engine: ${contact.engine_type_pref}`);

    if (noteParts.length > 0) {
      lines.push(`NOTE:${noteParts.join(" | ")}`);
    }

    lines.push("ORG:YotCRM Lead", "CATEGORIES:CRM Leads", "END:VCARD");

    const vcf = lines.join("\r\n");
    const name = [contact.first_name, contact.last_name].filter(Boolean).join("_") || "contact";

    return new NextResponse(vcf, {
      headers: {
        "Content-Type": "text/vcard",
        "Content-Disposition": `attachment; filename="${name}.vcf"`,
      },
    });
  } catch (error) {
    console.error("vCard error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
