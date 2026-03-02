import { NextResponse } from "next/server";
import { readContact, updateContact, deleteContact } from "@/lib/clients/storage";

export const runtime = "nodejs";

export async function GET(
  _req: Request, 
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const contact = await readContact(id);
  if (!contact) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  return NextResponse.json(contact);
}

export async function PUT(
  req: Request, 
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await req.json();
    const updated = await updateContact(id, {
      first_name: body.first_name ?? body.firstName,
      last_name: body.last_name ?? body.lastName,
      email: body.email,
      phone: body.phone,
      notes: body.notes,
      status: body.status ?? body.Status,
      tags: body.tags,
      occupation: body.occupation,
      employer: body.employer,
      city: body.city,
      state: body.state,
      zip: body.zip,
      linkedin_url: body.linkedin_url,
      facebook_url: body.facebook_url,
      instagram_url: body.instagram_url,
      twitter_url: body.twitter_url,
      net_worth_range: body.net_worth_range,
      board_positions: body.board_positions,
      yacht_clubs: body.yacht_clubs,
      nonprofit_roles: body.nonprofit_roles,
      total_donations: body.total_donations,
      wikipedia_url: body.wikipedia_url,
      website_url: body.website_url,
      media_mentions: body.media_mentions,
      estimated_net_worth: body.estimated_net_worth,
      net_worth_breakdown: body.net_worth_breakdown,
      date_of_birth: body.date_of_birth,
      age: body.age,
      spouse_name: body.spouse_name,
      spouse_employer: body.spouse_employer,
      primary_address: body.primary_address,
      secondary_addresses: body.secondary_addresses,
      identity_confidence: body.identity_confidence,
      identity_verifications: body.identity_verifications,
      manual_corrections: body.manual_corrections,
    });
    if (!updated) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update client", error);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const deleted = await deleteContact(id);
    if (!deleted) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete client", error);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}
