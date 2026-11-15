import { contrast, hslToRgb, luminance, toHex } from './color';
import { generate } from './generate';

const ENABLED_KEY = 'bst.background.enabled';
const CACHE_KEY = 'bst.background.cache';
const MODES: readonly ThemeId[] = ['dark', 'light', 'sepia', 'night', 'vivid'];
const FADE_MS = 800;

let appliedKeys: string[] = [];
let fadeTimer: ReturnType<typeof setTimeout> | undefined;

function readCache(): BackgroundCache | null {
  try {
    if (localStorage.getItem(ENABLED_KEY) === '0') return null;
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as BackgroundCache | null;
    return cached && cached.photo && Array.isArray(cached.palette) ? cached : null;
  } catch {
    return null;
  }
}

function currentMode(): ThemeId {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme && (MODES as readonly string[]).includes(theme) ? (theme as ThemeId) : 'dark';
}

function clear(): void {
  const style = document.documentElement.style;
  appliedKeys.forEach((key) => style.removeProperty(key));
  style.removeProperty('--bst-bg-image');
  appliedKeys = [];
}

function apply(hues: number[], mode?: ThemeId | string): void {
  const style = document.documentElement.style;
  const { vars } = generate(mode || currentMode(), hues);
  appliedKeys = Object.keys(vars);
  appliedKeys.forEach((key) => style.setProperty(key, vars[key]));
}

function applyFromCache(): void {
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

// Cross-fades every colour change. Whole-page view transition when available (also fades gradients
// and the photo overlay), otherwise a temporary colour-transition class.
function withFade(change: () => void, ms?: number, useViewTransition?: boolean): void {
  const duration = ms || FADE_MS;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const html = document.documentElement;
  if (reduce || !document.body) {
    change();
    return;
  }
  html.style.setProperty('--bst-fade-ms', `${duration}ms`);
  if (useViewTransition !== false && typeof document.startViewTransition === 'function') {
    document.startViewTransition(change);
    return;
  }
  html.classList.add('bst-color-fade');
  if (fadeTimer !== undefined) {
    clearTimeout(fadeTimer);
  }
  change();
  fadeTimer = setTimeout(() => html.classList.remove('bst-color-fade'), duration + 100);
}

const api: BSTPaletteApi = { withFade, generate, apply, clear, applyFromCache, contrast, luminance, hslToRgb, toHex };

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.BSTPalette = api;
  applyFromCache();
  new MutationObserver(applyFromCache).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
}

export default api;
