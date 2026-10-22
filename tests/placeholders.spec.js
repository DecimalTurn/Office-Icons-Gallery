const { test, expect } = require("@playwright/test");

test("marks Office fallback images in search results and detail pages", async ({ page }) => {
  await page.goto("/ImageMso.html?SearchMso=AccountingFormatExcel");
  await expect(page.locator(".icon-placeholder-badge").first()).toBeVisible();

  await page.goto("/Icon.html?name=AccountingFormatExcel");
  await expect(page.locator("#icon-image-status")).toHaveText(/shared Office fallback/);

  await page.goto("/Icon.html?name=BrightnessMore");
  await expect(page.locator("#icon-image-status")).toBeHidden();
});