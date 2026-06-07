import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const TMP_DB = path.join(os.tmpdir(), `ma_gov_p7_${process.pid}.db`);
for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.rmSync(f, { force: true }); } catch { /* ignore */ } }
process.env.DB_PATH = TMP_DB;

import { createVessel, setVesselField } from "../../src/lib/market-analysis/governance/vessels";
import { createSource } from "../../src/lib/market-analysis/governance/sources";
import { createExtraction } from "../../src/lib/market-analysis/governance/extractions";
import { stageVesselProposals, resolveProposal } from "../../src/lib/market-analysis/governance/proposals";
import { stageComps, reviewComp } from "../../src/lib/market-analysis/governance/comps";
import { createOrRefreshReport, finalizeReport } from "../../src/lib/market-analysis/governance/reports";
import { buildVesselExport } from "../../src/lib/market-analysis/governance/export";
import { getGovernanceDb } from "../../src/lib/market-analysis/governance/db";
import { GovError } from "../../src/lib/market-analysis/governance/errors";

test.after(() => { for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.rmSync(f, { force: true }); } catch { /* ignore */ } } });

const comp = (o: Record<string, unknown>) => ({
  name: "", make: "", model: "", year: "", length: "",
  listedPrice: null, soldPrice: null, askPrice: null,
  listedDate: "", soldDate: "", daysOnMarket: null, location: "", source: "t", ...o,
}) as Parameters<typeof stageComps>[0]["comps"][number];

