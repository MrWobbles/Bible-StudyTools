(function (root) {
  'use strict';

  const ENABLED_KEY = 'bst.background.enabled';
  const CACHE_KEY = 'bst.background.cache';
  const DEFAULT_ACCENT_HUE = 265;
  const SEPIA_HUE = 36;
  const NIGHT_HUE = 18;
  const MODES = ['dark', 'light', 'sepia', 'night', 'vivid'];
  const DEFAULT_SECOND_HUE = 205;
  const AA_TEXT = 4.5;
  const AA_UI = 3;

  const WHITE = [255, 255, 255];
  const BLACK = [0, 0, 0];

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.min(1, Math.max(0, s));
    l = Math.min(1, Math.max(0, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  function toHex(rgb) {
    return '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
  }

  function luminance(rgb) {
    const lin = rgb.map((v) => {
      const c = Math.round(v) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  function contrast(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function blend(fg, alpha, bg) {
    return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
  }

  function minContrast(rgb, backgrounds) {
    return Math.min.apply(null, backgrounds.map((bg) => contrast(rgb, bg)));
  }

  // Moves lightness in `direction` until the colour reaches `min` contrast on every background.
  function fit(h, s, l, backgrounds, min, direction) {
    let current = l;
    for (let i = 0; i < 110; i += 1) {
      const rgb = hslToRgb(h, s, current);
      if (minContrast(rgb, backgrounds) >= min) return rgb;
      current += direction * 0.01;
      if (current < 0 || current > 1) break;
    }
    return hslToRgb(h, s, direction > 0 ? 1 : 0);
  }

  function hsla(h, s, l, a) {
    const rgb = hslToRgb(h, s, l).map(Math.round);
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
  }

  function rgba(rgb, a) {
    return `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${a})`;
  }

  /**
   * Builds the full colour token set for a mode ('dark' | 'light' | 'sepia' | 'night' | 'vivid') and photo hues.
   * Returns { vars, raw } where vars are CSS custom properties and raw holds RGB values for checks.
   */
  function generate(mode, hues) {
    const sepia = mode === 'sepia';
    const dark = mode !== 'light' && !sepia;
    const night = mode === 'night';
    const vivid = mode === 'vivid';
    const neutral = !hues || hues.length === 0;
    // Night stays in warm hues so no blue light reaches the screen.
    const hAcc = night ? NIGHT_HUE : (neutral ? DEFAULT_ACCENT_HUE : hues[0]);
    const hSecond = night ? NIGHT_HUE + 18 : (neutral ? DEFAULT_SECOND_HUE : (hues[1] === undefined ? (hAcc + 150) % 360 : hues[1]));
    const hBg = sepia ? SEPIA_HUE : (neutral ? 220 : hAcc);
    const sBg = sepia ? 0.42 : night ? 0.3 : vivid ? (neutral ? 0.4 : 0.62) : (neutral ? 0.08 : (dark ? 0.3 : 0.35));
    const sAcc = night ? 0.55 : vivid ? 0.9 : (neutral ? 0.6 : (dark ? 0.8 : 0.75));
    const dir = dark ? 1 : -1;

    const surface = night
      ? { page: 0.035, subtle: 0.045, primary: 0.06, secondary: 0.075, elevated: 0.095 }
      : vivid
      ? { page: 0.08, subtle: 0.095, primary: 0.12, secondary: 0.15, elevated: 0.19 }
      : dark
      ? { page: 0.06, subtle: 0.075, primary: 0.1, secondary: 0.13, elevated: 0.17 }
      : (sepia
        ? { page: 0.88, subtle: 0.86, primary: 0.94, secondary: 0.91, elevated: 0.97 }
        : { page: 0.95, subtle: 0.93, primary: 0.985, secondary: 0.965, elevated: 1 });
    const S = {};
    Object.keys(surface).forEach((key) => {
      // Yellow-green hues are perceptually bright, so vivid surfaces are kept darker there.
      const lift = vivid && hBg > 40 && hBg < 180 ? 0.78 : 1;
      S[key] = hslToRgb(hBg, sBg, surface[key] * lift);
    });

    const overlayAlpha = night ? 0.9 : vivid ? 0.74 : (dark ? 0.74 : 0.72);
    const overlayRgb = hslToRgb(hBg, sBg, night ? 0.03 : vivid ? 0.09 : dark ? 0.05 : (sepia ? 0.9 : 0.97));
    const glassAlpha = 0.94;
    const worstPhoto = dark ? WHITE : BLACK;
    const pageWorst = blend(overlayRgb, overlayAlpha, worstPhoto);
    const glassWorst = blend(S.primary, glassAlpha, worstPhoto);
    const inputBg = dark ? hslToRgb(hBg, sBg, night ? 0.025 : vivid ? 0.07 : 0.045) : (sepia ? hslToRgb(hBg, sBg, 0.97) : WHITE);

    const surfaces = [S.page, S.subtle, S.primary, S.secondary, S.elevated, inputBg];

    // Text can also sit on tinted rows (selected items, highlights), so include the strongest tints.
    const tintSources = [
      hslToRgb(hAcc, sAcc, dark ? 0.7 : 0.36),
      hslToRgb(hSecond, sAcc, dark ? 0.68 : 0.36),
      hslToRgb(42, 0.9, dark ? 0.6 : 0.3)
    ];
    const tinted = [];
    tintSources.forEach((tint) => {
      [S.subtle, S.primary, S.secondary, S.elevated].forEach((surf) => tinted.push(blend(tint, 0.28, surf)));
    });
    const textBackgrounds = surfaces.concat([pageWorst, glassWorst], tinted);

    const text = {
      primary: fit(hBg, neutral ? 0.05 : 0.12, night ? 0.68 : dark ? 0.96 : 0.1, textBackgrounds, 7, dir),
      secondary: fit(hBg, 0.12, night ? 0.58 : dark ? 0.8 : 0.3, textBackgrounds, 6, dir),
      muted: fit(hBg, 0.1, night ? 0.5 : dark ? 0.68 : 0.42, textBackgrounds, AA_TEXT, dir)
    };

    const accent = {
      purple: fit(hAcc, sAcc, dark ? 0.7 : 0.36, textBackgrounds, AA_TEXT, dir),
      purpleSoft: fit(hAcc, sAcc - 0.1, dark ? 0.64 : 0.42, textBackgrounds, AA_TEXT, dir),
      purpleNeon: fit(hAcc, sAcc, dark ? 0.76 : 0.32, textBackgrounds, AA_TEXT, dir),
      pink: fit(hAcc + 30, sAcc, dark ? 0.78 : 0.3, textBackgrounds, AA_TEXT, dir),
      pinkSoft: fit(hAcc + 20, sAcc - 0.1, dark ? 0.82 : 0.36, textBackgrounds, AA_TEXT, dir),
      blue: fit(hSecond, sAcc, dark ? 0.68 : 0.36, textBackgrounds, AA_TEXT, dir),
      blueSoft: fit(hSecond, sAcc - 0.1, dark ? 0.74 : 0.4, textBackgrounds, AA_TEXT, dir)
    };

    // Filled controls: white label on a fill that is darkened until it passes AA.
    const fill = fit(hAcc, neutral ? 0.55 : 0.7, dark ? 0.5 : 0.42, [WHITE], 4.6, -1);
    const fillHover = fit(hAcc, neutral ? 0.55 : 0.7, dark ? 0.44 : 0.34, [WHITE], 4.6, -1);

    const status = {
      success: fit(142, 0.65, dark ? 0.6 : 0.3, textBackgrounds, AA_TEXT, dir),
      error: fit(2, 0.8, dark ? 0.68 : 0.38, textBackgrounds, AA_TEXT, dir),
      warning: fit(42, 0.9, dark ? 0.6 : 0.3, textBackgrounds, AA_TEXT, dir),
      info: fit(205, 0.8, dark ? 0.62 : 0.34, textBackgrounds, AA_TEXT, dir)
    };

    const inputBorder = fit(hBg, 0.15, dark ? 0.45 : 0.55, surfaces, AA_UI, dir);
    const textInverse = dark ? hslToRgb(hBg, 0.4, 0.05) : WHITE;
    const overlay = rgba(overlayRgb, overlayAlpha);
    const glow = (rgb) => `0 0 0 1px ${rgba(rgb, 0.35)}`;

    const vars = {
      '--bg-page': toHex(S.page),
      '--bg-surface-primary': toHex(S.primary),
      '--bg-surface-secondary': toHex(S.secondary),
      '--bg-surface-elevated': toHex(S.elevated),
      '--bg-surface-subtle': toHex(S.subtle),
      '--bg-overlay': overlay,

      '--text-primary': toHex(text.primary),
      '--text-secondary': toHex(text.secondary),
      '--text-muted': toHex(text.muted),
      '--text-inverse': toHex(textInverse),

      '--accent-purple': toHex(accent.purple),
      '--accent-purple-soft': toHex(accent.purpleSoft),
      '--accent-purple-neon': toHex(accent.purpleNeon),
      '--accent-pink': toHex(accent.pink),
      '--accent-pink-soft': toHex(accent.pinkSoft),
      '--accent-blue': toHex(accent.blue),
      '--accent-blue-soft': toHex(accent.blueSoft),
      '--accent-green': toHex(status.success),
      '--accent-red': toHex(status.error),
      '--accent-amber': toHex(status.warning),

      '--status-success': toHex(status.success),
      '--status-error': toHex(status.error),
      '--status-warning': toHex(status.warning),
      '--status-info': toHex(status.info),

      '--border-accent-purple': toHex(accent.purple),
      '--border-accent-blue': toHex(accent.blue),
      '--border-accent-pink': toHex(accent.pink),
      '--border-subtle': toHex(hslToRgb(hBg, sBg, dark ? 0.14 : 0.85)),
      '--border-strong': toHex(hslToRgb(hBg, sBg, dark ? 0.24 : 0.74)),

      '--accent-color': toHex(fill),
      '--accent-color-hover': toHex(fillHover),
      '--accent-text': toHex(accent.purple),
      '--on-accent': toHex(WHITE),
      '--focus-ring': rgba(accent.purple, 0.3),
      '--accent-tint': rgba(accent.purple, 0.14),
      '--accent-tint-strong': rgba(accent.purple, 0.24),
      '--accent-tint-faint': rgba(accent.purple, 0.08),
      '--accent-blue-tint': rgba(accent.blue, 0.14),

      '--page-bg': toHex(S.page),
      '--panel-bg': toHex(S.primary),
      '--surface-border': dark ? 'rgba(255, 255, 255, 0.12)' : hsla(hBg, 0.3, 0.4, 0.3),
      '--header-border': dark ? 'rgba(255, 255, 255, 0.12)' : hsla(hBg, 0.3, 0.4, 0.3),

      '--control-bg': dark ? 'rgba(255, 255, 255, 0.05)' : hsla(hBg, 0.4, 0.15, 0.04),
      '--control-bg-hover': dark ? 'rgba(255, 255, 255, 0.12)' : hsla(hBg, 0.4, 0.15, 0.09),
      '--control-border': toHex(inputBorder),
      '--control-text': toHex(text.primary),
      '--input-bg': toHex(inputBg),
      '--input-border': toHex(inputBorder),
      '--glass-surface': rgba(S.primary, glassAlpha),
      '--glass-border': dark ? 'rgba(255, 255, 255, 0.2)' : hsla(hBg, 0.3, 0.2, 0.2),
      '--glass-border-strong': dark ? 'rgba(255, 255, 255, 0.32)' : hsla(hBg, 0.3, 0.2, 0.32),
      '--modal-overlay': dark ? hsla(hBg, sBg, 0.03, 0.78) : hsla(hBg, 0.3, 0.15, 0.35),
      '--modal-surface': toHex(S.elevated),

      '--shadow-card-soft': `0 8px 20px rgba(0, 0, 0, ${dark ? 0.35 : 0.12})`,
      '--shadow-card-strong': `0 14px 34px rgba(0, 0, 0, ${dark ? 0.45 : 0.18})`,
      '--shadow-glow-purple': glow(accent.purple),
      '--shadow-glow-blue': glow(accent.blue),
      '--shadow-glow-pink': glow(accent.pink),

      '--layer-card-primary': `radial-gradient(circle at top left, ${rgba(accent.purple, 0.16)}, transparent 60%), radial-gradient(circle at bottom right, ${rgba(accent.blue, 0.16)}, transparent 60%), ${toHex(S.primary)}`,
      '--layer-card-secondary': toHex(S.primary),
      '--layer-card-metric': `linear-gradient(135deg, ${toHex(S.secondary)}, ${toHex(S.elevated)})`,
      '--layer-chip-neon': `radial-gradient(circle at top left, ${rgba(dark ? WHITE : accent.purple, dark ? 0.14 : 0.12)}, transparent 55%), ${toHex(S.elevated)}`,
      '--layer-surface-toolbar': rgba(S.primary, 0.97)
    };

    return {
      vars,
      raw: { S, text, accent, fill, fillHover, status, inputBg, inputBorder, pageWorst, glassWorst, textBackgrounds, surfaces, textInverse }
    };
  }

  function readCache() {
    try {
      if (localStorage.getItem(ENABLED_KEY) === '0') return null;
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return cached && cached.photo && Array.isArray(cached.palette) ? cached : null;
    } catch {
      return null;
    }
  }

  function currentMode() {
    const theme = document.documentElement.getAttribute('data-theme');
    return MODES.indexOf(theme) >= 0 ? theme : 'dark';
  }

  let appliedKeys = [];

  function clear() {
    const style = document.documentElement.style;
    appliedKeys.forEach((key) => style.removeProperty(key));
    style.removeProperty('--bst-bg-image');
    appliedKeys = [];
  }

  function apply(hues, mode) {
    const style = document.documentElement.style;
    const { vars } = generate(mode || currentMode(), hues);
    appliedKeys = Object.keys(vars);
    appliedKeys.forEach((key) => style.setProperty(key, vars[key]));
  }

  function applyFromCache() {
    const cached = readCache();
    if (!cached) {
      clear();
      return;
    }
    apply(cached.palette);
    if (cached.photo.url) {
      document.documentElement.style.setProperty('--bst-bg-image', `url("${String(cached.photo.url).replace(/"/g, '%22')}")`);
    }
  }

  const FADE_MS = 800;
  let fadeTimer = null;

  // Cross-fades every colour change. Whole-page view transition when available (also fades gradients
  // and the photo overlay), otherwise a temporary colour-transition class.
  function withFade(change, ms, useViewTransition) {
    const duration = ms || FADE_MS;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const html = document.documentElement;
    if (reduce || !document.body) {
      change();
      return;
    }
    html.style.setProperty('--bst-fade-ms', duration + 'ms');
    if (useViewTransition !== false && typeof document.startViewTransition === 'function') {
      document.startViewTransition(change);
      return;
    }
    html.classList.add('bst-color-fade');
    clearTimeout(fadeTimer);
    change();
    fadeTimer = setTimeout(() => html.classList.remove('bst-color-fade'), duration + 100);
  }

  const api = { withFade, generate, apply, clear, applyFromCache, contrast, luminance, hslToRgb, toHex };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.BSTPalette = api;
  applyFromCache();
  new MutationObserver(applyFromCache).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
})(typeof window !== 'undefined' ? window : globalThis);
