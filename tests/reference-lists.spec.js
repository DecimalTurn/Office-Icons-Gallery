const { test, expect } = require("@playwright/test");

async function mockReferenceLists(page) {
  let lists = [];
  await page.route("**/api/reference-lists", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { lists } });
      return;
    }
    const body = route.request().postDataJSON();
    lists = body.lists;
    await route.fulfill({ json: { lists } });
  });
  return () => lists;
}

test("creates saved lists and appends selected icons and IDs in the review page", async ({ page }) => {
  const getSavedLists = await mockReferenceLists(page);
  const metadataResponse = await page.request.get("/icon-metadata.json");
  const metadata = await metadataResponse.json();
  const idIcon = metadata.find((icon) => icon.name === "ChartFormatSelection");
  const selectedIcon = "_3DBevelOptionsDialog";
  const selectedIconData = metadata.find((icon) => icon.name === selectedIcon);

  await page.goto("/keyword-review.html#reference-lists");
  await expect(page.locator("#icon-position")).not.toHaveText("Loading icons");
  await expect(page.locator("#reference-list-status")).toHaveText("");
  await expect(page.locator("#list-feedback")).toBeHidden();
  const createFormFollowsSavedLists = await page.locator("#create-list-form").evaluate((form) => {
    const savedLists = document.querySelector("#saved-reference-lists");
    return form.parentElement === savedLists.parentElement
      && Boolean(savedLists.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(createFormFollowsSavedLists).toBe(true);
  const listPrecedesControls = await page.locator("#reference-icon-list").evaluate((iconList) => {
    const controls = ["#create-list-form", "#saved-reference-lists", ".reference-add-controls", "#delete-list"];
    return controls.every((selector) => iconList.compareDocumentPosition(document.querySelector(selector)) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(listPrecedesControls).toBe(true);
  const gridColumnCount = () => page.locator("#reference-icon-list").evaluate((list) => getComputedStyle(list).gridTemplateColumns.trim().split(" ").length);
  expect(await gridColumnCount()).toBe(4);
  await page.setViewportSize({ width: 700, height: 900 });
  expect(await gridColumnCount()).toBe(2);
  await page.setViewportSize({ width: 400, height: 900 });
  expect(await gridColumnCount()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(() => page.locator("#create-list-form").evaluate((form) => form.scrollWidth <= form.clientWidth)).toBe(true);
  await expect(page.locator("#catalog-position")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add position" })).toHaveCount(0);
  await page.getByLabel("Search icon ID").fill(selectedIcon);
  await page.getByRole("option", { name: selectedIcon }).click();
  await expect(page.locator("#reference-current-icon")).toHaveText(selectedIcon);
  await page.getByLabel("List name / tag").fill("Ribbon cleanup");
  await page.getByRole("button", { name: "Create list" }).click();
  await expect(page.getByRole("heading", { name: "Ribbon cleanup" })).toBeVisible();

  await page.getByRole("button", { name: "Add selected icon" }).click();
  await expect(page.getByRole("link", { name: selectedIcon, exact: true })).toBeVisible();
  expect(getSavedLists()[0].iconIds).toEqual([selectedIcon]);

  await page.getByLabel("Icon ID to add").fill(idIcon.name);
  await page.getByRole("button", { name: "Add ID" }).click();
  await expect(page.getByRole("link", { name: idIcon.name, exact: true })).toBeVisible();
  expect(getSavedLists()[0].iconIds).toEqual([selectedIcon, idIcon.name]);
  const listItems = page.locator(".reference-icon-item");
  await expect(listItems).toHaveCount(2);
  await expect(listItems.nth(0).getByRole("link")).toHaveText(selectedIcon);
  await expect(listItems.nth(0).locator(".reference-icon-keyword")).toHaveText(selectedIconData.keywords);
  await expect(listItems.nth(1).getByRole("link")).toHaveText(idIcon.name);
  await expect(listItems.nth(1).locator(".reference-icon-keyword")).toHaveText(idIcon.keywords);

  await page.getByRole("button", { name: `Remove ${idIcon.name} from list` }).click();
  await expect(page.getByRole("link", { name: idIcon.name, exact: true })).toHaveCount(0);
  expect(getSavedLists()[0].iconIds).toEqual([selectedIcon]);

  await page.getByLabel("List name / tag").fill("Shape picker");
  await page.getByRole("button", { name: "Create list" }).click();
  await expect(page.getByRole("heading", { name: "Shape picker" })).toBeVisible();
  await expect(page.getByText("This list is empty.")).toBeVisible();
  const savedListSelector = page.locator("#saved-reference-lists");
  await expect(savedListSelector.locator("option")).toHaveText([
    "Ribbon cleanup (1)",
    "Shape picker (0)"
  ]);
  await savedListSelector.selectOption({ label: "Ribbon cleanup (1)" });
  await expect(page.getByRole("heading", { name: "Ribbon cleanup" })).toBeVisible();
  await expect(page.getByRole("link", { name: selectedIcon, exact: true })).toBeVisible();
  await savedListSelector.selectOption({ label: "Shape picker (0)" });
  await expect(page.getByRole("heading", { name: "Shape picker" })).toBeVisible();
  expect(getSavedLists().map((list) => list.name)).toEqual(["Ribbon cleanup", "Shape picker"]);
});

test("persists named reference lists and rejects unknown icon IDs", async ({ request }) => {
  const initialResponse = await request.get("/api/reference-lists");
  expect(initialResponse.ok()).toBeTruthy();
  const originalLists = (await initialResponse.json()).lists;
  const testList = {
    id: "reference-list-api-check",
    name: "Temporary API check",
    iconIds: ["_0", "_1"]
  };

  try {
    const saveResponse = await request.put("/api/reference-lists", {
      data: { lists: [...originalLists, testList] }
    });
    expect(saveResponse.ok()).toBeTruthy();
    const savedLists = (await saveResponse.json()).lists;
    expect(savedLists.at(-1)).toEqual(testList);

    const loadResponse = await request.get("/api/reference-lists");
    expect((await loadResponse.json()).lists).toEqual(savedLists);

    const invalidResponse = await request.put("/api/reference-lists", {
      data: { lists: [{ id: "invalid-list", name: "Invalid", iconIds: ["NotAnIconId"] }] }
    });
    expect(invalidResponse.status()).toBe(400);
  } finally {
    const restoreResponse = await request.put("/api/reference-lists", {
      data: { lists: originalLists }
    });
    expect(restoreResponse.ok()).toBeTruthy();
  }
});