const { test, expect } = require("@playwright/test");

test("shows Office fallback status on detail pages, not in search results", async ({ page }) => {
  await page.goto("/index.html?SearchMso=AccountingFormatExcel");
  await expect(page.locator(".icon-placeholder-badge")).toHaveCount(0);

  await page.goto("/icon.html?name=AccountingFormatExcel");
  await expect(page.locator("#icon-image-status")).toHaveText(/shared Office fallback/);

  await page.goto("/icon.html?name=BrightnessMore");
  await expect(page.locator("#icon-image-status")).toBeHidden();
});