const { test, expect } = require("@playwright/test");

const sharedIds = ["ChartFormatSelection", "_3DBevelOptionsDialog", "_3DRotationOptionsDialog"];
const suggestion = "A paint bucket spills beside a paintbrush.";

async function mockReviewApi(page, { modelError = false, reviewedIconIds = [] } = {}) {
  const savedDrafts = {};
  const trackedDescriptions = {};
  const trackedReviewStatus = {};
  const statusResponse = await page.request.get("/icon-review-status.json");
  const reviewStatus = await statusResponse.json();
  for (const iconId of reviewedIconIds) {
    reviewStatus[iconId] = true;
  }
  await page.route("**/icon-review-status.json", async (route) => {
    await route.fulfill({ json: reviewStatus });
  });
  await page.route("**/api/description-review/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/models")) {
      await route.fulfill(modelError
        ? { status: 503, json: { error: "Ollama is unavailable at http://127.0.0.1:11434. Start Ollama, then retry." } }
        : { json: { models: ["gemma3:4b"] } });
      return;
    }
    if (url.pathname.endsWith("/drafts") && request.method() === "GET") {
      await route.fulfill({ json: { drafts: savedDrafts } });
      return;
    }
    if (url.pathname.endsWith("/image")) {
      const iconId = url.searchParams.get("name");
      const isSharedImage = sharedIds.includes(iconId);
      const curatedDescriptions = isSharedImage
        ? { _3DBevelOptionsDialog: trackedDescriptions._3DBevelOptionsDialog || "Existing reviewed wording" }
        : {};
      await route.fulfill({ json: {
        iconIds: isSharedImage ? sharedIds : [iconId],
        imageHash: isSharedImage ? "shared-image-hash" : `hash-${iconId}`,
        reviewed: trackedReviewStatus[isSharedImage ? "shared-image-hash" : `hash-${iconId}`] === true,
        curatedDescriptions,
        draft: savedDrafts[isSharedImage ? "shared-image-hash" : `hash-${iconId}`] || null
      } });
      return;
    }
    if (url.pathname.endsWith("/review") && request.method() === "POST") {
      const body = request.postDataJSON();
      const iconIds = sharedIds.includes(body.iconId) ? sharedIds : [body.iconId];
      for (const iconId of iconIds) {
        trackedDescriptions[iconId] = body.description;
      }
      const imageHash = sharedIds.includes(body.iconId) ? "shared-image-hash" : `hash-${body.iconId}`;
      trackedReviewStatus[imageHash] = true;
      await route.fulfill({ json: {
        imageHash,
        iconIds,
        reviewed: true,
        curatedDescriptions: Object.fromEntries(iconIds.map((iconId) => [iconId, body.description]))
      } });
      return;
    }
    if (url.pathname.endsWith("/review-status") && request.method() === "POST") {
      const body = request.postDataJSON();
      const iconIds = sharedIds.includes(body.iconId) ? sharedIds : [body.iconId];
      const imageHash = sharedIds.includes(body.iconId) ? "shared-image-hash" : `hash-${body.iconId}`;
      trackedReviewStatus[imageHash] = false;
      await route.fulfill({ json: { imageHash, iconIds, reviewed: false } });
      return;
    }
    if (url.pathname.endsWith("/generate")) {
      await route.fulfill({ json: { suggestion } });
      return;
    }
    if (url.pathname.endsWith("/drafts") && request.method() === "POST") {
      const body = request.postDataJSON();
      const imageHash = sharedIds.includes(body.iconId) ? "shared-image-hash" : `hash-${body.iconId}`;
      const draft = {
        ...body,
        imageHash,
        iconIds: sharedIds.includes(body.iconId) ? sharedIds : [body.iconId],
        updatedAt: new Date().toISOString()
      };
      savedDrafts[imageHash] = draft;
      await route.fulfill({ json: { draft } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "Unexpected review API request" } });
  });
  return { savedDrafts, trackedDescriptions, trackedReviewStatus };
}

