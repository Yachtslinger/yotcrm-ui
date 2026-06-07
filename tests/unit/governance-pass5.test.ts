import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const TMP_DB = path.join(os.tmpdir(), `ma_gov_p5_${process.pid}.db`);
for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.rmSync(f, { force: true }); } catch { /* ignore */ } }
process.env.DB_PATH = TMP_DB;

import { createVessel, setVesselField, getVesselFields } from "../../src/lib/market-analysis/governance/vessels";
import { stageVesselProposals, resolveProposal } from "../../src/lib/market-analysis/governance/proposals";
import { stageComps, reviewComp } from "../../src/lib/market-analysis/governance/comps";
import { createSource } from "../../src/lib/market-analysis/governance/sources";
import { getGovernanceDb } from "../../src/lib/market-analysis/governance/db";
import { buildSubjectAttrs, selectApprovedComps, usableFieldMap } from "../../src/lib/market-analysis/governance/valuation-input";
import { runGovernedValuation } from "../../src/lib/market-analysis/governance/valuation";
import { createOrRefreshReport, getReport } from "../../src/lib/market-analysis/governance/reports";

test.after(() => { for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.rmSync(f, { force: true }); } catch { /* ignore */ } } });

const comp = (o: Record<string, unknown>) => ({
  name: "", make: "", model: "", year: "", length: "",
  listedPrice: null, soldPrice: null, askPrice: null,
  listedDate: "", soldDate: "", daysOnMarket: null, location: "", source: "t", ...o,
}) as Parameters<typeof stageComps>[0]["comps"][number];

// Seed a vessel with usable live fields; returns vessel id.
function seedVessel(name: string) {
  const v = createVessel({ displayName: name });
  setVesselField(v.id, "builder", "Westport", "b");   // verified
  setVesselField(v.id, "loa", "112 ft", "b");          // verified
  setVesselField(v.id, "askingPrice", "$3,500,000", "b");
  // year via accepted proposal -> ai_accepted (also a usable status)
  const s = createSource({ kind: "listing", content_text: "x" });
  const [p] = stageVesselProposals({ vesselId: v.id, sourceId: s.id, extractionId: null, fields: { year: "2001" } });
  resolveProposal(p.id, { action: "accept", by: "b" });
  return { v, s };
}

// Approve N sold comps + optionally an active comp + leave pending/rejected noise.
function seedComps(vesselId: number, sourceId: number) {
  const staged = stageComps({
    vesselId, sourceId, extractionId: null,
    comps: [
      comp({ make: "Westport", year: "2000", length: "112 ft", soldPrice: 3300000, soldDate: "2025-10-01" }), // closed
      comp({ make: "Westport", year: "2002", length: "110 ft", soldPrice: 3700000, soldDate: "2025-11-01" }), // closed
      comp({ make: "Westport", year: "2003", length: "112 ft", askPrice: 4200000 }),                          // active
      comp({ make: "Westport", year: "1999", length: "108 ft", soldPrice: 3000000, soldDate: "2025-09-01" }), // closed (will stay pending)
      comp({ make: "Westport", year: "1998", length: "106 ft", soldPrice: 2800000, soldDate: "2025-08-01" }), // closed (will be rejected)
    ],
    createdBy: "t",
  });
  reviewComp(staged[0].id, { action: "approve", by: "b" });
  reviewComp(staged[1].id, { action: "approve", by: "b" });
  reviewComp(staged[2].id, { action: "approve", by: "b" }); // active approved
  // staged[3] left pending
  reviewComp(staged[4].id, { action: "reject", by: "b" });  // rejected
  return staged;
}

test("usableFieldMap / buildSubjectAttrs use only usable statuses; pending+rejected excluded", () => {
  const { v } = seedVessel("Subject");
  // inject a pending + a rejected field directly to prove exclusion
  const db = getGovernanceDb();
  try {
    db.prepare(`INSERT INTO ma_vessel_fields (vessel_id, field_key, value, status) VALUES (?, 'beam', '25 ft', 'pending')`).run(v.id);
    db.prepare(`INSERT INTO ma_vessel_fields (vessel_id, field_key, value, status) VALUES (?, 'flag', 'XX', 'rejected')`).run(v.id);
  } finally { db.close(); }
  const m = usableFieldMap(getVesselFields(v.id));
  assert.equal(m.builder, "Westport");
  assert.equal(m.year, "2001");
  assert.ok(!("beam" in m));  // pending excluded
  assert.ok(!("flag" in m));  // rejected excluded
  const subj = buildSubjectAttrs(getVesselFields(v.id));
  assert.equal(subj.make, "Westport");
  assert.equal(subj.year, 2001);
  assert.equal(subj.lengthFt, 112);
  assert.equal(subj.askingPrice, 3500000);
  assert.equal(subj.engineHp, null);     // documented gap -> null
  assert.equal(subj.refitScope, "");     // documented gap -> ""
});