const MA_TABLES = [
  "ma_schema_meta", "ma_vessels", "ma_vessel_fields", "ma_field_history", "ma_sources",
  "ma_extractions", "ma_vessel_field_proposals", "ma_comps", "ma_comp_field_history",
  "ma_reports", "ma_report_sections", "ma_report_versions",
];
function snapshotCounts(): Record<string, number> {
  const db = getGovernanceDb();
  try {
    const o: Record<string, number> = {};
    for (const t of MA_TABLES) o[t] = (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    return o;
  } finally { db.close(); }
}

// Build a complete governed lineage; return vessel id + a comp id for later corruption.
async function seedFull() {
  const v = createVessel({ displayName: "DealFile", createdBy: "b" });
  setVesselField(v.id, "builder", "Westport", "b");
  setVesselField(v.id, "loa", "112 ft", "b");
  setVesselField(v.id, "askingPrice", "$3,500,000", "b");
  const s = createSource({ kind: "listing", content_text: "FULL SOURCE TEXT for audit", createdBy: "b" });
  createExtraction({ sourceId: s.id, targetType: "vessel", targetId: v.id, model: "test", triggeredBy: "b", extracted: { year: "2001" } });
  // proposals: one accepted, one pending, one rejected
  const [pa] = stageVesselProposals({ vesselId: v.id, sourceId: s.id, extractionId: null, fields: { year: "2001" } });
  resolveProposal(pa.id, { action: "accept", by: "b" });
  stageVesselProposals({ vesselId: v.id, sourceId: s.id, extractionId: null, fields: { flag: "USA" } }); // pending
  const [pr] = stageVesselProposals({ vesselId: v.id, sourceId: s.id, extractionId: null, fields: { staterooms: "5" } });
  resolveProposal(pr.id, { action: "reject", by: "b" });
  // comps: approved closed x2, pending active, rejected closed
  const staged = stageComps({
    vesselId: v.id, sourceId: s.id, extractionId: null,
    comps: [
      comp({ make: "Westport", year: "2000", length: "112 ft", soldPrice: 3300000, soldDate: "2025-10-01" }),
      comp({ make: "Westport", year: "2002", length: "110 ft", soldPrice: 3700000, soldDate: "2025-11-01" }),
      comp({ make: "Westport", year: "2003", length: "112 ft", askPrice: 4200000 }),
      comp({ make: "Westport", year: "1998", length: "106 ft", soldPrice: 2800000, soldDate: "2025-08-01" }),
    ],
    createdBy: "b",
  });
  reviewComp(staged[0].id, { action: "approve", by: "b" });
  reviewComp(staged[1].id, { action: "approve", by: "b" });
  // staged[2] left pending
  reviewComp(staged[3].id, { action: "reject", by: "b" });
  const r = await createOrRefreshReport(v.id, { mode: "seller", by: "b" });
  finalizeReport(r!.report.id, { by: "broker" });
  return { vesselId: v.id, compId: staged[0].id };
}

test("export assembles a complete governed deal file with all sections populated", async () => {
  const { vesselId } = await seedFull();
  const x = buildVesselExport(vesselId);
  assert.equal(x.exportSchemaVersion, 1);
  assert.ok(typeof x.generatedAt === "string" && x.generatedAt.length > 0);
  assert.equal(x.governanceSchemaVersion, 1);
  assert.equal((x.vessel as Record<string, unknown>).id, vesselId);
  assert.ok(x.liveFields.length >= 3);
  assert.ok(x.fieldHistory.length >= 3);
  assert.ok(x.sources.length >= 1);
  assert.ok(x.extractions.length >= 1);
  assert.ok(x.proposals.length >= 3);
  assert.ok(x.comps.length >= 4);
  assert.ok(x.compHistory.length >= 1);
  assert.ok(x.reports.length >= 1);
  assert.ok(x.reportSections.length >= 1);
  assert.ok(x.reportVersions.length >= 1);
  // counts block present and consistent
  assert.equal(x.counts.comps, x.comps.length);
  assert.equal(x.counts.reportVersions, x.reportVersions.length);
});

test("frozen report version snapshot fields export correctly (parsed)", async () => {
  const { vesselId } = await seedFull();
  const x = buildVesselExport(vesselId);
  const ver = x.reportVersions[0] as Record<string, unknown>;
  assert.equal(ver.version, 1);
  assert.equal(ver.finalized_by, "broker");
  const vs = ver.vessel_snapshot as Record<string, unknown>;
  assert.ok((vs.subject as Record<string, unknown>).make === "Westport");
  assert.ok((vs.valuation as Record<string, unknown>).calculatedValue !== undefined);
  assert.ok(Array.isArray(ver.closed_comps));
  assert.ok(Array.isArray(ver.warnings));
  assert.ok("sections" in ver && typeof ver.sections === "object");
});

test("pending AND rejected proposals and comps are included (audit completeness)", async () => {
  const { vesselId } = await seedFull();
  const x = buildVesselExport(vesselId);
  const pStatuses = new Set((x.proposals as Record<string, unknown>[]).map((p) => p.status));
  assert.ok(pStatuses.has("pending") && pStatuses.has("accepted") && pStatuses.has("rejected"));
  const cStatuses = new Set((x.comps as Record<string, unknown>[]).map((c) => c.status));
  assert.ok(cStatuses.has("pending") && cStatuses.has("approved") && cStatuses.has("rejected"));
});

test("malformed JSON-in-TEXT falls back to the raw string (no throw, no data loss)", async () => {
  const { vesselId, compId } = await seedFull();
  const db = getGovernanceDb();
  try { db.prepare(`UPDATE ma_comps SET fields_json = 'not valid json{' WHERE id = ?`).run(compId); } finally { db.close(); }
  const x = buildVesselExport(vesselId);
  const corrupted = (x.comps as Record<string, unknown>[]).find((c) => c.id === compId)!;
  assert.equal(corrupted.fields, "not valid json{"); // raw preserved
});

test("missing vessel -> GovError 404", () => {
  try {
    buildVesselExport(999999);
    assert.fail("expected GovError");
  } catch (err) {
    assert.ok(err instanceof GovError);
    assert.equal((err as GovError).status, 404);
  }
});

test("export is read-only: ma_* row counts unchanged before/after", async () => {
  const { vesselId } = await seedFull();
  const before = snapshotCounts();
  buildVesselExport(vesselId);
  buildVesselExport(vesselId);
  const after = snapshotCounts();
  assert.deepEqual(after, before);
});

test("export object contains only ma_*-derived sections (no market_analyses key)", async () => {
  const { vesselId } = await seedFull();
  const x = buildVesselExport(vesselId) as unknown as Record<string, unknown>;
  assert.ok(!("market_analyses" in x));
  assert.ok(!("marketAnalyses" in x));
});
