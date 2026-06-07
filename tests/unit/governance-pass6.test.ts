import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const TMP_DB = path.join(os.tmpdir(), `ma_gov_p6_${process.pid}.db`);
for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.rmSync(f, { force: true }); } catch { /* ignore */ } }
process.env.DB_PATH = TMP_DB;

import { createVessel, setVesselField } from "../../src/lib/market-analysis/governance/vessels";
import { stageVesselProposals, resolveProposal } from "../../src/lib/market-analysis/governance/proposals";
import { stageComps, reviewComp } from "../../src/lib/market-analysis/governance/comps";
import { createSource } from "../../src/lib/market-analysis/governance/sources";
import { getGovernanceDb } from "../../src/lib/market-analysis/governance/db";
import { createOrRefreshReport, finalizeReport, getReportVersion, listReportVersions } from "../../src/lib/market-analysis/governance/reports";

test.after(() => { for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.rmSync(f, { force: true }); } catch { /* ignore */ } } });

const comp = (o: Record<string, unknown>) => ({
  name: "", make: "", model: "", year: "", length: "",
  listedPrice: null, soldPrice: null, askPrice: null,
  listedDate: "", soldDate: "", daysOnMarket: null, location: "", source: "t", ...o,
}) as Parameters<typeof stageComps>[0]["comps"][number];

// Seed a vessel with usable fields + approved sold/active comps; return ids.
function seed(name: string) {
  const v = createVessel({ displayName: name });
  setVesselField(v.id, "builder", "Westport", "b");
  setVesselField(v.id, "loa", "112 ft", "b");
  setVesselField(v.id, "askingPrice", "$3,500,000", "b");
  const s = createSource({ kind: "listing", content_text: "x" });
  const [p] = stageVesselProposals({ vesselId: v.id, sourceId: s.id, extractionId: null, fields: { year: "2001" } });
  resolveProposal(p.id, { action: "accept", by: "b" });
  const staged = stageComps({
    vesselId: v.id, sourceId: s.id, extractionId: null,
    comps: [
      comp({ make: "Westport", year: "2000", length: "112 ft", soldPrice: 3300000, soldDate: "2025-10-01" }),
      comp({ make: "Westport", year: "2002", length: "110 ft", soldPrice: 3700000, soldDate: "2025-11-01" }),
      comp({ make: "Westport", year: "2003", length: "112 ft", askPrice: 4200000 }),
    ],
    createdBy: "t",
  });
  reviewComp(staged[0].id, { action: "approve", by: "b" });
  reviewComp(staged[1].id, { action: "approve", by: "b" });
  reviewComp(staged[2].id, { action: "approve", by: "b" });
  return { v, s };
}

test("finalize writes a complete immutable snapshot to ma_report_versions", async () => {
  const { v } = seed("Finalize");
  const r = await createOrRefreshReport(v.id, { mode: "seller", by: "b" });
  const { report, version } = finalizeReport(r!.report.id, { by: "broker" });
  assert.equal(version.report_id, report.id);
  assert.equal(version.version, 1);
  assert.equal(version.finalized_by, "broker");

  const snap = getReportVersion(report.id, 1)!;
  // complete governed payload
  const vs = snap.vessel_snapshot as Record<string, unknown>;
  assert.equal((vs.mode as string), "seller");
  assert.ok((vs.subject as Record<string, unknown>).make === "Westport");
  assert.ok((vs.valuation as Record<string, unknown>).calculatedValue !== undefined);
  assert.ok(Array.isArray(vs.fields) && (vs.fields as unknown[]).length >= 3); // usable field lineage
  assert.equal((snap.closed_comps as unknown[]).length, 2); // sold comps used for math
  assert.equal((snap.active_comps as unknown[]).length, 1); // context only
  const sections = snap.sections as Record<string, unknown>;
  assert.ok("valuationSummary" in sections && "scorecard" in sections);
  assert.ok(snap.confidence !== null);

  // count grew
  const db = getGovernanceDb();
  try {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ma_report_versions`).get() as { n: number };
    assert.ok(n.n >= 1);
  } finally { db.close(); }
});

test("finalized version rows cannot be updated or deleted (immutability triggers)", async () => {
  const { v } = seed("Immutable");
  const r = await createOrRefreshReport(v.id, { mode: "seller", by: "b" });
  const { version } = finalizeReport(r!.report.id, { by: "b" });
  const db = getGovernanceDb();
  try {
    assert.throws(() => db.prepare("UPDATE ma_report_versions SET confidence='0' WHERE id=?").run(version.id), /immutable/i);
    assert.throws(() => db.prepare("DELETE FROM ma_report_versions WHERE id=?").run(version.id), /immutable/i);
  } finally { db.close(); }
});

test("re-finalize is deterministic: creates the next incrementing version", async () => {
  const { v } = seed("Reversion");
  const r = await createOrRefreshReport(v.id, { mode: "seller", by: "b" });
  const a = finalizeReport(r!.report.id, { by: "b" });
  const b = finalizeReport(r!.report.id, { by: "b" });
  assert.equal(a.version.version, 1);
  assert.equal(b.version.version, 2);
  const versions = listReportVersions(r!.report.id);
  assert.deepEqual(versions.map((x) => x.version), [1, 2]);
});

test("editing the working report after finalize does NOT mutate the frozen snapshot", async () => {
  const { v } = seed("Independence");
  const r = await createOrRefreshReport(v.id, { mode: "seller", by: "b" });
  finalizeReport(r!.report.id, { by: "b" });
  const before = JSON.stringify(getReportVersion(r!.report.id, 1)!.sections);

  // mutate a working section (working rows remain mutable)
  const db = getGovernanceDb();
  try {
    db.prepare(`UPDATE ma_report_sections SET content_json='{"tampered":true}' WHERE report_id=? AND section_key='valuationSummary'`).run(r!.report.id);
  } finally { db.close(); }

  const after = JSON.stringify(getReportVersion(r!.report.id, 1)!.sections);
  assert.equal(before, after); // snapshot is an independent copy
  // and the working section really did change (sanity)
  const db2 = getGovernanceDb();
  try {
    const row = db2.prepare(`SELECT content_json FROM ma_report_sections WHERE report_id=? AND section_key='valuationSummary'`).get(r!.report.id) as { content_json: string };
    assert.match(row.content_json, /tampered/);
  } finally { db2.close(); }
});

test("working report stays mutable before finalize (refresh upserts, version 0)", async () => {
  const { v } = seed("Working");
  const first = await createOrRefreshReport(v.id, { mode: "seller", by: "b" });
  assert.equal(first!.report.version, 0);
  const again = await createOrRefreshReport(v.id, { mode: "seller", by: "b" });
  assert.equal(again!.report.id, first!.report.id);
  // no versions until finalize
  assert.equal(listReportVersions(first!.report.id).length, 0);
});

test("finalize on a missing report -> 404 (GovError)", async () => {
  const { GovError } = await import("../../src/lib/market-analysis/governance/errors");
  try {
    finalizeReport(999999, { by: "b" });
    assert.fail("expected GovError");
  } catch (err) {
    assert.ok(err instanceof GovError);
    assert.equal((err as InstanceType<typeof GovError>).status, 404);
  }
});
