const fs = require("fs");
const path = require("path");

const galleryPath = path.join(__dirname, "ImageMso.html");
const outputPath = path.join(__dirname, "icon-metadata.json");
const galleryHtml = fs.readFileSync(galleryPath, "utf8");
const listMatch = galleryHtml.match(/<ol class="mso-list">([\s\S]*?)<\/ol>/);

if (!listMatch) {
  throw new Error("Could not find the icon list in ImageMso.html");
}

const iconNames = [...listMatch[1].matchAll(/<img\b[^>]*\btitle="([^"]+)"/g)]
  .map((match) => match[1]);

if (iconNames.length === 0 || new Set(iconNames).size !== iconNames.length) {
  throw new Error("The icon list is empty or contains duplicate names");
}

const relatedKeywords = new Map(Object.entries({
  add: ["create", "insert", "new"],
  brightness: ["light", "illumination"],
  chart: ["graph", "visualization"],
  color: ["colour"],
  copy: ["duplicate"],
  decrease: ["less", "lower", "reduce"],
  delete: ["remove", "clear"],
  email: ["mail", "message"],
  find: ["search", "lookup"],
  format: ["style", "appearance"],
  graph: ["chart", "visualization"],
  image: ["picture", "photo"],
  increase: ["more", "higher", "raise"],
  insert: ["add", "create"],
  lock: ["protect"],
  mail: ["email", "message"],
  open: ["launch", "show"],
  paste: ["insert"],
  picture: ["image", "photo"],
  print: ["printer", "printing"],
  redo: ["repeat"],
  refresh: ["reload", "update"],
  save: ["store", "write"],
  search: ["find", "lookup"],
  send: ["share", "submit"],
  table: ["grid"],
  undo: ["reverse"],
  unlock: ["unprotect"],
  zoom: ["magnify", "scale"]
}));

const iconOverrides = new Map(Object.entries({
  BrightnessLess: {
    description: "Reduce screen brightness or dim the display.",
    keywords: ["brightness", "dark", "decrease", "dim", "dimmer", "display", "lower", "moon", "night", "screen"]
  },
  BrightnessMore: {
    description: "Increase screen brightness or brighten the display.",
    keywords: ["brightness", "brighten", "brighter", "daylight", "display", "increase", "light", "screen", "sun"]
  }
}));

function splitIconName(name = "") {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

const metadata = iconNames.map((name) => {
  const words = splitIconName(name);
  const normalizedWords = words.map((word) => word.toLowerCase());
  const override = iconOverrides.get(name);
  const keywords = new Set([
    ...normalizedWords,
    normalizedWords.join(" "),
    ...normalizedWords.flatMap((word) => relatedKeywords.get(word) || []),
    ...(override ? override.keywords : [])
  ]);
  const description = override
    ? override.description
    : `Office icon for ${words.join(" ").toLowerCase()}.`;

  return {
    name,
    description,
    keywords: [...keywords].filter(Boolean).sort()
  };
});

fs.writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
console.log(`Generated metadata for ${metadata.length} icons in ${path.basename(outputPath)}`);
