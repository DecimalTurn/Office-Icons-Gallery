const { test, expect } = require("@playwright/test");
const { normalizeReviewedKeywordGroup, normalizeReviewedKeywords, requiredNameKeywords } = require("../scripts/keyword-utils");

test("metadata contains only keywords and includes every icon-name word", async () => {
  const reviewedKeywords = require("../icon-keywords.json");
  const metadata = require("../icon-metadata.json");
  const metadataByName = new Map(metadata.map((icon) => [icon.name, icon]));

  for (const icon of metadata) {
    expect(icon).not.toHaveProperty("description");
    const keywords = new Set(icon.keywords);
    const nameWords = requiredNameKeywords(icon.name);
    if (!Object.hasOwn(reviewedKeywords, icon.name)) {
      for (const word of nameWords) {
        expect(keywords.has(word), `${icon.name} should include generated name word ${word}`).toBe(true);
      }
    }
    if (!Object.hasOwn(reviewedKeywords, icon.name) && nameWords.length > 1) {
      const fullNamePhrase = nameWords.join(" ");
      expect(keywords.has(fullNamePhrase), `${icon.name} should not include its full name as one keyword`).toBe(false);
    }
  }
  for (const [name, keywords] of Object.entries(reviewedKeywords)) {
    expect(metadataByName.get(name)?.keywords, `reviewed keywords for ${name}`).toEqual(keywords);
  }
  const imageGroups = new Map();
  for (const icon of metadata.filter((entry) => entry.imageStatus !== "placeholder")) {
    const group = imageGroups.get(icon.imageSha256) || [];
    group.push(icon);
    imageGroups.set(icon.imageSha256, group);
  }
  for (const group of imageGroups.values()) {
    if (group.length > 1) {
      for (const icon of group.slice(1)) {
        expect(icon.keywords, `${icon.name} should share keywords with ${group[0].name}`).toEqual(group[0].keywords);
      }
    }
  }
  const largestImageGroup = [...imageGroups.values()]
    .filter((group) => group.length > 1)
    .sort((left, right) => right[0].keywords.length - left[0].keywords.length)[0];
  expect(largestImageGroup[0].keywords.length).toBeGreaterThan(100);
  expect(normalizeReviewedKeywordGroup(largestImageGroup.map((icon) => icon.name), largestImageGroup[0].keywords))
    .toEqual(largestImageGroup[0].keywords);
  expect(normalizeReviewedKeywords("_3DBevelOptionsDialog", [" Blue Pigment ", "BEVEL"])).toEqual([
    "bevel", "blue pigment"
  ]);
  expect(normalizeReviewedKeywordGroup(["_3DBevelOptionsDialog", "ChartFormatSelection"], [" Blue Pigment "])).toEqual([
    "blue pigment"
  ]);
});

test("never suggests placeholder images as related icons", async ({ request }) => {
  const response = await request.get("/icon-metadata.json");
  expect(response.ok()).toBe(true);

  const metadata = await response.json();
  const placeholderNames = new Set(metadata
    .filter((icon) => icon.imageStatus === "placeholder")
    .map((icon) => icon.name));
  const invalidSuggestions = metadata.flatMap((icon) =>
    (icon.relatedIcons || [])
      .filter((relatedName) => placeholderNames.has(relatedName))
      .map((relatedName) => `${icon.name}: ${relatedName}`)
  );

  expect(placeholderNames).toContain("ClientQuery");
  expect(invalidSuggestions).toEqual([]);
});

test("shows curated related icons on a detail page", async ({ page }) => {
  await page.goto("/icon.html?name=ZoomTwoPages");

  const section = page.locator("#related-icons-section");
  await expect(section).toBeVisible();
  await expect(section.getByRole("heading", { name: "Related icons" })).toBeVisible();
  await expect(page.locator("#related-icons-list li")).toContainText([
    "ZoomFitToWindow",
    "ZoomOnePage",
    "ZoomPageWidth"
  ]);

  await page.getByRole("link", { name: "ZoomPageWidth" }).click();
  await expect(page).toHaveURL(/icon\.html\?name=ZoomPageWidth$/);
  await expect(page.getByRole("heading", { name: "ZoomPageWidth" })).toBeVisible();
});

test("suggests icons that share PascalCase name words", async ({ page }) => {
  await page.goto("/icon.html?name=PictureInsertFromFile");

  await expect(page.locator("#related-icons-list li").first()).toBeVisible();
  const relatedNames = await page.locator("#related-icons-list li").allTextContents();
  expect(relatedNames).toContain("AutoSigInsertPictureFromFile");
  expect(relatedNames).toContain("PictureFromFileInsert");
  expect(relatedNames).toContain("PictureInsertFromFilePowerPoint");
  expect(relatedNames).toContain("PictureInsertFromFilePub");
  expect(relatedNames).not.toContain("_3DBevelPictureTopGallery");
  expect(relatedNames.length).toBeLessThanOrEqual(12);
});

test("marks each single-digit number icon as related to the other digits", async ({ page }) => {
  await page.goto("/icon.html?name=_1");

  await expect(page.locator("#related-icons-list li")).toHaveText([
    "_0",
    "_2",
    "_3",
    "_4",
    "_5",
    "_6",
    "_7",
    "_8",
    "_9"
  ]);
});

test("hides the related icons section when no relationships are curated", async ({ page }) => {
  await page.goto("/icon.html?name=Club");

  await expect(page.locator("#related-icons-section")).toBeHidden();
});

test("shows other bright icons as related to PictureBrightnessAndContrastGallery", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/icon.html?name=PictureBrightnessAndContrastGallery");

  await expect(page.locator("#related-icons-list li")).toContainText([
    "BrightnessAndContrastEdit",
    "BrightnessLess",
    "BrightnessMore",
    "Drawing1GalleryBrightness",
    "PictureBrightnessGallery"
  ]);
  await expect.poll(() => page.locator("#related-icons-list img").evaluateAll((images) =>
    images.every((image) => {
      const htmlImage = /** @type {HTMLImageElement} */ (image);
      return htmlImage.complete && htmlImage.naturalWidth > 0;
    })
  )).toBe(true);

  const previousButton = page.getByRole("button", { name: "Show previous related icons" });
  const nextButton = page.getByRole("button", { name: "Show next related icons" });
  await expect(previousButton).toBeDisabled();
  await expect(nextButton).toBeEnabled();
  await nextButton.click();
  await expect.poll(() => page.locator("#related-icons-list").evaluate((list) => list.scrollLeft)).toBeGreaterThan(0);
  await expect(previousButton).toBeEnabled();
});