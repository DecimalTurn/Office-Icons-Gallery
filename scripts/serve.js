const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || process.argv[2] || 8000);
const metadataPath = path.join(root, "icon-metadata.json");
const descriptionsPath = path.join(root, "icon-descriptions.json");
const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const descriptions = JSON.parse(fs.readFileSync(descriptionsPath, "utf8"));
const metadataByName = new Map(metadata.map((icon) => [icon.name, icon]));
const iconIdsByImageHash = new Map();
for (const icon of metadata) {
  if (!icon.imageSha256) {
    continue;
  }
  const iconIds = iconIdsByImageHash.get(icon.imageSha256) || [];
  iconIds.push(icon.name);
  iconIdsByImageHash.set(icon.imageSha256, iconIds);
}
const draftStorePath = path.join(root, ".description-review-drafts.json");
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

async function readJsonBody(request, maximumBytes = 16_384) {
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

function readDraftStore() {
  try {
    return JSON.parse(fs.readFileSync(draftStorePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function writeJsonFile(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function getIconImage(iconId) {
  if (typeof iconId !== "string" || !/^[A-Za-z0-9_]+$/.test(iconId)) {
    throw new Error("Choose a valid icon ID");
  }

  const icon = metadataByName.get(iconId);
  if (!icon) {
    throw new Error("That icon ID was not found");
  }

  const image = fs.readFileSync(path.join(root, "images", `${iconId}.png`));
  const imageHash = crypto.createHash("sha256").update(image).digest("hex").toUpperCase();
  return {
    icon,
    image,
    imageHash,
    iconIds: (iconIdsByImageHash.get(imageHash) || [iconId]).sort()
  };
}

function validModelName(model) {
  return typeof model === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(model);
}

async function handleDescriptionReviewApi(request, response, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  if (pathname === "/api/description-review/models" && request.method === "GET") {
    try {
      const ollamaResponse = await fetch("http://127.0.0.1:11434/api/tags", {
        signal: AbortSignal.timeout(3_000)
      });
      if (!ollamaResponse.ok) {
        sendJson(response, 502, { error: `Ollama returned HTTP ${ollamaResponse.status}` });
        return;
      }
      const result = await ollamaResponse.json();
      sendJson(response, 200, { models: (result.models || []).map(({ name }) => name) });
    } catch {
      sendJson(response, 503, { error: "Ollama is unavailable at http://127.0.0.1:11434. Start Ollama, then retry." });
    }
    return;
  }

  if (pathname === "/api/description-review/image" && request.method === "GET") {
    try {
      const { icon, imageHash, iconIds } = getIconImage(searchParams.get("name"));
      const drafts = readDraftStore();
      sendJson(response, 200, {
        iconIds,
        imageHash,
        curatedDescriptions: Object.fromEntries(iconIds
          .filter((iconId) => descriptions[iconId])
          .map((iconId) => [iconId, descriptions[iconId]])),
        draft: drafts[imageHash] || null
      });
    } catch (error) {
      sendJson(response, error.message === "That icon ID was not found" ? 404 : 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/description-review/drafts" && request.method === "GET") {
    try {
      sendJson(response, 200, { drafts: readDraftStore() });
    } catch {
      sendJson(response, 500, { error: "Could not read local description drafts" });
    }
    return;
  }

  if (pathname === "/api/description-review/generate" && request.method === "POST") {
    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      sendJson(response, 400, { error: error.message === "Request body is too large" ? error.message : "Request must contain valid JSON" });
      return;
    }
    if (!validModelName(body.model)) {
      sendJson(response, 400, { error: "Enter a valid Ollama model name" });
      return;
    }

    try {
      const { image } = getIconImage(body.iconId);
      const ollamaResponse = await fetch("http://127.0.0.1:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({
          model: body.model,
          stream: false,
          options: { temperature: 0.2 },
          messages: [{
            role: "user",
            content: "Describe only the visible artwork in this small icon. Name its shapes, colors, and arrangement. Do not infer the icon's function from its ID or context. Use one concise sentence, start directly with the visible object or scene, and do not use introductory phrases such as 'The icon depicts' or 'This icon shows'. Return only the sentence.",
            images: [image.toString("base64")]
          }]
        })
      });
      const result = await ollamaResponse.json().catch(() => ({}));
      if (!ollamaResponse.ok) {
        sendJson(response, 502, { error: result.error || `Ollama returned HTTP ${ollamaResponse.status}` });
        return;
      }
      const suggestion = result.message?.content?.trim();
      if (!suggestion || suggestion.length > 2_000) {
        sendJson(response, 502, { error: "The model returned an empty or oversized description" });
        return;
      }
      sendJson(response, 200, { suggestion });
    } catch (error) {
      const statusCode = error.message === "That icon ID was not found" ? 404 : 502;
      const message = error.name === "TimeoutError"
        ? "The model request timed out. Try again or choose a smaller model."
        : error.message;
      sendJson(response, statusCode, { error: message || "Could not reach Ollama at http://127.0.0.1:11434" });
    }
    return;
  }

  if (pathname === "/api/description-review/review" && request.method === "POST") {
    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      sendJson(response, 400, { error: error.message === "Request body is too large" ? error.message : "Request must contain valid JSON" });
      return;
    }
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!description || description.length > 2_000) {
      sendJson(response, 400, { error: "Provide a description of no more than 2,000 characters" });
      return;
    }

    try {
      const { iconIds, imageHash } = getIconImage(body.iconId);
      const updatedDescriptions = { ...descriptions };
      for (const iconId of iconIds) {
        updatedDescriptions[iconId] = description;
      }
      const updatedMetadata = metadata.map((icon) => iconIds.includes(icon.name)
        ? { ...icon, description }
        : icon);

      writeJsonFile(descriptionsPath, updatedDescriptions);
      writeJsonFile(metadataPath, updatedMetadata);
      Object.assign(descriptions, updatedDescriptions);
      for (const icon of updatedMetadata) {
        const currentIcon = metadataByName.get(icon.name);
        if (currentIcon) {
          currentIcon.description = icon.description;
        }
      }

      sendJson(response, 200, {
        imageHash,
        iconIds,
        curatedDescriptions: Object.fromEntries(iconIds.map((iconId) => [iconId, description]))
      });
    } catch (error) {
      const statusCode = error.message === "That icon ID was not found" ? 404 : 500;
      sendJson(response, statusCode, { error: error.message || "Could not update tracked icon descriptions" });
    }
    return;
  }

  if (pathname === "/api/description-review/drafts" && request.method === "POST") {
    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      sendJson(response, 400, { error: error.message === "Request body is too large" ? error.message : "Request must contain valid JSON" });
      return;
    }
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const suggestion = typeof body.suggestion === "string" ? body.suggestion.trim() : "";
    if (!validModelName(body.model) || !description || description.length > 2_000 || suggestion.length > 2_000 || !["draft", "reviewed"].includes(body.status)) {
      sendJson(response, 400, { error: "Provide a model, description, and valid draft status" });
      return;
    }

    try {
      const { iconIds, imageHash } = getIconImage(body.iconId);
      const record = {
        imageHash,
        iconIds,
        model: body.model,
        suggestion,
        description,
        status: body.status,
        updatedAt: new Date().toISOString()
      };
      const drafts = readDraftStore();
      drafts[imageHash] = record;
      const temporaryPath = `${draftStorePath}.tmp`;
      fs.writeFileSync(temporaryPath, `${JSON.stringify(drafts, null, 2)}\n`, "utf8");
      fs.renameSync(temporaryPath, draftStorePath);
      sendJson(response, 200, { draft: record });
    } catch (error) {
      const statusCode = error.message === "That icon ID was not found" ? 404 : 400;
      sendJson(response, statusCode, { error: error.message });
    }
    return;
  }

  if (pathname.startsWith("/api/description-review/")) {
    sendJson(response, 404, { error: "Review API route not found" });
    return;
  }

  return false;
}

http.createServer(async (request, response) => {
  let pathname;
  let requestUrl;

  try {
    requestUrl = new URL(request.url, "http://localhost");
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  const isReviewApi = await handleDescriptionReviewApi(request, response, requestUrl);
  if (isReviewApi !== false) {
    return;
  }

  if (pathname === "/") {
    pathname = "/index.html";
  }

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