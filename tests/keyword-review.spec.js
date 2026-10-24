const { test, expect } = require("@playwright/test");
const { normalizeReviewedKeywordGroup, requiredNameKeywords } = require("../scripts/keyword-utils");
const metadata = require("../icon-metadata.json");
const iconsByImageHash = new Map();
for (const icon of metadata.filter((entry) => entry.imageStatus !== "placeholder")) {
  const group = iconsByImageHash.get(icon.imageSha256) || [];
  group.push(icon.name);
  iconsByImageHash.set(icon.imageSha256, group);
}
const imageGroupByName = new Map([...iconsByImageHash.values()].flatMap((iconIds) =>
  iconIds.map((iconId) => [iconId, iconIds])
));

async function mockKeywordReview(page) {
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
  await page.route("**/api/keyword-review/**", async (route) => {
    const body = route.request().postDataJSON();
    if (route.request().url().endsWith("/confirm")) {
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

test("edits separate keywords and confirms them with required icon-name words", async ({ page }) => {
  const { confirmed, resets } = await mockKeywordReview(page);
  const iconId = "_3DBevelOptionsDialog";
  const imageGroupIds = imageGroupByName.get(iconId);
  await page.goto("/keyword-review.html");
  await expect(page.locator("#selected-icon-name")).toHaveText("_0");
  await expect(page.locator("#review-count")).toContainText("/ 9,324 reviewed");

  await page.getByLabel("Search icon ID").fill(iconId);
  await page.getByRole("option", { name: iconId }).click();
  const required = [...new Set(imageGroupIds.flatMap(requiredNameKeywords))];
  const keywordRows = page.locator(".keyword-row");
  const renderedRows = await keywordRows.evaluateAll((rows) => rows.map((row) => ({
    value: row.querySelector("input").value,
    readOnly: row.querySelector("input").readOnly,
    fromNameClass: row.querySelector("input").classList.contains("keyword-from-name"),
    removeDisabled: row.querySelector("button").disabled
  })));
  for (const word of required) {
    const row = renderedRows.find((entry) => entry.value === word);
    expect(row, `name keyword ${word}`).toBeTruthy();
    expect(row.readOnly).toBe(false);
    expect(row.fromNameClass).toBe(true);
    expect(row.removeDisabled).toBe(false);
  }
  const publisherIndex = renderedRows.findIndex((entry) => entry.value === "publisher");
  expect(publisherIndex).toBeGreaterThanOrEqual(0);
  await keywordRows.nth(publisherIndex).locator("input").fill("published");
  await page.getByRole("button", { name: "Remove keyword horiz" }).click();
  await page.getByRole("button", { name: "Add keyword" }).click();
  const temporaryInput = page.locator(".keyword-row input").last();
  await temporaryInput.fill("beve");
  const keywordSuggestions = page.locator(".keyword-editor .keyword-row .awesomplete > ul:not([hidden])");
  await expect(keywordSuggestions).toBeVisible();
  await expect(keywordSuggestions).toContainText("bevel");
  await temporaryInput.fill("temporary term");
  const backgrounds = await page.evaluate(() => {
    const requiredInput = document.querySelector("input.keyword-from-name");
    const editableInput = document.querySelector(".keyword-row input:not(.keyword-from-name)");
    const colors = {};
    for (const theme of ["light", "dark"]) {
      document.documentElement.dataset.theme = theme;
      colors[theme] = {
        required: getComputedStyle(requiredInput).backgroundColor,
        editable: getComputedStyle(editableInput).backgroundColor
      };
    }
    return colors;
  });
  expect(backgrounds.light.required).not.toBe(backgrounds.light.editable);
  expect(backgrounds.dark.required).not.toBe(backgrounds.dark.editable);

  await page.getByRole("button", { name: "Add keyword" }).click();
  await page.locator(".keyword-row input").last().fill(" Blue Pigment ");
  await page.getByRole("button", { name: "Remove keyword temporary term" }).click();
  await page.getByRole("button", { name: "Confirm review" }).click();

  await expect(page.locator("#review-state")).toHaveText("Reviewed");
  await expect(page.getByText(`Keywords saved for ${iconId}.`)).toBeVisible();
  expect(confirmed).toHaveLength(1);
  expect(confirmed[0].iconId).toBe(iconId);
  expect(confirmed[0].iconIds).toEqual(imageGroupIds);
  expect(confirmed[0].keywords).toContain("blue pigment");
  expect(confirmed[0].keywords).not.toContain("temporary term");
  expect(confirmed[0].keywords).toContain("published");
  expect(confirmed[0].keywords).not.toContain("publisher");
  expect(confirmed[0].keywords).not.toContain("horiz");
  await expect(page.locator(".reference-icon-item .reference-icon-keyword").filter({ hasText: "blue pigment" })).toHaveCount(2);
  for (const word of required) {
    if (word !== "publisher" && word !== "horiz") {
      expect(confirmed[0].keywords).toContain(word);
    }
  }

  await page.getByRole("button", { name: "Mark not reviewed" }).click();
  await expect(page.locator("#review-state")).toHaveText("Not reviewed");
  expect(resets).toEqual([{ iconId, reviewed: false }]);
  const savedKeywordValues = await page.locator(".keyword-row input").evaluateAll((inputs) => inputs.map((input) => input.value));
  expect(savedKeywordValues).toContain("blue pigment");
  expect(savedKeywordValues).toContain("published");
  expect(savedKeywordValues).not.toContain("publisher");
  expect(savedKeywordValues).not.toContain("horiz");
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
