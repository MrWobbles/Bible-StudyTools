import type { StudentState } from './types';

export const DEFAULT_VERSE_FONT_SIZE = 72;
export const DEFAULT_VERSE_SCALE = 1.0;
export const VERSE_STAGE_WIDTH = 1280;
export const VERSE_STAGE_HEIGHT = 720;
export const VERSE_LINE_HEIGHT = 1.6;
export const API_BIBLE_FALLBACKS = new Set(['web', 'kjv', 'esv', 'niv', 'nasb', 'nlt', 'amp', 'net']);

export const isInIframe = window.self !== window.top;

export const studentState: StudentState = {
  player: null,
  monitorId: null,
  nextPauseIndex: 0,
  channel: null,
  videoId: '',
  videoStart: 0,
  pausePoints: [],
  channelKey: 'class1-control',
  storageFallbackKey: 'class1-control-storage',
  pendingMedia: null,
  verseScrollContainer: null,
  versePages: [],
  currentVersePageIndex: 0,
  verseFontSize: DEFAULT_VERSE_FONT_SIZE,
  currentVerseLines: [],
  lastProcessedCommandId: null,
  apiBibleMapCache: null,
};

/**
 * Update the active YouTube player reference on both module state and `window.player`.
 */
export function setPlayer(newPlayer: YouTubePlayerInstance | null): void {
  studentState.player = newPlayer;
  window.player = newPlayer ?? undefined;
}

/**
 * Escape HTML special characters for safe template interpolation.
 */
export function escapeHtml(str: unknown): string {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
