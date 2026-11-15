import { debug, showStatusMessage } from './debug';
import { triggerMediaForIndex } from './display';
import { updateCurrentPointDisplay } from './outline';
import { CONFIG, DEFAULT_SCROLL_VELOCITY, state } from './state';

const pausedVerseLinks = new WeakSet<Element>();

// Smooth scrolling with Lerp (Linear Interpolation)
export function smoothScrollToPoint(pointIndex: number): void {
  const pointElement = document.querySelector(`[data-point-index="${pointIndex}"]`);
  if (!pointElement) return;

  const container = document.getElementById('content-area');
  if (!container) return;

  const containerTop = container.getBoundingClientRect().top;
  const targetOffset =
    container.scrollTop +
    pointElement.getBoundingClientRect().top -
    containerTop -
    container.clientHeight * 0.30; // Keep at 30% from top
  state.targetScrollPosition = Math.max(0, targetOffset);
  state.currentScrollPosition = container.scrollTop;
  state.isProgrammaticScroll = true;

  if (state.scrollAnimationId !== null) {
    cancelAnimationFrame(state.scrollAnimationId);
  }

  const startTime = Date.now();
  const startPosition = state.currentScrollPosition;

  function animateScroll(): void {
    if (!container) return;
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / CONFIG.SMOOTH_SCROLL_DURATION, 1);

    // Ease-in-out cubic for smooth deceleration
    const easeProgress = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    state.currentScrollPosition = startPosition + (state.targetScrollPosition - startPosition) * easeProgress;
    container.scrollTop = state.currentScrollPosition;

    if (progress < 1) {
      state.scrollAnimationId = requestAnimationFrame(animateScroll);
    } else {
      container.scrollTop = state.targetScrollPosition;
      state.currentScrollPosition = state.targetScrollPosition;
      state.isProgrammaticScroll = false;
      state.scrollRemainder = 0;
    }
  }

  animateScroll();
}

// Keep the current index in sync with the line at the reading position while scrolling
export function syncCurrentPointToScroll(container: HTMLElement): void {
  const readingLine = container.getBoundingClientRect().top + container.clientHeight * 0.30;
  const lines = document.querySelectorAll('#script-flow .teleprompter__line');
  let found = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].getBoundingClientRect().top <= readingLine) found = i;
    else break;
  }
  if (found !== state.currentPointIndex) {
    state.currentPointIndex = found;
    updateCurrentPointDisplay();
    triggerMediaForIndex(found);
  }
}

// Advance to a specific point with smooth scrolling
export function advanceToPoint(pointIndex: number): void {
  if (pointIndex < 0 || pointIndex >= state.allOutlinePoints.length) return;
  if (pointIndex === state.currentPointIndex) return;

  state.currentPointIndex = pointIndex;
  updateCurrentPointDisplay();
  triggerMediaForIndex(pointIndex);
  smoothScrollToPoint(pointIndex);
  state.consecutiveHighConfidenceMatches = 0;
  state.isTrackingFrozen = false;
}

// Toggle scrolling on/off (play/pause)
export function toggleScrolling(): void {
  state.isScrolling = !state.isScrolling;
  state.lastScrollTime = Date.now();
  const btn = document.getElementById('play-pause-scroll');
  if (btn) {
    btn.innerHTML = `<span class="material-icons">${state.isScrolling ? 'pause' : 'play_arrow'}</span><span class="btn-label">${state.isScrolling ? 'Pause' : 'Play'}</span>`;
  }
  debug(`${state.isScrolling ? '▶️ PLAYING' : '⏸️ PAUSED'} at ${state.scrollVelocity} px/s`);
  showStatusMessage(`${state.isScrolling ? '▶️ Playing' : '⏸️ Paused'} - Speed: ${state.scrollVelocity} px/s`, 1500);
}

// Update speed display element
export function updateSpeedDisplay(): void {
  const speedDisplay = document.getElementById('speed-display');
  const speedInput = document.getElementById('speed-input');
  if (speedInput instanceof HTMLInputElement) speedInput.value = String(state.scrollVelocity);
  if (speedDisplay) {
    const percentage = Math.round((state.scrollVelocity / DEFAULT_SCROLL_VELOCITY) * 100);
    speedDisplay.textContent = `${state.scrollVelocity} px/s (${percentage}%)`;
  }
}

export function setScrollSpeed(value: number): void {
  state.scrollVelocity = Math.max(5, Math.min(300, Math.round(value)));
  updateSpeedDisplay();
  showStatusMessage(
    `📊 Speed: ${state.scrollVelocity} px/s (${((state.scrollVelocity / DEFAULT_SCROLL_VELOCITY) * 100).toFixed(0)}%)`,
    1200
  );
  debug(`Speed changed to: ${state.scrollVelocity} px/s`);
}

export function changeScrollSpeed(delta: number): void {
  setScrollSpeed(state.scrollVelocity + delta);
}

