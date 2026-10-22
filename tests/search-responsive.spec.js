const { test, expect } = require("@playwright/test");

test("search suggestions remain aligned and selectable when resized", async ({ page }) => {
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
        viewportWidth: window.innerWidth,
        pointerDisplay: getComputedStyle(list, "::before").display
      };
    });

    expect(bounds.menuLeft).toBeCloseTo(bounds.inputLeft, 0);
    expect(bounds.menuWidth).toBeCloseTo(bounds.inputWidth, 0);
    expect(bounds.menuRight).toBeLessThanOrEqual(bounds.viewportWidth);
    expect(bounds.pointerDisplay).toBe("none");
  }

  await suggestion.click();
  await expect(page).toHaveURL(/Icon\.html\?name=ZoomTwoPages$/);
  await expect(page.getByRole("heading", { name: "ZoomTwoPages" })).toBeVisible();
});