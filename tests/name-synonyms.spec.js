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
  await page.route("**/api/synonyms", async (route) => {
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
  await page.getByLabel("Source word or keyword").fill("bucket");
  await page.getByRole("button", { name: "Open word" }).click();
  await expect(page.getByRole("heading", { name: "bucket", level: 2 })).toBeVisible();
  await page.getByLabel("Synonym to add").fill("pail");
  await page.getByRole("button", { name: "Add synonym" }).click();
  await expect(page.getByRole("list", { name: "Synonyms for selected source" })).toContainText("pail");
  const saveNote = page.locator("#synonym-save-note");
  await expect(saveNote).toHaveText("Quick save updates icons using bucket only. Save synonyms rebuilds searchable keywords for every matching icon image.");
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

test("quick-saves an additive edit for only the selected source", async ({ page }) => {
  let savedSynonyms = {};
  let quickSaveBody;
  let fullSaveRequests = 0;
  await page.route("**/api/synonyms/quick", async (route) => {
    quickSaveBody = route.request().postDataJSON();
    savedSynonyms = { ...savedSynonyms, [quickSaveBody.source]: quickSaveBody.synonyms };
    await route.fulfill({ json: { synonyms: savedSynonyms, metadataUpdated: true, updatedIconGroups: 3 } });
  });
  await page.route("**/api/synonyms", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { synonyms: savedSynonyms } });
      return;
    }
    fullSaveRequests += 1;
    await route.fulfill({ json: { synonyms: route.request().postDataJSON().synonyms, metadataUpdated: true } });
  });
  await page.route("**/icon-metadata.json", async (route) => {
    await route.fulfill({ json: metadata });
  });

  await page.goto("/name-synonyms.html?source=bucket");
  await page.getByLabel("Synonym to add").fill("pail");
  await page.getByRole("button", { name: "Add synonym" }).click();
  const quickSaveButton = page.getByRole("button", { name: "Quick save source" });
  await expect(quickSaveButton).toBeEnabled();
  await quickSaveButton.click();

  await expect(page.locator("#synonym-status")).toContainText("3 matching icon groups");
  await expect(quickSaveButton).toBeDisabled();
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();
  expect(quickSaveBody).toEqual({ source: "bucket", synonyms: ["pail"] });
  expect(savedSynonyms).toEqual({ bucket: ["pail"] });
  expect(fullSaveRequests).toBe(0);
});

test("discards unsaved synonym edits", async ({ page }) => {
  const savedSynonyms = { bucket: ["pail"] };
  await page.route("**/icon-metadata.json", async (route) => {
    await route.fulfill({ json: metadata });
  });
  await page.route("**/api/synonyms", async (route) => {
    await route.fulfill({ json: { synonyms: savedSynonyms } });
  });

  await page.goto("/name-synonyms.html");
  await page.getByRole("button", { name: "bucket", exact: true }).click();
  await page.getByRole("button", { name: "Remove synonym pail for bucket" }).click();
  await expect(page.getByRole("button", { name: "Quick save source" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Discard changes" })).toBeEnabled();
  await page.getByRole("button", { name: "Discard changes" }).click();

  await expect(page.getByRole("list", { name: "Synonyms for selected source" })).toContainText("pail");
  await expect(page.getByRole("button", { name: "Discard changes" })).toBeDisabled();
});

test("rejects adding a synonym that is already a source", async ({ page }) => {
  await page.route("**/api/synonyms", async (route) => {
    await route.fulfill({ json: { synonyms: { bucket: ["pail"] } } });
  });
  await page.route("**/icon-metadata.json", async (route) => {
    await route.fulfill({ json: metadata });
  });

  await page.goto("/name-synonyms.html?source=color");
  await page.getByLabel("Source word or keyword").fill("color");
  await page.getByRole("button", { name: "Open word" }).click();
  await page.getByLabel("Synonym to add").fill("bucket");
  await page.getByRole("button", { name: "Add synonym" }).click();

  await expect(page.locator("#synonym-status")).toContainText("A synonym cannot also be a synonym source.");
  await expect(page.getByRole("button", { name: "Save synonyms" })).toBeDisabled();
});

test("adds a synonym for a reviewed keyword in the shared dictionary", async ({ page }) => {
  let savedSynonyms = {};
  await page.route("**/api/synonyms", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { synonyms: savedSynonyms } });
      return;
    }
    const body = route.request().postDataJSON();
    savedSynonyms = body.synonyms;
    await route.fulfill({ json: {
      synonyms: savedSynonyms,
      metadataUpdated: true
    } });
  });

  await page.goto("/name-synonyms.html?source=paintbrush");
  await page.getByLabel("Source word or keyword").fill("paintbrush");
  await page.getByRole("button", { name: "Open word" }).click();
  await expect(page.getByRole("heading", { name: "paintbrush", level: 2 })).toBeVisible();
  await page.getByLabel("Synonym to add").fill("bristle");
  await page.getByRole("button", { name: "Add synonym" }).click();
  await expect(page.getByRole("list", { name: "Synonyms for selected source" })).toContainText("bristle");
  await page.getByRole("button", { name: "Save synonyms" }).click();

  expect(savedSynonyms).toEqual({ paintbrush: ["bristle"] });
});