export function resetScrollSpeed(): void {
  state.scrollVelocity = DEFAULT_SCROLL_VELOCITY;
  updateSpeedDisplay();
  showStatusMessage(`🔄 Speed reset to: ${state.scrollVelocity} px/s`, 1500);
  debug(`Speed reset to default: ${DEFAULT_SCROLL_VELOCITY} px/s`);
}

// Auto-pause once when a verse link reaches the reading line
function pauseAtVerseLink(container: HTMLElement): boolean {
  const readingLine = container.getBoundingClientRect().top + container.clientHeight * 0.30;
  let shouldPause = false;
  document.querySelectorAll('#script-flow a[data-verse]').forEach((link) => {
    const top = link.getBoundingClientRect().top;
    if (top > readingLine) {
      pausedVerseLinks.delete(link); // scrolled back above it; re-arm
    } else if (!pausedVerseLinks.has(link)) {
      pausedVerseLinks.add(link);
      // Ignore links already well past (e.g. after a jump)
      if (readingLine - top < 120) shouldPause = true;
    }
  });
  return shouldPause;
}

// Constant-speed scroll loop (runs continuously)
export function startScrollLoop(): void {
  function scroll(): void {
    const now = Date.now();
    const deltaTime = (now - state.lastScrollTime) / 1000;
    state.lastScrollTime = now;

    if (!state.isScrolling || state.isProgrammaticScroll) {
      state.scrollLoopId = requestAnimationFrame(scroll);
      return;
    }

    const scrollTarget = state.viewMode === 'scroll'
      ? document.getElementById('scroll-viewport')
      : document.getElementById('content-area');

    if (scrollTarget) {
      state.scrollRemainder += state.scrollVelocity * deltaTime;
      const whole = Math.floor(state.scrollRemainder);
      if (whole > 0) {
        state.scrollRemainder -= whole;
        scrollTarget.scrollTop += whole;
      }
      if (pauseAtVerseLink(scrollTarget)) toggleScrolling();
    }

    state.scrollLoopId = requestAnimationFrame(scroll);
  }

  scroll();
}

// Update visual hierarchy based on scroll position
export function updateScrollViewClasses(): void {
  const viewport = document.getElementById('scroll-viewport');
  const points = document.querySelectorAll('#all-points-container .teleprompter__point');

  if (!viewport || points.length === 0) return;

  const viewportCenter = viewport.scrollTop + viewport.clientHeight / 2;

  points.forEach((point) => {
    const rect = point.getBoundingClientRect();
    const pointCenter = viewport.scrollTop + rect.top - viewport.getBoundingClientRect().top + rect.height / 2;
    const distance = Math.abs(pointCenter - viewportCenter);

    point.classList.remove('scroll-center', 'scroll-near', 'scroll-far', 'scroll-fading');

    if (distance < 100) {
      point.classList.add('scroll-center');
    } else if (distance < 250) {
      point.classList.add('scroll-near');
    } else if (distance < 500) {
      point.classList.add('scroll-far');
    } else {
      point.classList.add('scroll-fading');
    }
  });
}

// Render all points in scroll view
export function renderScrollView(): void {
  const container = document.getElementById('all-points-container');
  if (!container) return;

  container.innerHTML = '';

  state.allOutlinePoints.forEach((point, idx) => {
    const pointEl = document.createElement('div');
    pointEl.className = 'teleprompter__point';
    pointEl.setAttribute('data-point-index', String(idx));
    pointEl.innerHTML = `
      <div class="point-text">${point.text}</div>
    `;
    container.appendChild(pointEl);
  });

  updateScrollViewClasses();
}

// Start continuous scroll view updater
export function startScrollViewUpdater(): void {
  function update(): void {
    if (state.viewMode === 'scroll') {
      updateScrollViewClasses();
      state.scrollUpdateId = requestAnimationFrame(update);
    }
  }
  update();
}

// Toggle view mode between 'word' and 'scroll'
export function toggleViewMode(): void {
  state.viewMode = state.viewMode === 'word' ? 'scroll' : 'word';
  const container = document.getElementById('content-area');
  const wordView = document.getElementById('teleprompter-content');
  const scrollView = document.getElementById('scroll-view-container');
  const btn = document.getElementById('toggle-view-mode');

  if (state.viewMode === 'scroll') {
    container?.setAttribute('data-view-mode', 'scroll');
    if (wordView) wordView.style.display = 'none';
    if (scrollView) scrollView.style.display = 'flex';
    if (btn) btn.textContent = '📋 Scroll View';
    renderScrollView();
    startScrollViewUpdater();
    debug('🔄 Switched to SCROLL view');
    showStatusMessage('📋 Scroll View - Center line highlighted', 1500);
  } else {
    container?.setAttribute('data-view-mode', 'word');
    if (wordView) wordView.style.display = 'block';
    if (scrollView) scrollView.style.display = 'none';
    if (btn) btn.textContent = '✏️ Word View';
    if (state.scrollUpdateId !== null) cancelAnimationFrame(state.scrollUpdateId);
    debug('🔄 Switched to WORD view');
    showStatusMessage('✏️ Word View - Speech recognition mode', 1500);
  }
}
