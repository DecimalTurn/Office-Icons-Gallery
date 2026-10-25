const { test, expect } = require("@playwright/test");
const { normalizeReviewedKeywordGroup, requiredNameKeywords } = require("../scripts/keyword-utils");
const metadata = require("../icon-metadata.json");
const seenReviewImageHashes = new Set();
const reviewableIcons = metadata.filter((icon) => {
  if (icon.imageStatus === "placeholder" || !icon.imageSha256 || seenReviewImageHashes.has(icon.imageSha256)) {
    return false;
  }
  seenReviewImageHashes.add(icon.imageSha256);
  return true;
});
const iconsByImageHash = new Map();
for (const icon of metadata.filter((entry) => entry.imageStatus !== "placeholder")) {
  const group = iconsByImageHash.get(icon.imageSha256) || [];
  group.push(icon.name);
  iconsByImageHash.set(icon.imageSha256, group);
}
const imageGroupByName = new Map([...iconsByImageHash.values()].flatMap((iconIds) =>
  iconIds.map((iconId) => [iconId, iconIds])
));

async function mockKeywordReview(page, { confirmDelay = 0, keywordOverrides = {} } = {}) {
  const confirmed = [];
  const resets = [];
  await page.route("**/api/reference-lists", async (route) => {
    await route.fulfill({ json: { lists: [{
      id: "keyword-review-test",
      name: "Keyword review test",
      iconIds: ["_3DBevelOptionsDialog", "ChartFormatSelection"]
    }] } });
  });
  await page.route("**/icon-review-status.json", async (route) => {
    await route.fulfill({ json: {} });
  });
  if (Object.keys(keywordOverrides).length > 0) {
    await page.route("**/icon-metadata.json", async (route) => {
      await route.fulfill({ json: metadata.map((icon) => ({
        ...icon,
        ...(Object.hasOwn(keywordOverrides, icon.name) ? { keywords: keywordOverrides[icon.name] } : {})
      })) });
    });
  }
  await page.route("**/api/keyword-review/**", async (route) => {
    const body = route.request().postDataJSON();
    if (route.request().url().endsWith("/confirm")) {
      if (confirmDelay) {
        await new Promise((resolve) => setTimeout(resolve, confirmDelay));
      }
      if (body.keywords.some((keyword) => !keyword.trim())) {
        await route.fulfill({ status: 400, json: { error: "Keywords must contain 1 to 80 characters" } });
        return;
      }
      const iconIds = imageGroupByName.get(body.iconId) || [body.iconId];
      const keywords = normalizeReviewedKeywordGroup(iconIds, body.keywords);
      confirmed.push({ ...body, iconIds, keywords });
      await route.fulfill({ json: {
        iconId: body.iconId,
        iconIds,
        keywords,
        reviewed: true
      } });
      return;
    }
    resets.push(body);
    await route.fulfill({ json: { iconId: body.iconId, reviewed: false } });
  });
  return { confirmed, resets };
}

