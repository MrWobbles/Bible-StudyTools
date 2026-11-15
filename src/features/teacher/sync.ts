import {
  DEFAULT_DISPLAY_HEIGHT,
  DEFAULT_DISPLAY_WIDTH,
  PREVIEW_THUMB_HEIGHT,
  PREVIEW_THUMB_WIDTH,
  flashStatus,
  formatTime,
  teacherState
} from './state';
import type { CommandPayload } from './types';

export function initBroadcastChannel(): void {
  if (window.bst?.createBroadcastChannel) {
    teacherState.channel = window.bst.createBroadcastChannel(teacherState.channelKey);
  } else if ('BroadcastChannel' in window) {
    teacherState.channel = new BroadcastChannel(teacherState.channelKey);
  } else {
    teacherState.channel = null;
  }
}

export function sendCommand(type: string, payload: CommandPayload = {}): void {
  const message = { type, ...payload, sentAt: Date.now() };
  console.log('[Teacher] Sending command:', type, message);
  if (teacherState.channel) {
    teacherState.channel.postMessage(message);
    console.log('[Teacher] Posted to BroadcastChannel');
  } else {
    console.warn('[Teacher] No BroadcastChannel available');
  }
  try {
    localStorage.setItem(teacherState.storageFallbackKey, JSON.stringify(message));
  } catch {
    // ignore storage errors
  }
  void window.BSTApi?.sendDisplayCommand(teacherState.channelKey, message);
  flashStatus(`Sent: ${labelFor(type, payload)}`);
}

