const { test, expect } = require("@playwright/test");

test("serves the gallery at the root and index.html", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#mso-search")).toBeVisible();

  await page.goto("/index.html");
  await expect(page.locator("#mso-search")).toBeVisible();
});

test("pagination state is shareable through the URL", async ({ page }) => {
  await page.goto("/index.html");

  const pageStatus = page.locator(".page-status").first();
  await expect(pageStatus).toContainText("Page 1 of");
  await page.getByRole("button", { name: "Next" }).first().click();

  await expect(page).toHaveURL(/Page=2$/);
  await expect(pageStatus).toContainText("Page 2 of");

  await page.reload();
  await expect(pageStatus).toContainText("Page 2 of");
});

test("ImageMso gallery links to lowercase icon detail pages", async ({ page }) => {
  await page.goto("/ImageMso.html");

  const iconLink = page.locator(".icon-link").first();
  const iconName = await iconLink.locator("img").getAttribute("alt");
  await expect(iconLink).toHaveAttribute("href", /^\.\/icon\.html\?name=/);

  await iconLink.click();
  await expect(page).toHaveURL(/\/icon\.html\?name=/);
  await expect(page.getByRole("heading", { name: iconName })).toBeVisible();
});