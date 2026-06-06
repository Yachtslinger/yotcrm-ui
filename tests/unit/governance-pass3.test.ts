import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const TMP_DB = path.join(os.tmpdir(), `ma_gov_p3_${process.pid}.db`);
for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
  try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
}
process.env.DB_PATH = TMP_DB;

import { createVessel, listVessels, getVessel, getVesselFields } from "../../src/lib/market-analysis/governance/vessels";
import { detectConflict, stageVesselProposals, listProposals, getProposal } from "../../src/lib/market-analysis/governance/proposals";
import { mapCompRecord, stageComps, listComps, getComp } from "../../src/lib/market-analysis/governance/comps";
import { createExtraction } from "../../src/lib/market-analysis/governance/extractions";
import { createSource } from "../../src/lib/market-analysis/governance/sources";
import { getGovernanceDb } from "../../src/lib/market-analysis/governance/db";

type CompRecord = Parameters<typeof stageComps>[0]["comps"][number];
const comp = (o: Partial<CompRecord>): CompRecord => ({
  name: "", make: "", model: "", year: "", length: "",
  listedPrice: null, soldPrice: null, askPrice: null,
  listedDate: "", soldDate: "", daysOnMarket: null, location: "", source: "test", ...o,
});

test.after(() => {
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
  }
});

test("vessel create/list/get", () => {
  const v = createVessel({ displayName: "Sea Breeze", createdBy: "tester" });
  assert.ok(v.id > 0);
  assert.equal(v.display_name, "Sea Breeze");
  assert.equal(getVessel(v.id)?.id, v.id);
  assert.ok(listVessels().some((x) => x.id === v.id));
});

test("detectConflict truth table", () => {
  assert.equal(detectConflict(null, "120 ft"), false);                                  // no existing value
  assert.equal(detectConflict({ value: "100", status: "unverified" }, "120"), false);   // existing not usable
  assert.equal(detectConflict({ value: "ai_unconfirmed", status: "ai_unconfirmed" }, "x"), false);
  assert.equal(detectConflict({ value: "120", status: "verified" }, "120"), false);      // usable + equal
  assert.equal(detectConflict({ value: "120 FT", status: "verified" }, "120 ft"), false);// normalized equal
  assert.equal(detectConflict({ value: "100", status: "verified" }, "120"), true);       // usable + differ
  assert.equal(detectConflict({ value: "100", status: "ai_accepted" }, "120"), true);
  assert.equal(detectConflict({ value: "100", status: "overridden" }, "120"), true);
});

test("stageVesselProposals skips null/empty and creates pending; live fields untouched", () => {
  const v = createVessel({ displayName: "Proposal Test" });
  const proposals = stageVesselProposals({
    vesselId: v.id, sourceId: null, extractionId: null,
    fields: { builder: "Westport", year: "2001", model: null, loa: "", beam: "23 ft" },
    createdBy: "tester",
  });
  // null (model) and empty ("" loa) skipped -> 3 created
  assert.equal(proposals.length, 3);
  assert.ok(proposals.every((p) => p.status === "pending"));
  // live vessel fields must remain untouched by Pass 3
  assert.equal(getVesselFields(v.id).length, 0);
});

test("stageVesselProposals duplicate guard (same vessel+field+value)", () => {
  const v = createVessel({ displayName: "Dup Test" });
  const first = stageVesselProposals({ vesselId: v.id, sourceId: null, extractionId: null, fields: { builder: "Hatteras" } });
  assert.equal(first.length, 1);
  const second = stageVesselProposals({ vesselId: v.id, sourceId: null, extractionId: null, fields: { builder: "Hatteras" } });
  assert.equal(second.length, 0); // identical pending proposal skipped
  const third = stageVesselProposals({ vesselId: v.id, sourceId: null, extractionId: null, fields: { builder: "Westport" } });
  assert.equal(third.length, 1); // different value -> new proposal
});

