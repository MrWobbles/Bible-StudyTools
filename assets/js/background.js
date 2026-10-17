(function () {
  const ENABLED_KEY = 'bst.background.enabled';
  const CACHE_KEY = 'bst.background.cache';
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

  function isEnabled() {
    try {
      return localStorage.getItem(ENABLED_KEY) !== '0';
    } catch {
      return true;
    }
  }

  function readCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && cached.photo && cached.palette && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached;
      }
    } catch {
      // ignore bad cache
    }
    return null;
  }

  function writeCache(photo, palette) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), photo, palette }));
    } catch {
      // ignore storage failures
    }
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s, l };
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Returns up to two dominant hues weighted by saturation and frequency.
  function extractHues(img) {
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const buckets = new Array(12).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      const { h, s, l } = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      if (s < 0.2 || l < 0.12 || l > 0.9) continue;
      buckets[Math.floor(h / 30) % 12] += s;
    }
    const ranked = buckets
      .map((weight, index) => ({ weight, hue: index * 30 + 15 }))
      .sort((a, b) => b.weight - a.weight);
    if (!ranked[0] || ranked[0].weight === 0) return [];
    const first = ranked[0].hue;
    const second = ranked.find((b) => {
      const diff = Math.abs(b.hue - first);
      return b.weight > 0 && Math.min(diff, 360 - diff) >= 60;
    });
    return second ? [first, second.hue] : [first];
  }

  function applyPalette(hues) {
    if (window.BSTPalette) window.BSTPalette.apply(hues);
  }

  function clearBackground() {
    if (window.BSTPalette) window.BSTPalette.clear();
    document.getElementById('bst-bg-credit')?.remove();
  }

  function showCredit(photo) {
    document.getElementById('bst-bg-credit')?.remove();
    if (!photo.photographer || !photo.photographerUrl) return;
    const credit = document.createElement('div');
    credit.id = 'bst-bg-credit';
    credit.style.cssText = 'position:fixed;left:10px;bottom:8px;z-index:5;font-size:12px;padding:3px 8px;border-radius:6px;background:var(--glass-surface);color:var(--text-primary);border:1px solid var(--glass-border);';
    const photoLink = document.createElement('a');
    photoLink.href = photo.photoUrl || photo.photographerUrl;
    photoLink.textContent = 'Photo';
    const userLink = document.createElement('a');
    userLink.href = photo.photographerUrl;
    userLink.textContent = photo.photographer;
    const unsplashLink = document.createElement('a');
    unsplashLink.href = 'https://unsplash.com/?utm_source=bible_study_tools&utm_medium=referral';
    unsplashLink.textContent = 'Unsplash';
    [photoLink, userLink, unsplashLink].forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.color = 'inherit';
    });
    credit.append(photoLink, ' by ', userLink, ' on ', unsplashLink);
    document.body.appendChild(credit);
  }

  function setImage(photo) {
    document.documentElement.style.setProperty('--bst-bg-image', `url("${String(photo.url).replace(/"/g, '%22')}")`);
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  const ROTATE_INTERVAL_MS = 15 * 60 * 1000;
  const ROTATE_CHECK_MS = 30 * 1000;
  const FADE_MS = 2000;
  const rotationAllowed = !(document.currentScript && document.currentScript.dataset.rotate === 'off');
  let lastChange = Date.now();
  let rotating = false;
  let rotationTimer = null;

  async function rotate() {
    if (rotating) return;
    rotating = true;
    try {
      const response = await fetch('/api/background/random?refresh=1', { credentials: 'same-origin' });
      if (!response.ok) return;
      const photo = await response.json();
      if (!photo || !photo.url) return;
      let hues = [];
      let img;
      try {
        img = await loadImage(photo.url);
        hues = extractHues(img);
      } catch {
        return;
      }
      writeCache(photo, hues);
      lastChange = Date.now();

      const layer = document.createElement('div');
      layer.className = 'bst-bg-fade';
      layer.style.setProperty('--bst-bg-image', `url("${String(photo.url).replace(/"/g, '%22')}")`);
      document.body.appendChild(layer);
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) layer.style.transition = 'none';
      void layer.offsetWidth;
      layer.classList.add('is-visible');
      if (window.BSTPalette && window.BSTPalette.withFade) {
        window.BSTPalette.withFade(() => applyPalette(hues), FADE_MS, false);
      } else {
        applyPalette(hues);
      }
      showCredit(photo);
      setTimeout(() => {
        setImage(photo);
        layer.remove();
      }, reduceMotion ? 0 : FADE_MS + 100);
    } catch {
      // keep current background on failure
    } finally {
      rotating = false;
    }
  }

  function startRotation() {
    if (!rotationAllowed || rotationTimer) return;
    rotationTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && isEnabled() && Date.now() - lastChange >= ROTATE_INTERVAL_MS) {
        rotate();
      }
    }, ROTATE_CHECK_MS);
  }

  async function init() {
    if (!isEnabled()) {
      clearBackground();
      return;
    }

    let cached = readCache();
    if (!cached) {
      try {
        const response = await fetch('/api/background/random', { credentials: 'same-origin' });
        if (!response.ok) return;
        const photo = await response.json();
        if (!photo || !photo.url) return;
        let hues = [];
        try {
          hues = extractHues(await loadImage(photo.url));
        } catch {
          const rgb = hexToRgb(photo.color);
          if (rgb) {
            const { h, s } = rgbToHsl(rgb[0], rgb[1], rgb[2]);
            if (s > 0.1) hues = [h];
          }
        }
        cached = { photo, palette: hues };
        writeCache(photo, hues);
      } catch {
        return;
      }
    }

    setImage(cached.photo);
    applyPalette(cached.palette);
    showCredit(cached.photo);
    lastChange = cached.at || Date.now();
    startRotation();
  }

  window.BSTBackground = {
    refresh() {
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        // ignore
      }
      return init();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
