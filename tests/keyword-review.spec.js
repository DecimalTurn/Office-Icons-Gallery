const { test, expect } = require("@playwright/test");
const { normalizeReviewedKeywords, requiredNameKeywords } = require("../scripts/keyword-utils");

async function mockKeywordReview(page) {
  const confirmed = [];
  const resets = [];
  await page.route("**/icon-review-status.json", async (route) => {
    await route.fulfill({ json: {} });
  });
  await page.route("**/api/keyword-review/**", async (route) => {
    const body = route.request().postDataJSON();
    if (route.request().url().endsWith("/confirm")) {
      confirmed.push(body);
      await route.fulfill({ json: {
        iconId: body.iconId,
        keywords: normalizeReviewedKeywords(body.iconId, body.keywords),
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
  await page.goto("/description-review.html");
  await expect(page.locator("#selected-icon-name")).toHaveText("_0");
  await expect(page.locator("#review-count")).toContainText("/ 9,324 reviewed");

  await page.getByLabel("Search icon ID").fill("_3DBevelOptionsDialog");
  await page.getByRole("option", { name: "_3DBevelOptionsDialog" }).click();
  const iconId = "_3DBevelOptionsDialog";
  const required = requiredNameKeywords(iconId);
  const keywordRows = page.locator(".keyword-row");
  const renderedRows = await keywordRows.evaluateAll((rows) => rows.map((row) => ({
    value: row.querySelector("input").value,
    readOnly: row.querySelector("input").readOnly,
    requiredClass: row.querySelector("input").classList.contains("keyword-required"),
    removeDisabled: row.querySelector("button").disabled
  })));
  for (const word of required) {
    const row = renderedRows.find((entry) => entry.value === word);
    expect(row, `required keyword ${word}`).toBeTruthy();
    expect(row.readOnly).toBe(true);
    expect(row.requiredClass).toBe(true);
    expect(row.removeDisabled).toBe(true);
  }
  await page.getByRole("button", { name: "Add keyword" }).click();
  await page.locator(".keyword-row input").last().fill("temporary term");
  const backgrounds = await page.evaluate(() => {
    const requiredInput = document.querySelector("input.keyword-required");
    const editableInput = document.querySelector(".keyword-row input:not(.keyword-required)");
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
  expect(confirmed[0].keywords).toContain("blue pigment");
  expect(confirmed[0].keywords).not.toContain("temporary term");
  for (const word of required) {
    expect(confirmed[0].keywords).toContain(word);
  }

  await page.getByRole("button", { name: "Mark not reviewed" }).click();
  await expect(page.locator("#review-state")).toHaveText("Not reviewed");
  expect(resets).toEqual([{ iconId, reviewed: false }]);
  const savedKeywordValues = await page.locator(".keyword-row input").evaluateAll((inputs) => inputs.map((input) => input.value));
  expect(savedKeywordValues).toContain("blue pigment");
  expect(savedKeywordValues).toEqual(expect.arrayContaining(required));
});

test("rejects an empty keyword row until it is filled or removed", async ({ page }) => {
  const { confirmed } = await mockKeywordReview(page);
  await page.goto("/description-review.html");
  await expect(page.locator("#selected-icon-name")).toHaveText("_0");
  await page.getByRole("button", { name: "Add keyword" }).click();
  await page.getByRole("button", { name: "Confirm review" }).click();
  await expect(page.locator("#review-status")).toContainText("Remove empty keyword rows");
  expect(confirmed).toHaveLength(0);
});
