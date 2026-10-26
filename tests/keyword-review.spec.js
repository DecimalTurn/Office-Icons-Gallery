const { test, expect } = require("@playwright/test");
const { nameKeywords, normalizeReviewedKeywordGroup } = require("../scripts/keyword-utils");
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

async function mockKeywordReview(page, {
  confirmDelay = 0,
  keywordOverrides = {},
  synonyms = {},
  reviewStatus = {},
  reviewedKeywordOverrides = {},
  metadataExtra = []
} = {}) {
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
    await route.fulfill({ json: reviewStatus });
  });
  await page.route("**/api/synonyms", async (route) => {
    await route.fulfill({ json: { synonyms } });
  });
  if (Object.keys(reviewedKeywordOverrides).length > 0) {
    await page.route("**/icon-keywords.json", async (route) => {
      await route.fulfill({ json: {
        ...require("../icon-keywords.json"),
        ...reviewedKeywordOverrides
      } });
    });
  }
  if (Object.keys(keywordOverrides).length > 0 || metadataExtra.length > 0) {
    await page.route("**/icon-metadata.json", async (route) => {
      await route.fulfill({ json: [...metadata.map((icon) => ({
        ...icon,
        ...(Object.hasOwn(keywordOverrides, icon.name) ? { keywords: keywordOverrides[icon.name] } : {})
      })), ...metadataExtra] });
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
      const keywords = normalizeReviewedKeywordGroup(iconIds, body.keywords, synonyms);
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

test("omits icon-name words and confirms only useful keywords", async ({ page }) => {
  const iconId = "_3DBevelOptionsDialog";
  const imageGroupIds = imageGroupByName.get(iconId);
  const { confirmed, resets } = await mockKeywordReview(page);
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
  const iconNameWords = nameKeywords(imageGroupIds);
  expect(renderedRows.map((row) => row.value).filter((word) => iconNameWords.has(word))).toEqual([]);
  const paintIndex = renderedRows.findIndex((entry) => entry.value === "paint");
  expect(paintIndex).toBeGreaterThanOrEqual(0);
  await keywordRows.nth(paintIndex).locator("input").fill("painted");
  await page.getByRole("button", { name: "Remove keyword bucket" }).click();
  const addKeywordButton = page.getByRole("button", { name: "Add keyword" });
  await addKeywordButton.click();
  const temporaryInput = page.locator(".keyword-row input").last();
  await temporaryInput.fill("paintb");
  const keywordSuggestions = page.locator(".keyword-editor .keyword-row .awesomplete > ul:not([hidden])");
  await expect(keywordSuggestions).toBeVisible();
  await expect(keywordSuggestions).toContainText("paintbrush");
  await temporaryInput.press("Tab");
  await expect(temporaryInput).toHaveValue("paintbrush");
  await expect(addKeywordButton).toBeFocused();
  await temporaryInput.fill("temporary term");
  await temporaryInput.press("Tab");
  await expect(addKeywordButton).toBeFocused();
  await page.getByRole("button", { name: "Add keyword" }).click();
  await page.locator(".keyword-row input").last().fill(" Blue Pigment ");
  await page.getByRole("button", { name: "Remove keyword temporary term" }).click();
  await page.getByLabel("Go to next icon after confirming review").uncheck();
  await page.getByRole("button", { name: "Confirm review" }).click();

  await expect(page.locator("#review-state .review-state-label")).toHaveText("Reviewed");
  await expect(page.locator("#selected-icon-name")).toHaveText(iconId);
  await page.locator("#review-state").hover();
  await expect(page.locator("#review-state .review-state-action")).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.locator("#review-state .review-state-label")).toBeVisible();
  await expect(page.locator("#review-status")).toBeEmpty();
  await expect(page.getByRole("button", { name: "Confirm review" })).toHaveClass(/review-button-saved/);
  expect(confirmed).toHaveLength(1);
  expect(confirmed[0].iconId).toBe(iconId);
  expect(confirmed[0].iconIds).toEqual(imageGroupIds);
  expect(confirmed[0].keywords).toContain("blue pigment");
  expect(confirmed[0].keywords).not.toContain("temporary term");
  expect(confirmed[0].keywords).toContain("painted");
  expect(confirmed[0].keywords).toContain("paintbrush");
  for (const word of iconNameWords) {
    expect(confirmed[0].keywords).not.toContain(word);
  }
  await expect(page.locator(".reference-icon-item .reference-icon-keyword").filter({ hasText: "blue pigment" })).toHaveCount(2);
  expect(confirmed[0].keywords).not.toContain("temporary term");

  await page.getByRole("button", { name: "Mark as not reviewed" }).click();
  await expect(page.locator("#review-state .review-state-label")).toHaveText("Not reviewed");
  await expect(page.locator("#review-state")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Mark not reviewed" })).toHaveCount(0);
  expect(resets).toEqual([{ iconId, reviewed: false }]);
  const savedKeywordValues = await page.locator(".keyword-row input").evaluateAll((inputs) => inputs.map((input) => input.value));
  expect(savedKeywordValues).toContain("blue pigment");
  expect(savedKeywordValues).toContain("painted");
  expect(savedKeywordValues).toContain("paintbrush");
});

test("advances to the next icon after confirming review when enabled", async ({ page }) => {
  const { confirmed } = await mockKeywordReview(page);
  await page.goto("/keyword-review.html");

  await expect(page.locator("#selected-icon-name")).toHaveText(reviewableIcons[0].name);
  await expect(page.getByLabel("Go to next icon after confirming review")).toBeChecked();
  const previousBounds = await page.getByRole("button", { name: "Previous icon" }).last().boundingBox();
  const nextBounds = await page.getByRole("button", { name: "Next icon" }).last().boundingBox();
  const autoAdvanceBounds = await page.getByLabel("Go to next icon after confirming review").boundingBox();
  expect(previousBounds).not.toBeNull();
  expect(nextBounds).not.toBeNull();
  expect(autoAdvanceBounds).not.toBeNull();
  expect(Math.abs(previousBounds.y - nextBounds.y)).toBeLessThan(1);
  expect(nextBounds.x).toBeGreaterThan(previousBounds.x);
  expect(autoAdvanceBounds.y).toBeGreaterThan(previousBounds.y);
  await page.getByRole("button", { name: "Confirm review" }).click();

  await expect.poll(() => confirmed.length).toBe(1);
  expect(confirmed[0].iconId).toBe(reviewableIcons[0].name);
  await expect(page.locator("#selected-icon-name")).toHaveText(reviewableIcons[1].name);
  await expect(page.locator("#icon-position")).toHaveText(`2 of ${reviewableIcons.length.toLocaleString()}`);
  await expect(page.locator(".keyword-row input").first()).toBeFocused();
});

test("focuses Add keyword after auto-advance to an icon with no keywords", async ({ page }) => {
  await mockKeywordReview(page, { keywordOverrides: { [reviewableIcons[1].name]: [] } });
  await page.goto("/keyword-review.html");

  await page.getByRole("button", { name: "Confirm review" }).click();

  await expect(page.locator("#selected-icon-name")).toHaveText(reviewableIcons[1].name);
  await expect(page.locator(".keyword-row input")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add keyword" })).toBeFocused();
});

test("jumps forward to the next unreviewed icon, skipping reviewed icons", async ({ page }) => {
  const reviewStatus = Object.fromEntries(reviewableIcons.slice(0, 2).map((icon) => [icon.name, true]));
  await mockKeywordReview(page, { reviewStatus });
  await page.goto(`/keyword-review.html?icon_id=${encodeURIComponent(reviewableIcons[0].name)}`);

  await page.getByRole("button", { name: "Next unreviewed icon" }).first().click();

  await expect(page.locator("#selected-icon-name")).toHaveText(reviewableIcons[2].name);
  await expect(page.locator("#icon-position")).toHaveText(`3 of ${reviewableIcons.length.toLocaleString()}`);
});

test("wraps to the first unreviewed icon when starting at the end", async ({ page }) => {
  const reviewStatus = Object.fromEntries(reviewableIcons.slice(1).map((icon) => [icon.name, true]));
  const lastIcon = reviewableIcons[reviewableIcons.length - 1];
  await mockKeywordReview(page, { reviewStatus });
  await page.goto(`/keyword-review.html?icon_id=${encodeURIComponent(lastIcon.name)}`);

  await page.getByRole("button", { name: "Next unreviewed icon" }).first().click();

  await expect(page.locator("#selected-icon-name")).toHaveText(reviewableIcons[0].name);
  await expect(page.locator("#icon-position")).toHaveText(`1 of ${reviewableIcons.length.toLocaleString()}`);
});

test("disables next-unreviewed navigation when no other unreviewed icon exists", async ({ page }) => {
  const reviewStatus = Object.fromEntries(reviewableIcons.map((icon) => [icon.name, true]));
  await mockKeywordReview(page, { reviewStatus });
  await page.goto(`/keyword-review.html?icon_id=${encodeURIComponent(reviewableIcons[0].name)}`);

  await expect(page.getByRole("button", { name: "Next unreviewed icon" }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next unreviewed icon" }).last()).toBeDisabled();
});

test("lists same-image name words and marks matching keywords red", async ({ page }) => {
  const iconId = "_3DEffectColorPickerClassic";
  const imageGroupIds = imageGroupByName.get(iconId);
  const keywordOverrides = Object.fromEntries(imageGroupIds.map((name) => [name, ["bucket", "paint", "colour"]]));
  await mockKeywordReview(page, { keywordOverrides });
  await page.setViewportSize({ width: 360, height: 800 });

  await page.goto(`/keyword-review.html?icon_id=${encodeURIComponent(iconId)}`);

  const tags = await page.locator("#name-word-tags .name-word-tag").allTextContents();
  expect(tags).toContain("bucket");
  expect(tags).toContain("paint");
  const tagRows = await page.locator("#name-word-tags .name-word-tag").evaluateAll((items) =>
    new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size
  );
  expect(tagRows).toBeGreaterThan(1);
  const bucketStyle = await page.locator(".keyword-row input").evaluateAll((inputs) => {
    const input = inputs.find((entry) => entry.value === "bucket");
    return {
      className: input.className,
      background: getComputedStyle(input).backgroundColor
    };
  });
  expect(bucketStyle.className).toMatch(/keyword-from-name/);
  const background = bucketStyle.background;
  const channels = background.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/) ||
    background.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  expect(channels).not.toBeNull();
  expect(Number(channels[1])).toBeGreaterThan(Number(channels[2]));
});

test("opens synonym manager with the clicked icon-name word selected", async ({ page }) => {
  await mockKeywordReview(page);
  const iconId = "_3DEffectColorPickerClassic";
  await page.goto(`/keyword-review.html?icon_id=${encodeURIComponent(iconId)}`);

  await page.getByRole("link", { name: "color", exact: true }).click();

  await expect(page).toHaveURL(/name-synonyms\.html\?source=color$/);
  await expect(page.getByRole("heading", { name: "color", level: 2 })).toBeVisible();
  await expect(page.getByLabel("Source word or keyword")).toHaveValue("color");
});

test("locks configured synonyms and names their source word", async ({ page }) => {
  const iconId = "_3DEffectColorPickerClassic";
  const imageGroupIds = imageGroupByName.get(iconId);
  const keywordOverrides = Object.fromEntries(imageGroupIds.map((name) => [name, ["pail", "colour"]]));
  const { confirmed } = await mockKeywordReview(page, {
    keywordOverrides,
    synonyms: { bucket: ["pail"] }
  });

  await page.goto(`/keyword-review.html?icon_id=${encodeURIComponent(iconId)}`);

  const pailInput = await page.locator(".keyword-row input").evaluateAll((inputs) => {
    const input = inputs.find((entry) => entry.value === "pail");
    const lock = input.closest(".keyword-row").querySelector(".keyword-lock-indicator");
    return {
      readOnly: input.readOnly,
      inputTitle: input.title,
      lockTitle: lock.title,
      lockText: lock.textContent
    };
  });
  expect(pailInput.readOnly).toBe(true);
  expect(pailInput.inputTitle).toContain("bucket");
  expect(pailInput.lockTitle).toContain("bucket");
  expect(pailInput.lockText).toBe("\uD83D\uDD12");
  await expect(page.getByRole("button", { name: "Remove keyword pail" })).toHaveCount(0);

  await page.getByRole("button", { name: "Confirm review" }).click();
  await expect.poll(() => confirmed.length).toBe(1);
  expect(confirmed[0].keywords).toContain("pail");
});

test("locks synonyms from the shared dictionary for reviewed keywords", async ({ page }) => {
  const iconId = "_3DBevelOptionsDialog";
  const imageGroupIds = imageGroupByName.get(iconId);
  const keywordOverrides = Object.fromEntries(imageGroupIds.map((name) => [name, ["bristle", "paintbrush"]]));
  const { confirmed } = await mockKeywordReview(page, {
    keywordOverrides,
    synonyms: { paintbrush: ["bristle"] },
    reviewedKeywordOverrides: { [imageGroupIds[0]]: ["paintbrush"] }
  });

  await page.goto(`/keyword-review.html?icon_id=${encodeURIComponent(iconId)}`);

  const synonymInput = page.locator('.keyword-row input[readonly][title*="paintbrush"]');
  await expect(synonymInput).toHaveAttribute("readonly", "");
  await expect(synonymInput).toHaveAttribute("title", /paintbrush/);
  await page.getByRole("button", { name: "Confirm review" }).click();
  await expect.poll(() => confirmed.length).toBe(1);
  expect(confirmed[0].keywords).toContain("bristle");
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
  const iconId = "_3DBevelOptionsDialog";
  const imageGroupIds = imageGroupByName.get(iconId);
  const reviewedKeywordOverrides = Object.fromEntries(imageGroupIds.map((name) => [name, []]));
  await mockKeywordReview(page, { reviewedKeywordOverrides });
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
  await autocompleteInput.fill("paintb");
  await expect(page.locator(".keyword-editor .keyword-row .awesomplete > ul:not([hidden])")).toContainText("paintbrush");

  await autocompleteInput.press("Tab");

  await expect(autocompleteInput).toHaveValue("paintbrush");
  await expect(nextKeywordInput).toBeFocused();
});

test("Backspace removes an empty keyword row and focuses the previous keyword", async ({ page }) => {
  const iconId = "_3DBevelOptionsDialog";
  const imageGroupIds = imageGroupByName.get(iconId);
  const keywordOverrides = Object.fromEntries(imageGroupIds.map((name) => [name, ["paint", "bucket"]]));
  await mockKeywordReview(page, { keywordOverrides });
  await page.goto(`/keyword-review.html?icon_id=${encodeURIComponent(iconId)}`);

  const keywordInputs = page.locator(".keyword-row input");
  await expect(keywordInputs).toHaveCount(2);
  await keywordInputs.nth(1).fill("");
  await keywordInputs.nth(1).press("Backspace");

  await expect(keywordInputs).toHaveCount(1);
  await expect(keywordInputs.first()).toHaveValue("paint");
  await expect(keywordInputs.first()).toBeFocused();
});

test("opens synonym manager with a reviewed custom keyword selected", async ({ page }) => {
  const iconId = "_3DBevelOptionsDialog";
  const imageGroupIds = imageGroupByName.get(iconId);
  const keywordOverrides = Object.fromEntries(imageGroupIds.map((name) => [name, ["appearance"]]));
  const reviewedKeywordOverrides = Object.fromEntries(imageGroupIds.map((name) => [name, ["appearance"]]));
  await mockKeywordReview(page, {
    keywordOverrides,
    reviewedKeywordOverrides,
    metadataExtra: [{ name: "AppearanceIcon", imageStatus: "placeholder" }]
  });

  await page.goto(`/keyword-review.html?icon_id=${encodeURIComponent(iconId)}`);

  const synonymLink = page.getByRole("link", { name: "Manage synonyms for keyword appearance" });
  await expect(synonymLink).toHaveAttribute("href", "./name-synonyms.html?source=appearance");
  await synonymLink.focus();
  await expect(synonymLink).toBeFocused();
  await synonymLink.press("Enter");

  await expect(page).toHaveURL(/name-synonyms\.html\?source=appearance$/);
  await expect(page.getByRole("heading", { name: "appearance", level: 2 })).toBeVisible();
  await expect(page.getByLabel("Source word or keyword")).toHaveValue("appearance");
});

test("searching an identical-image ID opens its review representative", async ({ page }) => {
  await mockKeywordReview(page);
  const aliasId = "ChartFormatSelection";
  const representative = reviewableIcons.find((icon) => imageGroupByName.get(icon.name)?.includes(aliasId));
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

test("opening an identical-image ID URL selects its review representative", async ({ page }) => {
  await mockKeywordReview(page);
  const aliasId = "ChartFormatSelection";
  const representative = reviewableIcons.find((icon) => imageGroupByName.get(icon.name)?.includes(aliasId));

  await page.goto(`/keyword-review.html?icon_id=${encodeURIComponent(aliasId)}`);

  await expect(page.locator("#selected-icon-name")).toHaveText(representative.name);
  await expect(page.locator("#same-image-ids")).toContainText(aliasId);
  await expect.poll(() => new URL(page.url()).searchParams.get("icon_id")).toBe(representative.name);
});

test("confirming review does not shift the workspace while saving", async ({ page }) => {
  await mockKeywordReview(page, { confirmDelay: 300 });
  await page.goto("/keyword-review.html");
  await expect(page.locator("#selected-icon-name")).toHaveText("_0");
  const workspace = page.locator(".review-workspace");
  const confirmButton = page.getByRole("button", { name: "Confirm review" });
  await confirmButton.scrollIntoViewIfNeeded();
  const initialTop = await workspace.evaluate((element) => element.getBoundingClientRect().top);

  await confirmButton.click();
  await expect(confirmButton).toBeDisabled();
  await expect(page.locator("#review-status")).toBeEmpty();
  await expect.poll(() => workspace.evaluate((element) => element.getBoundingClientRect().top)).toBe(initialTop);
  await expect(confirmButton).toBeEnabled();
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
