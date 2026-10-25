const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const metadata = require("../icon-metadata.json");

test("adds and saves a synonym for an icon-name word", async ({ page }) => {
  let savedSynonyms = {};
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
    await route.fulfill({ json: { synonyms: savedSynonyms, metadataUpdated: true } });
  });

  await page.goto("/name-synonyms.html");
  await page.getByLabel("Icon-name word").fill("bucket");
  await page.getByRole("button", { name: "Open word" }).click();
  await expect(page.getByRole("heading", { name: "bucket", level: 2 })).toBeVisible();
  await page.getByLabel("Synonym to add").fill("pail");
  await page.getByRole("button", { name: "Add synonym" }).click();
  await expect(page.getByRole("list", { name: "Synonyms for selected name word" })).toContainText("pail");
  await expect(page.getByRole("button", { name: "Save synonyms" })).toBeEnabled();
  await page.getByRole("button", { name: "Save synonyms" }).click();

  await expect(page.locator("#synonym-status")).toContainText("Searchable keywords have been updated");
  expect(savedSynonyms).toEqual({ bucket: ["pail"] });
  await expect(page.getByRole("button", { name: "Save synonyms" })).toBeDisabled();
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

  await expect(page.getByRole("list", { name: "Synonyms for selected name word" })).toContainText("pail");
  await expect(page.getByRole("button", { name: "Discard changes" })).toBeDisabled();
});

test("saving a synonym updates metadata for every ID with that real image", async ({ request }) => {
  test.setTimeout(120_000);
  const synonymPath = path.join(__dirname, "..", "icon-name-synonyms.json");
  const originalSynonyms = fs.readFileSync(synonymPath, "utf8");
  const target = metadata.find((icon) => icon.name === "_3DEffectColorPickerClassic");
  const expectedIds = metadata
    .filter((icon) => icon.imageStatus !== "placeholder" && icon.imageSha256 === target.imageSha256)
    .map((icon) => icon.name);

  try {
    const response = await request.put("/api/name-synonyms", {
      data: { synonyms: { bucket: ["pail"] }, timeout: 100_000 }
    });
    expect(response.ok()).toBe(true);
    const updatedMetadata = await request.get("/icon-metadata.json").then((result) => result.json());
    const pailIds = updatedMetadata.filter((icon) => icon.keywords?.includes("pail")).map((icon) => icon.name);
    expect(pailIds).toEqual([expectedIds[0]]);
    for (const aliasId of expectedIds.slice(1)) {
      expect(Object.hasOwn(updatedMetadata.find((icon) => icon.name === aliasId), "keywords")).toBe(false);
    }
  } finally {
    fs.writeFileSync(synonymPath, originalSynonyms, "utf8");
    const { spawnSync } = require("node:child_process");
    const generation = spawnSync(process.execPath, [path.join(__dirname, "..", "generate-icon-metadata.js")], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8"
    });
    if (generation.status !== 0) {
      throw new Error(generation.stderr || "Could not restore metadata after synonym API test");
    }
  }
});
