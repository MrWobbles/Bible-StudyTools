import { openStudentQrModal } from '../shared/studentQrModal';
import {
  clearDisplay,
  sendDisplayMessage,
  setupStudentPreview,
  showLinkOnDisplay,
  showMediaOnDisplay,
  showVerseOnDisplay
} from './display';
import {
  advanceToPoint,
  changeScrollSpeed,
  resetScrollSpeed,
  setScrollSpeed,
  startScrollLoop,
  syncCurrentPointToScroll,
  toggleScrolling,
  toggleViewMode,
  updateSpeedDisplay
} from './scroll';
import { toggleListening } from './speech';
import { state } from './state';
import type { TeleprompterMedia } from './types';

function initClockAndMarker(): void {
  const marker = document.getElementById('reading-marker');
  const area = document.getElementById('content-area');
  const clockEl = document.getElementById('clock-display');
  const timerEl = document.getElementById('timer-display');

  // Matches the 30% reading line used by syncCurrentPointToScroll
  const placeMarker = (): void => {
    if (!marker || !area) return;
    marker.style.top = `${area.offsetTop + area.clientHeight * 0.30}px`;
  };
  placeMarker();
  window.addEventListener('resize', placeMarker);

  let timerMs = 0;
  let last = Date.now();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const tick = (): void => {
    const now = Date.now();
    if (state.isScrolling) timerMs += now - last;
    last = now;
    if (clockEl) clockEl.textContent = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (timerEl) {
      const total = Math.floor(timerMs / 1000);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      timerEl.textContent = h ? `${h}:${pad(m)}:${pad(total % 60)}` : `${pad(m)}:${pad(total % 60)}`;
    }
  };
  const reset = (): void => {
    timerMs = 0;
    last = Date.now();
    tick();
  };
  timerEl?.addEventListener('click', reset);
  timerEl?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      reset();
    }
  });
  tick();
  setInterval(tick, 500);
}

