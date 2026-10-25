const { test, expect } = require("@playwright/test");

test("links to the GitHub repository from the icon detail page", async ({ page }) => {
  await page.goto("/icon.html?icon_id=ZoomTwoPages");

  const githubLink = page.getByRole("link", { name: "View Office Icons Gallery on GitHub" });
  await expect(githubLink).toHaveAttribute("href", "https://github.com/DecimalTurn/Office-Icons-Gallery");
  await expect(githubLink).toHaveAttribute("target", "_blank");
});

test("shows searchable keywords between the icon name and previews", async ({ page }) => {
  await page.goto("/icon.html?icon_id=ZoomTwoPages");

  const keywords = page.locator("#icon-keywords");
  await expect(keywords).toContainText("magnify");
  await expect(keywords).toContainText("scale");
  await expect(keywords).not.toContainText("zoom");
  await expect(keywords).not.toContainText("two");
  await expect(keywords).not.toContainText("pages");

  const isBeforePreviews = await page.evaluate(() => {
    const keywordsNode = document.querySelector("#icon-keywords");
    const previewsNode = document.querySelector(".icon-detail-previews");
    return Boolean(keywordsNode && previewsNode &&
      (keywordsNode.compareDocumentPosition(previewsNode) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(isBeforePreviews).toBe(true);
});

test("copies the icon ID from the title-row button", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/icon.html?icon_id=ZoomTwoPages");

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