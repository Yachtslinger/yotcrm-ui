import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { scrapeDenison } from "../../src/lib/campaign/providers/denison";

const fixturePath = path.join(process.cwd(), "src", "vendor", "fixtures", "denison", "arthurs-way.html");
const fixtureHtml = readFileSync(fixturePath, "utf-8");
const listingUrl = "https://www.denisonyachtsales.com/yachts-for-sale/arthurs-way-120-benetti-I";

test("scrapeDenison extracts key listing data", async () => {
  const draft = await scrapeDenison(listingUrl, fixtureHtml);
  assert.ok(draft.headline && /arthur/i.test(draft.headline));
  assert.ok(draft.specs.builder && /benetti/i.test(draft.specs.builder || ""));
  assert.ok(draft.specs.loa && /120/.test(draft.specs.loa));
  assert.ok(draft.specs.beam && /26/i.test(draft.specs.beam));
  assert.ok(draft.specs.draft && /6/i.test(draft.specs.draft));
  assert.equal(draft.specs.year, "2001");
  assert.equal(draft.specs.engines, "2 x MTU 12V 1500 hp");
  assert.equal(draft.specs.engineMake, "Mtu");
  assert.equal(draft.specs.power, "2 x 1500 hp");
  assert.ok(draft.heroUrl, "hero url missing");
  assert.ok(draft.gallery.length >= 2, "should gather gallery images");
  draft.gallery.forEach((url) => {
    assert.ok(!/flag|\.svg$/i.test(url), `unexpected icon url ${url}`);
  });
  assert.equal(draft.location, "Fort Lauderdale, FL");
});
