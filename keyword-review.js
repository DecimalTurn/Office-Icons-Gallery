(() => {
  const elements = {
    search: document.getElementById("icon-search"),
    results: document.getElementById("icon-results"),
    previous: [document.getElementById("previous-icon"), document.getElementById("previous-icon-bottom")],
    next: [document.getElementById("next-icon"), document.getElementById("next-icon-bottom")],
    position: document.getElementById("icon-position"),
    status: document.getElementById("review-status"),
    iconName: document.getElementById("selected-icon-name"),
    iconImage: document.getElementById("selected-icon-image"),
    reviewState: document.getElementById("review-state"),
    imageHash: document.getElementById("image-hash"),
    sameImageIds: document.getElementById("same-image-ids"),
    keywordEditor: document.getElementById("keyword-editor"),
    addKeyword: document.getElementById("add-keyword"),
    markReviewed: document.getElementById("mark-reviewed"),
    markNotReviewed: document.getElementById("mark-not-reviewed"),
    reviewCount: document.getElementById("review-count")
  };

  const state = {
    icons: [],
    reviewStatus: {},
    currentIcon: null,
    position: -1,
    searchResults: [],
    activeResult: -1,
    keywordBaseline: [],
    keywordSuggestions: [],
    sameImageIdsByName: new Map(),
    reviewRepresentativeById: new Map()
  };
  let reviewButtonFlashTimer;

  function flashReviewButton() {
    const flashClass = "review-button-saved";
    window.clearTimeout(reviewButtonFlashTimer);
    elements.markReviewed.classList.remove(flashClass);
    void elements.markReviewed.offsetWidth;
    elements.markReviewed.classList.add(flashClass);
    reviewButtonFlashTimer = window.setTimeout(() => {
      elements.markReviewed.classList.remove(flashClass);
    }, 850);
  }

  async function requestJson(url, options) {
    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Request failed (${response.status})`);
    }
    return result;
  }

  function setStatus(message, kind = "") {
    elements.status.textContent = message;
    elements.status.dataset.kind = kind;
  }

  function splitIconName(name) {
    return name
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
      .replace(/([A-Za-z])([0-9])/g, "$1 $2")
      .replace(/([0-9])([A-Za-z])/g, "$1 $2")
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((word) => word.toLocaleLowerCase("en"));
  }

  function nameKeywords() {
    if (!state.currentIcon) {
      return new Set();
    }
    return new Set([state.currentIcon.name, ...(state.sameImageIdsByName.get(state.currentIcon.name) || [])]
      .flatMap(splitIconName)
      .filter((word) => word.length >= 4));
  }

  function readKeywords() {
    return [...elements.keywordEditor.querySelectorAll(".keyword-row input")]
      .map((input) => input.value.trim().toLocaleLowerCase("en"));
  }

  function updateReviewCount() {
    const reviewedCount = state.icons.filter((icon) => state.reviewStatus[icon.name] === true).length;
    elements.reviewCount.textContent = `${reviewedCount.toLocaleString()} / ${state.icons.length.toLocaleString()} reviewed`;
  }

  function updateReviewState(reviewed) {
    elements.reviewState.textContent = reviewed ? "Reviewed" : "Not reviewed";
    elements.reviewState.dataset.state = reviewed ? "reviewed" : "not-reviewed";
    elements.markNotReviewed.hidden = !reviewed;
  }

  function createKeywordRow(keyword, index, nameDerived) {
    const row = document.createElement("div");
    const input = document.createElement("input");
    const remove = document.createElement("button");

    row.className = "keyword-row";
    input.type = "text";
    input.maxLength = 80;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = keyword;
    input.classList.toggle("keyword-from-name", nameDerived);
    input.setAttribute("aria-label", `Keyword ${index + 1}`);
    input.title = nameDerived ? "Keyword from an icon ID; editable" : "Edit keyword";
    remove.type = "button";
    remove.className = "review-icon-button keyword-remove-button";
    remove.dataset.removeKeyword = "true";
    remove.setAttribute("aria-label", `Remove keyword ${keyword || index + 1}`);
    remove.title = "Remove keyword";
    remove.innerHTML = "&#128465;";
    row.append(input, remove);
    let autocomplete = null;
    if (!nameDerived) {
      input.classList.add("awesomplete");
      autocomplete = new Awesomplete(input, {
        list: state.keywordSuggestions,
        minChars: 1,
        maxItems: 8,
        autoFirst: true
      });
    }
    input.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        event.preventDefault();
        if (autocomplete?.opened && autocomplete.selected) {
          autocomplete.select();
        }
        const keywordInputs = [...elements.keywordEditor.querySelectorAll(".keyword-row input")];
        const nextInput = keywordInputs[keywordInputs.indexOf(input) + 1];
        (nextInput || elements.addKeyword).focus();
      }
    });
    return row;
  }

  function renderKeywords(keywords) {
    const fromName = nameKeywords();
    const normalized = [...new Set((keywords || [])
      .map((keyword) => String(keyword).trim().toLocaleLowerCase("en"))
      .filter(Boolean))];
    elements.keywordEditor.replaceChildren(...normalized.map((keyword, index) =>
      createKeywordRow(keyword, index, fromName.has(keyword))
    ));
    state.keywordBaseline = readKeywords();
  }

  function closeResults() {
    elements.results.hidden = true;
    elements.search.setAttribute("aria-expanded", "false");
    state.searchResults = [];
    state.activeResult = -1;
  }

  function uniqueRealImageIcons(metadata) {
    const seenImageHashes = new Set();
    return metadata.filter((icon) => {
      if (icon.imageStatus === "placeholder" || !icon.imageSha256 || seenImageHashes.has(icon.imageSha256)) {
        return false;
      }
      seenImageHashes.add(icon.imageSha256);
      return true;
    });
  }

  function selectIcon(icon, position = state.icons.findIndex((entry) => entry.name === icon.name)) {
    if (state.currentIcon && JSON.stringify(readKeywords()) !== JSON.stringify(state.keywordBaseline)
      && !window.confirm("Discard the unsaved keyword edits for this icon?")) {
      return;
    }

    state.currentIcon = icon;
    state.position = position;
    const url = new URL(window.location.href);
    url.searchParams.set("icon_id", icon.name);
    url.searchParams.delete("icon");
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new CustomEvent("keyword-review-icon-selected", {
      detail: { iconId: icon.name }
    }));
    elements.iconName.textContent = icon.name;
    elements.iconImage.src = `./${icon.imageAsset}`;
    elements.iconImage.alt = icon.name;
    elements.position.textContent = `${position + 1} of ${state.icons.length.toLocaleString()}`;
    elements.previous.forEach((button) => {
      button.disabled = position <= 0;
    });
    elements.next.forEach((button) => {
      button.disabled = position >= state.icons.length - 1;
    });
    elements.search.value = icon.name;
    closeResults();
    elements.imageHash.textContent = icon.imageSha256 ? `SHA-256 ${icon.imageSha256}` : "";
    const sameImageIds = state.sameImageIdsByName.get(icon.name) || [];
    elements.sameImageIds.textContent = sameImageIds.length
      ? `Identical image IDs: ${sameImageIds.join(", ")}`
      : "Unique image file";
    renderKeywords(icon.keywords);
    updateReviewState(state.reviewStatus[icon.name] === true);
    setStatus(icon.imageStatus === "placeholder"
      ? "This ID uses a shared placeholder image. Review its keywords using the icon ID."
      : "");
  }

  function showResults(value) {
    const query = value.trim().toLocaleLowerCase("en");
    if (query.length < 2) {
      closeResults();
      return;
    }
    state.searchResults = state.icons
      .filter((icon) => [icon.name, ...(state.sameImageIdsByName.get(icon.name) || [])]
        .some((iconId) => iconId.toLocaleLowerCase("en").includes(query)))
      .slice(0, 30);
    elements.results.replaceChildren(...state.searchResults.map((icon, index) => {
      const option = document.createElement("button");
      const image = document.createElement("img");
      const label = document.createElement("span");
      option.type = "button";
      option.className = "icon-result";
      option.id = `icon-result-${index}`;
      option.role = "option";
      option.setAttribute("aria-selected", "false");
      image.src = `./${icon.imageAsset}`;
      image.alt = "";
      label.textContent = icon.name;
      option.append(image, label);
      option.addEventListener("click", () => selectIcon(icon));
      return option;
    }));
    elements.results.hidden = state.searchResults.length === 0;
    elements.search.setAttribute("aria-expanded", String(state.searchResults.length > 0));
  }

  function setActiveResult(index) {
    const options = elements.results.querySelectorAll('[role="option"]');
    if (!options.length) {
      return;
    }
    state.activeResult = Math.max(0, Math.min(index, options.length - 1));
    options.forEach((option, optionIndex) => {
      option.setAttribute("aria-selected", String(optionIndex === state.activeResult));
    });
    options[state.activeResult].scrollIntoView({ block: "nearest" });
    elements.search.setAttribute("aria-activedescendant", options[state.activeResult].id);
  }

  async function confirmReview() {
    if (!state.currentIcon) {
      return;
    }
    const keywords = readKeywords();
    if (keywords.some((keyword) => !keyword)) {
      setStatus("Remove empty keyword rows or enter a keyword before confirming.", "error");
      elements.keywordEditor.querySelector("input:placeholder-shown")?.focus();
      return;
    }

    let reviewSaved = false;
    elements.markReviewed.disabled = true;
    try {
      const result = await requestJson("/api/keyword-review/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconId: state.currentIcon.name, keywords })
      });
      state.currentIcon.keywords = result.keywords;
      const updatedIconIds = result.iconIds || [state.currentIcon.name];
      for (const iconId of updatedIconIds) {
        const icon = state.icons.find((entry) => entry.name === iconId);
        if (icon) {
          icon.keywords = result.keywords;
        }
      }
      for (const keyword of result.keywords) {
        if (!state.keywordSuggestions.includes(keyword)) {
          state.keywordSuggestions.push(keyword);
        }
      }
      window.dispatchEvent(new CustomEvent("keyword-review-keywords-updated", {
        detail: { iconIds: updatedIconIds, keywords: result.keywords }
      }));
      state.reviewStatus[state.currentIcon.name] = true;
      renderKeywords(result.keywords);
      updateReviewState(true);
      updateReviewCount();
      setStatus("");
      reviewSaved = true;
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      elements.markReviewed.disabled = false;
      if (reviewSaved) {
        flashReviewButton();
      }
    }
  }

  async function markNotReviewed() {
    if (!state.currentIcon) {
      return;
    }
    elements.markNotReviewed.disabled = true;
    setStatus("Resetting review status…");
    try {
      await requestJson("/api/keyword-review/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconId: state.currentIcon.name, reviewed: false })
      });
      state.reviewStatus[state.currentIcon.name] = false;
      updateReviewState(false);
      updateReviewCount();
      setStatus(`Review status reset for ${state.currentIcon.name}. Keywords were kept.`, "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      elements.markNotReviewed.disabled = false;
    }
  }

  elements.search.addEventListener("input", () => showResults(elements.search.value));
  elements.search.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && !elements.results.hidden) {
      event.preventDefault();
      setActiveResult(state.activeResult + 1);
    } else if (event.key === "ArrowUp" && !elements.results.hidden) {
      event.preventDefault();
      setActiveResult(state.activeResult - 1);
    } else if (event.key === "Enter" && !elements.results.hidden && state.searchResults.length) {
      event.preventDefault();
      selectIcon(state.searchResults[state.activeResult < 0 ? 0 : state.activeResult]);
    } else if (event.key === "Escape") {
      closeResults();
    }
  });
  document.addEventListener("click", (event) => {
    if (!elements.results.contains(event.target) && event.target !== elements.search) {
      closeResults();
    }
  });
  function navigatePrevious() {
    if (state.position > 0) {
      selectIcon(state.icons[state.position - 1], state.position - 1);
    }
  }
  function navigateNext() {
    if (state.position < state.icons.length - 1) {
      selectIcon(state.icons[state.position + 1], state.position + 1);
    }
  }
  elements.previous.forEach((button) => button.addEventListener("click", navigatePrevious));
  elements.next.forEach((button) => button.addEventListener("click", navigateNext));
  elements.keywordEditor.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-keyword]");
    if (removeButton && !removeButton.disabled) {
      removeButton.closest(".keyword-row").remove();
    }
  });
  elements.keywordEditor.addEventListener("input", (event) => {
    if (event.target.matches("input")) {
      const row = event.target.closest(".keyword-row");
      const removeButton = row.querySelector("[data-remove-keyword]");
      event.target.classList.toggle("keyword-from-name", nameKeywords().has(event.target.value.trim().toLocaleLowerCase("en")));
      removeButton.setAttribute("aria-label", `Remove keyword ${event.target.value || "row"}`);
    }
  });
  elements.addKeyword.addEventListener("click", () => {
    const row = createKeywordRow("", elements.keywordEditor.children.length, false);
    const input = row.querySelector("input");
    input.placeholder = "Enter keyword";
    elements.keywordEditor.append(row);
    input.focus();
  });
  elements.markReviewed.addEventListener("click", confirmReview);
  elements.markNotReviewed.addEventListener("click", markNotReviewed);

  async function initialize() {
    try {
      const [metadata, reviewStatus] = await Promise.all([
        requestJson("./icon-metadata.json"),
        requestJson("./icon-review-status.json")
      ]);
      const iconsByImageHash = new Map();
      for (const icon of metadata) {
        if (icon.imageStatus === "placeholder" || !icon.imageSha256) {
          continue;
        }
        const group = iconsByImageHash.get(icon.imageSha256) || [];
        group.push(icon);
        iconsByImageHash.set(icon.imageSha256, group);
      }
      for (const group of iconsByImageHash.values()) {
        const representative = group[0];
        for (const icon of group) {
          state.sameImageIdsByName.set(icon.name, group
            .filter((sameImageIcon) => sameImageIcon.name !== icon.name)
            .map((sameImageIcon) => sameImageIcon.name));
          state.reviewRepresentativeById.set(icon.name, representative);
        }
      }
      state.icons = uniqueRealImageIcons(metadata);
      state.keywordSuggestions = [...new Set(metadata.flatMap((icon) => icon.keywords || []))]
        .sort((left, right) => left.localeCompare(right, "en"));
      state.reviewStatus = reviewStatus;
      updateReviewCount();
      const requestedIconId = new URLSearchParams(window.location.search).get("icon_id")
        || new URLSearchParams(window.location.search).get("icon");
      const initialIcon = state.icons.find((icon) => icon.name === requestedIconId)
        || state.reviewRepresentativeById.get(requestedIconId)
        || state.icons.find((icon) => state.reviewStatus[icon.name] !== true)
        || state.icons[0];
      if (!initialIcon) {
        throw new Error("No reviewable images are available in metadata");
      }
      selectIcon(initialIcon, state.icons.indexOf(initialIcon));
    } catch (error) {
      setStatus(error.message, "error");
      elements.position.textContent = "Icon data unavailable";
    }
  }

  initialize();
})();
