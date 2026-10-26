(() => {
  const elements = {
    status: document.getElementById("synonym-status"),
    sourceWordForm: document.getElementById("source-word-form"),
    sourceKind: document.getElementById("source-kind"),
    sourceWordLabel: document.getElementById("source-word-label"),
    sourceWordInput: document.getElementById("source-word-input"),
    selectedPanel: document.getElementById("selected-source-panel"),
    selectedKind: document.getElementById("selected-source-kind"),
    selectedHeading: document.getElementById("selected-source-heading"),
    addSynonymForm: document.getElementById("add-synonym-form"),
    synonymInput: document.getElementById("synonym-input"),
    selectedSynonymList: document.getElementById("selected-synonym-list"),
    emptySynonymsMessage: document.getElementById("empty-synonyms-message"),
    configuredList: document.getElementById("configured-synonyms-list"),
    emptyDictionaryMessage: document.getElementById("empty-dictionary-message"),
    configuredWordCount: document.getElementById("configured-word-count"),
    configuredHeading: document.getElementById("configured-synonyms-heading"),
    discardButton: document.getElementById("discard-synonym-changes"),
    saveButton: document.getElementById("save-synonym-changes"),
    saveNote: document.getElementById("synonym-save-note")
  };

  const state = {
    availableWords: [],
    availableKeywords: [],
    synonyms: {},
    savedSynonyms: {},
    keywordSynonyms: {},
    savedKeywordSynonyms: {},
    selectedKind: "name",
    selectedSource: "",
    saving: false,
    saveSucceeded: false
  };

  function cloneSynonyms(synonyms) {
    return Object.fromEntries(Object.entries(synonyms).map(([source, terms]) => [source, [...terms]]));
  }

  function canonicalSynonyms(synonyms) {
    return Object.fromEntries(Object.entries(synonyms)
      .filter(([, terms]) => terms.length > 0)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([source, terms]) => [source, [...new Set(terms)].sort((left, right) => left.localeCompare(right, "en"))]));
  }

  function isDirty() {
    return JSON.stringify(canonicalSynonyms(state.synonyms)) !== JSON.stringify(canonicalSynonyms(state.savedSynonyms)) ||
      JSON.stringify(canonicalSynonyms(state.keywordSynonyms)) !== JSON.stringify(canonicalSynonyms(state.savedKeywordSynonyms));
  }

  function activeSynonyms() {
    return state.selectedKind === "keyword" ? state.keywordSynonyms : state.synonyms;
  }

  function activeSources() {
    return state.selectedKind === "keyword" ? state.availableKeywords : state.availableWords;
  }

  function updateSourceKind() {
    state.selectedKind = elements.sourceKind.value;
    state.selectedSource = "";
    elements.sourceWordInput.value = "";
    elements.selectedPanel.hidden = true;
    const keywordMode = state.selectedKind === "keyword";
    elements.sourceWordLabel.textContent = keywordMode ? "Custom keyword" : "Icon-name word";
    elements.sourceWordInput.placeholder = keywordMode ? "Search reviewed custom keywords" : "Search name words";
    elements.configuredHeading.textContent = keywordMode
      ? "Configured custom-keyword synonyms"
      : "Configured icon-name synonyms";
    elements.emptyDictionaryMessage.textContent = keywordMode
      ? "No custom-keyword synonyms defined."
      : "No icon-name synonyms defined.";
    elements.selectedKind.textContent = keywordMode ? "CUSTOM KEYWORD" : "ICON-NAME WORD";
    if (state.sourceAutocomplete) {
      state.sourceAutocomplete.list = activeSources();
    }
    renderConfiguredSynonyms();
  }

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

  function updateDirtyState() {
    const dirty = isDirty();
    elements.saveButton.disabled = !dirty || state.saving;
    elements.saveButton.textContent = state.saving
      ? "Saving…"
      : !dirty && state.saveSucceeded
        ? "Saved"
        : "Save synonyms";
    elements.discardButton.disabled = !dirty || state.saving;
    elements.saveNote.dataset.kind = !state.saving && !dirty && state.saveSucceeded ? "success" : "";
    elements.saveNote.textContent = state.saving
      ? "Updating searchable keywords for every matching icon image…"
      : dirty
        ? "Save to update searchable keywords for every matching icon image."
        : state.saveSucceeded
          ? "Save complete. Searchable keywords are updated for every matching icon image."
          : "Changes update searchable keywords for every matching icon image when you save.";
  }

  function selectSource(source) {
    state.selectedSource = source;
    elements.sourceWordInput.value = source;
    elements.selectedHeading.textContent = source;
    elements.emptySynonymsMessage.textContent = state.selectedKind === "keyword"
      ? "No synonyms saved for this custom keyword."
      : "No synonyms saved for this icon-name word.";
    elements.selectedPanel.hidden = false;
    renderSelectedSynonyms();
    elements.synonymInput.focus();
  }

  function renderSelectedSynonyms() {
    const terms = activeSynonyms()[state.selectedSource] || [];
    elements.selectedSynonymList.replaceChildren(...terms.map((term) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      const remove = document.createElement("button");
      item.className = "synonym-chip";
      label.textContent = term;
      remove.type = "button";
      remove.dataset.removeSynonym = term;
      remove.setAttribute("aria-label", `Remove synonym ${term} for ${state.selectedSource}`);
      remove.title = `Remove ${term}`;
      remove.textContent = "\u00D7";
      item.append(label, remove);
      return item;
    }));
    elements.emptySynonymsMessage.hidden = terms.length > 0;
  }

  function renderConfiguredSynonyms() {
    const entries = Object.entries(canonicalSynonyms(activeSynonyms()));
    elements.configuredWordCount.textContent = `${entries.length} ${entries.length === 1 ? "word" : "words"}`;
    elements.emptyDictionaryMessage.hidden = entries.length > 0;
    elements.configuredList.replaceChildren(...entries.map(([source, terms]) => {
      const item = document.createElement("li");
      const open = document.createElement("button");
      const labels = document.createElement("span");
      const remove = document.createElement("button");
      item.className = "configured-synonyms-row";
      open.type = "button";
      open.dataset.openSource = source;
      open.textContent = source;
      labels.className = "configured-synonym-terms";
      labels.textContent = terms.join(", ");
      remove.type = "button";
      remove.className = "review-icon-button";
      remove.dataset.removeSource = source;
      remove.setAttribute("aria-label", `Remove all synonyms for ${source}`);
      remove.title = `Remove synonyms for ${source}`;
      remove.textContent = "\uD83D\uDDD1";
      item.append(open, labels, remove);
      return item;
    }));
    updateDirtyState();
  }

  function render() {
    renderConfiguredSynonyms();
    if (state.selectedSource) {
      renderSelectedSynonyms();
    }
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

  function addSynonym(event) {
    event.preventDefault();
    if (!state.selectedSource) {
      return;
    }
    const term = elements.synonymInput.value.trim().toLocaleLowerCase("en");
    if (!term || term.length > 80) {
      setStatus("Enter a synonym from 1 to 80 characters.", "error");
      return;
    }
    const synonyms = activeSynonyms();
    const terms = synonyms[state.selectedSource] || [];
    if (terms.includes(term)) {
      setStatus(`${term} is already a synonym for ${state.selectedSource}.`, "error");
      return;
    }
    synonyms[state.selectedSource] = [...terms, term].sort((left, right) => left.localeCompare(right, "en"));
    elements.synonymInput.value = "";
    setStatus("Unsaved changes.");
    render();
    elements.synonymInput.focus();
  }

  elements.sourceWordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const source = elements.sourceWordInput.value.trim().toLocaleLowerCase("en");
    if (!activeSources().includes(source)) {
      setStatus(state.selectedKind === "keyword"
        ? "Choose a reviewed custom keyword."
        : "Choose a word that appears in an icon ID.", "error");
      return;
    }
    setStatus("");
    selectSource(source);
  });

  elements.sourceKind.addEventListener("change", updateSourceKind);

  elements.addSynonymForm.addEventListener("submit", addSynonym);
  elements.selectedSynonymList.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-synonym]");
    if (!remove) {
      return;
    }
    const synonyms = activeSynonyms();
    const remaining = (synonyms[state.selectedSource] || [])
      .filter((term) => term !== remove.dataset.removeSynonym);
    if (remaining.length) {
      synonyms[state.selectedSource] = remaining;
    } else {
      delete synonyms[state.selectedSource];
    }
    setStatus("Unsaved changes.");
    render();
  });

  elements.configuredList.addEventListener("click", (event) => {
    const open = event.target.closest("[data-open-source]");
    if (open) {
      selectSource(open.dataset.openSource);
      setStatus("");
      return;
    }
    const remove = event.target.closest("[data-remove-source]");
    if (remove) {
      const source = remove.dataset.removeSource;
      delete activeSynonyms()[source];
      if (state.selectedSource === source) {
        renderSelectedSynonyms();
      }
      setStatus("Unsaved changes.");
      renderConfiguredSynonyms();
    }
  });

  elements.discardButton.addEventListener("click", () => {
    state.synonyms = cloneSynonyms(state.savedSynonyms);
    state.keywordSynonyms = cloneSynonyms(state.savedKeywordSynonyms);
    setStatus("Unsaved changes discarded.");
    render();
  });

  elements.saveButton.addEventListener("click", async () => {
    if (!isDirty() || state.saving) {
      return;
    }
    state.saving = true;
    updateDirtyState();
    setStatus("Saving synonyms and updating searchable keywords…");
    try {
      const result = await requestJson("/api/name-synonyms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          synonyms: canonicalSynonyms(state.synonyms),
          keywordSynonyms: canonicalSynonyms(state.keywordSynonyms)
        })
      });
      state.synonyms = cloneSynonyms(result.synonyms || {});
      state.savedSynonyms = cloneSynonyms(state.synonyms);
      state.keywordSynonyms = cloneSynonyms(result.keywordSynonyms || {});
      state.savedKeywordSynonyms = cloneSynonyms(state.keywordSynonyms);
      state.saveSucceeded = true;
      setStatus("Synonyms saved. Searchable keywords have been updated.", "success");
      render();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      state.saving = false;
      updateDirtyState();
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (isDirty()) {
      event.preventDefault();
    }
  });

  async function initialize() {
    try {
      const [metadata, reviewedKeywords, result] = await Promise.all([
        requestJson("./icon-metadata.json"),
        requestJson("./icon-keywords.json"),
        requestJson("/api/name-synonyms")
      ]);
      state.availableWords = [...new Set(metadata.flatMap((icon) => splitIconName(icon.name)))].sort((left, right) => left.localeCompare(right, "en"));
      const nameSynonymTerms = new Set(Object.values(result.synonyms || {}).flat());
      const reviewedKeywordSet = new Set(Object.values(reviewedKeywords).flat()
        .map((keyword) => String(keyword).trim().toLocaleLowerCase("en")));
      state.availableKeywords = [...reviewedKeywordSet]
        .filter((keyword) => !nameSynonymTerms.has(keyword))
        .sort((left, right) => left.localeCompare(right, "en"));
      state.synonyms = cloneSynonyms(result.synonyms || {});
      state.savedSynonyms = cloneSynonyms(state.synonyms);
      state.keywordSynonyms = cloneSynonyms(result.keywordSynonyms || {});
      state.savedKeywordSynonyms = cloneSynonyms(state.keywordSynonyms);
      state.sourceAutocomplete = new Awesomplete(elements.sourceWordInput, {
        list: activeSources(),
        minChars: 1,
        maxItems: 12,
        autoFirst: true
      });
      render();
      const requestedSource = new URLSearchParams(window.location.search)
        .get("word")?.trim().toLocaleLowerCase("en");
      if (requestedSource && state.availableWords.includes(requestedSource)) {
        selectSource(requestedSource);
      } else {
        const requestedKeyword = new URLSearchParams(window.location.search)
          .get("keyword")?.trim().toLocaleLowerCase("en");
        if (requestedKeyword && state.availableKeywords.includes(requestedKeyword)) {
          elements.sourceKind.value = "keyword";
          updateSourceKind();
          selectSource(requestedKeyword);
        }
      }
      setStatus("");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  initialize();
})();
