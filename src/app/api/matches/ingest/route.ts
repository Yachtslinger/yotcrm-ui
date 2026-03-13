import { NextRequest, NextResponse } from "next/server";
import { createBatch, insertListing, runMatchesForBatch, generateMatchTodos, updateBatchCounts } from "@/lib/matches/storage";
import { parseBoatWizardEmail } from "@/lib/matches/parser";
import { parseBoatsGroupEmail } from "@/lib/matches/boatsgroup-parser";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, source, subject, sender } = body;

    if (!content || typeof content !== "string" || content.trim().length < 10) {
      return NextResponse.json({ ok: false, error: "Email content is required (min 10 chars)" }, { status: 400 });
    }

    // Create batch (returns null if duplicate)
    const batch = createBatch(
      source || "manual",
      subject || "Manual paste",
      sender || "",
      content
    );

    if (!batch) {
      return NextResponse.json({ ok: false, error: "Duplicate email — already processed" }, { status: 409 });
    }

    // Detect if this is a BoatsGroup email (from address or content signature)
    const isBoatsGroup = (sender || "").includes("boatsgroup.com") ||
      content.includes("boatsgroup.com") ||
      content.includes("Professional Boat Shopper") ||
      content.includes("ProSeller Platform") ||
      content.includes("boatwizard.com");

    let listingCount = 0;
    let sectionASummary = 0;
    let sectionBSummary = 0;
    let ignoredSections: string[] = [];
    let parseErrors: string[] = [];

    if (isBoatsGroup) {
      // ── New BoatsGroup Section-Aware Parser ──
      const result = parseBoatsGroupEmail(content);
      ignoredSections = result.ignoredSections;
      parseErrors = result.parseErrors;

      for (const section of result.sections) {
        for (const listing of section.listings) {
          insertListing(batch.id, {
            make: listing.make,
            model: listing.model,
            year: listing.year,
            loa: listing.loa,
            asking_price: listing.asking_price,
            location: listing.location,
            listing_url: listing.listing_url,
            vessel_type: listing.vessel_type,
            raw_text: listing.raw_text,
            broker_notes: listing.brokerage,
            section: listing.section,
            brokerage: listing.brokerage,
          });
          listingCount++;
          if (section.tag === "usa") sectionASummary++;
          else sectionBSummary++;
        }
      }

      if (listingCount === 0 && result.totalExtracted === 0) {
        // Fallback: try old parser
        const vessels = parseBoatWizardEmail(content);
        for (const vessel of vessels) {
          insertListing(batch.id, vessel);
          listingCount++;
        }
        if (listingCount === 0) {
          parseErrors.push("BoatsGroup parser found 0 listings, old parser also found 0");
        }
      }
    } else {
      // ── Legacy Parser for non-BoatsGroup emails ──
      const vessels = parseBoatWizardEmail(content);
      for (const vessel of vessels) {
        insertListing(batch.id, vessel);
        listingCount++;
      }
    }

    if (listingCount === 0) {
      return NextResponse.json({
        ok: true,
        batchId: batch.id,
        listingCount: 0,
        matchCount: 0,
        todosCreated: 0,
        warning: "No vessels could be parsed from this email",
        parseErrors,
        ignoredSections,
      });
    }

    // Run match engine
    const matchCount = runMatchesForBatch(batch.id);

    // Generate "Send Boat" todos for Will & Paolo
    const { human: humanTodos, bot: botTodos } = generateMatchTodos(batch.id);
    const todosCreated = humanTodos + botTodos;

    return NextResponse.json({
      ok: true,
      batchId: batch.id,
      listingCount,
      matchCount,
      todosCreated,
      sectionA: sectionASummary,
      sectionB: sectionBSummary,
      ignoredSections,
      parseErrors,
    });
  } catch (err: any) {
    console.error("[matches/ingest] Error:", err);
    return NextResponse.json({ ok: false, error: err.message || "Internal error" }, { status: 500 });
  }
}
