const { test, expect } = require("@playwright/test");

test("search suggestions remain aligned and selectable when resized", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.addStyleTag({ content: ".awesomplete > ul { transition: none !important; transform: none !important; }" });

  const search = page.locator("#mso-search");
  await expect(search).toBeVisible();
  await search.fill("bright");

  const suggestions = page.locator(".awesomplete > ul > li");
  await expect(suggestions.first()).toBeVisible();

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
        pointerDisplay: getComputedStyle(list, "::before").display,
        rows: [...list.children]
          .filter((row) => !row.classList.contains("search-see-all-row"))
          .map((row) => {
            const rowBounds = row.getBoundingClientRect();
            const imageBounds = row.querySelector("img").getBoundingClientRect();
            const labelBounds = row.querySelector("span").getBoundingClientRect();

            return {
              top: rowBounds.top,
              bottom: rowBounds.bottom,
              height: rowBounds.height,
              imageTop: imageBounds.top,
              imageBottom: imageBounds.bottom,
              imageRight: imageBounds.right,
              labelLeft: labelBounds.left,
              labelTop: labelBounds.top,
              labelHeight: labelBounds.height
            };
          })
      };
    });

    expect(bounds.menuLeft).toBeCloseTo(bounds.inputLeft, 0);
    expect(bounds.menuWidth).toBeCloseTo(bounds.inputWidth, 0);
    expect(bounds.menuRight).toBeCloseTo(bounds.inputLeft + bounds.inputWidth, 0);
    expect(bounds.pointerDisplay).toBe("none");
    for (const [index, row] of bounds.rows.entries()) {
      expect(row.height).toBeGreaterThanOrEqual(32);
      expect(row.labelLeft).toBeGreaterThan(row.imageRight);
      expect(Math.abs((row.imageTop + row.imageBottom) / 2 - (row.labelTop + row.labelHeight / 2))).toBeLessThan(1);
      if (index > 0) {
        expect(row.top).toBeGreaterThanOrEqual(bounds.rows[index - 1].bottom);
      }
    }
  }

  await search.fill("zoom two pages");
  const suggestion = page.locator(".awesomplete > ul > li").filter({ hasText: "ZoomTwoPages" }).first();
  await expect(suggestion).toBeVisible();
  await suggestion.click();
  await expect(page).toHaveURL(/icon\.html\?icon_id=ZoomTwoPages$/);
  await expect(page.getByRole("heading", { name: "ZoomTwoPages" })).toBeVisible();
});