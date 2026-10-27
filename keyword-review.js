(() => {
  const elements = {
    search: document.getElementById("icon-search"),
    results: document.getElementById("icon-results"),
    previous: [document.getElementById("previous-icon"), document.getElementById("previous-icon-bottom")],
    next: [document.getElementById("next-icon"), document.getElementById("next-icon-bottom")],
    nextUnreviewed: [document.getElementById("next-unreviewed-icon"), document.getElementById("next-unreviewed-icon-bottom")],
    position: document.getElementById("icon-position"),
    status: document.getElementById("review-status"),
    iconName: document.getElementById("selected-icon-name"),
    iconImage: document.getElementById("selected-icon-image"),
    reviewState: document.getElementById("review-state"),
    reviewStateLabel: document.querySelector(".review-state-label"),
    imageHash: document.getElementById("image-hash"),
    sameImageIds: document.getElementById("same-image-ids"),
    nameWordReference: document.getElementById("name-word-reference"),
    nameWordTags: document.getElementById("name-word-tags"),
    keywordEditor: document.getElementById("keyword-editor"),
    addKeyword: document.getElementById("add-keyword"),
    markReviewed: document.getElementById("mark-reviewed"),
    autoAdvanceReview: document.getElementById("auto-advance-review"),
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
    synonyms: {},
    reviewedKeywords: {},
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
      .flatMap(splitIconName));
  }

  function reviewedCustomKeywordSources() {
    const reviewedSources = new Set([
      state.currentIcon?.name,
      ...(state.sameImageIdsByName.get(state.currentIcon?.name) || [])
    ].flatMap((iconId) => state.reviewedKeywords[iconId] || [])
      .map((keyword) => keyword.toLocaleLowerCase("en")));
    for (const nameWord of nameKeywords()) {
      reviewedSources.delete(nameWord);
    }
    return reviewedSources;
  }

  function synonymSourcesByKeyword() {
    const nameWords = nameKeywords();
    const reviewedSources = reviewedCustomKeywordSources();
    const sourcesByKeyword = new Map();
    const addSynonyms = (source, synonyms) => {
      const normalizedSource = source.toLocaleLowerCase("en");
      for (const synonym of synonyms) {
        const normalizedSynonym = synonym.toLocaleLowerCase("en");
        const sources = sourcesByKeyword.get(normalizedSynonym) || [];
        sources.push(normalizedSource);
        sourcesByKeyword.set(normalizedSynonym, sources);
      }
    };
    const eligibleSources = new Set([...nameWords, ...reviewedSources]);
    for (const [source, synonyms] of Object.entries(state.synonyms)) {
      const normalizedSource = source.toLocaleLowerCase("en");
      if (eligibleSources.has(normalizedSource)) {
        addSynonyms(source, synonyms);
      }
    }
    return sourcesByKeyword;
  }

  function renderNameWordTags() {
    const words = [...nameKeywords()].sort((left, right) => left.localeCompare(right, "en"));
    elements.nameWordTags.replaceChildren(...words.map((word) => {
      const tag = document.createElement("a");
      tag.className = "name-word-tag";
      tag.href = `./name-synonyms.html?source=${encodeURIComponent(word)}`;
      tag.textContent = word;
      return tag;
    }));
    elements.nameWordReference.hidden = words.length === 0;
  }

  function readKeywords() {
    return [...elements.keywordEditor.querySelectorAll(".keyword-row input")]
      .map((input) => input.value.trim().toLocaleLowerCase("en"));
  }

  function updateReviewCount() {
    const reviewedCount = state.icons.filter((icon) => state.reviewStatus[icon.name] === true).length;
    elements.reviewCount.textContent = `${reviewedCount.toLocaleString()} / ${state.icons.length.toLocaleString()} reviewed`;
    updateNextUnreviewedState();
  }

  function updateNextUnreviewedState() {
    const hasNextUnreviewed = state.icons.some((icon, index) => index !== state.position &&
      state.reviewStatus[icon.name] !== true);
    elements.nextUnreviewed.forEach((button) => {
      button.disabled = !hasNextUnreviewed;
    });
  }

  function updateReviewState(reviewed) {
    elements.reviewStateLabel.textContent = reviewed ? "Reviewed" : "Not reviewed";
    elements.reviewState.dataset.state = reviewed ? "reviewed" : "not-reviewed";
    elements.reviewState.disabled = !reviewed;
    elements.reviewState.setAttribute("aria-label", reviewed ? "Mark as not reviewed" : "Not reviewed");
    elements.reviewState.title = reviewed ? "Click to mark as not reviewed" : "Not reviewed";
  }

  function createKeywordRow(keyword, index, nameDerived, synonymSources = []) {
    const row = document.createElement("div");
    const field = document.createElement("div");
    const input = document.createElement("input");
    const lockedSynonym = synonymSources.length > 0;
    const remove = document.createElement(lockedSynonym ? "span" : "button");

    row.className = "keyword-row";
    field.className = "keyword-field";
    input.type = "text";
    input.maxLength = 80;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = keyword;
    input.readOnly = lockedSynonym;
    input.classList.toggle("keyword-from-name", nameDerived);
    input.setAttribute("aria-label", `Keyword ${index + 1}`);
    input.title = lockedSynonym
      ? `Locked synonym for: ${synonymSources.join(", ")}`
      : nameDerived ? "Icon ID word; excluded when saved" : "Edit keyword";
    field.append(input);
    let synonymLink = null;
    if (!nameDerived && !lockedSynonym) {
      synonymLink = document.createElement("a");
      synonymLink.className = "keyword-synonym-link";
      synonymLink.textContent = "↗";
      synonymLink.hidden = true;
      field.append(synonymLink);
      const updateSynonymLink = () => {
        const source = input.value.trim().toLocaleLowerCase("en");
        synonymLink.hidden = !reviewedCustomKeywordSources().has(source);
        if (!synonymLink.hidden) {
          synonymLink.href = `./name-synonyms.html?source=${encodeURIComponent(source)}`;
          synonymLink.setAttribute("aria-label", `Manage synonyms for keyword ${source}`);
          synonymLink.title = `Manage synonyms for ${source}`;
        }
      };
      updateSynonymLink();
      input.addEventListener("input", updateSynonymLink);
    }
    if (lockedSynonym) {
      remove.className = "keyword-lock-indicator";
      remove.setAttribute("role", "img");
      remove.setAttribute("aria-label", `Locked synonym for ${synonymSources.join(", ")}`);
      remove.title = `Synonym for: ${synonymSources.join(", ")}`;
      remove.textContent = "\uD83D\uDD12";
    } else {
      remove.type = "button";
      remove.className = "review-icon-button keyword-remove-button";
      remove.dataset.removeKeyword = "true";
      remove.setAttribute("aria-label", `Remove keyword ${keyword || index + 1}`);
      remove.title = "Remove keyword";
      remove.innerHTML = "&#128465;";
    }
    row.append(field, remove);
    let autocomplete = null;
    if (!nameDerived && !lockedSynonym) {
      input.classList.add("awesomplete");
      autocomplete = new Awesomplete(input, {
        list: state.keywordSuggestions,
        minChars: 1,
        maxItems: 8,
        autoFirst: true
      });
    }
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const keywordInputs = [...elements.keywordEditor.querySelectorAll(".keyword-row input")];
        const inputIndex = keywordInputs.indexOf(input);
        const direction = event.key === "ArrowDown" ? 1 : -1;
        keywordInputs[inputIndex + direction]?.focus();
        return;
      }
      if (event.key === "Backspace" && !input.value.trim()) {
        event.preventDefault();
        const keywordInputs = [...elements.keywordEditor.querySelectorAll(".keyword-row input")];
        const inputIndex = keywordInputs.indexOf(input);
        const focusTarget = keywordInputs[inputIndex - 1] || keywordInputs[inputIndex + 1] || elements.addKeyword;
        row.remove();
        focusTarget.focus();
        return;
      }
      if (event.key === "Tab") {
        if (event.shiftKey) {
          return;
        }
        if (autocomplete?.opened && autocomplete.selected) {
          autocomplete.select();
        }
        if (synonymLink && !synonymLink.hidden) {
          event.preventDefault();
          synonymLink.focus();
          return;
        }
        event.preventDefault();
        const keywordInputs = [...elements.keywordEditor.querySelectorAll(".keyword-row input")];
        const nextInput = keywordInputs[keywordInputs.indexOf(input) + 1];
        (nextInput || elements.addKeyword).focus();
      }
    });
    return row;
  }

  function renderKeywords(keywords) {
    const fromName = nameKeywords();
    const synonymSources = synonymSourcesByKeyword();
    const normalized = [...new Set((keywords || [])
      .map((keyword) => String(keyword).trim().toLocaleLowerCase("en"))
      .filter(Boolean))];
    elements.keywordEditor.replaceChildren(...normalized.map((keyword, index) =>
      createKeywordRow(keyword, index, fromName.has(keyword), synonymSources.get(keyword) || [])
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
    updateNextUnreviewedState();
    elements.search.value = icon.name;
    closeResults();
    elements.imageHash.textContent = icon.imageSha256 ? `SHA-256 ${icon.imageSha256}` : "";
    const sameImageIds = state.sameImageIdsByName.get(icon.name) || [];
    elements.sameImageIds.textContent = sameImageIds.length
      ? `Identical image IDs: ${sameImageIds.join(", ")}`
      : "Unique image file";
    renderNameWordTags();
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
      state.reviewedKeywords[updatedIconIds[0]] = result.keywords;
      for (const iconId of updatedIconIds.slice(1)) {
        delete state.reviewedKeywords[iconId];
      }
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
        if (elements.autoAdvanceReview.checked) {
          navigateNext();
          (elements.keywordEditor.querySelector(".keyword-row input") || elements.addKeyword).focus();
        }
      }
    }
  }

  async function markNotReviewed() {
    if (!state.currentIcon) {
      return;
    }
    elements.reviewState.disabled = true;
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
      elements.reviewState.disabled = false;
    } finally {
      if (state.reviewStatus[state.currentIcon.name] === true) {
        elements.reviewState.disabled = false;
      }
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
  document.addEventListener("keydown", (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      elements.markReviewed.click();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigatePrevious();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      navigateNext();
      return;
    }
    if (event.key === "Delete" && event.target instanceof Element) {
      const input = event.target.closest(".keyword-row input");
      const row = input?.closest(".keyword-row");
      if (!input || input.readOnly || !row?.querySelector("[data-remove-keyword]")) {
        return;
      }
      event.preventDefault();
      const keywordInputs = [...elements.keywordEditor.querySelectorAll(".keyword-row input")];
      const inputIndex = keywordInputs.indexOf(input);
      const focusTarget = keywordInputs[inputIndex + 1] || keywordInputs[inputIndex - 1] || elements.addKeyword;
      row.remove();
      focusTarget.focus();
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
  function navigateNextUnreviewed() {
    for (let offset = 1; offset < state.icons.length; offset += 1) {
      const position = (state.position + offset) % state.icons.length;
      if (state.reviewStatus[state.icons[position].name] !== true) {
        selectIcon(state.icons[position], position);
        return;
      }
    }
    setStatus("No other unreviewed icons are available.");
  }
  elements.previous.forEach((button) => button.addEventListener("click", navigatePrevious));
  elements.next.forEach((button) => button.addEventListener("click", navigateNext));
  elements.nextUnreviewed.forEach((button) => button.addEventListener("click", navigateNextUnreviewed));
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
  elements.reviewState.addEventListener("click", markNotReviewed);

  async function initialize() {
    try {
      const [metadata, reviewStatus, synonymResponse, reviewedKeywords] = await Promise.all([
        requestJson("./icon-metadata.json"),
        requestJson("./icon-review-status.json"),
        requestJson("/api/synonyms"),
        requestJson("./icon-keywords.json")
      ]);
      state.synonyms = synonymResponse.synonyms || {};
      state.reviewedKeywords = reviewedKeywords;
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
