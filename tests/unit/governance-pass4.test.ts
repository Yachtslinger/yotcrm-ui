import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const TMP_DB = path.join(os.tmpdir(), `ma_gov_p4_${process.pid}.db`);
for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
  try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
}
process.env.DB_PATH = TMP_DB;

import { createVessel, getVesselFields, setVesselField, verifyVesselField } from "../../src/lib/market-analysis/governance/vessels";
import { stageVesselProposals, resolveProposal, resolvedFieldStatus, getProposal } from "../../src/lib/market-analysis/governance/proposals";
import { stageComps, reviewComp, getComp } from "../../src/lib/market-analysis/governance/comps";
import { createSource } from "../../src/lib/market-analysis/governance/sources";
import { getGovernanceDb } from "../../src/lib/market-analysis/governance/db";
import { GovError } from "../../src/lib/market-analysis/governance/errors";

test.after(() => {
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
  }
});

function historyCount(vesselId: number, fieldKey: string): number {
  const db = getGovernanceDb();
  try {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM ma_field_history WHERE vessel_id=? AND field_key=?`).get(vesselId, fieldKey) as { n: number };
    return r.n;
  } finally { db.close(); }
}

function stageOne(vesselId: number, sourceId: number, field: string, value: string) {
  return stageVesselProposals({ vesselId, sourceId, extractionId: null, fields: { [field]: value }, createdBy: "tester" })[0];
}

test("resolvedFieldStatus truth table", () => {
  assert.equal(resolvedFieldStatus("accept"), "ai_accepted");
  assert.equal(resolvedFieldStatus("edit_accept"), "overridden");
  assert.equal(resolvedFieldStatus("override"), "overridden");
});

test("accept -> ai_accepted live field + history + proposal terminal", () => {
  const v = createVessel({ displayName: "Accept" });
  const s = createSource({ kind: "listing", content_text: "x" });
  const p = stageOne(v.id, s.id, "builder", "Westport");
  const { proposal, field } = resolveProposal(p.id, { action: "accept", by: "broker" });
  assert.equal(field?.value, "Westport");
  assert.equal(field?.status, "ai_accepted");
  assert.equal(field?.accepted_by, "broker");
  assert.equal(field?.verified_by, null);
  assert.equal(proposal.status, "accepted");
  assert.equal(historyCount(v.id, "builder"), 1);
  // terminal-lock backstop: raw UPDATE of the resolved proposal is blocked
  const db = getGovernanceDb();
  try {
    assert.throws(() => db.prepare("UPDATE ma_vessel_field_proposals SET status='pending' WHERE id=?").run(p.id), /terminal|locked|immutable/i);
  } finally { db.close(); }
});

test("re-resolving a resolved proposal -> 409", () => {
  const v = createVessel({ displayName: "Recurse" });
  const s = createSource({ kind: "listing", content_text: "x" });
  const p = stageOne(v.id, s.id, "year", "2001");
  resolveProposal(p.id, { action: "accept", by: "broker" });
  try {
    resolveProposal(p.id, { action: "accept", by: "broker" });
    assert.fail("expected GovError");
  } catch (err) {
    assert.ok(err instanceof GovError);
    assert.equal((err as GovError).status, 409);
  }
});

test("edit_accept -> overridden with broker value", () => {
  const v = createVessel({ displayName: "Edit" });
  const s = createSource({ kind: "listing", content_text: "x" });
  const p = stageOne(v.id, s.id, "model", "Raised PH");
  const { field } = resolveProposal(p.id, { action: "edit_accept", value: "Raised Pilothouse", by: "broker" });
  assert.equal(field?.value, "Raised Pilothouse");
  assert.equal(field?.status, "overridden");
});

test("edit_accept without a value -> 400", () => {
  const v = createVessel({ displayName: "EditBad" });
  const s = createSource({ kind: "listing", content_text: "x" });
  const p = stageOne(v.id, s.id, "model", "Raised PH");
  try {
    resolveProposal(p.id, { action: "edit_accept", by: "broker" });
    assert.fail("expected GovError");
  } catch (err) {
    assert.ok(err instanceof GovError);
    assert.equal((err as GovError).status, 400);
  }
});

test("override over an existing verified value -> overridden; conflict value recorded", () => {
  const v = createVessel({ displayName: "Override" });
  const s = createSource({ kind: "listing", content_text: "x" });
  setVesselField(v.id, "loa", "100 ft", "broker"); // verified live value
  const p = stageOne(v.id, s.id, "loa", "120 ft");
  assert.equal(p.conflict, 1);                       // conflict detected at staging
  assert.equal(p.current_value_at_proposal, "100 ft"); // conflict value recorded
  const { field } = resolveProposal(p.id, { action: "override", by: "broker" });
  assert.equal(field?.value, "120 ft");
  assert.equal(field?.status, "overridden");
  assert.equal(field?.verified_by, "broker");
});

test("reject -> no live write + proposal rejected", () => {
  const v = createVessel({ displayName: "Reject" });
  const s = createSource({ kind: "listing", content_text: "x" });
  const p = stageOne(v.id, s.id, "beam", "23 ft");
  const { proposal, field } = resolveProposal(p.id, { action: "reject", by: "broker", notes: "not credible" });
  assert.equal(field, null);
  assert.equal(proposal.status, "rejected");
  assert.equal(getVesselFields(v.id).some((f) => f.field_key === "beam"), false);
});

test("verify -> verified", () => {
  const v = createVessel({ displayName: "Verify" });
  const s = createSource({ kind: "listing", content_text: "x" });
  const p = stageOne(v.id, s.id, "flag", "USA");
  resolveProposal(p.id, { action: "accept", by: "broker" }); // ai_accepted
  const field = verifyVesselField(v.id, "flag", "broker");
  assert.equal(field.status, "verified");
  assert.equal(field.verified_by, "broker");
});

test("verify a missing field -> 404", () => {
  const v = createVessel({ displayName: "VerifyMissing" });
  try {
    verifyVesselField(v.id, "nope", "broker");
    assert.fail("expected GovError");
  } catch (err) {
    assert.ok(err instanceof GovError);
    assert.equal((err as GovError).status, 404);
  }
});

test("manual setVesselField -> verified, provenance manual", () => {
  const v = createVessel({ displayName: "Manual" });
  const field = setVesselField(v.id, "staterooms", "5", "broker");
  assert.equal(field.value, "5");
  assert.equal(field.status, "verified");
  const db = getGovernanceDb();
  try {
    const r = db.prepare(`SELECT source FROM ma_field_history WHERE vessel_id=? AND field_key='staterooms' ORDER BY id DESC LIMIT 1`).get(v.id) as { source: string };
    assert.equal(r.source, "manual");
  } finally { db.close(); }
});

test("comp approve/reject + history", () => {
  const v = createVessel({ displayName: "CompReview" });
  const s = createSource({ kind: "sold", content_text: "x" });
  const comp = { name: "", make: "Westport", model: "", year: "2001", length: "112 ft", listedPrice: null, soldPrice: 3300000, askPrice: null, listedDate: "", soldDate: "2025-12-08", daysOnMarket: null, location: "", source: "t" };
  const [staged] = stageComps({ vesselId: v.id, sourceId: s.id, extractionId: null, comps: [comp], createdBy: "tester" });
  const approved = reviewComp(staged.id, { action: "approve", by: "broker" });
  assert.equal(approved.status, "approved");
  assert.equal(approved.reviewed_by, "broker");
  const rejected = reviewComp(staged.id, { action: "reject", by: "broker" }); // re-review allowed
  assert.equal(rejected.status, "rejected");
  const db = getGovernanceDb();
  try {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM ma_comp_field_history WHERE comp_id=?`).get(staged.id) as { n: number };
    assert.equal(r.n, 2);
  } finally { db.close(); }
});

test("reviewComp on a missing comp -> 404", () => {
  try {
    reviewComp(999999, { action: "approve", by: "broker" });
    assert.fail("expected GovError");
  } catch (err) {
    assert.ok(err instanceof GovError);
    assert.equal((err as GovError).status, 404);
  }
});

test("getProposal/getComp readback after resolution", () => {
  const v = createVessel({ displayName: "Readback" });
  const s = createSource({ kind: "listing", content_text: "x" });
  const p = stageOne(v.id, s.id, "fuelType", "Diesel");
  resolveProposal(p.id, { action: "accept", by: "broker" });
  assert.equal(getProposal(p.id)?.status, "accepted");
});
