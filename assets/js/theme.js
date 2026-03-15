(function () {
  const THEME_KEY = 'bst-theme';
  const DARK = 'dark';
  const LIGHT = 'light';

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === LIGHT ? LIGHT : DARK;
    } catch {
      return DARK;
    }
  }

  function applyTheme(theme) {
    const previousTheme = document.documentElement.getAttribute('data-theme') || DARK;
    const nextTheme = theme === LIGHT ? LIGHT : DARK;
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

      if (nextTheme === LIGHT) {
        if (icon) icon.textContent = 'dark_mode';
        if (label) label.textContent = 'Dark mode';
        button.setAttribute('aria-label', 'Switch to dark mode');
        button.setAttribute('title', 'Switch to dark mode');
      } else {
        if (icon) icon.textContent = 'light_mode';
        if (label) label.textContent = 'Light mode';
        button.setAttribute('aria-label', 'Switch to light mode');
        button.setAttribute('title', 'Switch to light mode');
      }
    });

    const textColorInput = document.getElementById('text-color');
    if (textColorInput) {
      const darkDefault = '#f8f9fa';
      const lightDefault = '#0f172a';
      const currentValue = String(textColorInput.value || '').toLowerCase();

      if (nextTheme === LIGHT && (currentValue === darkDefault || previousTheme === DARK)) {
        textColorInput.value = lightDefault;
      }

      if (nextTheme === DARK && (currentValue === lightDefault || previousTheme === LIGHT)) {
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