test("highlights only long name keywords and confirms the changes", async ({ page }) => {
  const iconId = "_3DBevelOptionsDialog";
  const imageGroupIds = imageGroupByName.get(iconId);
  const keywordOverrides = Object.fromEntries(imageGroupIds.map((iconName) => [iconName, ["3", "d", "bevel", "options", "dialog"]]));
  const { confirmed, resets } = await mockKeywordReview(page, { keywordOverrides });
  await page.goto("/keyword-review.html");
  await expect(page.locator("#selected-icon-name")).toHaveText("_0");
  await expect.poll(() => new URL(page.url()).searchParams.get("icon_id")).toBe("_0");
  await expect(page.locator("#review-count")).toContainText(`/ ${reviewableIcons.length.toLocaleString()} reviewed`);
  const lowerNavigation = page.getByRole("group", { name: "Icon navigation" });
  await expect(lowerNavigation.getByRole("button", { name: "Previous icon" })).toBeDisabled();
  await lowerNavigation.getByRole("button", { name: "Next icon" }).click();
  await expect(page.locator("#icon-position")).toHaveText(`2 of ${reviewableIcons.length.toLocaleString()}`);
  await expect(page.locator("#selected-icon-name")).toHaveText(reviewableIcons[1].name);
  await expect.poll(() => new URL(page.url()).searchParams.get("icon_id")).toBe(reviewableIcons[1].name);
  expect(reviewableIcons[0].imageSha256).not.toBe(reviewableIcons[1].imageSha256);
  await expect(page.locator("#previous-icon")).toBeEnabled();
  await lowerNavigation.getByRole("button", { name: "Previous icon" }).click();
  await expect(page.locator("#icon-position")).toHaveText(`1 of ${reviewableIcons.length.toLocaleString()}`);
  await expect.poll(() => new URL(page.url()).searchParams.get("icon_id")).toBe("_0");
  await expect(page.locator("#previous-icon")).toBeDisabled();

  await page.getByLabel("Search icon ID").fill(iconId);
  await page.getByRole("option", { name: iconId }).click();
  const keywordRows = page.locator(".keyword-row");
  const renderedRows = await keywordRows.evaluateAll((rows) => rows.map((row) => ({
    value: row.querySelector("input").value,
    readOnly: row.querySelector("input").readOnly,
    fromNameClass: row.querySelector("input").classList.contains("keyword-from-name"),
    removeDisabled: row.querySelector("button").disabled
  })));
  for (const row of renderedRows) {
    expect(row.readOnly).toBe(false);
    expect(row.removeDisabled).toBe(false);
  }
  for (const word of requiredNameKeywords(iconId)) {
    expect(renderedRows.find((row) => row.value === word)?.fromNameClass).toBe(true);
  }
  expect(renderedRows.filter((row) => row.fromNameClass).map((row) => row.value))
    .not.toEqual(expect.arrayContaining(["3", "d"]));
  const bevelIndex = renderedRows.findIndex((entry) => entry.value === "bevel");
  expect(bevelIndex).toBeGreaterThanOrEqual(0);
  await keywordRows.nth(bevelIndex).locator("input").fill("beveled");
  await page.getByRole("button", { name: "Remove keyword options" }).click();
  const addKeywordButton = page.getByRole("button", { name: "Add keyword" });
  await addKeywordButton.click();
  const temporaryInput = page.locator(".keyword-row input").last();
  await temporaryInput.fill("beve");
  const keywordSuggestions = page.locator(".keyword-editor .keyword-row .awesomplete > ul:not([hidden])");
  await expect(keywordSuggestions).toBeVisible();
  await expect(keywordSuggestions).toContainText("bevel");
  await temporaryInput.press("Tab");
  await expect(temporaryInput).toHaveValue("bevel");
  await expect(addKeywordButton).toBeFocused();
  await temporaryInput.fill("temporary term");
  await temporaryInput.press("Tab");
  await expect(addKeywordButton).toBeFocused();
  await page.getByRole("button", { name: "Add keyword" }).click();
  await page.locator(".keyword-row input").last().fill(" Blue Pigment ");
  await page.getByRole("button", { name: "Remove keyword temporary term" }).click();
  await page.getByRole("button", { name: "Confirm review" }).click();

  await expect(page.locator("#review-state")).toHaveText("Reviewed");
  await expect(page.locator("#review-status")).toBeEmpty();
  await expect(page.getByRole("button", { name: "Confirm review" })).toHaveClass(/review-button-saved/);
  expect(confirmed).toHaveLength(1);
  expect(confirmed[0].iconId).toBe(iconId);
  expect(confirmed[0].iconIds).toEqual(imageGroupIds);
  expect(confirmed[0].keywords).toContain("blue pigment");
  expect(confirmed[0].keywords).not.toContain("temporary term");
  expect(confirmed[0].keywords).toContain("beveled");
  expect(confirmed[0].keywords).not.toContain("bevel");
  expect(confirmed[0].keywords).not.toContain("options");
  await expect(page.locator(".reference-icon-item .reference-icon-keyword").filter({ hasText: "blue pigment" })).toHaveCount(2);
  expect(confirmed[0].keywords).not.toContain("3");
  expect(confirmed[0].keywords).not.toContain("d");
  expect(confirmed[0].keywords).toContain("dialog");

  await page.getByRole("button", { name: "Mark not reviewed" }).click();
  await expect(page.locator("#review-state")).toHaveText("Not reviewed");
  expect(resets).toEqual([{ iconId, reviewed: false }]);
  const savedKeywordValues = await page.locator(".keyword-row input").evaluateAll((inputs) => inputs.map((input) => input.value));
  expect(savedKeywordValues).toContain("blue pigment");
  expect(savedKeywordValues).toContain("beveled");
  expect(savedKeywordValues).not.toContain("bevel");
  expect(savedKeywordValues).not.toContain("options");
});

