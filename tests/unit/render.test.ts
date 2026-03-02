import test from "node:test";
import assert from "node:assert/strict";
import { createBlankCampaignData } from "../../src/lib/campaign/schema";
import { renderCampaignHTML } from "../../src/lib/campaign/render";

test("renderCampaignHTML includes hero, banner, and CTA", () => {
  const data = createBlankCampaignData("listing");
  data.title = "Test Vessel";
  data.subtitle = "Private Pricing Opportunity";
  data.hero.src = "https://example.com/hero.jpg";
  data.cta = { label: "Book a Tour", href: "https://example.com/tour" };

  const result = renderCampaignHTML(data);
  assert.ok(result.html.includes("Test Vessel"));
  assert.ok(result.html.includes(data.hero.src));
  assert.ok(result.html.includes("Denison"));
  assert.ok(result.text.includes("Book a Tour"));
});
