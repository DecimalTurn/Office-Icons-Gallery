function splitIconName(name = "") {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function requiredNameKeywords(name) {
  return [...new Set(splitIconName(name).map((word) => word.toLocaleLowerCase("en")))];
}

function normalizeReviewedKeywords(iconName, values) {
  if (!Array.isArray(values) || values.length > 100) {
    throw new Error("Provide no more than 100 keywords");
  }
  const submitted = values.map((value) => {
    if (typeof value !== "string") {
      throw new Error("Each keyword must be text");
    }
    const keyword = value.trim().toLocaleLowerCase("en");
    if (!keyword || keyword.length > 80) {
      throw new Error("Keywords must contain 1 to 80 characters");
    }
    return keyword;
  });
  return [...new Set([...requiredNameKeywords(iconName), ...submitted])].sort();
}

module.exports = { normalizeReviewedKeywords, requiredNameKeywords, splitIconName };
