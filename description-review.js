(() => {
  const elements = {
    search: document.getElementById("icon-search"),
    results: document.getElementById("icon-results"),
    previous: document.getElementById("previous-icon"),
    next: document.getElementById("next-icon"),
    position: document.getElementById("icon-position"),
    model: document.getElementById("model-name"),
    modelOptions: document.getElementById("model-options"),
    refreshModels: document.getElementById("refresh-models"),
    status: document.getElementById("review-status"),
    iconName: document.getElementById("selected-icon-name"),
    iconImage: document.getElementById("selected-icon-image"),
    reviewState: document.getElementById("review-state"),
    imageHash: document.getElementById("image-hash"),
    sameImageIds: document.getElementById("same-image-ids"),
    curatedReference: document.getElementById("curated-reference"),
    curatedList: document.getElementById("curated-list"),
    editor: document.getElementById("description-editor"),
    characterCount: document.getElementById("character-count"),
    draftModel: document.getElementById("draft-model"),
    generate: document.getElementById("generate-description"),
    save: document.getElementById("save-draft"),
    markReviewed: document.getElementById("mark-reviewed"),
    markNotReviewed: document.getElementById("mark-not-reviewed"),
    draftCount: document.getElementById("draft-count")
  };

  const state = {
    icons: [],
    drafts: {},
    currentIcon: null,
    currentImage: null,
    position: -1,
    searchResults: [],
    activeResult: -1,
    editorBaseline: "",
    suggestion: "",
    modelUsed: "human-edited",
    requestNumber: 0
  };

  function setStatus(message, kind = "") {
    elements.status.textContent = message;
    elements.status.dataset.kind = kind;
  }

  async function requestJson(url, options) {
    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Request failed (${response.status})`);
    }
    return result;
  }

  function currentDraft() {
    return state.currentImage ? state.drafts[state.currentImage.imageHash] || null : null;
  }

  function groupIconsByImage(metadata) {
    const groups = new Map();
    for (const icon of metadata) {
      const key = icon.imageSha256 || `unique:${icon.name}`;
      let group = groups.get(key);
      if (!group) {
        group = { ...icon, iconIds: new Set() };
        groups.set(key, group);
      }
      group.iconIds.add(icon.name);
      for (const iconId of icon.sameImageIds || []) {
        group.iconIds.add(iconId);
      }
    }
    return [...groups.values()].map((group) => ({
      ...group,
      iconIds: [...group.iconIds].sort()
    }));
  }

  function updateDraftSummary() {
    const drafts = Object.values(state.drafts);
    const draftCount = drafts.filter((draft) => draft.status === "draft").length;
    elements.draftCount.textContent = draftCount === 0
      ? "No local drafts yet"
      : `${draftCount} saved drafts`;
  }

  function updateCharacterCount() {
    elements.characterCount.textContent = `${elements.editor.value.length.toLocaleString()} / 2,000`;
  }

  function renderCuratedDescriptions(descriptions) {
    const entries = Object.entries(descriptions || {});
    elements.curatedList.replaceChildren(...entries.map(([iconId, description]) => {
      const item = document.createElement("li");
      item.textContent = `${iconId}: ${description}`;
      return item;
    }));
    elements.curatedReference.hidden = entries.length === 0;
  }

  function updateReviewState(draft, reviewed = false) {
    const hasDraft = draft?.status === "draft";
    const stateName = reviewed ? "reviewed" : "not-reviewed";
    elements.reviewState.textContent = reviewed ? "Reviewed" : "Not reviewed";
    elements.reviewState.dataset.state = stateName;
    elements.draftModel.textContent = hasDraft ? `Saved with ${draft.model}` : "";
    elements.markReviewed.hidden = false;
    elements.markNotReviewed.hidden = !reviewed;
  }

  async function selectIcon(icon, position = state.icons.findIndex((entry) => entry.name === icon.name)) {
    if (elements.editor.value !== state.editorBaseline && !window.confirm("Discard the unsaved edits for this image?")) {
      return;
    }

    const requestNumber = ++state.requestNumber;
    state.currentIcon = icon;
    state.position = position;
    window.dispatchEvent(new CustomEvent("description-review-icon-selected", {
      detail: { iconId: icon.name }
    }));
    elements.iconName.textContent = icon.name;
    elements.iconImage.src = `./images/${encodeURIComponent(icon.name)}.png`;
    elements.iconImage.alt = icon.name;
    elements.position.textContent = `${position + 1} of ${state.icons.length}`;
    elements.previous.disabled = position <= 0;
    elements.next.disabled = position >= state.icons.length - 1;
    elements.search.value = icon.name;
    elements.generate.disabled = icon.imageStatus === "placeholder";
    closeResults();
    setStatus(`Loading image details for ${icon.name}…`);

    try {
      const details = await requestJson(`/api/description-review/image?name=${encodeURIComponent(icon.name)}`);
      if (requestNumber !== state.requestNumber) {
        return;
      }
      state.currentImage = details;
      const draft = details.draft || null;
      if (draft) {
        state.drafts[details.imageHash] = draft;
      }
      const curatedEntries = Object.entries(details.curatedDescriptions || {});
      const initialDescription = draft?.status === "draft"
        ? draft.description
        : curatedEntries[0]?.[1] || draft?.description || "";
      state.editorBaseline = initialDescription;
      state.suggestion = draft?.suggestion || "";
      state.modelUsed = draft?.model || "human-edited";
      elements.editor.value = initialDescription;
      elements.imageHash.textContent = `SHA-256 ${details.imageHash}`;
      elements.sameImageIds.textContent = details.iconIds.length > 1
        ? `Same image IDs using this shared description: ${details.iconIds.join(", ")}`
        : "Unique image file";
      renderCuratedDescriptions(details.curatedDescriptions);
      updateReviewState(draft, details.reviewed);
      updateCharacterCount();
      setStatus(icon.imageStatus === "placeholder"
        ? "This ID uses a shared placeholder image. Choose a real icon image before generating a description."
        : details.reviewed
          ? "This image has a tracked human-reviewed description."
          : "Inspect the artwork, edit the description, then save or mark it reviewed.");
      updateDraftSummary();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function closeResults() {
    elements.results.hidden = true;
    elements.search.setAttribute("aria-expanded", "false");
    state.searchResults = [];
    state.activeResult = -1;
  }

  function showResults(value) {
    const query = value.trim().toLowerCase();
    if (query.length < 2) {
      closeResults();
      return;
    }
    state.searchResults = state.icons
      .filter((icon) => icon.iconIds.some((iconId) => iconId.toLowerCase().includes(query)))
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
      image.src = `./images/${encodeURIComponent(icon.name)}.png`;
      image.alt = "";
      const matchingId = icon.iconIds.find((iconId) => iconId.toLowerCase().includes(query)) || icon.name;
      label.textContent = icon.iconIds.length > 1
        ? `${matchingId} (${icon.iconIds.length} identical IDs)`
        : matchingId;
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

  async function refreshModels() {
    elements.refreshModels.disabled = true;
    try {
      const result = await requestJson("/api/description-review/models");
      elements.modelOptions.replaceChildren(...result.models.map((model) => {
        const option = document.createElement("option");
        option.value = model;
        return option;
      }));
      setStatus(result.models.length
        ? `Ollama is ready. Found ${result.models.length} local model${result.models.length === 1 ? "" : "s"}.`
        : "Ollama is running, but no models are installed. Pull a vision model such as gemma3:4b.", result.models.length ? "success" : "");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      elements.refreshModels.disabled = false;
    }
  }

  async function generateDescription() {
    if (!state.currentIcon) {
      return;
    }
    const iconId = state.currentIcon.name;
    const model = elements.model.value.trim();
    if (!model) {
      setStatus("Enter an Ollama model name first.", "error");
      return;
    }
    elements.generate.disabled = true;
    setStatus(`Asking ${model} to inspect ${state.currentIcon.name}…`);
    try {
      const result = await requestJson("/api/description-review/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconId: state.currentIcon.name, model })
      });
      if (state.currentIcon?.name !== iconId) {
        return;
      }
      state.suggestion = result.suggestion;
      state.modelUsed = model;
      elements.editor.value = result.suggestion;
      elements.editor.focus();
      updateCharacterCount();
      setStatus("Draft generated. Review the image and edit the wording before marking it reviewed.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      elements.generate.disabled = false;
    }
  }

  async function saveDescription() {
    if (!state.currentIcon || !state.currentImage) {
      return;
    }
    const description = elements.editor.value.trim();
    if (!description) {
      setStatus("Enter a description before saving.", "error");
      elements.editor.focus();
      return;
    }
    const iconId = state.currentIcon.name;
    const imageHash = state.currentImage.imageHash;
    const model = state.modelUsed;
    const button = elements.save;
    button.disabled = true;
    setStatus("Saving local draft…");
    try {
      const result = await requestJson("/api/description-review/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iconId: state.currentIcon.name,
          model,
          suggestion: state.suggestion,
          description,
          status: "draft"
        })
      });
      state.drafts[imageHash] = result.draft;
      if (state.currentImage?.imageHash === imageHash && state.currentIcon?.name === iconId) {
        state.editorBaseline = description;
        updateReviewState(result.draft, state.currentImage.reviewed);
      }
      updateDraftSummary();
      setStatus("Draft saved locally.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function markReviewed() {
    if (!state.currentIcon || !state.currentImage) {
      return;
    }
    const description = elements.editor.value.trim();
    if (!description) {
      setStatus("Enter a description before marking it reviewed.", "error");
      elements.editor.focus();
      return;
    }

    const iconId = state.currentIcon.name;
    const imageHash = state.currentImage.imageHash;
    elements.markReviewed.disabled = true;
    setStatus("Saving reviewed description to the tracked source…");
    try {
      const result = await requestJson("/api/description-review/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconId, description })
      });
      if (state.currentImage?.imageHash === imageHash && state.currentIcon?.name === iconId) {
        state.currentImage.curatedDescriptions = result.curatedDescriptions;
        state.currentImage.reviewed = result.reviewed;
        state.editorBaseline = description;
        renderCuratedDescriptions(result.curatedDescriptions);
        updateReviewState(currentDraft(), result.reviewed);
      }
      setStatus(`Reviewed description saved to tracked files for ${result.iconIds.length} identical image IDs.`, "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      elements.markReviewed.disabled = false;
    }
  }

  async function markNotReviewed() {
    if (!state.currentIcon || !state.currentImage) {
      return;
    }

    const iconId = state.currentIcon.name;
    const imageHash = state.currentImage.imageHash;
    elements.markNotReviewed.disabled = true;
    setStatus("Resetting tracked review status…");
    try {
      const result = await requestJson("/api/description-review/review-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconId, reviewed: false })
      });
      if (state.currentImage?.imageHash === imageHash && state.currentIcon?.name === iconId) {
        state.currentImage.reviewed = false;
        updateReviewState(currentDraft(), false);
      }
      setStatus(`Review status reset for ${result.iconIds.length} identical image IDs. The descriptions were kept.`, "success");
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
      const index = state.activeResult < 0 ? 0 : state.activeResult;
      selectIcon(state.searchResults[index]);
    } else if (event.key === "Escape") {
      closeResults();
    }
  });
  document.addEventListener("click", (event) => {
    if (!elements.results.contains(event.target) && event.target !== elements.search) {
      closeResults();
    }
  });
  elements.previous.addEventListener("click", () => {
    if (state.position > 0) {
      selectIcon(state.icons[state.position - 1], state.position - 1);
    }
  });
  elements.next.addEventListener("click", () => {
    if (state.position < state.icons.length - 1) {
      selectIcon(state.icons[state.position + 1], state.position + 1);
    }
  });
  elements.refreshModels.addEventListener("click", refreshModels);
  elements.generate.addEventListener("click", generateDescription);
  elements.save.addEventListener("click", saveDescription);
  elements.markReviewed.addEventListener("click", markReviewed);
  elements.markNotReviewed.addEventListener("click", markNotReviewed);
  elements.editor.addEventListener("input", updateCharacterCount);

  async function initialize() {
    try {
      const [metadata, draftResult, reviewStatus] = await Promise.all([
        requestJson("./icon-metadata.json"),
        requestJson("/api/description-review/drafts"),
        requestJson("./icon-review-status.json")
      ]);
      state.icons = groupIconsByImage(metadata);
      state.drafts = draftResult.drafts || {};
      updateDraftSummary();
      const initialIcon = state.icons.find((icon) =>
        icon.iconIds.some((iconId) => reviewStatus[iconId] === false)
      ) || state.icons[0];
      if (!initialIcon) {
        throw new Error("No icons are available in metadata");
      }
      await selectIcon(initialIcon, state.icons.indexOf(initialIcon));
      await refreshModels();
    } catch (error) {
      setStatus(error.message, "error");
      elements.position.textContent = "Icon data unavailable";
    }
  }

  initialize();
})();
