import { editorState, updateSaveStatus } from '../state';
import { getHtmlText, isRecord } from '../types';
import type { EditorConflictState, EditorDocument, EditorDraft } from '../types';
import { getCodeViewHtml } from '../ui/codeView';
import { openModal } from '../ui/modals';

export function getEditorDraftKey(): string {
  const docType = editorState.isNoteMode
    ? 'notes'
    : editorState.currentClassId
      ? 'classes'
      : 'local';
  const recordId = editorState.currentNoteId || editorState.currentClassId || 'general-content';
  return `bst-editor-draft:${docType}:${encodeURIComponent(recordId)}`;
}

export function markEditorDirty(): void {
  editorState.isDirty = true;
  editorState.editorChangeCounter += 1;
  updateSaveStatus('Modified');
  scheduleEditorDraftSave();
}

export function scheduleEditorDraftSave(): void {
  if (editorState.draftSaveTimeout) {
    clearTimeout(editorState.draftSaveTimeout);
  }
  editorState.draftSaveTimeout = window.setTimeout(persistEditorDraft, 400);
}

export function persistEditorDraft(): void {
  const { editor, isDirty, editorDraftUpdates } = editorState;
  if (!editor || (!isDirty && !Object.keys(editorDraftUpdates).length)) return;
  if (editorState.draftSaveTimeout) {
    clearTimeout(editorState.draftSaveTimeout);
    editorState.draftSaveTimeout = null;
  }

  try {
    localStorage.setItem(
      getEditorDraftKey(),
      JSON.stringify({
        html: getCodeViewHtml() ?? editor.getHTML(),
        revision: editorState.editorRevision,
        updates: editorDraftUpdates,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error: unknown) {
    console.error('Could not preserve the local editor draft:', error);
    updateSaveStatus('Warning: local draft could not be stored');
  }
}

export function clearEditorDraft(): void {
  try {
    localStorage.removeItem(getEditorDraftKey());
  } catch (error: unknown) {
    console.error('Could not clear the saved local editor draft:', error);
  }
}

export function openEditorConflict({
  kind,
  localHtml,
  latestDocument,
  latestRevision,
  localUpdates = {},
}: EditorConflictState): void {
  const latestHtml = latestDocument?.content?.html || '';
  editorState.pendingEditorConflict = {
    kind,
    localHtml,
    latestDocument,
    latestRevision,
    localUpdates,
  };

  const conflictMsg = document.getElementById('editor-conflict-message');
  if (conflictMsg) {
    conflictMsg.textContent =
      kind === 'draft'
        ? 'A saved local draft was found. Compare it with the latest server version before choosing what to continue with.'
        : 'Another session saved this document after you opened it. Your changes are still here and have not been overwritten.';
  }

  const pendingSettings = Object.keys(localUpdates).length
    ? `\n\nPending class settings:\n${JSON.stringify(localUpdates, null, 2)}`
    : '';

  const localEl = document.getElementById('editor-conflict-local');
  if (localEl) {
    localEl.textContent = `${getHtmlText(localHtml)}${pendingSettings}`;
  }

  const latestEl = document.getElementById('editor-conflict-latest');
  if (latestEl) {
    latestEl.textContent = getHtmlText(latestHtml);
  }

  const mergeEl = document.getElementById('editor-conflict-merge');
  if (mergeEl instanceof HTMLTextAreaElement || mergeEl instanceof HTMLInputElement) {
    mergeEl.value = localHtml;
  }

  const keepLocalBtn = document.getElementById('btn-conflict-keep-local');
  if (keepLocalBtn) {
    keepLocalBtn.textContent = kind === 'draft' ? 'Restore my draft' : 'Keep my version and save';
  }

  openModal('editor-conflict-modal');
}

export function checkForLocalEditorDraft(latestDocument: EditorDocument | null): void {
  let draft: EditorDraft | null = null;
  try {
    const stored = localStorage.getItem(getEditorDraftKey());
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isRecord(parsed)) {
        draft = parsed as unknown as EditorDraft;
      }
    }
  } catch (error: unknown) {
    console.error('Could not read the saved local editor draft:', error);
    updateSaveStatus('Warning: local draft could not be read');
    return;
  }

  if (!draft || typeof draft.html !== 'string') return;
  const latestHtml = latestDocument?.content?.html || '';
  if (draft.html !== latestHtml || Object.keys(draft.updates || {}).length) {
    openEditorConflict({
      kind: 'draft',
      localHtml: draft.html,
      latestDocument,
      latestRevision: editorState.editorRevision,
      localUpdates: draft.updates || {},
    });
  } else {
    clearEditorDraft();
  }
}
