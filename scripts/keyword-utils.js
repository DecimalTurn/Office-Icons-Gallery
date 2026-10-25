const fs = require("node:fs");

function splitIconName(name = "") {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function nameKeywords(iconNames) {
  return new Set(iconNames
    .flatMap(splitIconName)
    .map((word) => word.toLocaleLowerCase("en")));
}

function removeNameKeywords(iconNames, keywords) {
  const excludedKeywords = nameKeywords(iconNames);
  return keywords.filter((keyword) => !excludedKeywords.has(keyword.toLocaleLowerCase("en")));
}

function normalizeKeywordValues(values, maximumKeywords) {
  if (!Array.isArray(values) || values.length > maximumKeywords) {
    throw new Error(`Provide no more than ${maximumKeywords} keywords`);
  }
  return values.map((value) => {
    if (typeof value !== "string") {
      throw new Error("Each keyword must be text");
    }
    const keyword = value.trim().toLocaleLowerCase("en");
    if (!keyword || keyword.length > 80) {
      throw new Error("Keywords must contain 1 to 80 characters");
    }
    return keyword;
  });
}

function normalizeReviewedKeywords(iconName, values) {
  const submitted = normalizeKeywordValues(values, 100);
  return [...new Set(removeNameKeywords([iconName], submitted))].sort();
}

function normalizeReviewedKeywordGroup(iconNames, values) {
  if (!Array.isArray(iconNames) || iconNames.length === 0) {
    throw new Error("Provide at least one icon ID");
  }
  const submitted = normalizeKeywordValues(values, 200);
  return [...new Set(removeNameKeywords(iconNames, submitted))].sort();
}

function updateReviewStatus(reviewStatus, iconId, reviewed) {
  return { ...reviewStatus, [iconId]: reviewed };
}

function updateMetadataKeywords(metadata, iconIds, keywords) {
  const iconIdSet = new Set(iconIds);
  return metadata.map((entry) => iconIdSet.has(entry.name) ? { ...entry, keywords } : entry);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readReviewStatus(filePath) {
  return readJsonFile(filePath);
}

module.exports = { nameKeywords, normalizeReviewedKeywordGroup, normalizeReviewedKeywords, readJsonFile, readReviewStatus, removeNameKeywords, splitIconName, updateMetadataKeywords, updateReviewStatus };
