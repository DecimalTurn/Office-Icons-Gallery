const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const metadata = JSON.parse(fs.readFileSync(path.join(root, "icon-metadata.json"), "utf8"));
const curatedDescriptions = JSON.parse(fs.readFileSync(path.join(root, "icon-descriptions.json"), "utf8"));
const options = new Map();

for (let index = 3; index < process.argv.length; index += 1) {
  const [name, inlineValue] = process.argv[index].split("=", 2);
  if (!name.startsWith("--")) {
    throw new Error(`Unexpected argument: ${name}`);
  }
  const value = inlineValue ?? process.argv[++index];
  if (!value) {
    throw new Error(`Missing value for ${name}`);
  }
  options.set(name.slice(2), value);
}

function positiveIntegerOption(name, fallback) {
  const value = Number(options.get(name) || fallback);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

const command = process.argv[2] || "candidates";
if (!new Set(["candidates", "contact-sheet"]).has(command)) {
  throw new Error("Use `candidates` or `contact-sheet`");
}

const count = positiveIntegerOption("count", 36);
const batches = positiveIntegerOption("batches", 1);
const batch = positiveIntegerOption("batch", 1);
if (batch > batches) {
  throw new Error("--batch cannot be greater than --batches");
}

const prefix = (options.get("prefix") || "").toLowerCase();
const candidates = metadata.filter((icon) =>
  icon.imageStatus !== "placeholder" &&
  !Object.hasOwn(curatedDescriptions, icon.name) &&
  icon.name.toLowerCase().startsWith(prefix)
);

if (command === "candidates") {
  if (batches === 1) {
    console.log(JSON.stringify(candidates.slice(0, count).map(({ name }) => name), null, 2));
  } else {
    const result = Array.from({ length: batches }, (_, index) => ({
      batch: index + 1,
      ids: candidates.slice(index * count, (index + 1) * count).map(({ name }) => name)
    }));
    console.log(JSON.stringify(result, null, 2));
  }
} else {
  const selected = candidates.slice((batch - 1) * count, batch * count);
  const cards = selected.map(({ name }) => `
      <figure>
        <img src="./images/${encodeURIComponent(name)}.png" alt="${escapeHtml(name)}" width="48" height="48">
        <figcaption>${escapeHtml(name)}</figcaption>
      </figure>`).join("");
  const outputPath = path.join(root, ".description-contact-sheet.html");
  const document = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Icon description contact sheet</title>
    <style>
      body { margin: 24px; color: #202124; font: 14px/1.4 "Segoe UI", sans-serif; }
      h1 { font-size: 20px; font-weight: 600; }
      main { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 1px; }
      figure { display: grid; justify-items: center; align-content: start; gap: 8px; min-height: 90px; margin: 0; padding: 12px 6px; border: 1px solid #dadce0; text-align: center; }
      img { image-rendering: pixelated; object-fit: contain; }
      figcaption { overflow-wrap: anywhere; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>Uncurated icons, batch ${batch} of ${batches}</h1>
    <main>${cards}
    </main>
  </body>
</html>
`;
  fs.writeFileSync(outputPath, document, "utf8");
  console.log(JSON.stringify(selected.map(({ name }) => name), null, 2));
  console.log(`Wrote ${path.relative(root, outputPath)}`);
}