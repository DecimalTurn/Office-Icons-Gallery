const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const metadata = require("../icon-metadata.json");

test("adds and saves a synonym for an icon-name word", async ({ page }) => {
  let savedSynonyms = {};
  let completeSave;
  const savePending = new Promise((resolve) => {
    completeSave = resolve;
  });
  await page.route("**/icon-metadata.json", async (route) => {
    await route.fulfill({ json: metadata });
  });
  await page.route("**/api/name-synonyms", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { synonyms: savedSynonyms } });
      return;
    }
    const body = route.request().postDataJSON();
    savedSynonyms = body.synonyms;
    await savePending;
    await route.fulfill({ json: { synonyms: savedSynonyms, metadataUpdated: true } });
  });

  await page.goto("/name-synonyms.html");
  await page.getByLabel("Icon-name word").fill("bucket");
  await page.getByRole("button", { name: "Open word" }).click();
  await expect(page.getByRole("heading", { name: "bucket", level: 2 })).toBeVisible();
  await page.getByLabel("Synonym to add").fill("pail");
  await page.getByRole("button", { name: "Add synonym" }).click();
  await expect(page.getByRole("list", { name: "Synonyms for selected source" })).toContainText("pail");
  const saveNote = page.locator("#synonym-save-note");
  await expect(saveNote).toHaveText("Save to update searchable keywords for every matching icon image.");
  await expect(page.getByRole("button", { name: "Save synonyms" })).toBeEnabled();
  const initialSaveNoteColor = await saveNote.evaluate((note) => getComputedStyle(note).color);
  await page.getByRole("button", { name: "Save synonyms" }).click();

  await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(saveNote).toHaveText("Updating searchable keywords for every matching icon image…");
  completeSave();
  await expect(saveNote).toHaveText("Save complete. Searchable keywords are updated for every matching icon image.");
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();
  await expect(saveNote).toHaveAttribute("data-kind", "success");
  const successSaveNoteColor = await saveNote.evaluate((note) => getComputedStyle(note).color);
  expect(successSaveNoteColor).not.toBe(initialSaveNoteColor);
  await expect(page.locator("#synonym-status")).toContainText("Searchable keywords have been updated");
  expect(savedSynonyms).toEqual({ bucket: ["pail"] });
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();
});

test("discards unsaved synonym edits", async ({ page }) => {
  const savedSynonyms = { bucket: ["pail"] };
  await page.route("**/icon-metadata.json", async (route) => {
    await route.fulfill({ json: metadata });
  });
  await page.route("**/api/name-synonyms", async (route) => {
    await route.fulfill({ json: { synonyms: savedSynonyms } });
  });

  await page.goto("/name-synonyms.html");
  await page.getByRole("button", { name: "bucket", exact: true }).click();
  await page.getByRole("button", { name: "Remove synonym pail for bucket" }).click();
  await expect(page.getByRole("button", { name: "Discard changes" })).toBeEnabled();
  await page.getByRole("button", { name: "Discard changes" }).click();

  await expect(page.getByRole("list", { name: "Synonyms for selected source" })).toContainText("pail");
  await expect(page.getByRole("button", { name: "Discard changes" })).toBeDisabled();
});

test("adds a synonym for a reviewed custom keyword", async ({ page }) => {
  let savedNameSynonyms = {};
  let savedKeywordSynonyms = {};
  await page.route("**/api/name-synonyms", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: {
        synonyms: savedNameSynonyms,
        keywordSynonyms: savedKeywordSynonyms
      } });
      return;
    }
    const body = route.request().postDataJSON();
    savedNameSynonyms = body.synonyms;
    savedKeywordSynonyms = body.keywordSynonyms;
    await route.fulfill({ json: {
      synonyms: savedNameSynonyms,
      keywordSynonyms: savedKeywordSynonyms,
      metadataUpdated: true
    } });
  });

  await page.goto("/name-synonyms.html");
  await page.getByLabel("Source type").selectOption("keyword");
  await page.getByLabel("Custom keyword").fill("paintbrush");
  await page.getByRole("button", { name: "Open word" }).click();
  await expect(page.getByRole("heading", { name: "paintbrush", level: 2 })).toBeVisible();
  await page.getByLabel("Synonym to add").fill("bristle");
  await page.getByRole("button", { name: "Add synonym" }).click();
  await expect(page.getByRole("list", { name: "Synonyms for selected source" })).toContainText("bristle");
  await page.getByRole("button", { name: "Save synonyms" }).click();

  expect(savedNameSynonyms).toEqual({});
  expect(savedKeywordSynonyms).toEqual({ paintbrush: ["bristle"] });
});

