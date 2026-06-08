import test from "node:test";
import assert from "node:assert/strict";
import { emptyVessel } from "../../src/lib/vessel-scraper/types";
import { mineVesselIdentity } from "../../src/lib/vessel-scraper/utils";

// Regression: Denison "CLAIRE" listing exposed no JSON-LD Boat node, so the
// scraper left year/make/length blank even though "85' Ocean Alexander 2016"
// is in the heading, breadcrumb and slug. mineVesselIdentity recovers them.

test("mineVesselIdentity fills length/builder/year from a Denison-style heading", () => {
  const v = emptyVessel(
    "https://www.denisonyachtsales.com/yachts-for-sale/claire-85-ocean-alexander"
  );
  mineVesselIdentity(v, {
    headings: ['"CLAIRE" Yacht for Sale', "85' Ocean Alexander | 2016"],
    breadcrumb: "motoryachts ocean alexander claire",
    slug: "claire-85-ocean-alexander",
  });
  assert.equal(v.year, 2016);
  assert.match(v.builder, /ocean alexander/i);
  assert.match(v.loa, /85/);
});

test("mineVesselIdentity recovers length + builder from the URL slug alone", () => {
  const v = emptyVessel("");
  mineVesselIdentity(v, { slug: "claire-85-ocean-alexander" });
  assert.match(v.loa, /85/);
  assert.match(v.builder, /ocean alexander/i);
});

test("mineVesselIdentity parses the existing Arthur's Way fixture shape", () => {
  const v = emptyVessel("");
  mineVesselIdentity(v, {
    headings: ["120' Benetti 2001"],
    slug: "arthurs-way-120-benetti-I",
  });
  assert.equal(v.year, 2001);
  assert.match(v.builder, /benetti/i);
  assert.match(v.loa, /120/);
});

test("mineVesselIdentity never overwrites fields already populated", () => {
  const v = emptyVessel("");
  v.builder = "Westport";
  v.year = 2010;
  v.loa = "112 ft";
  mineVesselIdentity(v, {
    headings: ["85' Ocean Alexander | 2016"],
    slug: "claire-85-ocean-alexander",
  });
  assert.equal(v.builder, "Westport");
  assert.equal(v.year, 2010);
  assert.equal(v.loa, "112 ft");
});
