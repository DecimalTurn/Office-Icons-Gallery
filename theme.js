(() => {
  const storageKey = "office-icon-gallery-theme";
  const root = document.documentElement;
  const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");
  let savedTheme = null;

  try {
    const storedTheme = window.localStorage.getItem(storageKey);
    if (storedTheme === "light" || storedTheme === "dark") {
      savedTheme = storedTheme;
    }
  } catch {
    savedTheme = null;
  }

  if (savedTheme) {
    root.dataset.theme = savedTheme;
  }

  function updateToggle() {
    const toggle = document.querySelector(".theme-toggle");
    if (!toggle) {
      return;
    }

    const isDark = (root.dataset.theme || (systemPreference.matches ? "dark" : "light")) === "dark";
    toggle.textContent = isDark ? "Light mode" : "Dark mode";
    toggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
    toggle.setAttribute("aria-pressed", String(isDark));
  }

  document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.querySelector(".theme-toggle");
    if (toggle) {
      toggle.addEventListener("click", () => {
        const currentTheme = root.dataset.theme || (systemPreference.matches ? "dark" : "light");
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        root.dataset.theme = nextTheme;

        try {
          window.localStorage.setItem(storageKey, nextTheme);
        } catch {
          // The toggle still works when storage is unavailable.
        }

        updateToggle();
      });
    }

    updateToggle();
  });

  systemPreference.addEventListener("change", (event) => {
    if (!root.dataset.theme) {
      updateToggle();
    }
  });
})();