test("saving a synonym updates metadata for every ID with that real image", async ({ request }) => {
  test.setTimeout(120_000);
  const synonymPath = path.join(__dirname, "..", "icon-name-synonyms.json");
  const keywordSynonymPath = path.join(__dirname, "..", "icon-keyword-synonyms.json");
  const keywordsPath = path.join(__dirname, "..", "icon-keywords.json");
  const metadataPath = path.join(__dirname, "..", "icon-metadata.json");
  const originalSynonyms = fs.readFileSync(synonymPath, "utf8");
  const originalKeywordSynonyms = fs.readFileSync(keywordSynonymPath, "utf8");
  const originalKeywords = fs.readFileSync(keywordsPath, "utf8");
  const originalMetadata = fs.readFileSync(metadataPath, "utf8");
  const nameTarget = metadata.find((icon) => icon.name === "_3DEffectColorPickerClassic");
  const keywordTarget = metadata.find((icon) => icon.name === "_3DBevelOptionsDialog");
  const imageGroupIds = (target) => metadata
    .filter((icon) => icon.imageStatus !== "placeholder" && icon.imageSha256 === target.imageSha256)
    .map((icon) => icon.name);
  const expectedNameIds = imageGroupIds(nameTarget);
  const expectedKeywordIds = imageGroupIds(keywordTarget);

  try {
    const reviewedKeywords = JSON.parse(originalKeywords);
    reviewedKeywords[expectedKeywordIds[0]] = [...new Set([
      ...(reviewedKeywords[expectedKeywordIds[0]] || []),
      "appearance"
    ])];
    fs.writeFileSync(keywordsPath, `${JSON.stringify(reviewedKeywords, null, 2)}\n`, "utf8");
    const response = await request.put("/api/name-synonyms", {
      data: {
        synonyms: { bucket: ["pail"] },
        keywordSynonyms: { paintbrush: ["bristle"], appearance: ["facade-term"] },
        timeout: 100_000
      }
    });
    expect(response.ok()).toBe(true);
    const updatedMetadata = await request.get("/icon-metadata.json").then((result) => result.json());
    const nameRepresentative = updatedMetadata.find((icon) => icon.name === expectedNameIds[0]);
    const keywordRepresentative = updatedMetadata.find((icon) => icon.name === expectedKeywordIds[0]);
    expect(nameRepresentative.keywords).toContain("pail");
    expect(keywordRepresentative.keywords).toContain("bristle");
    expect(keywordRepresentative.keywords).toContain("facade-term");
    expect(updatedMetadata.filter((icon) => icon.keywords?.includes("pail")).map((icon) => icon.name))
      .toEqual([expectedNameIds[0]]);
    expect(updatedMetadata.filter((icon) => icon.keywords?.includes("bristle")).map((icon) => icon.name))
      .toEqual([expectedKeywordIds[0]]);
    for (const aliasId of [...expectedNameIds.slice(1), ...expectedKeywordIds.slice(1)]) {
      expect(Object.hasOwn(updatedMetadata.find((icon) => icon.name === aliasId), "keywords")).toBe(false);
    }
  } finally {
    fs.writeFileSync(synonymPath, originalSynonyms, "utf8");
    fs.writeFileSync(keywordSynonymPath, originalKeywordSynonyms, "utf8");
    fs.writeFileSync(keywordsPath, originalKeywords, "utf8");
    const { spawnSync } = require("node:child_process");
    const generation = spawnSync(process.execPath, [path.join(__dirname, "..", "generate-icon-metadata.js")], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8"
    });
    if (generation.status !== 0) {
      throw new Error(generation.stderr || "Could not restore metadata after synonym API test");
    }
    fs.writeFileSync(metadataPath, originalMetadata, "utf8");
  }
});
