import { editorState } from '../state';

const SPEECH_WPM_KEY = 'bst.editor.speechWpm';
const DEFAULT_SPEECH_WPM = 140;
let speechSelectionMode = false;

function getSpeechWpm(): number {
  const stored = Number(localStorage.getItem(SPEECH_WPM_KEY));
  return stored >= 20 && stored <= 400 ? stored : DEFAULT_SPEECH_WPM;
}

function formatSpeechTime(words: number, wpm: number): string {
  const totalSeconds = Math.round((words / wpm) * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function countWords(text: string): number {
  const matches = String(text || '').trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

export function updateSpeechTime(): void {
  const box = document.getElementById('speech-time-box');
  const { editor } = editorState;
  if (!box || !editor) return;
  const { from, to, empty } = editor.state.selection;
  if (empty) speechSelectionMode = false;
  const text = speechSelectionMode
    ? editor.state.doc.textBetween(from, to, ' ')
    : editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ');
  const words = countWords(text);
  const valueEl = box.querySelector('.speech-time-value');
  const wordsEl = box.querySelector('.speech-time-words');
  if (valueEl) valueEl.textContent = formatSpeechTime(words, getSpeechWpm());
  if (wordsEl) wordsEl.textContent = `${words} words`;
}

export function initSpeechTimeBox(): void {
  if (document.getElementById('speech-time-box')) return;
  const box = document.createElement('div');
  box.id = 'speech-time-box';
  box.title = 'Click to show time for the highlighted selection (click again for whole text)';
  box.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:1000;padding:8px 12px;border-radius:8px;background:rgba(20,20,20,.9);color:#fff;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);text-align:right;user-select:none;';
  box.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;justify-content:flex-end">' +
    '<div><div class="speech-time-value" style="font-size:20px;font-weight:600"></div>' +
    '<div class="speech-time-words" style="font-size:11px;opacity:.8"></div></div>' +
    '<a class="speech-time-gear" href="settings.html" target="_blank" rel="noopener" title="Settings" aria-label="Settings" style="color:inherit;text-decoration:none;font-size:20px">&#9881;</a></div>';
  document.body.appendChild(box);

  box
    .querySelector('.speech-time-gear')
    ?.addEventListener('click', (e: Event) => e.stopPropagation());
  // Keep the editor selection when clicking the box.
  box.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.target instanceof Element && !e.target.closest('.speech-time-gear')) {
      e.preventDefault();
    }
  });
  // Pick up a changed speed after returning from the settings tab.
  window.addEventListener('focus', updateSpeechTime);
  box.addEventListener('click', () => {
    speechSelectionMode =
      !speechSelectionMode && !!editorState.editor && !editorState.editor.state.selection.empty;
    updateSpeechTime();
  });
  updateSpeechTime();
}
