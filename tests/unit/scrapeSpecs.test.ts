import test from "node:test";
import assert from "node:assert/strict";
import { scrapeSpecsFromHtml, toFeet } from "../../src/lib/campaign/scrapeSpecs";

test("scrapeSpecsFromHtml parses dt/dd and table values", () => {
  const html = `
    <html><body>
      <dl>
        <dt>Length</dt><dd>120'</dd>
        <dt>Beam</dt><dd>26'</dd>
        <dt>Power</dt><dd>CAT 1550 hp</dd>
      </dl>
      <table>
        <tr><th>Draft</th><td>7.5'</td></tr>
        <tr><th>Staterooms</th><td>5</td></tr>
      </table>
    </body></html>`;
  const specs = scrapeSpecsFromHtml(html);
  assert.equal(specs.length, "120.0 ft");
  assert.equal(specs.beam, "26.0 ft");
  assert.equal(specs.power, "CAT 1550 hp");
  assert.equal(specs.draft, "7.5 ft");
  assert.equal(specs.staterooms, "5");
});

test("toFeet converts meters when necessary", () => {
  assert.equal(toFeet("10 m"), "32.8 ft");
  assert.equal(toFeet("115'"), "115.0 ft");
});
