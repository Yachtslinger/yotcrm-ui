import test from "node:test";
import assert from "node:assert/strict";
import { pickHeroImage } from "../../src/lib/media";

test("pickHeroImage prefers horizontal hero tags and filters tiny assets", () => {
  const candidates = [
    { src: "https://example.com/flag.png", width: 200, height: 200, alt: "flag", tags: [] as string[] },
    { src: "https://example.com/interior.jpg", width: 800, height: 600, alt: "interior", tags: ["interior"] },
    { src: "https://example.com/hero.jpg", width: 1600, height: 900, alt: "hero", tags: ["hero", "exterior"] },
  ];
  const hero = pickHeroImage(candidates);
  assert.equal(hero.src, "https://example.com/hero.jpg");
});

test("pickHeroImage returns placeholder when list empty", () => {
  const hero = pickHeroImage([]);
  assert.ok(hero.src.includes("placeholder"));
});
