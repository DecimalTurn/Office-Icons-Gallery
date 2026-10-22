const { test, expect } = require("@playwright/test");

test("lists IDs that use the same image on the icon detail page", async ({ page }) => {
  await page.goto("/Icon.html?name=BorderMoreColorsDialog");

  const section = page.locator("#same-image-section");
  await expect(section).toBeVisible();
  await expect(section.getByRole("heading", { name: "Other IDs using the same image" })).toBeVisible();
  const matchingId = page.getByRole("link", { name: "FontColorCycle" });
  await expect(matchingId).toBeVisible();
  await matchingId.click();
  await expect(page).toHaveURL(/Icon\.html\?name=FontColorCycle$/);
});

test("does not list placeholder IDs as alternative image names", async ({ page }) => {
  await page.goto("/Icon.html?name=AccountingFormatExcel");

  await expect(page.locator("#icon-image-status")).toHaveText(/shared Office fallback/);
  await expect(page.locator("#same-image-section")).toBeHidden();
});