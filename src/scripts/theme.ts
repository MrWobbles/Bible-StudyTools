(function () {
  const THEME_KEY = 'bst-theme';
  const DARK: ThemeId = 'dark';
  const LIGHT: ThemeId = 'light';
  const SEPIA: ThemeId = 'sepia';
  const THEMES: readonly ThemeOption[] = [
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'night', label: 'Night' },
    { id: 'vivid', label: 'Vivid' }
  ];
  const NEXT_ICONS: Readonly<Record<ThemeId, string>> = {
    dark: 'dark_mode',
    light: 'light_mode',
    sepia: 'auto_stories',
    night: 'bedtime',
    vivid: 'palette'
  };
  const VALID_THEME_IDS = new Set<string>(THEMES.map((theme) => theme.id));

  function normalizeTheme(theme: string | null | undefined): ThemeId {
    const normalized = String(theme || '').trim().toLowerCase();
    if (VALID_THEME_IDS.has(normalized)) {
      return normalized as ThemeId;
    }
    return DARK;
  }

  function getSavedTheme(): ThemeId {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return normalizeTheme(saved);
    } catch {
      return DARK;
    }
  }

  function applyTheme(theme: string): void {
    const previousTheme = document.documentElement.getAttribute('data-theme') || DARK;
    const nextTheme = normalizeTheme(theme);
    const commitTheme = (): void => {
      document.documentElement.setAttribute('data-theme', nextTheme);
      document.body?.setAttribute('data-theme', nextTheme);
    };
    if (nextTheme !== previousTheme && window.BSTPalette?.withFade) {
      window.BSTPalette.withFade(commitTheme);
    } else {
      commitTheme();
    }

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
    if (textColorInput instanceof HTMLInputElement) {
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

  function toggleTheme(): void {
    const current = document.documentElement.getAttribute('data-theme') || DARK;
    const index = THEMES.findIndex((theme) => theme.id === current);
    applyTheme(THEMES[(index + 1) % THEMES.length].id);
  }

  function initThemeToggle(): void {
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
    initThemeToggle
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeToggle);
  } else {
    initThemeToggle();
  }
})();
