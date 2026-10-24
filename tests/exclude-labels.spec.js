const { test, expect } = require("@playwright/test");

async function galleryLayout(page) {
  return page.evaluate(() => {
    const items = [...document.querySelectorAll(".mso-list li")];
    const tops = items.map((item) => item.getBoundingClientRect().top);
    const firstTop = tops[0];
    const columns = tops.filter((top) => Math.abs(top - firstTop) < 2).length;
    const list = document.querySelector(".mso-list").getBoundingClientRect();
    const labelVisible = items.some((item) => {
      const label = item.querySelector("span");
      if (!label) {
        return false;
      }
      const style = getComputedStyle(label);
      return style.display !== "none" && style.visibility !== "hidden" && label.getClientRects().length > 0;
    });

    return {
      columns,
      listHeight: list.height,
      count: items.length,
      labelVisible
    };
  });
}

test("hides image labels and packs a page of icons into a dense grid", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/index.html");

  const excludePlaceholders = page.getByRole("checkbox", { name: "Exclude placeholder images" });
  const excludeLabels = page.getByRole("checkbox", { name: "Exclude image labels" });
  const placeholderBounds = await excludePlaceholders.boundingBox();
  const labelBounds = await excludeLabels.boundingBox();

  if (placeholderBounds === null || labelBounds === null) {
    throw new Error("Gallery filter checkbox has no bounding box");
  }
  expect(labelBounds.y).toBeGreaterThan(placeholderBounds.y + placeholderBounds.height - 1);
  expect(labelBounds.x).toBeCloseTo(placeholderBounds.x, 0);
  expect(labelBounds.width).toBe(16);
  expect(labelBounds.height).toBe(16);
  await expect(excludeLabels).not.toBeChecked();
  await expect(page.locator("label[for='exclude-labels']")).toHaveCSS("white-space", "nowrap");

  await expect(page.locator(".mso-list li")).toHaveCount(500);
  const labeledLayout = await galleryLayout(page);
  expect(labeledLayout.labelVisible).toBe(true);

  await excludeLabels.check();

  await expect(page).toHaveURL(/\/index\.html\?ExcludeLabels=1$/);
  await expect(excludeLabels).toBeChecked();
  await expect(page.locator("#search-result-count")).toBeHidden();
  await expect(page.locator(".mso-list")).toHaveClass(/labels-hidden/);
  await expect(page.locator(".mso-list li")).toHaveCount(500);
  await expect(page.locator(".mso-list li span").first()).toBeHidden();

  const denseLayout = await galleryLayout(page);
  expect(denseLayout.labelVisible).toBe(false);
  expect(denseLayout.columns).toBeGreaterThan(labeledLayout.columns * 3);
  expect(denseLayout.listHeight).toBeLessThan(labeledLayout.listHeight / 3);
  expect(denseLayout.listHeight).toBeLessThan(700);

  await page.reload();

  await expect(excludeLabels).toBeChecked();
  await expect(page.locator(".mso-list li")).toHaveCount(500);
  await expect(page.locator(".mso-list li span").first()).toBeHidden();
  const reloadedLayout = await galleryLayout(page);
  expect(reloadedLayout.columns).toBe(denseLayout.columns);

  await excludeLabels.uncheck();

  await expect(page).toHaveURL(/\/index\.html$/);
  await expect(page.locator(".mso-list")).not.toHaveClass(/labels-hidden/);
  await expect(page.locator(".mso-list li span").first()).toBeVisible();
});

test("keeps the dense label-free view across search, filters, and pages", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/index.html?SearchMso=sun&ExcludeLabels=1");

  await expect(page.locator("#search-result-count")).toHaveText("2 icons found");
  await expect(page.locator(".mso-list li")).toHaveCount(2);
  await expect(page.locator(".mso-list li span").first()).toBeHidden();
  await expect(page.getByRole("checkbox", { name: "Exclude image labels" })).toBeChecked();

  await page.getByRole("button", { name: "Clear search" }).click();

  await expect(page).toHaveURL(/\/index\.html\?ExcludeLabels=1$/);
  await expect(page.locator("#search-result-count")).toBeHidden();
  await expect(page.locator(".mso-list")).toHaveClass(/labels-hidden/);
  await expect(page.locator(".mso-list li span").first()).toBeHidden();

  await page.getByRole("checkbox", { name: "Exclude placeholder images" }).check();

  await expect(page).toHaveURL(/ExcludePlaceholders=1/);
  await expect(page).toHaveURL(/ExcludeLabels=1/);
  await expect(page).not.toHaveURL(/SearchMso|Page=/);
  await expect(page.locator(".mso-list li span").first()).toBeHidden();
  await expect(page.locator("#search-result-count")).toBeVisible();

  await page.goto("/index.html?ExcludeLabels=1");
  await expect(page.locator(".mso-list li")).toHaveCount(500);
  await page.getByRole("button", { name: "Next" }).first().click();

  await expect(page).toHaveURL(/\/index\.html\?ExcludeLabels=1&Page=2$/);
  await expect(page.locator(".page-status").first()).toContainText("Page 2 of");
  await expect(page.locator(".mso-list li span").first()).toBeHidden();

  const iconLink = page.locator(".icon-link").first();
  const iconName = await iconLink.locator("img").getAttribute("alt");
  await expect(iconLink).toHaveAttribute("title", iconName);
  await iconLink.click();
  await expect(page).toHaveURL(new RegExp(`/icon\\.html\\?name=${iconName}$`));
  await expect(page.getByRole("heading", { name: iconName })).toBeVisible();
});
