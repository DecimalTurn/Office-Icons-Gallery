const { test, expect } = require("@playwright/test");

test("links to the GitHub repository from the icon detail page", async ({ page }) => {
  await page.goto("/icon.html?icon_id=ZoomTwoPages");

  const githubLink = page.getByRole("link", { name: "View Office Icons Gallery on GitHub" });
  await expect(githubLink).toHaveAttribute("href", "https://github.com/DecimalTurn/Office-Icons-Gallery");
  await expect(githubLink).toHaveAttribute("target", "_blank");
});

test("shows searchable keywords above related icons", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/icon.html?icon_id=ZoomTwoPages");

  const keywords = page.locator("#icon-keywords");
  await expect(keywords).toContainText("magnify");
  await expect(keywords).toContainText("scale");
  await expect(keywords).not.toContainText("zoom");
  await expect(keywords).not.toContainText("two");
  await expect(keywords).not.toContainText("pages");

  const isAboveRelatedIcons = await page.evaluate(() => {
    const keywordsNode = document.querySelector("#icon-keywords");
    const relatedNode = document.querySelector("#related-icons-section");
    return Boolean(keywordsNode && relatedNode &&
      (keywordsNode.compareDocumentPosition(relatedNode) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(isAboveRelatedIcons).toBe(true);
  await expect(page.getByRole("link", { name: "Suggest a keyword change" })).toBeVisible();
  await expect(page.locator("#icon-keywords li").last()).toContainText("Suggest a keyword change");
  const suggestionIsBelowLastKeyword = await page.evaluate(() => {
    const keywords = [...document.querySelectorAll("#icon-keywords li:not(.icon-keyword-suggestion)")];
    const suggestion = document.querySelector("#icon-keywords .icon-keyword-suggestion");
    return keywords.length > 0 && suggestion &&
      suggestion.getBoundingClientRect().top >= keywords[keywords.length - 1].getBoundingClientRect().bottom;
  });
  expect(suggestionIsBelowLastKeyword).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("opens a prefilled GitHub issue draft for keyword additions and removals", async ({ page }) => {
  await page.addInitScript(() => {
    window.issueDrafts = [];
    window.open = (url) => {
      window.issueDrafts.push(String(url));
      return null;
    };
  });
  await page.goto("/icon.html?icon_id=ZoomTwoPages");

  const dialog = page.getByRole("dialog", { name: "Suggest a keyword change" });
  await page.getByRole("link", { name: "Suggest a keyword change" }).click();
  await expect(dialog).toBeVisible();
  const existingKeyword = (await page.locator("#icon-keywords li:not(.icon-keyword-suggestion)").first().textContent()).trim();
  await page.getByRole("radio", { name: "Suggest a removal" }).check();
  await expect(page.locator("#suggestion-remove-field")).toBeVisible();
  await page.locator("#suggestion-keyword-select").selectOption(existingKeyword);
  await page.getByRole("button", { name: "Continue to GitHub" }).click();
  await expect(dialog).toBeHidden();

  const removalDraft = new URL(await page.evaluate(() => window.issueDrafts[0]));
  expect(removalDraft.origin + removalDraft.pathname).toBe("https://github.com/DecimalTurn/Office-Icons-Gallery/issues/new");
  expect(removalDraft.searchParams.get("title")).toContain(`remove ${existingKeyword} for ZoomTwoPages`);
  expect(removalDraft.searchParams.get("body")).toContain("Type: Suggest a removal");
  expect(removalDraft.searchParams.get("body")).toContain("Icon ID: `ZoomTwoPages`");
  expect(removalDraft.searchParams.get("body")).toContain("http://127.0.0.1:4173/icon.html?icon_id=ZoomTwoPages");

  await page.getByRole("link", { name: "Suggest a keyword change" }).click();
  await page.getByRole("textbox", { name: "Keyword to add" }).fill("folding screen");
  await page.getByRole("button", { name: "Continue to GitHub" }).click();
  const additionDraft = new URL(await page.evaluate(() => window.issueDrafts[1]));
  expect(additionDraft.searchParams.get("title")).toContain("add folding screen for ZoomTwoPages");
  expect(additionDraft.searchParams.get("body")).toContain("Type: Suggest an addition");
  expect(additionDraft.searchParams.get("body")).toContain("Keyword: `folding screen`");
  expect(additionDraft.searchParams.get("body")).toContain("Additional context");
});

test("keeps the keyword suggestion link on its own row for the reported icon", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/icon.html?icon_id=_3DEffectColorPickerMoreClassic");

  const keywords = page.locator("#icon-keywords li:not(.icon-keyword-suggestion)");
  const suggestion = page.locator("#icon-keywords .icon-keyword-suggestion");
  await expect(suggestion).toBeVisible();
  const suggestionBelowKeywords = await page.evaluate(() => {
    const items = [...document.querySelectorAll("#icon-keywords li:not(.icon-keyword-suggestion)")];
    const linkItem = document.querySelector("#icon-keywords .icon-keyword-suggestion");
    return linkItem.getBoundingClientRect().top >= items[items.length - 1].getBoundingClientRect().bottom;
  });
  expect(suggestionBelowKeywords).toBe(true);
  await expect(keywords).not.toHaveCount(0);
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