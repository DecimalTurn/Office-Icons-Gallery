const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

test("downloads the displayed icon as PNG, ICO, and JPEG", async ({ page }) => {
  await page.goto("/icon.html?name=FileSave");

  const downloadButton = page.locator("#download-button");
  await expect(downloadButton).toBeEnabled();

  await downloadButton.click();
  await expect(downloadButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menuitem")).toHaveText(["PNG", "ICO", "JPEG"]);

  const png = fs.readFileSync(path.join(__dirname, "..", "images", "FileSave.png"));
  const formats = [
    { format: "png", extension: "png" },
    { format: "ico", extension: "ico" },
    { format: "jpeg", extension: "jpg" }
  ];

  for (const { format, extension } of formats) {
    if (await downloadButton.getAttribute("aria-expanded") === "false") {
      await downloadButton.click();
    }
    await expect(downloadButton).toHaveAttribute("aria-expanded", "true");
    const downloadPromise = page.waitForEvent("download");
    await page.locator(`[data-download-format="${format}"]`).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`FileSave.${extension}`);

    const downloadedPath = await download.path();
    const fileBytes = fs.readFileSync(downloadedPath);
    if (format === "png") {
      expect(fileBytes).toEqual(png);
      continue;
    }

    if (format === "jpeg") {
      expect(fileBytes[0]).toBe(0xff);
      expect(fileBytes[1]).toBe(0xd8);
      expect(fileBytes[fileBytes.length - 2]).toBe(0xff);
      expect(fileBytes[fileBytes.length - 1]).toBe(0xd9);
      continue;
    }

    expect(fileBytes.readUInt16LE(0)).toBe(0);
    expect(fileBytes.readUInt16LE(2)).toBe(1);
    expect(fileBytes.readUInt16LE(4)).toBe(1);
    expect(fileBytes[6]).toBe(32);
    expect(fileBytes[7]).toBe(32);
    expect(fileBytes.readUInt16LE(10)).toBe(1);
    expect(fileBytes.readUInt16LE(12)).toBe(32);
    expect(fileBytes.readUInt32LE(14)).toBe(png.length);
    expect(fileBytes.readUInt32LE(18)).toBe(22);
    expect(fileBytes.subarray(22)).toEqual(png);
  }
});