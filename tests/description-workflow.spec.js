const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "scripts", "description-workflow.js");

test("description batches are disjoint and exclude curated and placeholder icons", () => {
  const batches = JSON.parse(execFileSync(process.execPath, [
    workflowPath,
    "candidates",
    "--count",
    "36",
    "--batches",
    "3"
  ], { encoding: "utf8" }));
  const metadata = require("../icon-metadata.json");
  const curatedDescriptions = require("../icon-descriptions.json");
  const metadataByName = new Map(metadata.map((icon) => [icon.name, icon]));
  const batchIds = batches.flatMap(({ ids }) => ids);

  expect(batches).toHaveLength(3);
  expect(batches.every(({ ids }) => ids.length === 36)).toBe(true);
  expect(new Set(batchIds).size).toBe(batchIds.length);
  expect(batchIds.every((name) => metadataByName.has(name))).toBe(true);
  expect(batchIds.every((name) => !Object.hasOwn(curatedDescriptions, name))).toBe(true);
  expect(batchIds.every((name) => metadataByName.get(name)?.imageStatus !== "placeholder")).toBe(true);
});