import { state } from './state';
import type { DisplayMessagePayload, IndexedOutlinePoint, TeleprompterMedia } from './types';

export function escapeAttr(value: string | undefined | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Only allow http(s), same-site paths and inline images
export function safeMediaUrl(raw: string | null | undefined): string {
  const value = (raw || '').trim();
  if (!value) return '';
  if (/^data:image\//i.test(value)) return value;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {
    return '';
  }
  return '';
}

export function getDisplayChannelKey(): string {
  return state.classConfig.channelName || `class${state.classId}-control`;
}

export function sendDisplayMessage(message: DisplayMessagePayload): void {
  const payload: DisplayMessagePayload = { ...message, sentAt: Date.now() };
  if (!state.displayChannel) {
    if (window.bst?.createBroadcastChannel) {
      state.displayChannel = window.bst.createBroadcastChannel(getDisplayChannelKey());
    } else if ('BroadcastChannel' in window) {
      state.displayChannel = new BroadcastChannel(getDisplayChannelKey());
    }
  }
  if (state.displayChannel) state.displayChannel.postMessage(payload);
  try {
    localStorage.setItem(`${getDisplayChannelKey()}-storage`, JSON.stringify(payload));
  } catch {
    /* ignore storage errors */
  }
}

export function showImageOnDisplay(point: IndexedOutlinePoint): void {
  sendDisplayMessage({
    type: 'displayMedia',
    media: {
      type: 'image',
      title: point.title || 'Image',
      url: point.url,
      sources: [{ url: point.url }],
      fullscreen: true
    }
  });
}

export function showVerseOnDisplay(reference: string, translationOverride?: string): void {
  let translation = translationOverride || 'nkjv';
  if (!translationOverride) {
    try {
      translation = localStorage.getItem('bible-translation-preference') || 'nkjv';
    } catch {
      /* ignore storage errors */
    }
  }
  sendDisplayMessage({
    type: 'displayMedia',
    media: { type: 'verse', reference, translation, title: reference, fullscreen: true }
  });
}

export function showMediaOnDisplay(media: TeleprompterMedia): void {
  if (media.type === 'verse') {
    showVerseOnDisplay(media.reference || media.title || '', media.translation);
    return;
  }
  const type = media.type === 'images' ? 'image' : media.type;
  sendDisplayMessage({
    type: 'displayMedia',
    media: { ...media, type, fullscreen: type === 'image' }
  });
}

export function showLinkOnDisplay(url: string): void {
  const lower = url.toLowerCase();
  let type = 'link';
  if (lower.includes('youtube.com') || lower.includes('youtu.be') || /\.(mp4|webm|ogg)(\?|$)/.test(lower)) {
    type = 'video';
  } else if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/.test(lower)) {
    type = 'image';
  }
  sendDisplayMessage({
    type: 'displayMedia',
    media: { type, title: 'Link', url, sources: [{ url }], fullscreen: type === 'image' }
  });
}

export function clearDisplay(): void {
  state.shownMediaId = null;
  sendDisplayMessage({ type: 'clearScreen' });
}

// Images show when reached; a verse shows once the line before it is current
export function triggerMediaForIndex(index: number): void {
  let active: { id: string; show: () => void } | null = null;
  const last = Math.min(index + 1, state.allOutlinePoints.length - 1);
  for (let i = 0; i <= last; i++) {
    const point = state.allOutlinePoints[i];
    if (point.type === 'image' && i <= index) {
      active = { id: `image-${i}`, show: () => showImageOnDisplay(point) };
    } else if (point.media && Math.max(0, i - 1) <= index) {
      const media = point.media;
      active = { id: `media-${i}`, show: () => showMediaOnDisplay(media) };
    } else if (point.verse && Math.max(0, i - 1) <= index) {
      const verse = point.verse;
      active = { id: `verse-${i}`, show: () => showVerseOnDisplay(verse) };
    }
  }

  const activeId = active ? active.id : null;
  if (activeId === state.shownMediaId) return;
  const hadMedia = state.shownMediaId !== null;
  state.shownMediaId = activeId;
  if (active) active.show();
  else if (hadMedia) sendDisplayMessage({ type: 'clearScreen' });
}

// Small live preview of the student display, same approach as the teacher view
export function setupStudentPreview(): void {
  if (document.getElementById('student-preview-shell')) return;
  const shell = document.createElement('div');
  shell.id = 'student-preview-shell';
  shell.style.cssText = 'position:fixed;bottom:20px;right:20px;width:320px;height:180px;border:1px solid #ccc;z-index:1000;pointer-events:none;overflow:hidden;background:#000;';
  const frame = document.createElement('iframe');
  frame.id = 'student-preview';
  frame.title = 'Student display preview';
  frame.src = `${window.location.origin}/student.html?class=${encodeURIComponent(state.classId)}`;
  frame.style.cssText = 'position:absolute;top:0;left:0;border:0;width:1280px;height:720px;transform:scale(0.25);transform-origin:top left;';
  shell.appendChild(frame);
  document.body.appendChild(shell);
}
