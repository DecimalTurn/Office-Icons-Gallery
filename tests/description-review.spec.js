const fs = require("node:fs");
const { test, expect } = require("@playwright/test");

const sharedIds = ["ChartFormatSelection", "_3DBevelOptionsDialog", "_3DRotationOptionsDialog"];
const suggestion = "A paint bucket spills beside a paintbrush.";

async function mockReviewApi(page, { modelError = false } = {}) {
  const savedDrafts = {};
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
      await route.fulfill({ json: {
        iconIds: isSharedImage ? sharedIds : [iconId],
        imageHash: isSharedImage ? "shared-image-hash" : `hash-${iconId}`,
        curatedDescriptions: isSharedImage ? { _3DBevelOptionsDialog: "Existing reviewed wording" } : {},
        draft: savedDrafts[isSharedImage ? "shared-image-hash" : `hash-${iconId}`] || null
      } });
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
  return savedDrafts;
}

test("generates, edits, reviews, and exports one shared-image description", async ({ page }) => {
  await mockReviewApi(page);
  await page.goto("/description-review.html");
  await expect(page.getByText("Ollama is ready. Found 1 local model.")).toBeVisible();

  const metadataResponse = await page.request.get("/icon-metadata.json");
  const metadata = await metadataResponse.json();
  const uniqueImageCount = new Set(metadata.map((icon) => icon.imageSha256 || icon.name)).size;
  expect(uniqueImageCount).toBeLessThan(metadata.length);
  await expect(page.locator("#icon-position")).toContainText(`of ${uniqueImageCount}`);

  const iconSearch = page.getByLabel("Icon ID");
  await iconSearch.fill("ChartFormatSelection");
  const sharedImageOption = page.getByRole("option", { name: "ChartFormatSelection" });
  await expect(sharedImageOption).toHaveCount(1);
  await sharedImageOption.click();
  await expect(page.getByText("Existing reviewed wording")).toBeVisible();
  await expect(page.getByText(/Same image IDs using this shared description:/)).toContainText("_3DBevelOptionsDialog");

  await page.getByRole("button", { name: "Generate draft" }).click();
  const editor = page.getByRole("textbox", { name: "Editable icon description" });
  await expect(editor).toHaveValue(suggestion);
  await editor.fill("A paint bucket spills beside a paintbrush, with blue paint visible.");
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByText("Marked reviewed. This does not change the curated description source.")).toBeVisible();
  await expect(page.getByText("Reviewed", { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export reviewed" }).click();
  const download = await downloadPromise;
  const exportContent = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  expect(download.suggestedFilename()).toBe("reviewed-icon-descriptions.json");
  for (const iconId of sharedIds) {
    expect(exportContent[iconId]).toBe("A paint bucket spills beside a paintbrush, with blue paint visible.");
  }
});

test("shows the local Ollama connection error", async ({ page }) => {
  await mockReviewApi(page, { modelError: true });
  await page.goto("/description-review.html");
  await expect(page.getByRole("status")).toContainText("Ollama is unavailable at http://127.0.0.1:11434");
  await expect(page.getByRole("button", { name: "Generate draft" })).toBeEnabled();
});