test("generates, edits, and marks one shared-image description reviewed in tracked files", async ({ page }) => {
  const { savedDrafts, trackedDescriptions, trackedReviewStatus } = await mockReviewApi(page);
  savedDrafts["shared-image-hash"] = {
    status: "reviewed",
    model: "gemma3:4b",
    suggestion,
    description: "Legacy local reviewed wording",
    iconIds: sharedIds
  };
  await page.goto("/description-review.html");
  await expect(page.getByText("Ollama is ready. Found 1 local model.")).toBeVisible();

  const metadataResponse = await page.request.get("/icon-metadata.json");
  const metadata = await metadataResponse.json();
  const uniqueImageCount = new Set(metadata.map((icon) => icon.imageSha256 || icon.name)).size;
  expect(uniqueImageCount).toBeLessThan(metadata.length);
  await expect(page.locator("#icon-position")).toHaveText(`1 of ${uniqueImageCount}`);
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("_0");

  const iconSearch = page.getByLabel("Icon ID");
  await iconSearch.fill("ChartFormatSelection");
  const sharedImageOption = page.getByRole("option", { name: "ChartFormatSelection" });
  await expect(sharedImageOption).toHaveCount(1);
  await sharedImageOption.click();
  const reviewState = page.locator(".review-editor-panel #review-state");
  await expect(reviewState).toHaveText("Not reviewed");
  await expect(reviewState).toHaveAttribute("data-state", "not-reviewed");
  await expect(page.getByText("Draft saved", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Existing reviewed wording")).toBeVisible();
  await expect(page.getByText(/Same image IDs using this shared description:/)).toContainText("_3DBevelOptionsDialog");

  await page.getByRole("button", { name: "Generate draft" }).click();
  const editor = page.getByRole("textbox", { name: "Editable icon description" });
  await expect(editor).toHaveValue(suggestion);
  await editor.fill("A paint bucket spills beside a paintbrush, with blue paint visible.");
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByText("Reviewed description saved to tracked files for 3 identical image IDs.")).toBeVisible();
  await expect(reviewState).toHaveText("Reviewed");
  await expect(reviewState).toHaveAttribute("data-state", "reviewed");
  await expect(page.getByRole("button", { name: "Mark reviewed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark not reviewed" })).toBeVisible();
  for (const iconId of sharedIds) {
    expect(trackedDescriptions[iconId]).toBe("A paint bucket spills beside a paintbrush, with blue paint visible.");
  }
  expect(trackedReviewStatus["shared-image-hash"]).toBe(true);
  expect(savedDrafts["shared-image-hash"].description).toBe("Legacy local reviewed wording");
  await expect(page.getByRole("button", { name: "Export reviewed" })).toHaveCount(0);

  await page.getByRole("button", { name: "Mark not reviewed" }).click();
  await expect(page.getByText("Review status reset for 3 identical image IDs. The descriptions were kept.")).toBeVisible();
  await expect(reviewState).toHaveText("Not reviewed");
  await expect(reviewState).toHaveAttribute("data-state", "not-reviewed");
  expect(trackedReviewStatus["shared-image-hash"]).toBe(false);
  for (const iconId of sharedIds) {
    expect(trackedDescriptions[iconId]).toBe("A paint bucket spills beside a paintbrush, with blue paint visible.");
  }
  await expect(page.getByRole("button", { name: "Mark reviewed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark not reviewed" })).toBeHidden();
});

test("starts at the first image group with an unreviewed ID", async ({ page }) => {
  const metadataResponse = await page.request.get("/icon-metadata.json");
  const metadata = await metadataResponse.json();
  const groupsByHash = new Map();
  for (const icon of metadata) {
    const imageKey = icon.imageSha256 || icon.name;
    const group = groupsByHash.get(imageKey) || [];
    group.push(icon.name);
    groupsByHash.set(imageKey, group);
  }
  const groups = [...groupsByHash.values()];
  const reviewedIconIds = groups[0];
  const expectedIconId = groups[1][0];

  await mockReviewApi(page, { reviewedIconIds });
  await page.goto("/description-review.html");

  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(expectedIconId);
  await expect(page.locator("#icon-position")).toHaveText("2 of 3407");
  await expect(page.getByText("Not reviewed", { exact: true })).toBeVisible();
});

test("resets tracked review status for a shared image without changing descriptions", async ({ request }) => {
  const [metadataResponse, statusResponse, descriptionsResponse] = await Promise.all([
    request.get("/icon-metadata.json"),
    request.get("/icon-review-status.json"),
    request.get("/icon-descriptions.json")
  ]);
  const metadata = await metadataResponse.json();
  const reviewStatus = await statusResponse.json();
  const descriptionsBefore = await descriptionsResponse.json();
  const imageGroups = new Map();
  for (const icon of metadata) {
    const imageKey = icon.imageSha256 || icon.name;
    const group = imageGroups.get(imageKey) || [];
    group.push(icon.name);
    imageGroups.set(imageKey, group);
  }
  const iconIds = [...imageGroups.values()].find((group) =>
    group.length > 1 && group.every((iconId) => reviewStatus[iconId] === false)
  );
  test.skip(!iconIds, "No unreviewed shared-image group is available for a non-mutating API check");

  const response = await request.post("/api/description-review/review-status", {
    data: { iconId: iconIds[0], reviewed: false }
  });
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.reviewed).toBe(false);
  expect(result.iconIds).toEqual(iconIds.slice().sort());

  const [updatedStatusResponse, updatedDescriptionsResponse] = await Promise.all([
    request.get("/icon-review-status.json"),
    request.get("/icon-descriptions.json")
  ]);
  const updatedStatus = await updatedStatusResponse.json();
  const updatedDescriptions = await updatedDescriptionsResponse.json();
  for (const iconId of iconIds) {
    expect(updatedStatus[iconId]).toBe(false);
    expect(updatedDescriptions[iconId]).toBe(descriptionsBefore[iconId]);
  }
});

test("saves a draft locally without changing tracked descriptions", async ({ page }) => {
  const { savedDrafts, trackedDescriptions } = await mockReviewApi(page);
  await page.goto("/description-review.html");
  await expect(page.getByText("Ollama is ready. Found 1 local model.")).toBeVisible();

  const iconSearch = page.getByLabel("Icon ID");
  await iconSearch.fill("ChartFormatSelection");
  await page.getByRole("option", { name: "ChartFormatSelection" }).click();
  const editor = page.getByRole("textbox", { name: "Editable icon description" });
  await editor.fill("A local draft for this shared image.");
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page.getByText("Draft saved locally.")).toBeVisible();
  expect(savedDrafts["shared-image-hash"].description).toBe("A local draft for this shared image.");
  expect(trackedDescriptions).toEqual({});
});

test("shows the local Ollama connection error", async ({ page }) => {
  await mockReviewApi(page, { modelError: true });
  await page.goto("/description-review.html");
  await expect(page.getByRole("status")).toContainText("Ollama is unavailable at http://127.0.0.1:11434");
  await expect(page.getByRole("button", { name: "Generate draft" })).toBeEnabled();
});
