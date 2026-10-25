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

  await expect(page).toHaveURL(/page=2$/);
  await expect(pageStatus).toContainText("Page 2 of");

  await page.reload();
  await expect(pageStatus).toContainText("Page 2 of");
});

test("migrates legacy gallery query parameters to snake_case", async ({ page }) => {
  await page.goto("/index.html?Page=2&ExcludePlaceholders=1");

  await expect(page).toHaveURL(/page=2&exclude_placeholders=1$/);
  await expect(page.getByRole("checkbox", { name: "Exclude placeholder images" })).toBeChecked();
  await expect(page.locator(".page-status").first()).toContainText("Page 2 of");
});

test("gallery links to lowercase icon detail pages", async ({ page }) => {
  await page.goto("/index.html");

  const iconLink = page.locator(".icon-link").first();
  const iconName = await iconLink.locator("img").getAttribute("alt");
  await expect(iconLink).toHaveAttribute("href", /^\.\/icon\.html\?icon_id=/);

  await iconLink.click();
  await expect(page).toHaveURL(/\/icon\.html\?icon_id=/);
  await expect(page.getByRole("heading", { name: iconName })).toBeVisible();
});

test("migrates legacy icon detail URLs to icon_id", async ({ page }) => {
  await page.goto("/icon.html?name=ZoomTwoPages");

  await expect(page).toHaveURL(/icon\.html\?icon_id=ZoomTwoPages$/);
  await expect(page.getByRole("heading", { name: "ZoomTwoPages" })).toBeVisible();
});