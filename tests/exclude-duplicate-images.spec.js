const { test, expect } = require("@playwright/test");

test("excludes duplicate images and keeps the first alphabetic ID", async ({ page }) => {
  await page.goto("/index.html");

  const expected = await page.evaluate(async () => {
    const metadata = await (await fetch("./icon-metadata.json")).json();
    const firstNameByImage = new Map();
    metadata.forEach((icon) => {
      if (!firstNameByImage.has(icon.imageAsset)) {
        firstNameByImage.set(icon.imageAsset, icon.name);
      }
    });
    const uniqueIcons = metadata.filter((icon) => firstNameByImage.get(icon.imageAsset) === icon.name);
    const duplicate = metadata.find((icon) => firstNameByImage.get(icon.imageAsset) !== icon.name);

    return {
      count: uniqueIcons.length,
      firstPageNames: uniqueIcons.slice(0, 500).map(({ name }) => name),
      firstDuplicateName: firstNameByImage.get(duplicate.imageAsset),
      duplicateName: duplicate.name
    };
  });
  const excludeDuplicates = page.getByRole("checkbox", { name: "Exclude duplicate images" });

  await expect(excludeDuplicates).not.toBeChecked();
  await excludeDuplicates.check();

  await expect(page).toHaveURL(/ExcludeDuplicateImages=1$/);
  await expect(excludeDuplicates).toBeChecked();
  await expect(page.locator("#search-result-count")).toHaveText(`${expected.count.toLocaleString()} icons found`);
  await expect(page.locator(".mso-list li")).toHaveCount(500);
  const renderedNames = await page.locator(".mso-list li img").evaluateAll((images) => images.map((image) => image.alt));
  expect(renderedNames).toEqual(expected.firstPageNames);
  await expect(page.locator(`.mso-list a[title="${expected.firstDuplicateName}"]`)).toHaveCount(1);
  await expect(page.locator(`.mso-list a[title="${expected.duplicateName}"]`)).toHaveCount(0);

  await page.reload();
  await expect(excludeDuplicates).toBeChecked();
  await expect(page.locator("#search-result-count")).toHaveText(`${expected.count.toLocaleString()} icons found`);

  await page.getByRole("checkbox", { name: "Hide image labels" }).check();
  await expect(page).toHaveURL(/ExcludeDuplicateImages=1/);
  await expect(page).toHaveURL(/ExcludeLabels=1/);
  await expect(page.locator(".mso-list li span").first()).toBeHidden();
});