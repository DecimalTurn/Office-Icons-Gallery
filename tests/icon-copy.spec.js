const { test, expect } = require("@playwright/test");

test("links to the GitHub repository from the icon detail page", async ({ page }) => {
  await page.goto("/icon.html?name=ZoomTwoPages");

  const githubLink = page.getByRole("link", { name: "View Office Icons Gallery on GitHub" });
  await expect(githubLink).toHaveAttribute("href", "https://github.com/DecimalTurn/Office-Icons-Gallery");
  await expect(githubLink).toHaveAttribute("target", "_blank");
});

test("copies the icon ID from the title-row button", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/icon.html?name=ZoomTwoPages");

  const copyIdButton = page.getByRole("button", { name: "Copy icon ID" });
  await expect(copyIdButton).toBeVisible();
  await expect(copyIdButton).toBeEnabled();
  await copyIdButton.click();

  const copyStatus = page.locator("#copy-status");
  await expect(copyStatus).toHaveText("✓ Copied ZoomTwoPages");
  await expect(copyStatus.locator(".copy-status-check")).toHaveAttribute("aria-hidden", "true");
  await expect(copyStatus).toHaveClass(/is-visible/);
  await expect(copyStatus).toHaveCSS("opacity", "1");
  await page.waitForTimeout(5300);
  await expect(copyStatus).not.toHaveClass(/is-visible/);
  await expect(copyStatus).toHaveCSS("opacity", "0");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("ZoomTwoPages");
});