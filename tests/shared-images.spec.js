const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

test("maps icon IDs to existing shortened-SHA image assets", () => {
  const metadata = require("../icon-metadata.json");
  const metadataByName = new Map(metadata.map((icon) => [icon.name, icon]));
  const assetPaths = new Set(metadata.map((icon) => icon.imageAsset));
  const assetDirectory = path.join(__dirname, "..", "images", "by-hash");
  const assetFileNames = new Set(fs.readdirSync(assetDirectory));

  assert.equal(assetPaths.size, 3407);
  assert.deepEqual(assetFileNames, new Set([...assetPaths].map((asset) => path.basename(asset))));
  for (const icon of metadata) {
    assert.match(icon.imageAsset, /^images\/by-hash\/[a-f0-9]{16}\.png$/);
    for (const sameImageName of icon.sameImageIds || []) {
      assert.equal(metadataByName.get(sameImageName).imageAsset, icon.imageAsset);
    }
  }

  const representativeAsset = [...assetPaths][0];
  const imagePath = path.join(__dirname, "..", representativeAsset);
  const hashPrefix = crypto.createHash("sha256").update(fs.readFileSync(imagePath)).digest("hex").slice(0, 16);
  assert.equal(path.basename(representativeAsset, ".png"), hashPrefix);
});

test("lists IDs that use the same image on the icon detail page", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/icon.html?name=BorderMoreColorsDialog");

  const section = page.locator("#same-image-section");
  await expect(section).toBeVisible();
  await expect(section.getByRole("heading", { name: "Other IDs using the same image" })).toBeVisible();
  const matchingId = page.getByRole("link", { name: "FontColorCycle" });
  await expect(matchingId).toBeVisible();

  const copyButton = page.getByRole("button", { name: "Copy FontColorCycle ID" });
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  await expect(page.locator("#copy-status")).toHaveText("✓ Copied FontColorCycle");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("FontColorCycle");
  await expect(page).toHaveURL(/icon\.html\?name=BorderMoreColorsDialog$/);

  await matchingId.click();
  await expect(page).toHaveURL(/icon\.html\?name=FontColorCycle$/);
});

test("does not list placeholder IDs as alternative image names", async ({ page }) => {
  await page.goto("/icon.html?name=AccountingFormatExcel");

  await expect(page.locator("#icon-image-status")).toHaveText(/shared Office fallback/);
  await expect(page.locator("#same-image-section")).toBeHidden();
});

test("keeps long alternative IDs clear of their copy buttons on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/icon.html?name=BorderMoreColorsDialog");

  const rows = page.locator("#same-image-list li");
  await expect(rows.first()).toBeVisible();
  const columnCount = await rows.first().evaluate((firstRow) => {
    return getComputedStyle(firstRow.parentElement).gridTemplateColumns.split(" ").length;
  });
  expect(columnCount).toBe(1);

  for (const row of await rows.all()) {
    const link = await row.locator(".same-image-link").boundingBox();
    const copyButton = await row.locator(".same-image-copy-button").boundingBox();
    const label = row.locator(".same-image-link span");

    expect(link).not.toBeNull();
    expect(copyButton).not.toBeNull();
    expect(link.x + link.width).toBeLessThanOrEqual(copyButton.x);
    expect(copyButton.x - (link.x + link.width)).toBeLessThanOrEqual(6);
    await expect(label).toHaveCSS("white-space", "nowrap");
  }
});