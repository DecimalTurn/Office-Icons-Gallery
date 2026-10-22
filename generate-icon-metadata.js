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

const missingOverrides = [...iconOverrides.keys()].filter((name) => !iconNames.includes(name));
if (missingOverrides.length > 0) {
  throw new Error(`Overrides reference unknown icons: ${missingOverrides.join(", ")}`);
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
