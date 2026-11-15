import type { Editor, JSONContent } from '@tiptap/core';
import type {
  CodeMirrorEditor,
  EditorConflictState,
  EditorContentPayload,
  EditorDocument,
  EditorMediaEntry,
} from './types';

export interface EditorRuntimeState {
  editor: Editor | null;
  currentDocument: EditorDocument | null;
  isDirty: boolean;
  editorRevision: string;
  editorChangeCounter: number;
  isApplyingEditorState: boolean;
  saveInProgress: boolean;
  draftSaveTimeout: number | null;
  pendingEditorConflict: EditorConflictState | null;
  editorDraftUpdates: Record<string, unknown>;
  currentClassId: string | null;
  currentNoteId: string | null;
  allClasses: EditorDocument[];
  allNotes: EditorDocument[];
  generatedOutline: OutlineSection[] | null;
  isNoteMode: boolean;
  isCodeView: boolean;
  editorMediaItems: EditorMediaEntry[];
  lastEditorInteractionAt: number;
  eventListenersInitialized: boolean;
  displayControlChannel: BroadcastChannel | null;
  displayControlChannelName: string;
  autoSaveInterval: ReturnType<typeof setInterval> | null;
  focusModeExitTimer: number | null;
  focusModeEscapeHandled: boolean;
  codeMirrorInstance: CodeMirrorEditor | null;
  selectedVersionHtml: string | null;
  currentSearchIndex: number;
}

export const editorState: EditorRuntimeState = {
  editor: null,
  currentDocument: null,
  isDirty: false,
  editorRevision: '',
  editorChangeCounter: 0,
  isApplyingEditorState: false,
  saveInProgress: false,
  draftSaveTimeout: null,
  pendingEditorConflict: null,
  editorDraftUpdates: {},
  currentClassId: null,
  currentNoteId: null,
  allClasses: [],
  allNotes: [],
  generatedOutline: null,
  isNoteMode: false,
  isCodeView: false,
  editorMediaItems: [],
  lastEditorInteractionAt: 0,
  eventListenersInitialized: false,
  displayControlChannel: null,
  displayControlChannelName: '',
  autoSaveInterval: null,
  focusModeExitTimer: null,
  focusModeEscapeHandled: false,
  codeMirrorInstance: null,
  selectedVersionHtml: null,
  currentSearchIndex: 0,
};

export function markEditorInteraction(): void {
  editorState.lastEditorInteractionAt = Date.now();
}

export function hasRecentEditorInteraction(): boolean {
  return Date.now() - editorState.lastEditorInteractionAt < 5000;
}

export function getEditorContent(): EditorContentPayload {
  const { editor } = editorState;
  if (!editor) {
    return {
      html: '',
      json: { type: 'doc', content: [] },
      text: '',
    };
  }
  return {
    html: editor.getHTML(),
    json: editor.getJSON(),
    text: editor.getText(),
  };
}

export function setEditorContent(content: string | JSONContent): void {
  if (!editorState.editor) return;
  editorState.isApplyingEditorState = true;
  try {
    editorState.editor.commands.setContent(content);
  } finally {
    editorState.isApplyingEditorState = false;
  }
}

export function updateSaveStatus(status: string): void {
  const statusEl = document.getElementById('save-status');
  if (statusEl) {
    statusEl.textContent = status;
    statusEl.className = 'save-status';

    if (status === 'Saved') {
      statusEl.classList.add('saved');
    } else if (status === 'Saving...') {
      statusEl.classList.add('saving');
    } else if (status === 'Modified') {
      statusEl.classList.add('modified');
    } else if (status.startsWith('Warning:') || status.startsWith('Conflict')) {
      statusEl.classList.add('warning');
    } else if (status.includes('failed')) {
      statusEl.classList.add('error');
    }
  }
}

export function closeModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }
}
