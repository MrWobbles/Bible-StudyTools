import type {
  AdminClassConfig,
  LessonPlan,
  NoteItem,
  SaveResultPayload,
} from './types';

export interface AdminState {
  allLessonPlans: LessonPlan[];
  allClasses: AdminClassConfig[];
  allNotes: NoteItem[];
  currentLessonPlan: number | null;
  currentClass: number | null;
  currentNote: number | null;
  currentMediaIndex: number | null;
  currentSectionIndex: number | null;
}

export const adminState: AdminState = {
  allLessonPlans: [],
  allClasses: [],
  allNotes: [],
  currentLessonPlan: null,
  currentClass: null,
  currentNote: null,
  currentMediaIndex: null,
  currentSectionIndex: null,
};

export const ADMIN_AUTOSAVE_DELAY_MS = 3000;

let toastTimeout: ReturnType<typeof setTimeout> | undefined;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export function getEl(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function getInput(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

export function getTextArea(id: string): HTMLTextAreaElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLTextAreaElement ? el : null;
}

export function getSelect(id: string): HTMLSelectElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLSelectElement ? el : null;
}

export function getAnchor(id: string): HTMLAnchorElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLAnchorElement ? el : null;
}

export function generateGUID(): string {
  return 'class-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

export function generateNoteGUID(): string {
  return 'note-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

export function getLessonPlanIdentifier(plan: LessonPlan | null | undefined): string {
  if (!plan || typeof plan !== 'object') {
    return '';
  }
  return String(plan.id || plan.planId || '').trim();
}

export function getNoteIdentifier(note: NoteItem | null | undefined): string {
  if (!note || typeof note !== 'object') {
    return '';
  }
  return String(note.id || note.noteId || '').trim();
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m] ?? m);
}

export function showAdminSaveStatus(msg: string, isError = false, iconName = ''): void {
  let toast = getEl('admin-save-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'admin-save-toast';
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      padding: '10px 18px',
      borderRadius: '6px',
      fontSize: '13px',
      fontWeight: '600',
      color: '#fff',
      zIndex: '9999',
      opacity: '0',
      transition: 'opacity 0.3s ease',
      pointerEvents: 'none',
    });
    document.body.appendChild(toast);
  }

  if (iconName) {
    toast.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; margin-right: 6px;">${iconName}</span>${escapeHtml(String(msg || ''))}`;
  } else {
    toast.textContent = msg;
  }
  toast.style.background = isError ? '#c0392b' : '#27ae60';
  toast.style.opacity = '1';

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    if (toast) {
      toast.style.opacity = '0';
    }
  }, 2500);
}

export function showAdminSaveResult(
  itemLabel: string,
  result: SaveResultPayload | null | undefined
): void {
  if (result?.success) {
    showAdminSaveStatus(`${itemLabel} saved`, false, 'check_circle');
    return;
  }
  showAdminSaveStatus(`${itemLabel} save failed`, true, 'warning');
}

export async function postAdminSave(
  endpoint: string,
  payload: Record<string, unknown>,
  itemLabel: string
): Promise<void> {
  try {
    if (!window.BSTApi) {
      throw new Error('BSTApi is not available');
    }
    console.log(`Attempting API save to ${endpoint}...`);
    const response = await window.BSTApi.fetch(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      { requireAdmin: true }
    );

    console.log('API response status:', response.status, response.statusText);

    if (response.ok) {
      const rawResult: unknown = await response.json().catch(() => ({}));
      const result: SaveResultPayload = isRecord(rawResult) ? (rawResult as SaveResultPayload) : {};
      console.log(`[OK] ${itemLabel} saved successfully:`, result);
      showAdminSaveResult(itemLabel, result);
      return;
    }

    const errorText = await response.text();
    console.error('API error response:', errorText);
    throw new Error(`API error: ${response.status} - ${errorText}`);
  } catch (err: unknown) {
    console.error(`Failed to save ${itemLabel.toLowerCase()}:`, err);
    showAdminSaveStatus(`${itemLabel} save failed: ${getErrorMessage(err)}`, true, 'warning');
  }
}
