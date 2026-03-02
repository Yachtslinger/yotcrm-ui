import { test, expect } from "@playwright/test";

test.describe("campaign builder smoke", () => {
  test("scrape button click runs handler", async ({ page }) => {
    await page.route("**/api/campaign/scrape", async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: "Mock scrape failure" }),
        headers: { "content-type": "application/json" },
      });
    });

    const dialogPromise = page.waitForEvent("dialog");

    await page.goto("/campaigns");
    await page.getByPlaceholder("https://www.denisonyachting.com/yachts-for-sale/...").fill("https://www.denisonyachting.com/yachts-for-sale/test-yacht");
    await page.getByRole("button", { name: "Scrape" }).click();

    const dialog = await dialogPromise;
    await expect(dialog.message()).toContain("Mock scrape failure");
    await dialog.dismiss();
  });
});
