const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { splitIconName } = require("./scripts/keyword-utils");

const imagesPath = path.join(__dirname, "images");
const sharedImagesPath = path.join(imagesPath, "by-hash");
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
fs.mkdirSync(sharedImagesPath, { recursive: true });
const imageAssetByHash = new Map();
const shortHashToImageHash = new Map();
const expectedSharedImageFiles = new Set();
for (const [imageHash, names] of namesByImageHash) {
  const shortHash = imageHash.slice(0, 16).toLowerCase();
  const existingHash = shortHashToImageHash.get(shortHash);
  if (existingHash) {
    throw new Error(`Short image hash collision between ${existingHash} and ${imageHash}`);
  }

  shortHashToImageHash.set(shortHash, imageHash);
  const fileName = `${shortHash}.png`;
  const imageAsset = `images/by-hash/${fileName}`;
  fs.copyFileSync(path.join(imagesPath, `${names[0]}.png`), path.join(sharedImagesPath, fileName));
  imageAssetByHash.set(imageHash, imageAsset);
  expectedSharedImageFiles.add(fileName);
}
for (const entry of fs.readdirSync(sharedImagesPath, { withFileTypes: true })) {
  if (entry.isFile() && /^[a-f0-9]{16}\.png$/.test(entry.name) && !expectedSharedImageFiles.has(entry.name)) {
    fs.unlinkSync(path.join(sharedImagesPath, entry.name));
  }
}
const placeholderIconNames = new Set(iconNames.filter((name) =>
  placeholderByHash.has(imageHashByName.get(name))
));
const relatedIconNames = iconNames.filter((name) => !placeholderIconNames.has(name));

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

const reviewedKeywords = JSON.parse(fs.readFileSync(
  path.join(__dirname, "icon-keywords.json"),
  "utf8"
));
if (!reviewedKeywords || Array.isArray(reviewedKeywords) || typeof reviewedKeywords !== "object") {
  throw new Error("Reviewed keywords must be a JSON object keyed by icon ID");
}

const keywordOverrides = new Map(Object.entries({
  "BrightnessLess": [
    "brightness",
    "dark",
    "decrease",
    "dim",
    "dimmer",
    "display",
    "glare",
    "lower",
    "moon",
    "night",
    "screen",
    "sun",
    "sunlight"
  ],
  "BrightnessMore": [
    "brightness",
    "brighten",
    "brighter",
    "daylight",
    "display",
    "increase",
    "light",
    "screen",
    "sun"
  ],
  "AlignCenter": [
    "align",
    "alignment",
    "center",
    "centered",
    "middle",
    "position"
  ],
  "AnimationAudio": [
    "animation",
    "audio",
    "motion",
    "music",
    "sound",
    "speaker"
  ],
  "CalendarImport": [
    "appointment",
    "calendar",
    "date",
    "event",
    "import",
    "schedule"
  ],
  "ChartInsert": [
    "bar chart",
    "chart",
    "data",
    "graph",
    "insert",
    "plot",
    "visualization"
  ],
  "BuildHyperlink": [
    "address",
    "hyperlink",
    "link",
    "url",
    "web",
    "website"
  ],
  "AutoSigInsertPictureFromFile": [
    "email",
    "file",
    "graphic",
    "image",
    "insert",
    "photo",
    "picture",
    "signature"
  ]
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

const missingKeywordOverrides = [...keywordOverrides.keys()].filter((name) => !iconNames.includes(name));
if (missingKeywordOverrides.length > 0) {
  throw new Error("Keyword overrides reference unknown icons: " + missingKeywordOverrides.join(", "));
}
const invalidReviewedKeywords = Object.entries(reviewedKeywords)
  .filter(([name, keywords]) => !/^[A-Za-z0-9_]+$/.test(name) || !Array.isArray(keywords) ||
    keywords.some((keyword) => typeof keyword !== "string" || !keyword.trim()));
if (invalidReviewedKeywords.length > 0) {
  throw new Error("Invalid reviewed keywords: " + invalidReviewedKeywords.map(([name]) => name).join(", "));
}

const iconNameSet = new Set(iconNames);
const unknownKeywordIcons = Object.keys(reviewedKeywords).filter((name) => !iconNameSet.has(name));
if (unknownKeywordIcons.length > 0) {
  throw new Error("Reviewed keywords reference unknown icons: " + unknownKeywordIcons.join(", "));
}
for (const [name, relatedNames] of relatedIconOverrides) {
  const invalidRelatedNames = relatedNames.filter((relatedName) =>
    !iconNameSet.has(relatedName) || relatedName === name || placeholderIconNames.has(relatedName)
  );
  if (!iconNameSet.has(name) || placeholderIconNames.has(name) || invalidRelatedNames.length > 0 || new Set(relatedNames).size !== relatedNames.length) {
    throw new Error(`Invalid related icon IDs for ${name}: ${invalidRelatedNames.join(", ") || relatedNames.join(", ")}`);
  }
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
for (const name of relatedIconNames) {
  const words = relatedWordsByName.get(name);
  for (const word of words) {
    relatedWordFrequency.set(word, (relatedWordFrequency.get(word) || 0) + 1);
  }
}

const maximumCommonWordFrequency = Math.floor(relatedIconNames.length * 0.025);
const minimumRelatedIconScore = 5;
const relatedNamesByWord = new Map();
for (const name of relatedIconNames) {
  const words = relatedWordsByName.get(name);
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
    const weight = Math.log((relatedIconNames.length + 1) / (relatedWordFrequency.get(word) + 1));
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
  const keywordOverride = keywordOverrides.get(name) || [];
  const relatedIcons = findRelatedIconNames(name);
  const imageHash = imageHashByName.get(name);
  const imageAsset = imageAssetByHash.get(imageHash);
  const placeholder = placeholderByHash.get(imageHash);
  const sameImageIds = placeholder
    ? []
    : (namesByImageHash.get(imageHash) || []).filter((otherName) => otherName !== name);
  const generatedKeywords = [
    ...normalizedWords,
    ...normalizedWords.flatMap((word) => relatedKeywords.get(word) || []),
    ...(placeholder ? ["placeholder", "office fallback"] : []),
    ...keywordOverride
  ];
  const keywords = new Set([
    ...normalizedWords,
    ...(Object.hasOwn(reviewedKeywords, name) ? reviewedKeywords[name] : generatedKeywords)
      .map((keyword) => keyword.trim().toLocaleLowerCase("en"))
  ]);

  return {
    name,
    imageAsset,
    keywords: [...keywords].filter(Boolean).sort(),
    ...(relatedIcons.length > 0 ? { relatedIcons } : {}),
    ...(sameImageIds.length > 0 ? { sameImageIds } : {}),
    imageSha256: imageHash,
    ...(placeholder ? {
      imageStatus: placeholder.imageStatus,
      placeholderLabel: placeholder.label,
      placeholderAsset: placeholder.asset
    } : {})
  };
});

fs.writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
console.log(`Generated metadata for ${metadata.length} icons in ${path.basename(outputPath)}`);
