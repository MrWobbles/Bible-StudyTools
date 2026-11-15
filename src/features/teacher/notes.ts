import { sendTextToStudent } from './customDisplay';
import { flashStatus, teacherState } from './state';
import type { ImportedNotesPayload } from './types';

export function hydrateNotes(): void {
  if (!teacherState.notesEl) return;
  teacherState.notesEl.innerHTML = localStorage.getItem(teacherState.notesKey) || '';
  teacherState.notesEl.addEventListener('input', persistNotes);
}

export function persistNotes(): void {
  if (!teacherState.notesEl) return;
  try {
    localStorage.setItem(teacherState.notesKey, teacherState.notesEl.innerHTML);
  } catch {
    // ignore storage errors
  }
}

export function downloadNotes(): void {
  const questions: Record<string, string> = {};
  teacherState.questionFields.forEach((field) => {
    const key = field.dataset.questionKey;
    if (key) {
      questions[key] = field.value;
    }
  });
  const payload = {
    version: 1,
    classNumber: teacherState.classConfig.classNumber,
    notesHtml: teacherState.notesEl?.innerHTML || '',
    questions
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `class${teacherState.classId}-notes.json`;
  a.click();
  URL.revokeObjectURL(url);
  flashStatus(`Downloaded notes file (class${teacherState.classId}-notes.json).`);
}

export function importNotes(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const file = target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === 'string' ? reader.result : '';
    try {
      const parsedRaw: unknown = JSON.parse(text);
      if (parsedRaw && typeof parsedRaw === 'object') {
        const parsed = parsedRaw as ImportedNotesPayload;
        if (typeof parsed.notesHtml === 'string' && teacherState.notesEl) {
          teacherState.notesEl.innerHTML = parsed.notesHtml;
        }
        if (parsed.questions && typeof parsed.questions === 'object') {
          const questionsMap = parsed.questions;
          teacherState.questionFields.forEach((field) => {
            const key = field.dataset.questionKey;
            if (!key) return;
            const val = questionsMap[key];
            if (typeof val === 'string') field.value = val;
          });
        }
        persistNotes();
        teacherState.questionFields.forEach((field) => {
          const key = field.dataset.questionKey || '';
          try {
            localStorage.setItem(teacherState.questionPrefix + key, field.value);
          } catch {
            // ignore storage errors
          }
        });
        flashStatus('Imported notes and outline fields.');
        target.value = '';
        return;
      }
    } catch {
      // fall through to treat as raw HTML
    }

    if (teacherState.notesEl) teacherState.notesEl.innerHTML = text;
    persistNotes();
    flashStatus('Imported notes (rich text).');
    target.value = '';
  };
  reader.readAsText(file);
}

export function bindNotesAndQuestionControls(): void {
  if (teacherState.downloadBtn) teacherState.downloadBtn.onclick = downloadNotes;
  if (teacherState.uploadBtn) teacherState.uploadBtn.onclick = () => teacherState.fileInput?.click();
  if (teacherState.fileInput) teacherState.fileInput.onchange = importNotes;

  document.querySelectorAll('.rte-toolbar button').forEach((btn) => {
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.onclick = () => {
      const cmd = btn.dataset.cmd;
      if (!cmd) return;
      const val = btn.dataset.value || undefined;
      document.execCommand(cmd, false, val);
      if (teacherState.notesEl) teacherState.notesEl.focus();
      persistNotes();
    };
  });

  teacherState.questionFields.forEach((field) => {
    const key = field.dataset.questionKey || '';
    const stored = localStorage.getItem(teacherState.questionPrefix + key);
    if (stored) field.value = stored;
    field.addEventListener('input', () => {
      try {
        localStorage.setItem(teacherState.questionPrefix + key, field.value);
      } catch {
        // ignore storage errors
      }
    });
  });
}

function createContextMenu(): void {
  if (teacherState.customContextMenu) return;
  const menu = document.createElement('div');
  menu.id = 'custom-context-menu';
  menu.style.position = 'fixed';
  menu.style.zIndex = '10000';
  menu.style.background = '#1e1e1e';
  menu.style.border = '1px solid #333';
  menu.style.borderRadius = '4px';
  menu.style.padding = '4px 0';
  menu.style.minWidth = '200px';
  menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
  menu.style.display = 'none';
  menu.innerHTML = `
    <style>
      .context-menu-item {
        padding: 10px 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        color: #fff;
        font-size: 14px;
        user-select: none;
      }
      .context-menu-item:hover {
        background: rgba(255,255,255,0.1);
      }
    </style>
    <div class="context-menu-item" id="ctx-display">
      <span class="material-symbols-outlined" style="font-size:18px; color: var(--accent);">cast</span> Display on Student Screen
    </div>
  `;
  document.body.appendChild(menu);
  teacherState.customContextMenu = menu;

  const ctxDisplayBtn = document.getElementById('ctx-display');
  ctxDisplayBtn?.addEventListener('click', () => {
    const text = window.getSelection()?.toString().trim() || '';
    if (text) {
      sendTextToStudent('Highlighted Note', text);
      flashStatus('Displayed highlighted text to student screen');
    }
    if (teacherState.customContextMenu) {
      teacherState.customContextMenu.style.display = 'none';
    }
  });

  document.addEventListener('click', (e: MouseEvent) => {
    const activeMenu = teacherState.customContextMenu;
    if (
      activeMenu &&
      activeMenu.style.display !== 'none' &&
      e.target instanceof Node &&
      !activeMenu.contains(e.target)
    ) {
      activeMenu.style.display = 'none';
    }
  });
}

let contextMenuListenerInitialized = false;

export function setupContextMenuListener(): void {
  if (contextMenuListenerInitialized) return;
  contextMenuListenerInitialized = true;

  document.addEventListener('contextmenu', (e: MouseEvent) => {
    const selection = window.getSelection()?.toString().trim() || '';
    if (selection && !e.shiftKey) {
      e.preventDefault();
      createContextMenu();

      const activeMenu = teacherState.customContextMenu;
      if (!activeMenu) return;

      let x = e.clientX;
      let y = e.clientY;

      activeMenu.style.display = 'block';
      const rect = activeMenu.getBoundingClientRect();
      if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width;
      if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height;

      activeMenu.style.left = `${x}px`;
      activeMenu.style.top = `${y}px`;
    }
  });
}
