(function () {
  const THEME_KEY = 'bst-theme';
  const DARK = 'dark';
  const LIGHT = 'light';
  const THEMES = [
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
    { id: 'monokai-dark', label: 'Monokai Dark' },
    { id: 'dracula-dark', label: 'Dracula Dark' },
    { id: 'nord-dark', label: 'Nord Dark' }
  ];
  const VALID_THEME_IDS = new Set(THEMES.map((theme) => theme.id));

  function normalizeTheme(theme) {
    const normalized = String(theme || '').trim().toLowerCase();
    if (VALID_THEME_IDS.has(normalized)) {
      return normalized;
    }
    return DARK;
  }

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return normalizeTheme(saved);
    } catch {
      return DARK;
    }
  }

  function applyTheme(theme) {
    const previousTheme = document.documentElement.getAttribute('data-theme') || DARK;
    const nextTheme = normalizeTheme(theme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    document.body?.setAttribute('data-theme', nextTheme);

    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch {
      // ignore storage failures
    }

    const toggleButtons = document.querySelectorAll('[data-theme-toggle]');
    toggleButtons.forEach((button) => {
      const icon = button.querySelector('.theme-toggle__icon');
      const label = button.querySelector('.theme-toggle__label');
      const nextLabel = nextTheme === LIGHT ? 'Dark mode' : 'Light mode';
      const nextIcon = nextTheme === LIGHT ? 'dark_mode' : 'light_mode';

      if (icon) icon.textContent = nextIcon;
      if (label) label.textContent = nextLabel;
      button.setAttribute('aria-label', `Switch to ${nextLabel.toLowerCase()}`);
      button.setAttribute('title', `Switch to ${nextLabel.toLowerCase()}`);
    });

    const themeSelects = document.querySelectorAll('[data-theme-select]');
    themeSelects.forEach((select) => {
      if (select instanceof HTMLSelectElement) {
        select.value = nextTheme;
      }
    });

    const textColorInput = document.getElementById('text-color');
    if (textColorInput) {
      const darkDefault = '#f8f9fa';
      const lightDefault = '#0f172a';
      const currentValue = String(textColorInput.value || '').toLowerCase();
      const previousWasLight = previousTheme === LIGHT;
      const nextIsLight = nextTheme === LIGHT;

      if (nextIsLight && (currentValue === darkDefault || !previousWasLight)) {
        textColorInput.value = lightDefault;
      }

      if (!nextIsLight && (currentValue === lightDefault || previousWasLight)) {
        textColorInput.value = darkDefault;
      }
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || DARK;
    applyTheme(current === LIGHT ? DARK : LIGHT);
  }

  function initThemeToggle() {
    applyTheme(getSavedTheme());

    const toggleButtons = document.querySelectorAll('[data-theme-toggle]');
    toggleButtons.forEach((button) => {
      button.addEventListener('click', toggleTheme);
    });

    const themeSelects = document.querySelectorAll('[data-theme-select]');
    themeSelects.forEach((select) => {
      if (!(select instanceof HTMLSelectElement)) {
        return;
      }

      if (select.options.length === 0) {
        THEMES.forEach((theme) => {
          const option = document.createElement('option');
          option.value = theme.id;
          option.textContent = theme.label;
          select.appendChild(option);
        });
      }

      select.value = document.documentElement.getAttribute('data-theme') || DARK;
      select.addEventListener('change', () => {
        applyTheme(select.value);
      });
    });
  }

  window.BSTTheme = {
    applyTheme,
    toggleTheme,
    initThemeToggle,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeToggle);
  } else {
    initThemeToggle();
  }
})();
