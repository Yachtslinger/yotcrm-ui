import test from "node:test";
import assert from "node:assert/strict";
import { emptyVessel } from "../../src/lib/vessel-scraper/types";
import { mineEngineIdentity, mineModel, mineRefit } from "../../src/lib/vessel-scraper/utils";

// Regression: the Denison "CLAIRE" listing carried engine/refit/model only in
// the highlights bullets ("TWIN CATERPILLAR C32"), the "Engines: Caterpillar"
// line, and the prose ("2016 Ocean Alexander 85E", "Complete Refit in 2024").

test("mineEngineIdentity reads brand + count from 'TWIN CATERPILLAR C 32 ENGINES'", () => {
  const v = emptyVessel("");
  mineEngineIdentity(v, "TWIN CATERPILLAR C 32 ENGINES (1000 HR SERVICE DONE SEPT 2024)");
  assert.match(v.engineMake || "", /caterpillar/i);
  assert.equal(v.engineCount, "2");
});

test("mineEngineIdentity reads brand from an 'Engines: Caterpillar' highlight", () => {
  const v = emptyVessel("");
  mineEngineIdentity(v, "Engines: Caterpillar");
  assert.match(v.engineMake || "", /caterpillar/i);
});

test("mineEngineIdentity handles '2 x MTU' digit form", () => {
  const v = emptyVessel("");
  mineEngineIdentity(v, "Powered by 2 x MTU 12V 4000 M93 diesel engines");
  assert.equal(v.engineMake, "MTU");
  assert.equal(v.engineCount, "2");
});

test("mineEngineIdentity does NOT read a model number as a count ('C 32 engines')", () => {
  const v = emptyVessel("");
  mineEngineIdentity(v, "Caterpillar C 32 engines");
  assert.match(v.engineMake || "", /caterpillar/i);
  assert.ok(!v.engineCount, `engineCount should be empty, got ${v.engineCount}`);
});

test("mineModel pulls '85E' when builder is known", () => {
  const v = emptyVessel("");
  v.builder = "Ocean Alexander";
  mineModel(v, "Welcome aboard a stunning 2016 Ocean Alexander 85E Motor-Yacht.");
  assert.equal(v.model, "85E");
});

test("mineModel falls back to the bare length number", () => {
  const v = emptyVessel("");
  v.builder = "Westport";
  v.loa = "112 ft";
  mineModel(v, "A fine motor yacht with no model designation in the copy.");
  assert.equal(v.model, "112");
});

test("mineRefit reads year + scope from 'Complete Refit in 2024'", () => {
  const v = emptyVessel("");
  mineRefit(v, "Complete Refit in 2024 — all new soft goods and electronics.");
  assert.equal(v.refitYear, "2024");
  assert.equal(v.refitScope, "full");
});

test("mineRefit leaves scope unset when no qualifier word is present", () => {
  const v = emptyVessel("");
  mineRefit(v, "Refit in 2019.");
  assert.equal(v.refitYear, "2019");
  assert.ok(!v.refitScope, `refitScope should be empty, got ${v.refitScope}`);
});

test("engine/model/refit miners never overwrite populated fields", () => {
  const v = emptyVessel("");
  v.engineMake = "MAN";
  v.engineCount = "3";
  v.builder = "Sunseeker";
  v.model = "76";
  v.refitYear = "2018";
  v.refitScope = "cosmetic";
  mineEngineIdentity(v, "TWIN CATERPILLAR engines");
  mineModel(v, "Sunseeker 95 Yacht");
  mineRefit(v, "Complete Refit in 2024");
  assert.equal(v.engineMake, "MAN");
  assert.equal(v.engineCount, "3");
  assert.equal(v.model, "76");
  assert.equal(v.refitYear, "2018");
  assert.equal(v.refitScope, "cosmetic");
});
