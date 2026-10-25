const { test, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { normalizeReviewedKeywordGroup, normalizeReviewedKeywords, readJsonFile, readReviewStatus, removeShortNameKeywords, requiredNameKeywords, shortNameKeywords, updateMetadataKeywords, updateReviewStatus } = require("../scripts/keyword-utils");

test("metadata contains only keywords and excludes short icon-name words", async () => {
  const reviewedKeywords = require("../icon-keywords.json");
  const metadata = require("../icon-metadata.json");
  const metadataByName = new Map(metadata.map((icon) => [icon.name, icon]));
  const metadataViolations = [];

  for (const icon of metadata) {
    if (Object.hasOwn(icon, "description")) {
      metadataViolations.push(`${icon.name} has a description`);
    }
    const keywords = new Set(icon.keywords);
    const nameWords = requiredNameKeywords(icon.name);
    if (!Object.hasOwn(reviewedKeywords, icon.name)) {
      for (const word of nameWords) {
        if (!keywords.has(word)) {
          metadataViolations.push(`${icon.name} is missing generated name word ${word}`);
        }
      }
    }
    if (!Object.hasOwn(reviewedKeywords, icon.name) && nameWords.length > 1) {
      const fullNamePhrase = nameWords.join(" ");
      if (keywords.has(fullNamePhrase)) {
        metadataViolations.push(`${icon.name} includes its full name as one keyword`);
      }
    }
  }
  const keywordGroups = new Map();
  for (const icon of metadata) {
    const groupId = icon.imageStatus === "placeholder" ? icon.name : icon.imageSha256;
    const group = keywordGroups.get(groupId) || [];
    group.push(icon);
    keywordGroups.set(groupId, group);
  }
  for (const group of keywordGroups.values()) {
    const shortNameWords = shortNameKeywords(group.map((icon) => icon.name));
    for (const keyword of group[0].keywords) {
      if (shortNameWords.has(keyword)) {
        metadataViolations.push(`${keyword} is a short name word in image group ${group[0].name}`);
      }
    }
  }
  for (const [name, keywords] of Object.entries(reviewedKeywords)) {
    const icon = metadataByName.get(name);
    const relatedNames = icon?.imageStatus === "placeholder" ? [name] : [
      name,
      ...metadata.filter((other) => other.imageStatus !== "placeholder" &&
        other.imageSha256 === icon?.imageSha256 && other.name !== name).map((other) => other.name)
    ];
    const expectedKeywords = removeShortNameKeywords(relatedNames, keywords);
    if (!expectedKeywords.every((keyword) => icon?.keywords.includes(keyword))) {
      metadataViolations.push(`reviewed keywords for ${name} are missing from metadata`);
    }
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
        if (JSON.stringify(icon.keywords) !== JSON.stringify(group[0].keywords)) {
          metadataViolations.push(`${icon.name} does not share keywords with ${group[0].name}`);
        }
      }
    }
  }
  expect(metadataViolations).toEqual([]);
  const largestImageGroup = [...imageGroups.values()]
    .filter((group) => group.length > 1)
    .sort((left, right) => right[0].keywords.length - left[0].keywords.length)[0];
  expect(largestImageGroup[0].keywords.length).toBeGreaterThan(100);
  expect(normalizeReviewedKeywordGroup(largestImageGroup.map((icon) => icon.name), largestImageGroup[0].keywords))
    .toEqual(largestImageGroup[0].keywords);
  expect(normalizeReviewedKeywords("_3DBevelOptionsDialog", [" Blue Pigment ", "BEVEL"])).toEqual([
    "bevel", "blue pigment"
  ]);
  expect(requiredNameKeywords("_3DBevelOptionsDialog")).toEqual(["bevel", "options", "dialog"]);
  expect(normalizeReviewedKeywordGroup(["_3DBevelOptionsDialog"], ["3", "d", "bevel"])).toEqual(["bevel"]);
  expect(normalizeReviewedKeywordGroup(["_3DBevelOptionsDialog", "ChartFormatSelection"], [" Blue Pigment "])).toEqual([
    "blue pigment"
  ]);
});

