(() => {
  const elements = {
    status: document.getElementById("synonym-status"),
    sourceWordForm: document.getElementById("source-word-form"),
    sourceWordInput: document.getElementById("source-word-input"),
    selectedPanel: document.getElementById("selected-source-panel"),
    selectedHeading: document.getElementById("selected-source-heading"),
    addSynonymForm: document.getElementById("add-synonym-form"),
    synonymInput: document.getElementById("synonym-input"),
    selectedSynonymList: document.getElementById("selected-synonym-list"),
    emptySynonymsMessage: document.getElementById("empty-synonyms-message"),
    configuredList: document.getElementById("configured-synonyms-list"),
    emptyDictionaryMessage: document.getElementById("empty-dictionary-message"),
    configuredWordCount: document.getElementById("configured-word-count"),
    discardButton: document.getElementById("discard-synonym-changes"),
    saveButton: document.getElementById("save-synonym-changes")
  };

  const state = {
    availableWords: [],
    synonyms: {},
    savedSynonyms: {},
    selectedSource: "",
    saving: false
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
    return JSON.stringify(canonicalSynonyms(state.synonyms)) !== JSON.stringify(canonicalSynonyms(state.savedSynonyms));
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
    elements.discardButton.disabled = !dirty || state.saving;
  }

  function selectSource(source) {
    state.selectedSource = source;
    elements.sourceWordInput.value = source;
    elements.selectedHeading.textContent = source;
    elements.selectedPanel.hidden = false;
    renderSelectedSynonyms();
    elements.synonymInput.focus();
  }

  function renderSelectedSynonyms() {
    const terms = state.synonyms[state.selectedSource] || [];
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
    const entries = Object.entries(canonicalSynonyms(state.synonyms));
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
    const terms = state.synonyms[state.selectedSource] || [];
    if (terms.includes(term)) {
      setStatus(`${term} is already a synonym for ${state.selectedSource}.`, "error");
      return;
    }
    state.synonyms[state.selectedSource] = [...terms, term].sort((left, right) => left.localeCompare(right, "en"));
    elements.synonymInput.value = "";
    setStatus("Unsaved changes.");
    render();
    elements.synonymInput.focus();
  }

  elements.sourceWordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const source = elements.sourceWordInput.value.trim().toLocaleLowerCase("en");
    if (!state.availableWords.includes(source)) {
      setStatus("Choose a word that appears in an icon ID.", "error");
      return;
    }
    setStatus("");
    selectSource(source);
  });

  elements.addSynonymForm.addEventListener("submit", addSynonym);
  elements.selectedSynonymList.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-synonym]");
    if (!remove) {
      return;
    }
    const remaining = (state.synonyms[state.selectedSource] || [])
      .filter((term) => term !== remove.dataset.removeSynonym);
    if (remaining.length) {
      state.synonyms[state.selectedSource] = remaining;
    } else {
      delete state.synonyms[state.selectedSource];
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
      delete state.synonyms[source];
      if (state.selectedSource === source) {
        renderSelectedSynonyms();
      }
      setStatus("Unsaved changes.");
      renderConfiguredSynonyms();
    }
  });

  elements.discardButton.addEventListener("click", () => {
    state.synonyms = cloneSynonyms(state.savedSynonyms);
    setStatus("Unsaved changes discarded.");
    render();
  });

  elements.saveButton.addEventListener("click", async () => {
    if (!isDirty() || state.saving) {
      return;
    }
    state.saving = true;
    elements.saveButton.disabled = true;
    elements.discardButton.disabled = true;
    setStatus("Saving synonyms and updating searchable keywords…");
    try {
      const result = await requestJson("/api/name-synonyms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ synonyms: canonicalSynonyms(state.synonyms) })
      });
      state.synonyms = cloneSynonyms(result.synonyms || {});
      state.savedSynonyms = cloneSynonyms(state.synonyms);
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
      const [metadata, result] = await Promise.all([
        requestJson("./icon-metadata.json"),
        requestJson("/api/name-synonyms")
      ]);
      state.availableWords = [...new Set(metadata.flatMap((icon) => splitIconName(icon.name)))].sort((left, right) => left.localeCompare(right, "en"));
      state.synonyms = cloneSynonyms(result.synonyms || {});
      state.savedSynonyms = cloneSynonyms(state.synonyms);
      new Awesomplete(elements.sourceWordInput, {
        list: state.availableWords,
        minChars: 1,
        maxItems: 12,
        autoFirst: true
      });
      render();
      setStatus("");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  initialize();
})();
