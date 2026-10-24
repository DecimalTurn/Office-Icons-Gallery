const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeReviewedKeywordGroup, readReviewStatus, updateReviewStatus } = require("./keyword-utils");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || process.argv[2] || 8000);
const metadataPath = path.join(root, "icon-metadata.json");
const keywordsPath = path.join(root, "icon-keywords.json");
const reviewStatusPath = path.join(root, "icon-review-status.json");
const referenceListsPath = path.join(root, ".reference-icon-lists.json");
const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const reviewedKeywords = JSON.parse(fs.readFileSync(keywordsPath, "utf8"));
const metadataByName = new Map(metadata.map((icon) => [icon.name, icon]));
const iconIdsByImageHash = new Map();
for (const icon of metadata) {
  if (icon.imageStatus === "placeholder") {
    continue;
  }
  const iconIds = iconIdsByImageHash.get(icon.imageSha256) || [];
  iconIds.push(icon.name);
  iconIdsByImageHash.set(icon.imageSha256, iconIds);
}
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readJsonBody(request, maximumBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) {
      throw new Error("Request body is too large");
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJsonFile(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function readReferenceLists() {
  try {
    const value = JSON.parse(fs.readFileSync(referenceListsPath, "utf8"));
    return Array.isArray(value.lists) ? value.lists : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function validateReferenceLists(value) {
  if (!Array.isArray(value) || value.length > 50) {
    throw new Error("Provide no more than 50 reference lists");
  }

  const listIds = new Set();
  const listNames = new Set();
  return value.map((list) => {
    const id = typeof list?.id === "string" ? list.id.trim() : "";
    const name = typeof list?.name === "string" ? list.name.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !name || name.length > 60 || !Array.isArray(list.iconIds) || list.iconIds.length > 500) {
      throw new Error("Each list needs a valid ID, a name of 1 to 60 characters, and no more than 500 icons");
    }
    const normalizedName = name.toLocaleLowerCase("en");
    if (listIds.has(id) || listNames.has(normalizedName)) {
      throw new Error("Reference list IDs and names must be unique");
    }
    listIds.add(id);
    listNames.add(normalizedName);

    const iconIds = [];
    const seenIconIds = new Set();
    for (const iconId of list.iconIds) {
      if (typeof iconId !== "string" || !metadataByName.has(iconId)) {
        throw new Error(`Unknown icon ID: ${String(iconId)}`);
      }
      if (!seenIconIds.has(iconId)) {
        iconIds.push(iconId);
        seenIconIds.add(iconId);
      }
    }
    return { id, name, iconIds };
  });
}

async function handleApi(request, response, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/reference-lists" && request.method === "GET") {
    try {
      sendJson(response, 200, { lists: readReferenceLists() });
    } catch {
      sendJson(response, 500, { error: "Could not read local reference lists" });
    }
    return true;
  }

  if (pathname === "/api/reference-lists" && request.method === "PUT") {
    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      sendJson(response, 400, { error: error.message === "Request body is too large" ? error.message : "Request must contain valid JSON" });
      return true;
    }
    try {
      const lists = validateReferenceLists(body.lists);
      writeJsonFile(referenceListsPath, { lists });
      sendJson(response, 200, { lists });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Could not save local reference lists" });
    }
    return true;
  }

  if (pathname === "/api/keyword-review/confirm" && request.method === "POST") {
    let body;
    try {
      body = await readJsonBody(request, 32_768);
    } catch (error) {
      sendJson(response, 400, { error: error.message === "Request body is too large" ? error.message : "Request must contain valid JSON" });
      return true;
    }
    const iconId = typeof body.iconId === "string" ? body.iconId : "";
    if (!metadataByName.has(iconId)) {
      sendJson(response, 404, { error: "That icon ID was not found" });
      return true;
    }

    try {
      const icon = metadataByName.get(iconId);
      const iconIds = icon.imageStatus === "placeholder"
        ? [iconId]
        : iconIdsByImageHash.get(icon.imageSha256) || [iconId];
      const iconIdSet = new Set(iconIds);
      const keywords = normalizeReviewedKeywordGroup(iconIds, body.keywords);
      const nextKeywords = { ...reviewedKeywords };
      for (const groupIconId of iconIds) {
        nextKeywords[groupIconId] = keywords;
      }
      const nextReviewStatus = updateReviewStatus(readReviewStatus(reviewStatusPath), iconId, true);
      const nextMetadata = metadata.map((entry) => iconIdSet.has(entry.name) ? { ...entry, keywords } : entry);
      writeJsonFile(keywordsPath, nextKeywords);
      writeJsonFile(metadataPath, nextMetadata);
      writeJsonFile(reviewStatusPath, nextReviewStatus);
      for (const groupIconId of iconIds) {
        reviewedKeywords[groupIconId] = keywords;
        metadataByName.get(groupIconId).keywords = keywords;
      }
      sendJson(response, 200, { iconId, iconIds, keywords, reviewed: true });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Could not save reviewed keywords" });
    }
    return true;
  }

  if (pathname === "/api/keyword-review/status" && request.method === "POST") {
    let body;
    try {
      body = await readJsonBody(request, 16_384);
    } catch (error) {
      sendJson(response, 400, { error: error.message === "Request body is too large" ? error.message : "Request must contain valid JSON" });
      return true;
    }
    if (body.reviewed !== false || typeof body.iconId !== "string" || !metadataByName.has(body.iconId)) {
      sendJson(response, 400, { error: "Choose an icon ID and set reviewed to false" });
      return true;
    }
    try {
      const nextReviewStatus = updateReviewStatus(readReviewStatus(reviewStatusPath), body.iconId, false);
      writeJsonFile(reviewStatusPath, nextReviewStatus);
      sendJson(response, 200, { iconId: body.iconId, reviewed: false });
    } catch (error) {
      sendJson(response, 500, { error: error.message || "Could not reset review status" });
    }
    return true;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "API route not found" });
    return true;
  }
  return false;
}

http.createServer(async (request, response) => {
  let requestUrl;
  try {
    requestUrl = new URL(request.url, "http://localhost");
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  if (await handleApi(request, response, requestUrl)) {
    return;
  }

  const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const filePath = path.resolve(root, `.${pathname}`);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    response.end(content);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Office Icons Gallery: http://127.0.0.1:${port}`);
});