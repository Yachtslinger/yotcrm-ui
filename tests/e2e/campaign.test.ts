import test from "node:test";
import assert from "node:assert/strict";
import { createBlankCampaignData } from "../../src/lib/campaign/schema";
import { renderCampaignHTML } from "../../src/lib/campaign/render";
import { pickHeroImage } from "../../src/lib/media";

test("builder integration: hero selection feeds renderer", () => {
  const data = createBlankCampaignData("listing");
  data.title = "Integration Vessel";
  data.gallery = [
    { src: "https://example.com/icon.png", width: 200, height: 200, alt: "icon", tags: [] },
    { src: "https://example.com/hero-wide.jpg", width: 1600, height: 900, alt: "wide", tags: ["hero"] },
  ];
  data.hero = pickHeroImage(data.gallery);
  const output = renderCampaignHTML(data);
  assert.ok(output.html.includes("Integration Vessel"));
  assert.ok(output.html.includes("https://example.com/hero-wide.jpg"));
});