test("stores detail data in per-icon sidecar files", async ({ request }) => {
  const response = await request.get("/icon-metadata.json");
  expect(response.ok()).toBe(true);

  const metadata = await response.json();
  expect(metadata.every((icon) => !Object.hasOwn(icon, "relatedIcons") && !Object.hasOwn(icon, "sameImageIds"))).toBe(true);
  const detailsDirectory = path.join(__dirname, "..", "icon-details");
  const detailFileNames = fs.readdirSync(detailsDirectory).filter((fileName) => fileName.endsWith(".json"));
  const metadataByName = new Map(metadata.map((icon) => [icon.name, icon]));
  const placeholderNames = new Set(metadata
    .filter((icon) => icon.imageStatus === "placeholder")
    .map((icon) => icon.name));
  const namesByImageHash = new Map();
  for (const icon of metadata) {
    if (icon.imageStatus === "placeholder") {
      continue;
    }
    const names = namesByImageHash.get(icon.imageSha256) || [];
    names.push(icon.name);
    namesByImageHash.set(icon.imageSha256, names);
  }
  const invalidSuggestions = [];
  const invalidDetails = [];
  for (const fileName of detailFileNames) {
    const iconName = path.basename(fileName, ".json");
    const details = JSON.parse(fs.readFileSync(path.join(detailsDirectory, fileName), "utf8"));
    const icon = metadataByName.get(iconName);
    if (!icon || !Array.isArray(details.relatedIcons) || !Array.isArray(details.sameImageIds)) {
      invalidDetails.push(`${iconName}: invalid detail data`);
      continue;
    }
    const expectedSameImageIds = icon.imageStatus === "placeholder"
      ? []
      : (namesByImageHash.get(icon.imageSha256) || []).filter((name) => name !== iconName);
    if (JSON.stringify(details.sameImageIds) !== JSON.stringify(expectedSameImageIds)) {
      invalidDetails.push(`${iconName}: same-image IDs do not match its image hash group`);
    }
    for (const relatedIcon of details.relatedIcons) {
      if (placeholderNames.has(relatedIcon.name) || metadataByName.get(relatedIcon.name)?.imageAsset !== relatedIcon.imageAsset) {
        invalidSuggestions.push(`${iconName}: ${relatedIcon.name}`);
      }
    }
  }
  expect(placeholderNames).toContain("ClientQuery");
  expect(fs.existsSync(path.join(detailsDirectory, "Club.json"))).toBe(false);
  assert.deepEqual(invalidDetails, []);
  expect(invalidSuggestions).toEqual([]);
});

test("shows curated related icons on a detail page", async ({ page }) => {
  await page.goto("/icon.html?icon_id=ZoomTwoPages");

  const section = page.locator("#related-icons-section");
  await expect(section).toBeVisible();
  await expect(section.getByRole("heading", { name: "Related icons" })).toBeVisible();
  await expect(page.locator("#related-icons-list li")).toContainText([
    "ZoomFitToWindow",
    "ZoomOnePage",
    "ZoomPageWidth"
  ]);

  await page.getByRole("link", { name: "ZoomPageWidth" }).click();
  await expect(page).toHaveURL(/icon\.html\?icon_id=ZoomPageWidth$/);
  await expect(page.getByRole("heading", { name: "ZoomPageWidth" })).toBeVisible();
});

test("suggests icons that share PascalCase name words", async ({ page }) => {
  await page.goto("/icon.html?icon_id=PictureInsertFromFile");

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
  await page.goto("/icon.html?icon_id=_1");

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
  await page.goto("/icon.html?icon_id=Club");

  await expect(page.locator("#related-icons-section")).toBeHidden();
});

test("shows other bright icons as related to PictureBrightnessAndContrastGallery", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/icon.html?icon_id=PictureBrightnessAndContrastGallery");

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

test("review confirmation changes only the selected icon status", () => {
  const initialStatus = {
    _0: false,
    _0PercentComplete: false,
    _1: true
  };
  const nextStatus = updateReviewStatus(initialStatus, "_0", true);

  expect(nextStatus).toEqual({
    _0: true,
    _0PercentComplete: false,
    _1: true
  });
  expect(initialStatus._0).toBe(false);
});

test("review confirmation uses status restored after the server started", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "icon-review-status-"));
  const statusPath = path.join(temporaryDirectory, "icon-review-status.json");
  try {
    fs.writeFileSync(statusPath, JSON.stringify({ _0: false, _0PercentComplete: true }));
    const cachedAtStartup = readReviewStatus(statusPath);
    fs.writeFileSync(statusPath, JSON.stringify({ _0: false, _0PercentComplete: false, _1: false }));

    const nextStatus = updateReviewStatus(readReviewStatus(statusPath), "_0", true);
    expect(nextStatus).toEqual({ _0: true, _0PercentComplete: false, _1: false });
    expect(cachedAtStartup._0PercentComplete).toBe(true);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("keyword confirmation preserves metadata restored after the server started", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "icon-metadata-"));
  const metadataPath = path.join(temporaryDirectory, "icon-metadata.json");
  try {
    fs.writeFileSync(metadataPath, JSON.stringify([
      { name: "_0", keywords: ["stale"], imageSha256: "selected" },
      { name: "Unrelated", keywords: ["stale"], relatedIcons: ["OldRelated"] }
    ]));
    const cachedAtStartup = readJsonFile(metadataPath);
    fs.writeFileSync(metadataPath, JSON.stringify([
      { name: "_0", keywords: ["zero"], imageSha256: "selected" },
      { name: "Unrelated", keywords: ["current"], relatedIcons: ["CurrentRelated"] }
    ]));

    const nextMetadata = updateMetadataKeywords(readJsonFile(metadataPath), ["_0"], ["reviewed", "zero"]);
    expect(nextMetadata).toEqual([
      { name: "_0", keywords: ["reviewed", "zero"], imageSha256: "selected" },
      { name: "Unrelated", keywords: ["current"], relatedIcons: ["CurrentRelated"] }
    ]);
    expect(cachedAtStartup[1].keywords).toEqual(["stale"]);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});