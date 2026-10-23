const { test, expect } = require("@playwright/test");

test("shows curated related icons on a detail page", async ({ page }) => {
  await page.goto("/Icon.html?name=ZoomTwoPages");

  const section = page.locator("#related-icons-section");
  await expect(section).toBeVisible();
  await expect(section.getByRole("heading", { name: "Related icons" })).toBeVisible();
  await expect(page.locator("#related-icons-list li")).toHaveText([
    "ZoomFitToWindow",
    "ZoomOnePage",
    "ZoomPageWidth"
  ]);

  await page.getByRole("link", { name: "ZoomPageWidth" }).click();
  await expect(page).toHaveURL(/Icon\.html\?name=ZoomPageWidth$/);
  await expect(page.getByRole("heading", { name: "ZoomPageWidth" })).toBeVisible();
});

test("marks each single-digit number icon as related to the other digits", async ({ page }) => {
  await page.goto("/Icon.html?name=_1");

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
  await page.goto("/Icon.html?name=FileSave");

  await expect(page.locator("#related-icons-section")).toBeHidden();
});

test("shows other bright icons as related to PictureBrightnessAndContrastGallery", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/Icon.html?name=PictureBrightnessAndContrastGallery");

  await expect(page.locator("#related-icons-list li")).toHaveText([
    "BrightnessAndContrastEdit",
    "BrightnessLess",
    "BrightnessMore",
    "Drawing1GalleryBrightness",
    "PictureBrightnessGallery"
  ]);
  await expect.poll(() => page.locator("#related-icons-list img").evaluateAll((images) =>
    images.every((image) => image.complete && image.naturalWidth > 0)
  )).toBe(true);

  const previousButton = page.getByRole("button", { name: "Show previous related icons" });
  const nextButton = page.getByRole("button", { name: "Show next related icons" });
  await expect(previousButton).toBeDisabled();
  await expect(nextButton).toBeEnabled();
  await nextButton.click();
  await expect.poll(() => page.locator("#related-icons-list").evaluate((list) => list.scrollLeft)).toBeGreaterThan(0);
  await expect(previousButton).toBeEnabled();
});