// Setup manual controls
export function setupControls(): void {
  setupStudentPreview();
  const toggleBtn = document.getElementById('toggle-listening');
  const nextBtn = document.getElementById('manual-next');
  const prevBtn = document.getElementById('manual-prev');
  const resetBtn = document.getElementById('reset-scroll');
  const closeBtn = document.getElementById('close-teleprompter');
  const viewModeToggleBtn = document.getElementById('toggle-view-mode');

  // Speed controls for constant-speed scroll mode
  const playPauseBtn = document.getElementById('play-pause-scroll');
  const speedUpBtn = document.getElementById('speed-up');
  const speedDownBtn = document.getElementById('speed-down');
  const speedResetBtn = document.getElementById('speed-reset');

  toggleBtn?.addEventListener('click', toggleListening);
  nextBtn?.addEventListener('click', () => advanceToPoint(state.currentPointIndex + 1));
  prevBtn?.addEventListener('click', () => advanceToPoint(state.currentPointIndex - 1));
  resetBtn?.addEventListener('click', () => advanceToPoint(0));
  document.getElementById('open-display')?.addEventListener('click', () => {
    window.open(`student.html?class=${state.classId}`, 'display-screen', 'width=1280,height=720');
  });
  document.getElementById('share-student-qr')?.addEventListener('click', () => {
    void openStudentQrModal({
      classId: state.classId,
      onShowOnScreen: (url) => {
        sendDisplayMessage({
          type: 'displayMedia',
          media: { type: 'qr', url, title: 'Follow Along on Your Screen' }
        });
      }
    });
  });
  document.getElementById('clear-display')?.addEventListener('click', clearDisplay);
  closeBtn?.addEventListener('click', () => {
    if (state.isListening) void toggleListening();
    if (state.scrollLoopId !== null) cancelAnimationFrame(state.scrollLoopId);
    window.close();
  });

  viewModeToggleBtn?.addEventListener('click', toggleViewMode);
  playPauseBtn?.addEventListener('click', toggleScrolling);

  const editSpeedBtn = document.getElementById('edit-speed');
  const speedEditControls = document.getElementById('speed-edit-controls');
  const speedDoneBtn = document.getElementById('speed-done');

  if (editSpeedBtn && speedEditControls) {
    editSpeedBtn.addEventListener('click', () => {
      speedEditControls.style.display = speedEditControls.style.display === 'none' ? 'flex' : 'none';
      if (speedEditControls.style.display === 'flex') {
        document.getElementById('speed-input')?.focus();
      }
    });
  }

  if (speedDoneBtn && speedEditControls) {
    speedDoneBtn.addEventListener('click', () => {
      speedEditControls.style.display = 'none';
    });
  }

  speedUpBtn?.addEventListener('click', (e: MouseEvent) => changeScrollSpeed(e.shiftKey ? 1 : 5));
  speedDownBtn?.addEventListener('click', (e: MouseEvent) => changeScrollSpeed(e.shiftKey ? -1 : -5));
  speedResetBtn?.addEventListener('click', () => resetScrollSpeed());

  const speedInput = document.getElementById('speed-input');
  if (speedInput instanceof HTMLInputElement) {
    const applyTypedSpeed = (): void => {
      const value = Number(speedInput.value);
      if (Number.isFinite(value) && speedInput.value !== '') setScrollSpeed(value);
      else updateSpeedDisplay();
    };
    speedInput.addEventListener('change', applyTypedSpeed);
    speedInput.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        applyTypedSpeed();
        speedInput.blur();
      }
    });
    speedInput.addEventListener('wheel', (e: WheelEvent) => e.preventDefault(), { passive: false });
  }

  document.getElementById('verse-prev')?.addEventListener('click', () => sendDisplayMessage({ type: 'versePrevious' }));
  document.getElementById('verse-next')?.addEventListener('click', () => sendDisplayMessage({ type: 'verseNext' }));

  // Keyboard shortcuts
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.matches('input[type="range"]')) target.blur();
    const step = e.shiftKey ? 1 : 5;
    if (e.key === ' ' || e.code === 'Space') {
      if (target?.matches('input:not([type="range"]), textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      if (e.repeat) return;
      // Drop focus from buttons so Space doesn't also click them on release
      if (target?.matches('button, a, [role="button"]')) target.blur();
      toggleScrolling();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      toggleViewMode();
    } else if (e.key === 'ArrowRight' || e.key === '+' || e.key === '=') {
      e.preventDefault();
      changeScrollSpeed(step);
    } else if (e.key === 'ArrowLeft' || e.key === '-' || e.key === '_') {
      e.preventDefault();
      changeScrollSpeed(-step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      sendDisplayMessage({ type: 'verseNext' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sendDisplayMessage({ type: 'versePrevious' });
    } else if (e.key === 'r' || e.key === 'R') {
      resetScrollSpeed();
    } else if (e.key === 'c' || e.key === 'C') {
      sendDisplayMessage({ type: 'blackout' });
    }
  });

  // Scroll sync and link clicks
  const contentArea = document.getElementById('content-area');
  if (contentArea) {
    contentArea.addEventListener('scroll', () => {
      if (!state.isProgrammaticScroll) syncCurrentPointToScroll(contentArea);
    }, { passive: true });

    contentArea.addEventListener('click', (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      const link = e.target.closest('a.teleprompter__link');
      if (!(link instanceof HTMLElement)) return;
      e.preventDefault();
      if (link.dataset.media) {
        try {
          const parsed: unknown = JSON.parse(decodeURIComponent(link.dataset.media));
          if (parsed && typeof parsed === 'object' && 'type' in parsed && typeof (parsed as Record<string, unknown>).type === 'string') {
            showMediaOnDisplay(parsed as TeleprompterMedia);
          }
        } catch {
          /* ignore malformed media payload */
        }
      } else if (link.dataset.verse) {
        showVerseOnDisplay(link.dataset.verse);
      } else if (link.dataset.url) {
        showLinkOnDisplay(link.dataset.url);
      }
    });
  }

  updateSpeedDisplay();
  startScrollLoop();
  initClockAndMarker();
}