function labelFor(type: string, payload: CommandPayload): string {
  if (type === 'jumpToPause' && typeof payload.index === 'number' && Number.isInteger(payload.index)) {
    const idx = payload.index;
    const point = teacherState.pausePoints[idx];
    if (teacherState.classConfig?.outline) {
      for (const sec of teacherState.classConfig.outline) {
        try {
          const found = findPauseIndexForSection(sec);
          if (found === idx) {
            const time =
              point && typeof point.time === 'number' ? ` · ${formatTime(point.time)}` : '';
            return `Jump to ${sec.summary}${time}`;
          }
        } catch {
          /* ignore */
        }
      }
    }
    return point ? `Jump to ${point.label}` : 'Jump to pause';
  }
  if (type === 'nextPause') return 'Skip to next pause';
  if (type === 'fullscreen') return 'Fullscreen display';
  if (type === 'restart') return 'Restart video';
  if (type === 'toggle') return 'Play / Pause';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function findPauseIndexForSection(section: OutlineSection): number | null {
  try {
    const primaryVideo = teacherState.classConfig.media?.find(
      (m) => m.primary && m.type === 'video'
    );
    const points = primaryVideo?.pausePoints || [];
    if (!points.length) return null;

    // 1) Try by label similarity
    const sum = normalizeString(section.summary || '');
    let bestIdx: number | null = null;
    let bestScore = 0;
    points.forEach((p, idx) => {
      const lbl = normalizeString(p.label || '');
      if (!lbl) return;
      if (sum.includes(lbl) || lbl.includes(sum)) {
        bestIdx = idx;
        bestScore = 2;
        return;
      }
      const score = tokenOverlap(sum, lbl);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    if (bestIdx != null && bestScore > 0) return bestIdx;

    // 2) Try by timestamp in summary (e.g., 00:07:05 · ... or 7:05)
    const ts = parseTimeFromSummary(section.summary || '');
    if (ts != null) {
      let nearest = 0;
      let delta = Infinity;
      points.forEach((p, idx) => {
        const pTime = typeof p.time === 'number' ? p.time : Number(p.time) || 0;
        const d = Math.abs(pTime - ts);
        if (d < delta) {
          delta = d;
          nearest = idx;
        }
      });
      if (delta <= 45) return nearest;
    }
  } catch {
    // ignore
  }
  return null;
}

function normalizeString(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/\u00b7/g, ' ')
    .replace(/"|\(|\)|\[|\]|\{|\}|:|,|\.|&/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  let count = 0;
  ta.forEach((t) => {
    if (tb.has(t)) count += 1;
  });
  return count;
}

function parseTimeFromSummary(summary: string): number | null {
  const m = String(summary).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = m[3] ? parseInt(m[1], 10) : 0;
  const mm = m[3] ? parseInt(m[2], 10) : parseInt(m[1], 10);
  const ss = m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10);
  return h * 3600 + mm * 60 + ss;
}

export function updateControlVisibility(): void {
  const controlsBar = document.querySelector('.controls-bar');
  if (!controlsBar) return;

  const allControls = controlsBar.querySelectorAll('[data-control-type]');

  allControls.forEach((control) => {
    if (!(control instanceof HTMLElement)) return;
    const controlType = control.getAttribute('data-control-type');

    if (controlType === 'all') {
      control.style.display = '';
      return;
    }

    if (controlType === teacherState.currentMediaType) {
      control.style.display = '';
    } else {
      control.style.display = 'none';
    }
  });
}

export function openDisplayWindow(): void {
  if (teacherState.displayWindow && !teacherState.displayWindow.closed) {
    teacherState.displayWindow.location.href = `${window.location.origin}/student.html?class=${teacherState.classId}`;
    teacherState.displayWindow.focus();
  } else {
    teacherState.displayWindow = window.open(
      `${window.location.origin}/student.html?class=${teacherState.classId}`,
      'display-screen',
      'width=1280,height=720'
    );
  }

  const previewShell = document.getElementById('student-preview-shell');
  if (previewShell) {
    previewShell.style.display = 'block';
    syncPreviewViewport();
  }

  if (teacherState.displayWindowCheckInterval !== null) {
    window.clearInterval(teacherState.displayWindowCheckInterval);
  }
  teacherState.displayWindowCheckInterval = window.setInterval(() => {
    syncPreviewViewport();

    if (teacherState.displayWindow && teacherState.displayWindow.closed) {
      const shell = document.getElementById('student-preview-shell');
      if (shell) {
        shell.style.display = 'none';
      }
      if (teacherState.displayWindowCheckInterval !== null) {
        window.clearInterval(teacherState.displayWindowCheckInterval);
        teacherState.displayWindowCheckInterval = null;
      }
    }
  }, 1000);
}

export function openTeleprompter(): void {
  const teleprompterUrl = `${window.location.origin}/teleprompter.html?class=${teacherState.classId}`;
  window.open(
    teleprompterUrl,
    'teleprompter-screen',
    'width=1024,height=768,menubar=no,toolbar=no'
  );
}

function getDisplayViewportSize(): { width: number; height: number } {
  const win = teacherState.displayWindow;
  if (!win || win.closed) {
    return { width: DEFAULT_DISPLAY_WIDTH, height: DEFAULT_DISPLAY_HEIGHT };
  }

  const width = Number(win.innerWidth || win.outerWidth || DEFAULT_DISPLAY_WIDTH);
  const height = Number(win.innerHeight || win.outerHeight || DEFAULT_DISPLAY_HEIGHT);

  return {
    width: Math.max(320, width),
    height: Math.max(180, height)
  };
}

export function syncPreviewViewport(): void {
  const previewShell = document.getElementById('student-preview-shell');
  const previewIframe = document.getElementById('student-preview');
  if (!previewShell || !(previewIframe instanceof HTMLElement)) return;

  const { width, height } = getDisplayViewportSize();
  const shellWidth = previewShell.clientWidth || PREVIEW_THUMB_WIDTH;
  const shellHeight = previewShell.clientHeight || PREVIEW_THUMB_HEIGHT;

  const scale = Math.max(shellWidth / width, shellHeight / height);
  const offsetX = (shellWidth - width * scale) / 2;
  const offsetY = (shellHeight - height * scale) / 2;

  previewIframe.style.width = `${width}px`;
  previewIframe.style.height = `${height}px`;
  previewIframe.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  previewIframe.style.transformOrigin = 'top left';
}
