const { test, expect } = require("@playwright/test");

test("copies the icon ID from the title-row button", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/Icon.html?name=ZoomTwoPages");

  const copyIdButton = page.getByRole("button", { name: "Copy icon ID" });
  await expect(copyIdButton).toBeVisible();
  await expect(copyIdButton).toBeEnabled();
  await copyIdButton.click();

  await expect(page.locator("#copy-status")).toHaveText("Copied ZoomTwoPages");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("ZoomTwoPages");
});