test("opens the icon selected by the URL parameter", async ({ page }) => {
  await mockKeywordReview(page);
  const icon = reviewableIcons[1];

  await page.goto(`/keyword-review.html?icon_id=${encodeURIComponent(icon.name)}`);

  await expect(page.locator("#selected-icon-name")).toHaveText(icon.name);
  await expect.poll(() => new URL(page.url()).searchParams.get("icon_id")).toBe(icon.name);
});

test("migrates the legacy icon URL parameter", async ({ page }) => {
  await mockKeywordReview(page);
  const icon = reviewableIcons[1];

  await page.goto(`/keyword-review.html?icon=${encodeURIComponent(icon.name)}`);

  await expect(page.locator("#selected-icon-name")).toHaveText(icon.name);
  await expect.poll(() => new URL(page.url()).searchParams.get("icon_id")).toBe(icon.name);
  expect(new URL(page.url()).searchParams.has("icon")).toBe(false);
});

test("Tab accepts a suggestion and focuses the next keyword field", async ({ page }) => {
  await mockKeywordReview(page);
  const iconId = "_3DBevelOptionsDialog";
  await page.goto("/keyword-review.html");
  await page.getByLabel("Search icon ID").fill(iconId);
  await page.getByRole("option", { name: iconId }).click();

  const addKeywordButton = page.getByRole("button", { name: "Add keyword" });
  await addKeywordButton.click();
  await addKeywordButton.click();
  const keywordInputs = page.locator(".keyword-row input");
  const keywordInputCount = await keywordInputs.count();
  const autocompleteInput = keywordInputs.nth(keywordInputCount - 2);
  const nextKeywordInput = keywordInputs.nth(keywordInputCount - 1);
  await autocompleteInput.fill("beve");
  await expect(page.locator(".keyword-editor .keyword-row .awesomplete > ul:not([hidden])")).toContainText("bevel");

  await autocompleteInput.press("Tab");

  await expect(autocompleteInput).toHaveValue("bevel");
  await expect(nextKeywordInput).toBeFocused();
});

test("searching an identical-image ID opens its review representative", async ({ page }) => {
  await mockKeywordReview(page);
  const aliasId = "ChartFormatSelection";
  const representative = reviewableIcons.find((icon) => icon.sameImageIds?.includes(aliasId));
  expect(representative).toBeTruthy();

  await page.goto("/keyword-review.html");
  await expect(page.locator("#selected-icon-name")).toHaveText("_0");
  await page.getByLabel("Search icon ID").fill(aliasId);
  const matchingOption = page.getByRole("option", { name: representative.name });
  await expect(matchingOption).toBeVisible();
  await matchingOption.click();

  await expect(page.locator("#selected-icon-name")).toHaveText(representative.name);
  await expect(page.locator("#same-image-ids")).toContainText(aliasId);
  await expect(page.locator("#icon-position")).toHaveText(`${reviewableIcons.indexOf(representative) + 1} of ${reviewableIcons.length.toLocaleString()}`);
});

test("confirming review does not shift the workspace while saving", async ({ page }) => {
  await mockKeywordReview(page, { confirmDelay: 300 });
  await page.goto("/keyword-review.html");
  await expect(page.locator("#selected-icon-name")).toHaveText("_0");
  const workspace = page.locator(".review-workspace");
  const initialTop = await workspace.evaluate((element) => element.getBoundingClientRect().top);

  await page.getByRole("button", { name: "Confirm review" }).click();
  await expect(page.getByRole("button", { name: "Confirm review" })).toBeDisabled();
  await expect(page.locator("#review-status")).toBeEmpty();
  await expect.poll(() => workspace.evaluate((element) => element.getBoundingClientRect().top)).toBe(initialTop);
  await expect(page.getByRole("button", { name: "Confirm review" })).toBeEnabled();
});

test("rejects an empty keyword row until it is filled or removed", async ({ page }) => {
  const { confirmed } = await mockKeywordReview(page);
  await page.goto("/keyword-review.html");
  await expect(page.locator("#selected-icon-name")).toHaveText("_0");
  await page.getByRole("button", { name: "Add keyword" }).click();
  await page.getByRole("button", { name: "Confirm review" }).click();
  await expect(page.locator("#review-status")).toContainText("Remove empty keyword rows");
  expect(confirmed).toHaveLength(0);
});
