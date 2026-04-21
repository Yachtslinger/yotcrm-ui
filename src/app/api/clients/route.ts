import { NextRequest, NextResponse } from "next/server";
import { readContacts, readContactsPaginated, createContact } from "@/lib/clients/storage";
import { enrichLead } from "@/lib/intel/orchestrator";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page");

    // ── Paginated mode (Phase 0 — prevents 3,271-lead full loads) ────────────
    if (page !== null) {
      const result = await readContactsPaginated({
        page:        parseInt(page) || 1,
        pageSize:    parseInt(searchParams.get("pageSize") || "100"),
        search:      searchParams.get("search")      || "",
        status:      searchParams.get("status")      || "all",
        source:      searchParams.get("source")      || "all",
        intelFilter: searchParams.get("intelFilter") || "all",
        boatFilter:  searchParams.get("boatFilter")  || "",
        sortBy:      searchParams.get("sortBy")      || "newest",
      });
      return NextResponse.json({
        ok: true,
        contacts:  result.contacts,
        total:     result.total,
        counts:    result.counts,
        page:      parseInt(page) || 1,
        pageSize:  parseInt(searchParams.get("pageSize") || "100"),
      });
    }

    // ── Legacy mode (backward compat — no ?page param) ─────────────────────
    // Hard cap at 200 to prevent accidental full-table dumps
    const result = await readContactsPaginated({ page: 1, pageSize: 200 });
    return NextResponse.json({ contacts: result.contacts });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[API Error] GET /api/clients:", message);
    return NextResponse.json(
      { ok: false, error: "Failed to load clients", detail: message, contacts: [] },
      { status: 500 }
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const contact = await createContact({
      first_name: body.first_name ?? body.firstName ?? "",
      last_name:  body.last_name  ?? body.lastName  ?? "",
      email:  body.email  || undefined,
      phone:  body.phone,
      status: body.status,
      notes:  body.notes,
      source: body.source ?? "manual",
      boat:   body.boat,
    });

    // Fire-and-forget: auto-enrich new lead via Lighthouse
    const leadId = Number(contact.id);
    if (leadId) {
      enrichLead(leadId).catch(err =>
        console.error("[Lighthouse] Auto-enrich failed for lead", leadId, err)
      );
    }

    return NextResponse.json(contact, { status: 201 });
  } catch (error: any) {
    if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return NextResponse.json(
        { error: "A lead with this email already exists" },
        { status: 409 }
      );
    }
    console.error("Failed to create client", error);
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}
