(() => {
  const elements = {
    status: document.getElementById("reference-list-status"),
    createForm: document.getElementById("create-list-form"),
    newListName: document.getElementById("new-list-name"),
    listNavigation: document.getElementById("saved-reference-lists"),
    listCount: document.getElementById("saved-list-count"),
    activeListName: document.getElementById("active-list-name"),
    activeListSize: document.getElementById("active-list-size"),
    deleteList: document.getElementById("delete-list"),
    currentIcon: document.getElementById("reference-current-icon"),
    addCurrentIcon: document.getElementById("add-current-icon"),
    idForm: document.getElementById("add-id-form"),
    iconId: document.getElementById("icon-id-input"),
    feedback: document.getElementById("list-feedback"),
    emptyMessage: document.getElementById("empty-list-message"),
    iconList: document.getElementById("reference-icon-list")
  };

  const activeListStorageKey = "office-icon-gallery.active-reference-list";
  const state = {
    icons: [],
    iconsById: new Map(),
    lists: [],
    activeListId: "",
    currentIconId: "",
    saving: false
  };

  async function requestJson(url, options) {
    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Request failed with HTTP ${response.status}`);
    }
    return result;
  }

  function setFeedback(message, kind = "") {
    elements.feedback.textContent = message;
    elements.feedback.dataset.kind = kind;
  }

  function activeList() {
    return state.lists.find((list) => list.id === state.activeListId) || null;
  }

  function setActiveList(listId) {
    state.activeListId = listId;
    try {
      window.localStorage.setItem(activeListStorageKey, listId);
    } catch {
      // The selected list still works when browser storage is unavailable.
    }
    render();
  }

  function renderListNavigation() {
    elements.listCount.textContent = String(state.lists.length);
    const options = state.lists.map((list) => {
      const option = document.createElement("option");
      option.value = list.id;
      option.textContent = `${list.name} (${list.iconIds.length})`;
      return option;
    });
    if (!options.length) {
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "No saved lists yet";
      options.push(emptyOption);
    }
    elements.listNavigation.replaceChildren(...options);
    elements.listNavigation.value = state.activeListId;
    elements.listNavigation.disabled = !state.lists.length || state.saving;
  }

  function renderIconItems(list) {
    const items = list.iconIds.map((iconId, index) => {
      const icon = state.iconsById.get(iconId.toLocaleLowerCase("en"));
      if (!icon) {
        return null;
      }
      const item = document.createElement("li");
      const image = document.createElement("img");
      const link = document.createElement("a");
      const remove = document.createElement("button");

      item.className = "reference-icon-item";
      image.src = `./${icon.imageAsset}`;
      image.alt = icon.name;
      image.loading = "lazy";
      link.className = "reference-icon-id";
      link.href = `./icon.html?name=${encodeURIComponent(icon.name)}`;
      link.textContent = icon.name;
      remove.type = "button";
      remove.className = "reference-remove-button";
      remove.dataset.removeIcon = icon.name;
      remove.setAttribute("aria-label", `Remove ${icon.name} from list`);
      remove.title = "Remove from list";
      remove.innerHTML = "&times;";

      item.append(image, link, remove);
      return item;
    }).filter(Boolean);
    elements.iconList.replaceChildren(...items);
    elements.emptyMessage.hidden = list.iconIds.length > 0;
  }

  function render() {
    const list = activeList();
    renderListNavigation();
    elements.activeListName.textContent = list?.name || "Choose or create a list";
    elements.activeListSize.textContent = `${list?.iconIds.length || 0} ${list?.iconIds.length === 1 ? "icon" : "icons"}`;
    elements.deleteList.hidden = !list;
    elements.currentIcon.textContent = state.currentIconId || "Choose an icon above";
    elements.addCurrentIcon.disabled = !list || !state.currentIconId || state.saving;
    for (const control of elements.idForm.querySelectorAll("input, button")) {
      control.disabled = !list || state.saving;
    }
    if (list) {
      renderIconItems(list);
    } else {
      elements.iconList.replaceChildren();
      elements.emptyMessage.hidden = true;
    }
  }

  elements.listNavigation.addEventListener("change", () => {
    if (state.lists.some((list) => list.id === elements.listNavigation.value)) {
      setActiveList(elements.listNavigation.value);
    }
  });

  async function saveLists(nextLists, successMessage) {
    state.saving = true;
    render();
    try {
      const result = await requestJson("/api/reference-lists", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lists: nextLists })
      });
      state.lists = result.lists;
      render();
      setFeedback(successMessage);
      return true;
    } catch (error) {
      render();
      setFeedback(error.message, "error");
      return false;
    } finally {
      state.saving = false;
      render();
    }
  }

  async function addIcon(iconId) {
    const list = activeList();
    const icon = state.iconsById.get(iconId.toLocaleLowerCase("en"));
    if (!list || !icon) {
      setFeedback("Choose a list and enter a valid icon ID.", "error");
      return false;
    }
    if (list.iconIds.includes(icon.name)) {
      setFeedback(`${icon.name} is already in this list.`, "error");
      return false;
    }

    const nextLists = state.lists.map((item) => item.id === list.id
      ? { ...item, iconIds: [...item.iconIds, icon.name] }
      : item);
    const saved = await saveLists(nextLists, `Added ${icon.name} to ${list.name}.`);
    if (saved) {
      elements.iconId.value = "";
    }
    return saved;
  }

  elements.createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.newListName.value.trim();
    if (!name) {
      return;
    }
    if (state.lists.some((list) => list.name.toLocaleLowerCase("en") === name.toLocaleLowerCase("en"))) {
      setFeedback("A list with that name already exists.", "error");
      return;
    }
    const id = `list-${crypto.randomUUID()}`;
    const nextLists = [...state.lists, { id, name, iconIds: [] }];
    state.activeListId = id;
    const saved = await saveLists(nextLists, `Created ${name}.`);
    if (saved) {
      elements.newListName.value = "";
      setActiveList(id);
    }
  });

  elements.addCurrentIcon.addEventListener("click", () => {
    addIcon(state.currentIconId);
  });

  window.addEventListener("keyword-review-icon-selected", (event) => {
    state.currentIconId = event.detail?.iconId || "";
    render();
  });

  elements.idForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const iconId = elements.iconId.value.trim();
    const icon = state.iconsById.get(iconId.toLocaleLowerCase("en"));
    if (!icon) {
      setFeedback(`No icon matches ID "${iconId}".`, "error");
      return;
    }
    await addIcon(icon.name);
  });

  elements.iconList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove-icon]");
    const list = activeList();
    if (!button || !list) {
      return;
    }
    const iconId = button.dataset.removeIcon;
    const nextLists = state.lists.map((item) => item.id === list.id
      ? { ...item, iconIds: item.iconIds.filter((id) => id !== iconId) }
      : item);
    await saveLists(nextLists, `Removed ${iconId} from ${list.name}.`);
  });

  elements.deleteList.addEventListener("click", async () => {
    const list = activeList();
    if (!list || !window.confirm(`Delete the list "${list.name}"?`)) {
      return;
    }
    const nextLists = state.lists.filter((item) => item.id !== list.id);
    state.activeListId = nextLists[0]?.id || "";
    const saved = await saveLists(nextLists, `Deleted ${list.name}.`);
    if (saved) {
      setActiveList(state.activeListId);
    }
  });

  async function initialize() {
    try {
      const [metadata, result] = await Promise.all([
        requestJson("./icon-metadata.json"),
        requestJson("/api/reference-lists")
      ]);
      state.icons = metadata;
      state.iconsById = new Map(metadata.map((icon) => [icon.name.toLocaleLowerCase("en"), icon]));
      state.lists = result.lists;
      try {
        const rememberedListId = window.localStorage.getItem(activeListStorageKey);
        state.activeListId = state.lists.some((list) => list.id === rememberedListId)
          ? rememberedListId
          : state.lists[0]?.id || "";
      } catch {
        state.activeListId = state.lists[0]?.id || "";
      }
      render();
      elements.status.textContent = "";
    } catch (error) {
      elements.status.textContent = error.message;
    }
  }

  initialize();
})();