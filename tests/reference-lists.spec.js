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

async function mockDescriptionReview(page) {
  await page.route("**/api/description-review/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/models")) {
      await route.fulfill({ json: { models: ["gemma3:4b"] } });
      return;
    }
    if (url.pathname.endsWith("/drafts")) {
      await route.fulfill({ json: { drafts: {} } });
      return;
    }
    if (url.pathname.endsWith("/image")) {
      const iconId = url.searchParams.get("name");
      await route.fulfill({ json: {
        iconIds: [iconId],
        imageHash: `test-${iconId}`,
        reviewed: false,
        curatedDescriptions: {},
        draft: null
      } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "Unexpected review API request" } });
  });
}

test("creates saved lists and adds selected icons, IDs, and catalog positions in the review page", async ({ page }) => {
  const getSavedLists = await mockReferenceLists(page);
  await mockDescriptionReview(page);
  const metadataResponse = await page.request.get("/icon-metadata.json");
  const metadata = await metadataResponse.json();
  const idIcon = metadata.find((icon) => icon.name === "ChartFormatSelection");
  const selectedIcon = "_3DBevelOptionsDialog";
  const positionIndex = metadata.findIndex((icon, index) => index > 0 && Boolean(icon.description));
  const positionIcon = metadata[positionIndex];

  await page.goto("/description-review.html#reference-lists");
  await expect(page.locator("#icon-position")).not.toHaveText("Loading icons");
  await expect(page.locator("#reference-list-status")).toContainText("icons loaded");
  await page.getByLabel("Search icon ID").fill(idIcon.name);
  await page.getByRole("option", { name: idIcon.name }).click();
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

  await page.getByLabel("Catalog position (# in gallery)").fill(String(positionIndex + 1));
  await page.getByRole("button", { name: "Add position" }).click();
  await expect(page.getByRole("link", { name: positionIcon.name, exact: true })).toBeVisible();
  await expect(page.getByText(positionIcon.description, { exact: true })).toBeVisible();
  await expect(page.locator(".reference-position").last()).toHaveText(`#${positionIndex + 1}`);
  expect(getSavedLists()[0].iconIds).toEqual([selectedIcon, idIcon.name, positionIcon.name]);

  await page.getByRole("button", { name: `Remove ${idIcon.name} from list` }).click();
  await expect(page.getByRole("link", { name: idIcon.name, exact: true })).toHaveCount(0);
  expect(getSavedLists()[0].iconIds).toEqual([selectedIcon, positionIcon.name]);

  await page.getByLabel("List name / tag").fill("Shape picker");
  await page.getByRole("button", { name: "Create list" }).click();
  await expect(page.getByRole("heading", { name: "Shape picker" })).toBeVisible();
  await expect(page.getByText("This list is empty.")).toBeVisible();
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