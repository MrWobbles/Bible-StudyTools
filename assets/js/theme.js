(function () {
  const THEME_KEY = 'bst-theme';
  const DARK = 'dark';
  const LIGHT = 'light';
  const SEPIA = 'sepia';
  const THEMES = [
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'night', label: 'Night' },
    { id: 'vivid', label: 'Vivid' }
  ];
  const NEXT_ICONS = { dark: 'dark_mode', light: 'light_mode', sepia: 'auto_stories', night: 'bedtime', vivid: 'palette' };
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
      const next = THEMES[(THEMES.findIndex((item) => item.id === nextTheme) + 1) % THEMES.length];
      const nextLabel = `${next.label} mode`;
      const nextIcon = NEXT_ICONS[next.id] || 'palette';

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
      const previousWasLight = previousTheme === LIGHT || previousTheme === SEPIA;
      const nextIsLight = nextTheme === LIGHT || nextTheme === SEPIA;

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
    const index = THEMES.findIndex((theme) => theme.id === current);
    applyTheme(THEMES[(index + 1) % THEMES.length].id);
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