test("stageVesselProposals conflict detection against a usable live field", () => {
  const v = createVessel({ displayName: "Conflict Test" });
  // Simulate a Pass-4-style accepted/verified live field (direct insert; test-only).
  const db = getGovernanceDb();
  try {
    db.prepare(`INSERT INTO ma_vessel_fields (vessel_id, field_key, value, status) VALUES (?, 'loa', '100 ft', 'verified')`).run(v.id);
  } finally { db.close(); }
  const conflicting = stageVesselProposals({ vesselId: v.id, sourceId: null, extractionId: null, fields: { loa: "120 ft" } });
  assert.equal(conflicting[0].conflict, 1);
  assert.equal(conflicting[0].current_value_at_proposal, "100 ft");
  const agreeing = stageVesselProposals({ vesselId: v.id, sourceId: null, extractionId: null, fields: { loa: "100 ft" } });
  assert.equal(agreeing[0].conflict, 0);
});

test("proposal list/get", () => {
  const v = createVessel({ displayName: "List Test" });
  const [p] = stageVesselProposals({ vesselId: v.id, sourceId: null, extractionId: null, fields: { year: "1999" } });
  assert.equal(getProposal(p.id)?.id, p.id);
  assert.ok(listProposals({ vesselId: v.id, status: "pending" }).some((x) => x.id === p.id));
});

test("mapCompRecord: closed vs active, discount only from real listed+sold", () => {
  const closed = mapCompRecord(comp({ make: "Westport", year: "2001", length: "112 ft", listedPrice: 3890000, soldPrice: 3300000 }));
  assert.equal(closed.type, "closed");
  assert.equal(closed.builder, "Westport");
  assert.ok(closed.discount != null && closed.discount > 0); // (3890000-3300000)/3890000
  const active = mapCompRecord(comp({ make: "Hatteras", askPrice: 1200000 }));
  assert.equal(active.type, "active");
  assert.equal(active.discount, null); // no sold price -> no invented discount
});

test("stageComps from sample parsed objects + conservative dup guard", () => {
  const v = createVessel({ displayName: "Comp Test" });
  const s = createSource({ kind: "sold", content_text: "comps source" });
  const comps = [
    comp({ make: "Westport", year: "2001", length: "112 ft", soldPrice: 3300000, soldDate: "2025-12-08" }),
    comp({ make: "Hatteras", year: "1997", length: "74 ft", askPrice: 999000 }),
  ];
  const staged = stageComps({ vesselId: v.id, sourceId: s.id, extractionId: null, comps, createdBy: "tester" });
  assert.equal(staged.length, 2);
  assert.ok(staged.every((c) => c.status === "pending"));
  // identical batch from same vessel+source -> all collapsed by dup guard
  const again = stageComps({ vesselId: v.id, sourceId: s.id, extractionId: null, comps });
  assert.equal(again.length, 0);
  assert.ok(listComps({ vesselId: v.id, status: "pending" }).length >= 2);
  assert.ok(getComp(staged[0].id)?.id === staged[0].id);
});

test("extraction log is written before staging and remains immutable", () => {
  const s = createSource({ kind: "listing", content_text: "112 ft 2001 Westport" });
  const v = createVessel({ displayName: "Order Test" });
  // Mimic orchestration order: log first, then stage referencing it.
  const ex = createExtraction({ sourceId: s.id, targetType: "vessel", targetId: v.id, model: "test", extracted: { raw: "{}" } });
  const [p] = stageVesselProposals({ vesselId: v.id, sourceId: s.id, extractionId: ex.id, fields: { builder: "Westport" } });
  assert.equal(p.extraction_id, ex.id);
  const db = getGovernanceDb();
  try {
    assert.throws(() => db.prepare("UPDATE ma_extractions SET model='x' WHERE id=?").run(ex.id), /immutable/);
    assert.throws(() => db.prepare("DELETE FROM ma_extractions WHERE id=?").run(ex.id), /immutable/);
  } finally { db.close(); }
});
