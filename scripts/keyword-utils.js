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

function nameWordSynonyms(iconNames, synonymsByNameWord = {}) {
  const nameWords = nameKeywords(iconNames);
  const sourcesBySynonym = new Map();
  for (const [sourceWord, synonyms] of Object.entries(synonymsByNameWord)) {
    const normalizedSource = sourceWord.trim().toLocaleLowerCase("en");
    if (!nameWords.has(normalizedSource) || !Array.isArray(synonyms)) {
      continue;
    }
    for (const synonym of synonyms) {
      if (typeof synonym !== "string") {
        continue;
      }
      const normalizedSynonym = synonym.trim().toLocaleLowerCase("en");
      if (!normalizedSynonym) {
        continue;
      }
      const sources = sourcesBySynonym.get(normalizedSynonym) || [];
      if (!sources.includes(normalizedSource)) {
        sources.push(normalizedSource);
        sourcesBySynonym.set(normalizedSynonym, sources);
      }
    }
  }
  return sourcesBySynonym;
}

function keywordSynonymsForValues(values, synonymsByKeyword = {}) {
  const sourceKeywords = new Set(values.map((value) => value.trim().toLocaleLowerCase("en")));
  const sourcesBySynonym = new Map();
  for (const [sourceKeyword, synonyms] of Object.entries(synonymsByKeyword)) {
    const normalizedSource = sourceKeyword.trim().toLocaleLowerCase("en");
    if (!sourceKeywords.has(normalizedSource) || !Array.isArray(synonyms)) {
      continue;
    }
    for (const synonym of synonyms) {
      if (typeof synonym !== "string") {
        continue;
      }
      const normalizedSynonym = synonym.trim().toLocaleLowerCase("en");
      if (!normalizedSynonym) {
        continue;
      }
      const sources = sourcesBySynonym.get(normalizedSynonym) || [];
      if (!sources.includes(normalizedSource)) {
        sources.push(normalizedSource);
        sourcesBySynonym.set(normalizedSynonym, sources);
      }
    }
  }
  return sourcesBySynonym;
}

function normalizeKeywordSynonyms(value, availableKeywords) {
  if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).length > 5000) {
    throw new Error("Keyword synonyms must be an object with no more than 5,000 keywords");
  }
  const normalized = {};
  for (const [sourceKeyword, synonyms] of Object.entries(value)) {
    const source = sourceKeyword.trim().toLocaleLowerCase("en");
    if (!availableKeywords.has(source)) {
      throw new Error(`Unknown custom keyword: ${sourceKeyword}`);
    }
    if (!Array.isArray(synonyms) || synonyms.length > 100) {
      throw new Error(`Provide no more than 100 synonyms for ${source}`);
    }
    const normalizedSynonyms = [...new Set(synonyms.map((synonym) => {
      if (typeof synonym !== "string") {
        throw new Error("Each synonym must be text");
      }
      const term = synonym.trim().toLocaleLowerCase("en");
      if (!term || term.length > 80) {
        throw new Error("Synonyms must contain 1 to 80 characters");
      }
      return term;
    }))].sort();
    if (normalizedSynonyms.length > 0) {
      normalized[source] = normalizedSynonyms;
    }
  }
  return Object.fromEntries(Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right, "en")));
}

function normalizeNameSynonyms(value, availableNameWords) {
  if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).length > 5000) {
    throw new Error("Synonyms must be an object with no more than 5,000 name words");
  }
  const normalized = {};
  for (const [sourceWord, synonyms] of Object.entries(value)) {
    const source = sourceWord.trim().toLocaleLowerCase("en");
    if (!availableNameWords.has(source)) {
      throw new Error(`Unknown icon-name word: ${sourceWord}`);
    }
    if (!Array.isArray(synonyms) || synonyms.length > 100) {
      throw new Error(`Provide no more than 100 synonyms for ${source}`);
    }
    const normalizedSynonyms = [...new Set(synonyms.map((synonym) => {
      if (typeof synonym !== "string") {
        throw new Error("Each synonym must be text");
      }
      const term = synonym.trim().toLocaleLowerCase("en");
      if (!term || term.length > 80) {
        throw new Error("Synonyms must contain 1 to 80 characters");
      }
      return term;
    }))].sort();
    if (normalizedSynonyms.length > 0) {
      normalized[source] = normalizedSynonyms;
    }
  }
  return Object.fromEntries(Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right, "en")));
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

function normalizeReviewedKeywordGroup(iconNames, values, synonymsByNameWord = {}, synonymsByKeyword = {}) {
  if (!Array.isArray(iconNames) || iconNames.length === 0) {
    throw new Error("Provide at least one icon ID");
  }
  const submitted = normalizeKeywordValues(values, 200);
  const nameWords = nameKeywords(iconNames);
  const reviewedKeywords = removeNameKeywords(iconNames, submitted);
  const synonymKeywords = [...nameWordSynonyms(iconNames, synonymsByNameWord).keys()];
  const customSynonymKeywords = [...keywordSynonymsForValues(submitted, synonymsByKeyword).keys()];
  return [...new Set([...reviewedKeywords, ...synonymKeywords, ...customSynonymKeywords])]
    .filter((keyword) => !nameWords.has(keyword))
    .sort();
}

function updateReviewStatus(reviewStatus, iconId, reviewed) {
  return { ...reviewStatus, [iconId]: reviewed };
}

function updateMetadataKeywords(metadata, iconIds, keywords) {
  const iconIdSet = new Set(iconIds);
  const representativeId = iconIds[0];
  return metadata.map((entry) => {
    if (!iconIdSet.has(entry.name)) {
      return entry;
    }
    if (entry.name === representativeId) {
      return { ...entry, keywords };
    }
    const alias = { ...entry };
    delete alias.keywords;
    return alias;
  });
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readReviewStatus(filePath) {
  return readJsonFile(filePath);
}

module.exports = { keywordSynonymsForValues, nameKeywords, nameWordSynonyms, normalizeKeywordSynonyms, normalizeNameSynonyms, normalizeReviewedKeywordGroup, normalizeReviewedKeywords, readJsonFile, readReviewStatus, removeNameKeywords, splitIconName, updateMetadataKeywords, updateReviewStatus };
