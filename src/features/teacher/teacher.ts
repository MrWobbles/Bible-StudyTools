import { renderTextDrawer, setupTeacherLinkDelegation } from './customDisplay';
import { renderGeneratedOutline } from './editorContent';
import { renderMediaGallery } from './media';
import {
  bindNotesAndQuestionControls,
  hydrateNotes,
  setupContextMenuListener
} from './notes';
import {
  renderOutlineWithQuestions,
  renderPauseList,
  setupOutlineTabs
} from './outline';
import { formatTime, teacherState } from './state';
import { registerMarkerRerender } from './stopMarkers';
import {
  initBroadcastChannel,
  openDisplayWindow,
  openTeleprompter,
  sendCommand
} from './sync';
import type {
  ClassesDataStore,
  NormalizedPausePoint,
  TeacherClassConfig
} from './types';
import { bindVerseControls, renderVerseDrawer } from './verses';

function normalizePausePoints(rawPausePoints: unknown[]): NormalizedPausePoint[] {
  return rawPausePoints
    .map((p): NormalizedPausePoint | null => {
      if (p == null) return null;
      if (typeof p === 'number') return { time: p, label: formatTime(p) };
      if (typeof p === 'string') {
        const parts = p.split(':').map((n) => Number(n));
        let secs = 0;
        if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
        else secs = Number(p) || 0;
        return { time: secs, label: formatTime(secs) };
      }
      if (typeof p === 'object') {
        const pt = p as { time?: unknown; label?: unknown };
        const t = Number(pt.time);
        const timeVal = Number.isFinite(t)
          ? t
          : typeof pt.time === 'string'
            ? pt.time.split(':').reduce((acc, cur) => acc * 60 + Number(cur), 0)
            : 0;
        const label =
          typeof pt.label === 'string' && pt.label ? pt.label : formatTime(timeVal);
        return { time: timeVal, label };
      }
      return null;
    })
    .filter((p): p is NormalizedPausePoint => p !== null);
}

async function loadClassConfig(): Promise<void> {
  try {
    if (!window.BSTApi) {
      console.error('BSTApi is not available');
      return;
    }

    const raw = await window.BSTApi.getClasses();
    teacherState.allClassesData = raw as ClassesDataStore;

    let classesArr: TeacherClassConfig[];
    if (Array.isArray(raw)) {
      classesArr = raw as TeacherClassConfig[];
    } else if (raw && typeof raw === 'object' && 'classes' in raw && Array.isArray(raw.classes)) {
      classesArr = raw.classes as TeacherClassConfig[];
    } else if (raw && typeof raw === 'object') {
      classesArr = [raw as TeacherClassConfig];
    } else {
      classesArr = [];
    }

    const { classId } = teacherState;
    const matchedClass =
      classesArr.find((c) => c.classNumber?.toString() === classId || c.id === classId) ||
      classesArr[0] ||
      {};
    teacherState.classConfig = matchedClass;

    if (!matchedClass || !matchedClass.classNumber) {
      console.error(`Class ${classId} not found in configuration`);
    }

    const primaryMedia = matchedClass.media?.find((m) => m.primary && m.type === 'video');
    teacherState.videoId = primaryMedia?.sources?.[0]?.videoId || '';
    const rawPausePoints: unknown[] = primaryMedia?.pausePoints || [];
    teacherState.pausePoints = normalizePausePoints(rawPausePoints);

    teacherState.channelKey = matchedClass.channelName || `class${classId}-control`;
    teacherState.storageFallbackKey = `${teacherState.channelKey}-storage`;
    teacherState.notesKey = `class${classId}-teacher-notes`;
    teacherState.questionPrefix = `class${classId}-question-`;

    window.BIBLE_STUDY_CONFIG = {
      videoId: teacherState.videoId,
      channelName: teacherState.channelKey,
      bibleTranslation: matchedClass.bibleTranslation || 'nkjv',
      pausePoints: teacherState.pausePoints
    };

    initializePage();
  } catch (err: unknown) {
    console.error('Failed to load class configuration:', err);
  }
}

function bindControls(): void {
  const toggleBtn = document.getElementById('toggle');
  const playBtn = document.getElementById('play');
  const pauseBtn = document.getElementById('pause');
  const restartBtn = document.getElementById('restart');
  const nextBtn = document.getElementById('next');
  const fullscreenBtn = document.getElementById('fullscreen');
  const clearScreenBtn = document.getElementById('clear-screen');

  if (toggleBtn) toggleBtn.onclick = () => sendCommand('toggle');
  if (playBtn) playBtn.onclick = () => sendCommand('play');
  if (pauseBtn) pauseBtn.onclick = () => sendCommand('pause');
  if (restartBtn) restartBtn.onclick = () => sendCommand('restart');
  if (nextBtn) nextBtn.onclick = () => sendCommand('nextPause');
  if (fullscreenBtn) fullscreenBtn.onclick = () => sendCommand('fullscreen');
  if (clearScreenBtn) clearScreenBtn.onclick = () => sendCommand('clearScreen');

  bindVerseControls();
  bindNotesAndQuestionControls();
  renderPauseList();
}

function initializePage(): void {
  const { classConfig, classId } = teacherState;
  document.title = `Presenter View — ${classConfig.title || ''}`;

  teacherState.statusEl = document.getElementById('status');
  teacherState.pauseListEl = document.getElementById('pause-list');
  teacherState.notesEl = document.getElementById('notes');
  teacherState.downloadBtn = document.getElementById('download-notes');
  teacherState.uploadBtn = document.getElementById('upload-notes');
  const fileInputEl = document.getElementById('notes-file');
  teacherState.fileInput = fileInputEl instanceof HTMLInputElement ? fileInputEl : null;

  const h1 = document.querySelector('h1');
  if (h1) h1.textContent = `Presenter View · ${classConfig.title || ''}`;

  const subtitle = document.querySelector('.subtitle');
  if (subtitle) {
    subtitle.textContent = `${classConfig.subtitle || ''} · Keep this on your laptop while casting the main screen.`;
  }

  const previewIframe = document.getElementById('student-preview');
  if (previewIframe instanceof HTMLIFrameElement) {
    previewIframe.src = `${window.location.origin}/student.html?class=${classId}`;
  }

  const guideTitle = document.querySelector('h3');
  if (guideTitle) guideTitle.textContent = `${classConfig.title || ''} guide with notes`;

  registerMarkerRerender(() => {
    renderOutlineWithQuestions();
    renderGeneratedOutline();
  });

  renderOutlineWithQuestions();
  renderMediaGallery();
  renderVerseDrawer();
  renderTextDrawer();
  setupOutlineTabs();
  renderGeneratedOutline();

  initBroadcastChannel();
  bindControls();
  hydrateNotes();
  setupTeacherLinkDelegation();
  setupContextMenuListener();

  const openDisplayBtn = document.getElementById('open-display-btn');
  if (openDisplayBtn) {
    openDisplayBtn.addEventListener('click', openDisplayWindow);
  }

  const openTeleprompterBtn = document.getElementById('open-teleprompter-btn');
  if (openTeleprompterBtn) {
    openTeleprompterBtn.addEventListener('click', openTeleprompter);
  }

  if (teacherState.statusEl) {
    teacherState.statusEl.textContent = 'Ready. Open the display page on the TV (student.html).';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void loadClassConfig();
  });
} else {
  void loadClassConfig();
}