test("one synonym dictionary updates name words and reviewed keywords", async ({ request }) => {
  test.setTimeout(120_000);
  const synonymPath = path.join(__dirname, "..", "icon-synonyms.json");
  const keywordsPath = path.join(__dirname, "..", "icon-keywords.json");
  const metadataPath = path.join(__dirname, "..", "icon-metadata.json");
  const originalSynonyms = fs.readFileSync(synonymPath, "utf8");
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
    const response = await request.put("/api/synonyms", {
      data: {
        synonyms: { color: ["colour"], appearance: ["facade-term"] },
        timeout: 100_000
      }
    });
    expect(response.ok()).toBe(true);
    const updatedMetadata = await request.get("/icon-metadata.json").then((result) => result.json());
    const nameRepresentative = updatedMetadata.find((icon) => icon.name === expectedNameIds[0]);
    const keywordRepresentative = updatedMetadata.find((icon) => icon.name === expectedKeywordIds[0]);
    expect(nameRepresentative.keywords).toContain("colour");
    expect(keywordRepresentative.keywords).toContain("facade-term");
    expect(nameRepresentative.keywords).toContain("colour");
    expect(updatedMetadata.filter((icon) => icon.keywords?.includes("facade-term")).map((icon) => icon.name))
      .toContain(expectedKeywordIds[0]);
    for (const aliasId of [...expectedNameIds.slice(1), ...expectedKeywordIds.slice(1)]) {
      expect(Object.hasOwn(updatedMetadata.find((icon) => icon.name === aliasId), "keywords")).toBe(false);
    }
  } finally {
    fs.writeFileSync(synonymPath, originalSynonyms, "utf8");
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

test("quick synonym API updates matching keywords without rebuilding unrelated metadata", async ({ request }) => {
  const synonymPath = path.join(__dirname, "..", "icon-synonyms.json");
  const metadataPath = path.join(__dirname, "..", "icon-metadata.json");
  const originalSynonyms = fs.readFileSync(synonymPath, "utf8");
  const originalMetadata = fs.readFileSync(metadataPath, "utf8");
  const originalEntries = JSON.parse(originalMetadata);
  const targetName = "_3DEffectColorPickerClassic";
  const unrelatedName = "_3DBevelOptionsDialog";
  const target = originalEntries.find((icon) => icon.name === targetName);
  const unrelated = originalEntries.find((icon) => icon.name === unrelatedName);
  const groupIds = originalEntries
    .filter((icon) => icon.imageStatus !== "placeholder" && icon.imageSha256 === target.imageSha256)
    .map((icon) => icon.name);
  const sentinel = "quick-save-preserve-me";

  try {
    const metadataWithSentinel = originalEntries.map((icon) => icon.name === unrelatedName
      ? { ...icon, quickSaveSentinel: sentinel }
      : icon);
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadataWithSentinel, null, 2)}\n`, "utf8");
    const existingSynonyms = JSON.parse(originalSynonyms);
    const response = await request.put("/api/synonyms/quick", {
      data: {
        source: "color",
        synonyms: [...(existingSynonyms.color || []), "quick-save-test"]
      }
    });
    expect(response.ok()).toBe(true);
    const result = await response.json();
    expect(result.updatedIconGroups).toBeGreaterThan(0);
    expect(result.synonyms.color).toContain("quick-save-test");

    const updatedMetadata = await request.get("/icon-metadata.json").then((metadataResponse) => metadataResponse.json());
    expect(updatedMetadata.find((icon) => icon.name === targetName).keywords).toContain("quick-save-test");
    expect(updatedMetadata.find((icon) => icon.name === unrelatedName).quickSaveSentinel).toBe(sentinel);
    for (const aliasName of groupIds.slice(1)) {
      expect(Object.hasOwn(updatedMetadata.find((icon) => icon.name === aliasName), "keywords")).toBe(false);
    }
  } finally {
    fs.writeFileSync(synonymPath, originalSynonyms, "utf8");
    fs.writeFileSync(metadataPath, originalMetadata, "utf8");
  }
});
