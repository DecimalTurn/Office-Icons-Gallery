const { test, expect } = require("@playwright/test");

test("lists IDs that use the same image on the icon detail page", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/Icon.html?name=BorderMoreColorsDialog");

  const section = page.locator("#same-image-section");
  await expect(section).toBeVisible();
  await expect(section.getByRole("heading", { name: "Other IDs using the same image" })).toBeVisible();
  const matchingId = page.getByRole("link", { name: "FontColorCycle" });
  await expect(matchingId).toBeVisible();

  const copyButton = page.getByRole("button", { name: "Copy FontColorCycle ID" });
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  await expect(page.locator("#copy-status")).toHaveText("Copied FontColorCycle");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("FontColorCycle");
  await expect(page).toHaveURL(/Icon\.html\?name=BorderMoreColorsDialog$/);

  await matchingId.click();
  await expect(page).toHaveURL(/Icon\.html\?name=FontColorCycle$/);
});

test("does not list placeholder IDs as alternative image names", async ({ page }) => {
  await page.goto("/Icon.html?name=AccountingFormatExcel");

  await expect(page.locator("#icon-image-status")).toHaveText(/shared Office fallback/);
  await expect(page.locator("#same-image-section")).toBeHidden();
});

test("keeps long alternative IDs clear of their copy buttons on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/Icon.html?name=BorderMoreColorsDialog");

  const rows = page.locator("#same-image-list li");
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    const link = await row.locator(".same-image-link").boundingBox();
    const copyButton = await row.locator(".same-image-copy-button").boundingBox();

    expect(link).not.toBeNull();
    expect(copyButton).not.toBeNull();
    expect(link.x + link.width).toBeLessThanOrEqual(copyButton.x);
  }
});