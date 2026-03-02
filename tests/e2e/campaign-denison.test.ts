import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { POST } from "../../src/app/api/scrape/route";

type ApiSpecs = Record<string, string | undefined>;
type ApiDraft = {
  headline?: string;
  location?: string;
  specs: ApiSpecs;
  gallery: string[];
};
type ApiResponse = { ok: boolean; error?: string; data?: ApiDraft };

const fixturePath = path.join(process.cwd(), "src", "vendor", "fixtures", "denison", "arthurs-way.html");
const fixtureHtml = readFileSync(fixturePath, "utf-8");
const listingUrl = "https://www.denisonyachtsales.com/yachts-for-sale/arthurs-way-120-benetti-I";

test("api/scrape returns normalized Denison payload", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target = typeof input === "string" ? input : input.toString();
    if (target.includes("denisonyachtsales.com")) {
      return new Response(fixtureHtml, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (originalFetch) {
      return originalFetch(input, init);
    }
    throw new Error("Unexpected fetch call");
  };

  try {
    const req = new Request("http://localhost/api/scrape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: listingUrl }),
    });
    const res = await POST(req);
    const json = (await res.json()) as ApiResponse;
    assert.equal(res.status, 200);
    assert.equal(json.ok, true);
    assert.ok(json.data);
    const data = json.data as ApiDraft;
    assert.match(String(data.headline), /arthur/i);
    assert.equal(String(data.location), "Fort Lauderdale, FL");
    const specs = data.specs as Record<string, string>;
    assert.equal(specs.builder, "Benetti");
    assert.match(specs.loa || "", /120/);
    assert.match(specs.beam || "", /26/);
    assert.match(specs.draft || "", /6/);
    assert.equal(specs.engines, "2 x MTU 12V 1500 hp");
    assert.equal(specs.power, "2 x 1500 hp");
    const gallery = data.gallery as string[];
    assert.ok(Array.isArray(gallery) && gallery.length >= 2);
    gallery.forEach((url: string) => assert.ok(!/flag|\.svg$/i.test(url)));
  } finally {
    global.fetch = originalFetch;
  }
});
