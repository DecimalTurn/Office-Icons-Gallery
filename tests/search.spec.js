const { test, expect } = require("@playwright/test");

test("submits a search query and filters the gallery after reload", async ({ page }) => {
  await page.goto("/ImageMso.html");

  const search = page.locator("#mso-search");
  await search.fill("sun");
  await search.press("Enter");

  await expect(page).toHaveURL(/ImageMso\.html\?SearchMso=sun$/);
  await expect(page.locator("#mso-search")).toHaveValue("sun");
    const totalCount = await page.evaluate(async () => {
      const metadata = await (await fetch("./icon-metadata.json")).json();
      return metadata.length.toLocaleString();
    });
    await expect(page.locator("#icon-count")).toHaveText(totalCount);
    await expect(page.locator("#search-result-count")).toHaveText("2 icons found");
  await expect(page.locator(".mso-list li")).toHaveCount(2);
  await expect(page.locator(".page-status").first()).toContainText("1-2 of 2 icons");
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
      const searchArea = document.querySelector(".mso-filter").getBoundingClientRect();
      const list = document.querySelector(".awesomplete > ul");
      const menu = list.getBoundingClientRect();

      return {
        inputLeft: input.left,
        inputWidth: input.width,
        searchAreaLeft: searchArea.left,
        searchAreaWidth: searchArea.width,
        searchAreaRight: searchArea.right,
        menuLeft: menu.left,
        menuWidth: menu.width,
        menuRight: menu.right,
        pointerDisplay: getComputedStyle(list, "::before").display
      };
    });

    expect(bounds.menuLeft).toBeCloseTo(bounds.searchAreaLeft, 0);
    expect(bounds.menuWidth).toBeCloseTo(bounds.searchAreaWidth, 0);
    expect(bounds.menuRight).toBeCloseTo(bounds.searchAreaRight, 0);
    expect(bounds.menuWidth).toBeGreaterThanOrEqual(bounds.inputWidth);
    expect(bounds.pointerDisplay).toBe("none");
  }

  await suggestion.click();
  await expect(page).toHaveURL(/Icon\.html\?name=ZoomTwoPages$/);
  await expect(page.getByRole("heading", { name: "ZoomTwoPages" })).toBeVisible();
});

test("shows Office fallback status on detail pages, not in search results", async ({ page }) => {
  await page.goto("/ImageMso.html?SearchMso=AccountingFormatExcel");
  await expect(page.locator(".icon-placeholder-badge")).toHaveCount(0);

  await page.goto("/Icon.html?name=AccountingFormatExcel");
  await expect(page.locator("#icon-image-status")).toHaveText(/shared Office fallback/);

  await page.goto("/Icon.html?name=BrightnessMore");
  await expect(page.locator("#icon-image-status")).toBeHidden();
});