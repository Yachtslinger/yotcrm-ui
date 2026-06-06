import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Point the governance DB at a throwaway temp file BEFORE importing the libs.
const TMP_DB = path.join(os.tmpdir(), `ma_gov_unit_${process.pid}.db`);
for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
  try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
}
process.env.DB_PATH = TMP_DB;

import { createSource, listSources, getSource } from "../../src/lib/market-analysis/governance/sources";
import { createExtraction, listExtractions, getExtraction } from "../../src/lib/market-analysis/governance/extractions";
import { runGovernanceIntegrityCheck } from "../../src/lib/market-analysis/governance/integrity";
import { getGovernanceDb } from "../../src/lib/market-analysis/governance/db";
import { isGovernanceEnabled } from "../../src/lib/market-analysis/governance/flag";

test.after(() => {
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
  }
});

test("feature flag is off by default and reads the env var", () => {
  delete process.env.MA_GOVERNANCE_ENABLED;
  assert.equal(isGovernanceEnabled(), false);
  process.env.MA_GOVERNANCE_ENABLED = "1";
  assert.equal(isGovernanceEnabled(), true);
  process.env.MA_GOVERNANCE_ENABLED = "true";
  assert.equal(isGovernanceEnabled(), true);
  delete process.env.MA_GOVERNANCE_ENABLED;
  assert.equal(isGovernanceEnabled(), false);
});

test("createSource persists and getSource returns full content", () => {
  const s = createSource({ kind: "listing", label: "Test listing", content_text: "hello world", createdBy: "tester" });
  assert.ok(s.id > 0);
  assert.equal(s.kind, "listing");
  assert.equal(s.schema_version, 1);
  const full = getSource(s.id);
  assert.equal(full?.content_text, "hello world");
});

test("invalid source kind falls back to 'other'", () => {
  const s = createSource({ kind: "totally-bogus", label: "x", content_text: "y" });
  assert.equal(s.kind, "other");
});

test("listSources returns newest-first previews, not full content", () => {
  const list = listSources({ limit: 10 });
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1);
  assert.ok(!("content_text" in list[0]));
  assert.ok("content_preview" in list[0]);
});

test("createExtraction requires an existing source", () => {
  assert.throws(() => createExtraction({ sourceId: 999999, targetType: "vessel", extracted: {} }), /source not found/);
});

test("createExtraction rejects an invalid targetType", () => {
  const s = createSource({ kind: "note", content_text: "n" });
  assert.throws(() => createExtraction({ sourceId: s.id, targetType: "bogus", extracted: {} }), /invalid targetType/);
});

test("createExtraction stores and round-trips the payload; list filters by source", () => {
  const s = createSource({ kind: "sold", content_text: "report text" });
  const e = createExtraction({
    sourceId: s.id, targetType: "comp", model: "test-model", triggeredBy: "tester",
    extracted: { price: 1000000, name: "Vessel X" },
  });
  assert.ok(e.id > 0);
  const got = getExtraction(e.id);
  assert.ok(got);
  assert.deepEqual(JSON.parse(got!.extracted_json), { price: 1000000, name: "Vessel X" });
  const listed = listExtractions({ sourceId: s.id });
  assert.equal(listed.length, 1);
  assert.ok(!("extracted_json" in listed[0]));
});

test("extraction logs are immutable (UPDATE and DELETE blocked by trigger)", () => {
  const s = createSource({ kind: "spec", content_text: "spec" });
  const e = createExtraction({ sourceId: s.id, targetType: "vessel", extracted: { a: 1 } });
  const db = getGovernanceDb();
  try {
    assert.throws(() => db.prepare("UPDATE ma_extractions SET model = 'x' WHERE id = ?").run(e.id), /immutable/);
    assert.throws(() => db.prepare("DELETE FROM ma_extractions WHERE id = ?").run(e.id), /immutable/);
  } finally {
    db.close();
  }
});

test("integrity check runs and reports no issues on clean referential data", () => {
  const issues = runGovernanceIntegrityCheck();
  assert.ok(Array.isArray(issues));
  assert.equal(issues.length, 0);
});
