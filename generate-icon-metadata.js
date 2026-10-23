const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const imagesPath = path.join(__dirname, "images");
const outputPath = path.join(__dirname, "icon-metadata.json");
const placeholderManifestPath = path.join(__dirname, "assets", "placeholders", "manifest.tsv");
const imageFiles = fs.readdirSync(imagesPath, { withFileTypes: true })
  .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".png");
const iconNames = imageFiles.map((entry) => path.basename(entry.name, path.extname(entry.name)));
const normalizedIconNames = iconNames.map((name) => name.toLowerCase());

if (iconNames.length === 0 || new Set(normalizedIconNames).size !== iconNames.length) {
  throw new Error("The image folder is empty or contains duplicate icon IDs");
}

if (iconNames.some((name) => !/^[A-Za-z0-9_]+$/.test(name))) {
  throw new Error("An image filename contains characters that are not valid in an icon ID");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

const placeholderByHash = new Map();
const placeholderRows = fs.readFileSync(placeholderManifestPath, "utf8").split(/\r?\n/).filter(Boolean);
for (const row of placeholderRows) {
  const [sha256, imageStatus, label, asset] = row.split("\t");
  const assetPath = path.resolve(__dirname, asset);
  if (!/^[A-F0-9]{64}$/.test(sha256) || imageStatus !== "placeholder" || !label || !asset) {
    throw new Error(`Invalid placeholder manifest row: ${row}`);
  }
  if (!assetPath.startsWith(`${path.resolve(__dirname, "assets", "placeholders")}${path.sep}`)) {
    throw new Error(`Placeholder asset must be stored under assets/placeholders: ${asset}`);
  }
  if (!fs.existsSync(assetPath) || sha256File(assetPath) !== sha256) {
    throw new Error(`Placeholder asset hash does not match manifest: ${asset}`);
  }
  if (placeholderByHash.has(sha256)) {
    throw new Error(`Duplicate placeholder hash: ${sha256}`);
  }
  placeholderByHash.set(sha256, { imageStatus, label, asset });
}

iconNames.sort((left, right) =>
  left.localeCompare(right, "en", { numeric: true, sensitivity: "base" }) || left.localeCompare(right)
);

const imageHashByName = new Map();
const namesByImageHash = new Map();
for (const name of iconNames) {
  const imageHash = sha256File(path.join(imagesPath, `${name}.png`));
  imageHashByName.set(name, imageHash);
  const names = namesByImageHash.get(imageHash) || [];
  names.push(name);
  namesByImageHash.set(imageHash, names);
}

const relatedKeywords = new Map(Object.entries({
  add: ["create", "insert", "new"],
  align: ["alignment", "position"],
  animation: ["motion", "movement"],
  audio: ["sound", "speaker", "music"],
  brightness: ["light", "illumination", "screen brightness"],
  calendar: ["schedule", "date", "appointment"],
  chart: ["graph", "visualization"],
  color: ["colour"],
  copy: ["duplicate"],
  decrease: ["less", "lower", "reduce"],
  delete: ["remove", "clear"],
  document: ["file", "page"],
  email: ["mail", "message"],
  file: ["document"],
  find: ["search", "lookup"],
  format: ["style", "appearance"],
  folder: ["directory", "files"],
  graph: ["chart", "visualization"],
  hyperlink: ["link", "url", "web address"],
  image: ["picture", "photo", "graphic"],
  increase: ["more", "higher", "raise"],
  insert: ["add", "create"],
  link: ["hyperlink", "url", "web address"],
  lock: ["protect"],
  mail: ["email", "message"],
  meeting: ["appointment", "conference"],
  open: ["launch", "show"],
  paste: ["insert"],
  picture: ["image", "photo", "graphic"],
  print: ["printer", "printing"],
  redo: ["repeat"],
  refresh: ["reload", "update"],
  rotate: ["rotation", "turn"],
  save: ["store", "write"],
  search: ["find", "lookup"],
  send: ["share", "submit"],
  slide: ["presentation", "slideshow"],
  sound: ["audio", "speaker", "music"],
  table: ["grid"],
  undo: ["reverse"],
  unlock: ["unprotect"],
  video: ["movie", "film", "clip"],
  zoom: ["magnify", "scale"]
}));

const iconOverrides = new Map(Object.entries({
  BrightnessLess: {
    description: "Sun icon for reducing screen brightness and glare.",
    keywords: ["brightness", "dark", "decrease", "dim", "dimmer", "display", "glare", "lower", "moon", "night", "screen", "sun", "sunlight"]
  },
  BrightnessMore: {
    description: "Sun icon for increasing screen brightness.",
    keywords: ["brightness", "brighten", "brighter", "daylight", "display", "increase", "light", "screen", "sun"]
  },
  AlignCenter: {
    description: "Align text or objects to the center.",
    keywords: ["align", "alignment", "center", "centered", "middle", "position"]
  },
  AnimationAudio: {
    description: "Add speaker audio or sound to an animation.",
    keywords: ["animation", "audio", "motion", "music", "sound", "speaker"]
  },
  CalendarImport: {
    description: "Import appointments and events into a calendar.",
    keywords: ["appointment", "calendar", "date", "event", "import", "schedule"]
  },
  ChartInsert: {
    description: "Insert a chart or graph to visualize data.",
    keywords: ["bar chart", "chart", "data", "graph", "insert", "plot", "visualization"]
  },
  BuildHyperlink: {
    description: "Create a web hyperlink or URL.",
    keywords: ["address", "hyperlink", "link", "url", "web", "website"]
  },
  AutoSigInsertPictureFromFile: {
    description: "Insert a picture from a file into an email signature.",
    keywords: ["email", "file", "graphic", "image", "insert", "photo", "picture", "signature"]
  }
}));

const relatedIconOverrides = new Map(Object.entries({
  BrightnessLess: ["BrightnessMore"],
  BrightnessMore: ["BrightnessLess"],
  PictureBrightnessAndContrastGallery: [
    "BrightnessAndContrastEdit",
    "BrightnessLess",
    "BrightnessMore",
    "Drawing1GalleryBrightness",
    "PictureBrightnessGallery"
  ],
  Zoom100: ["ZoomCurrent100", "ZoomOnePage", "ZoomPageWidth", "ZoomToSelection"],
  ZoomCurrent100: ["Zoom100", "ZoomOnePage", "ZoomPageWidth"],
  ZoomFitToWindow: ["ZoomOnePage", "ZoomTwoPages"],
  ZoomOnePage: ["Zoom100", "ZoomCurrent100", "ZoomPageWidth", "ZoomTwoPages"],
  ZoomPageWidth: ["Zoom100", "ZoomCurrent100", "ZoomOnePage", "ZoomTwoPages"],
  ZoomToSelection: ["Zoom100", "ZoomPageWidth"],
  ZoomTwoPages: ["ZoomFitToWindow", "ZoomOnePage", "ZoomPageWidth"]
}));

const numericIconNames = iconNames.filter((name) => /^_[0-9]+$/.test(name));
for (const name of numericIconNames) {
  relatedIconOverrides.set(name, numericIconNames.filter((relatedName) => relatedName !== name));
}

const missingOverrides = [...iconOverrides.keys()].filter((name) => !iconNames.includes(name));
if (missingOverrides.length > 0) {
  throw new Error(`Overrides reference unknown icons: ${missingOverrides.join(", ")}`);
}

const iconNameSet = new Set(iconNames);
for (const [name, relatedNames] of relatedIconOverrides) {
  const invalidRelatedNames = relatedNames.filter((relatedName) =>
    !iconNameSet.has(relatedName) || relatedName === name
  );
  if (!iconNameSet.has(name) || invalidRelatedNames.length > 0 || new Set(relatedNames).size !== relatedNames.length) {
    throw new Error(`Invalid related icon IDs for ${name}: ${invalidRelatedNames.join(", ") || relatedNames.join(", ")}`);
  }
}

function splitIconName(name = "") {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

const relatedNameStopWords = new Set([
  "all", "and", "as", "by", "classic", "control", "dialog", "first", "five", "four",
  "from", "gallery", "group", "in", "menu", "more", "new", "nine", "of", "on", "one",
  "options", "other", "same", "second", "seven", "show", "six", "ten", "the", "third",
  "three", "to", "toolbar", "two", "with"
]);
const relatedWordsByName = new Map(iconNames.map((name) => [
  name,
  new Set(splitIconName(name)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 1 && !/^\d+$/.test(word) && !relatedNameStopWords.has(word)))
]));
const relatedWordFrequency = new Map();
for (const words of relatedWordsByName.values()) {
  for (const word of words) {
    relatedWordFrequency.set(word, (relatedWordFrequency.get(word) || 0) + 1);
  }
}

const maximumCommonWordFrequency = Math.floor(iconNames.length * 0.025);
const minimumRelatedIconScore = 5;
const relatedNamesByWord = new Map();
for (const [name, words] of relatedWordsByName) {
  for (const word of words) {
    if (relatedWordFrequency.get(word) > maximumCommonWordFrequency) {
      continue;
    }

    const names = relatedNamesByWord.get(word) || [];
    names.push(name);
    relatedNamesByWord.set(word, names);
  }
}

/** @param {string} name */
function findRelatedIconNames(name) {
  const scores = new Map();
  for (const word of relatedWordsByName.get(name) || []) {
    const matchingNames = relatedNamesByWord.get(word) || [];
    const weight = Math.log((iconNames.length + 1) / (relatedWordFrequency.get(word) + 1));
    for (const relatedName of matchingNames) {
      if (relatedName === name) {
        continue;
      }

      const score = scores.get(relatedName) || { weight: 0, sharedWordCount: 0 };
      score.weight += weight;
      score.sharedWordCount += 1;
      scores.set(relatedName, score);
    }
  }

  const curatedNames = relatedIconOverrides.get(name) || [];
  const generatedNames = [...scores.entries()]
    .filter(([, score]) => score.weight >= minimumRelatedIconScore)
    .sort(([leftName, leftScore], [rightName, rightScore]) =>
      rightScore.weight - leftScore.weight ||
      rightScore.sharedWordCount - leftScore.sharedWordCount ||
      leftName.localeCompare(rightName, "en", { numeric: true, sensitivity: "base" }) ||
      leftName.localeCompare(rightName)
    )
    .map(([relatedName]) => relatedName)
    .filter((relatedName) => !curatedNames.includes(relatedName));

  return [...curatedNames, ...generatedNames].slice(0, 12);
}

const metadata = iconNames.map((name) => {
  const words = splitIconName(name);
  const normalizedWords = words.map((word) => word.toLowerCase());
  const override = iconOverrides.get(name);
  const relatedIcons = findRelatedIconNames(name);
  const imageHash = imageHashByName.get(name);
  const placeholder = placeholderByHash.get(imageHash);
  const sameImageIds = placeholder
    ? []
    : (namesByImageHash.get(imageHash) || []).filter((otherName) => otherName !== name);
  const keywords = new Set([
    ...normalizedWords,
    normalizedWords.join(" "),
    ...normalizedWords.flatMap((word) => relatedKeywords.get(word) || []),
    ...(placeholder ? ["placeholder", "office fallback"] : []),
    ...(override ? override.keywords : [])
  ]);
  const description = override
    ? override.description
    : `Office icon for ${words.join(" ").toLowerCase()}.`;

  return {
    name,
    description,
    keywords: [...keywords].filter(Boolean).sort(),
    ...(relatedIcons.length > 0 ? { relatedIcons } : {}),
    ...(sameImageIds.length > 0 ? { sameImageIds } : {}),
    ...(placeholder ? {
      imageStatus: placeholder.imageStatus,
      placeholderLabel: placeholder.label,
      placeholderAsset: placeholder.asset,
      imageSha256: imageHash
    } : {})
  };
});

fs.writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
console.log(`Generated metadata for ${metadata.length} icons in ${path.basename(outputPath)}`);
