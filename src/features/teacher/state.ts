import type { TeacherRuntimeState } from './types';

export const PREVIEW_THUMB_WIDTH = 400;
export const PREVIEW_THUMB_HEIGHT = 225;
export const DEFAULT_DISPLAY_WIDTH = 1280;
export const DEFAULT_DISPLAY_HEIGHT = 720;

export const teacherState: TeacherRuntimeState = {
  classId: new URLSearchParams(window.location.search).get('class') || '1',
  classConfig: {},
  videoId: '',
  pausePoints: [],
  channelKey: 'class-control',
  storageFallbackKey: 'class-control-storage',
  notesKey: 'class-teacher-notes',
  questionPrefix: 'class-question-',
  currentMediaType: null,
  allClassesData: null,
  channel: null,
  statusEl: null,
  pauseListEl: null,
  notesEl: null,
  downloadBtn: null,
  uploadBtn: null,
  fileInput: null,
  questionFields: [],
  displayWindow: null,
  displayWindowCheckInterval: null,
  customContextMenu: null
};

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function flashStatus(text: string): void {
  if (teacherState.statusEl) {
    teacherState.statusEl.textContent = text;
  }
}