test("selectApprovedComps: approved-only, sold/active split, pending+rejected excluded", () => {
  const { v, s } = seedVessel("Comps");
  seedComps(v.id, s.id);
  const db = getGovernanceDb();
  let rows;
  try { rows = db.prepare(`SELECT * FROM ma_comps WHERE vessel_id=?`).all(v.id); } finally { db.close(); }
  const { sold, active } = selectApprovedComps(rows as Parameters<typeof selectApprovedComps>[0]);
  assert.equal(sold.length, 2);    // 2 approved closed (pending + rejected closed excluded)
  assert.equal(active.length, 1);  // 1 approved active
});

test("runGovernedValuation: sold comps feed value; active excluded; value > 0", () => {
  const { v, s } = seedVessel("Valuation");
  seedComps(v.id, s.id);
  const r = runGovernedValuation(v.id, { mode: "seller" });
  assert.equal(r.soldCompCount, 2);
  assert.equal(r.activeCompCount, 1);
  assert.equal(r.valuation.compCount, 2);   // engine used only the 2 approved sold comps
  assert.ok(r.valuation.calculatedValue > 0);
  assert.equal(r.sufficient, true);
});

test("buyer and seller modes yield the same calculated value", () => {
  const { v, s } = seedVessel("Modes");
  seedComps(v.id, s.id);
  const sellerV = runGovernedValuation(v.id, { mode: "seller" }).valuation.calculatedValue;
  const buyerV = runGovernedValuation(v.id, { mode: "buyer" }).valuation.calculatedValue;
  assert.equal(sellerV, buyerV);
});

test("no approved sold comps -> sufficient false, value 0 (no crash)", () => {
  const { v, s } = seedVessel("Empty");
  // approve only an active comp
  const [a] = stageComps({ vesselId: v.id, sourceId: s.id, extractionId: null, comps: [comp({ make: "Westport", year: "2003", length: "112 ft", askPrice: 4000000 })], createdBy: "t" });
  reviewComp(a.id, { action: "approve", by: "b" });
  const r = runGovernedValuation(v.id, { mode: "seller" });
  assert.equal(r.soldCompCount, 0);
  assert.equal(r.valuation.compCount, 0);
  assert.equal(r.sufficient, false);
});

test("report sections created as working mutable sections; no ma_report_versions rows", async () => {
  const { v, s } = seedVessel("Report");
  seedComps(v.id, s.id);
  const res = await createOrRefreshReport(v.id, { mode: "seller", by: "b" });
  assert.ok(res);
  assert.equal(res!.report.version, 0);        // working
  assert.equal(res!.report.status, "draft");
  const keys = res!.sections.map((x) => x.section_key);
  assert.ok(keys.includes("valuationSummary"));
  assert.ok(keys.includes("closedComparables"));
  assert.ok(keys.includes("scorecard"));
  assert.ok(res!.sections.every((x) => x.status === "generated"));
  // re-run is mutable upsert: same report id, no duplicate sections
  const again = await createOrRefreshReport(v.id, { mode: "seller", by: "b" });
  assert.equal(again!.report.id, res!.report.id);
  assert.equal(again!.sections.length, res!.sections.length);
  // CRITICAL: no finalized versions written
  const db = getGovernanceDb();
  try {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ma_report_versions`).get() as { n: number };
    assert.equal(n.n, 0);
  } finally { db.close(); }
});

test("getReport reads back the working report + sections", async () => {
  const { v, s } = seedVessel("Readback");
  seedComps(v.id, s.id);
  const res = await createOrRefreshReport(v.id, { mode: "buyer", by: "b" });
  const got = getReport(res!.report.id);
  assert.equal(got!.report.id, res!.report.id);
  assert.equal(got!.report.mode, "buy");
  assert.ok(got!.sections.length >= 5);
});
