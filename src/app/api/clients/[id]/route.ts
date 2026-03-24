import { NextResponse } from "next/server";
import { readContact, updateContact, deleteContact } from "@/lib/clients/storage";
import { getBatchIds, runMatchesForBatch, generateMatchTodos } from "@/lib/matches/storage";
import { rescoreForLead } from "@/lib/connect/storage";

export const runtime = "nodejs";

// Buyer criteria fields that trigger match recomputation when changed
const CRITERIA_FIELDS = new Set([
  "budget_min","budget_max","loa_min","loa_max","year_min","year_max",
  "make_preference","preferred_location","vessel_type_pref",
  "flybridge_pref","stabilizers_pref","min_cabins","engine_type_pref",
]);

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
      court_records: body.court_records,
      professional_history: body.professional_history,
      relatives: body.relatives,
      additional_properties: body.additional_properties,
      reverify_status: body.reverify_status,
      broker_notes: body.broker_notes,
      // ── Buyer criteria ──────────────────────────────────────────────────────
      budget_min: body.budget_min,
      budget_max: body.budget_max,
      loa_min: body.loa_min,
      loa_max: body.loa_max,
      year_min: body.year_min,
      year_max: body.year_max,
      make_preference: body.make_preference,
      preferred_location: body.preferred_location,
      vessel_type_pref: body.vessel_type_pref,
      flybridge_pref: body.flybridge_pref,
      stabilizers_pref: body.stabilizers_pref,
      min_cabins: body.min_cabins,
      engine_type_pref: body.engine_type_pref,
    });
    if (!updated) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // ── Auto-rerun matches when buyer criteria change ──────────────────────
    // Fire-and-forget — don't block the save response
    const criteriaChanged = Object.keys(body).some(k => CRITERIA_FIELDS.has(k));
    if (criteriaChanged) {
      try {
        const batchIds = getBatchIds();
        for (const batchId of batchIds) {
          runMatchesForBatch(batchId);
          generateMatchTodos(batchId);
        }
        console.log(`[criteria-rerun] Recomputed ${batchIds.length} batches for lead ${id}`);
      } catch (e) {
        console.error("[criteria-rerun] Failed:", e);
        // Non-fatal — criteria saved successfully even if rerun fails
      }
      // ── Also rescore Connect engine pairs for this lead ──────────────────
      try {
        rescoreForLead(parseInt(id));
        console.log(`[connect-rescore] Rescored connect pairs for lead ${id}`);
      } catch (e) {
        console.error("[connect-rescore] Failed:", e);
      }
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
