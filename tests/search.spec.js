const { test, expect } = require("@playwright/test");

test("submits a search query and filters the gallery after reload", async ({ page }) => {
  await page.goto("/index.html");

  const search = page.locator("#mso-search");
  await search.fill("sun");
  await search.press("Enter");

  await expect(page).toHaveURL(/index\.html\?SearchMso=sun$/);
  await expect(page.locator("#mso-search")).toHaveValue("sun");
    const counts = await page.evaluate(async () => {
      const metadata = await (await fetch("./icon-metadata.json")).json();
      return {
        ids: metadata.length.toLocaleString(),
        uniqueImages: new Set(metadata.map((icon) => icon.imageAsset)).size.toLocaleString()
      };
    });
    expect(counts).toEqual({ ids: "9,324", uniqueImages: "3,407" });
    await expect(page.locator("#icon-count")).toHaveText(counts.ids);
    await expect(page.locator("#unique-icon-count")).toHaveText(counts.uniqueImages);
    await expect(page.locator("#search-result-count")).toHaveText("2 icons found");
  await expect(search).not.toBeFocused();
  await expect(page.locator(".awesomplete > ul")).toBeHidden();
  await expect(page.locator(".mso-list li")).toHaveCount(2);
  await expect(page.locator(".page-status").first()).toContainText("1-2 of 2 icons");
});

test("limits suggestions to 30 and submits from the See all results row", async ({ page }) => {
  await page.goto("/index.html");

  const search = page.locator("#mso-search");
  await search.fill("icon");

  const suggestions = page.locator(".awesomplete > ul > li:not(.search-see-all-row)");
  const seeAllButton = page.getByRole("button", { name: "See all results" });
  await expect(suggestions).toHaveCount(30);
  await expect(page.locator(".awesomplete > ul > li").last()).toContainText("See all results");
  await expect(seeAllButton).toBeVisible();

  await seeAllButton.click();

  await expect(page).toHaveURL(/index\.html\?SearchMso=icon$/);
  const resultCountStatus = page.locator("#search-result-count");
  await expect(resultCountStatus).toHaveText(/^[\d,]+ icons found$/);
  const resultCount = await resultCountStatus.evaluate((element) => {
    return Number.parseInt(element.textContent.replaceAll(",", ""), 10);
  });
  expect(resultCount).toBeGreaterThan(30);
});

test("explains why the number of unique icons is lower than the idMso count", async ({ page }) => {
  await page.goto("/index.html");

  const infoButton = page.getByRole("button", { name: "About unique icon count" });
  const tooltip = page.getByRole("tooltip");

  await infoButton.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Some idMso entries point to the same image");

  await infoButton.focus();
  await expect(tooltip).toBeVisible();
});

test("clears an active search and returns to the unfiltered gallery", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/index.html?SearchMso=sun");

  const search = page.locator("#mso-search");
  const clearButton = page.getByRole("button", { name: "Clear search" });
  await expect(search).toHaveValue("sun");
  await expect(clearButton).toBeVisible();
  const inputBounds = await search.boundingBox();
  const clearBounds = await clearButton.boundingBox();
  if (inputBounds === null || clearBounds === null) {
    throw new Error("Search field or clear button has no bounding box");
  }
  expect(inputBounds.width).toBeLessThanOrEqual(544);
  expect(clearBounds.x).toBeGreaterThan(inputBounds.x);
  expect(clearBounds.x + clearBounds.width).toBeLessThanOrEqual(inputBounds.x + inputBounds.width);
  expect(clearBounds.y).toBeGreaterThan(inputBounds.y);
  expect(clearBounds.y + clearBounds.height).toBeLessThanOrEqual(inputBounds.y + inputBounds.height);

  await clearButton.click();

  await expect(page).toHaveURL(/\/index\.html$/);
  await expect(search).toHaveValue("");
  await expect(clearButton).toBeHidden();
  await expect(page.locator("#search-result-count")).toBeHidden();
});

test("excludes placeholder images and preserves the filter after reload", async ({ page }) => {
  await page.goto("/index.html");

  const expectedResults = await page.evaluate(async () => {
    /** @type {{ name: string, imageStatus?: string }[]} */
    const metadata = await (await fetch("./icon-metadata.json")).json();
    const filteredIcons = metadata.filter((icon) => icon.imageStatus !== "placeholder");

    return {
      count: `${filteredIcons.length.toLocaleString()} icons found`,
      firstPageNames: filteredIcons.slice(0, 500).map(({ name }) => name)
    };
  });
  const excludePlaceholders = page.getByRole("checkbox", { name: "Exclude placeholder images" });
  const checkboxBounds = await excludePlaceholders.boundingBox();

  if (checkboxBounds === null) {
    throw new Error("Placeholder filter checkbox has no bounding box");
  }
  expect(checkboxBounds.width).toBe(16);
  expect(checkboxBounds.height).toBe(16);
  await expect(page.locator("label[for='exclude-placeholders']")).toHaveCSS("white-space", "nowrap");

  await excludePlaceholders.check();

  await expect(page).toHaveURL(/ExcludePlaceholders=1$/);
  await expect(excludePlaceholders).toBeChecked();
  await expect(page.locator("#search-result-count")).toHaveText(expectedResults.count);
  await expect(page.locator(".mso-list li span")).toHaveText(expectedResults.firstPageNames);

  await page.reload();

  await expect(excludePlaceholders).toBeChecked();
  await expect(page.locator("#search-result-count")).toHaveText(expectedResults.count);
  await expect(page.locator(".mso-list li span")).toHaveText(expectedResults.firstPageNames);
});

test("search suggestions match the input and remain usable when resized", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.addStyleTag({ content: ".awesomplete > ul { transition: none !important; transform: none !important; }" });

  const search = page.locator("#mso-search");
  await expect(search).toBeVisible();
  await search.fill("zoom two pages");

  const suggestion = page.locator(".awesomplete > ul > li").filter({ hasText: "ZoomTwoPages" }).first();
  await expect(suggestion).toBeVisible();

  for (const width of [1280, 768, 375]) {
    await page.setViewportSize({ width, height: 800 });
    const bounds = await page.evaluate(() => {
      const input = document.querySelector("#mso-search").getBoundingClientRect();
      const list = document.querySelector(".awesomplete > ul");
      const menu = list.getBoundingClientRect();

      return {
        inputLeft: input.left,
        inputWidth: input.width,
        menuLeft: menu.left,
        menuWidth: menu.width,
        menuRight: menu.right,
        pointerDisplay: getComputedStyle(list, "::before").display
      };
    });

    expect(bounds.menuLeft).toBeCloseTo(bounds.inputLeft, 0);
    expect(bounds.menuWidth).toBeCloseTo(bounds.inputWidth, 0);
    expect(bounds.menuRight).toBeCloseTo(bounds.inputLeft + bounds.inputWidth, 0);
    expect(bounds.pointerDisplay).toBe("none");
  }

  await suggestion.click();
  await expect(page).toHaveURL(/icon\.html\?name=ZoomTwoPages$/);
  await expect(page.getByRole("heading", { name: "ZoomTwoPages" })).toBeVisible();
});

test("shows Office fallback status on detail pages, not in search results", async ({ page }) => {
  await page.goto("/index.html?SearchMso=AccountingFormatExcel");
  await expect(page.locator(".icon-placeholder-badge")).toHaveCount(0);

  await page.goto("/icon.html?name=AccountingFormatExcel");
  await expect(page.locator("#icon-image-status")).toHaveText(/shared Office fallback/);

  await page.goto("/icon.html?name=BrightnessMore");
  await expect(page.locator("#icon-image-status")).toBeHidden();
});