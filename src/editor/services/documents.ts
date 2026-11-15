import {
  editorState,
  getEditorContent,
  updateSaveStatus,
} from '../state';
import {
  getErrorMessage,
  isConflictError,
  isRecord,
  matchesClassId,
  matchesNoteId,
} from '../types';
import type { EditorDocument } from '../types';
import { getCodeViewHtml } from '../ui/codeView';
import {
  applyMergedEditorVersion as applyMergedVersionImpl,
  keepLocalEditorVersion as keepLocalVersionImpl,
  loadDocument,
  useLatestEditorVersion,
} from './documentLoader';
import {
  clearEditorDraft,
  openEditorConflict,
  persistEditorDraft,
} from './drafts';

export { loadDocument, useLatestEditorVersion };

export function initializeAutoSave(): void {
  if (editorState.autoSaveInterval) {
    clearInterval(editorState.autoSaveInterval);
  }

  editorState.autoSaveInterval = setInterval(() => {
    if (editorState.isDirty) {
      console.log('Auto-saving document...');
      void saveDocument();
    }
  }, 300000);
}

export async function saveDocument(): Promise<void> {
  const { editor, saveInProgress, pendingEditorConflict } = editorState;
  if (!editor || saveInProgress || pendingEditorConflict) return;
  editorState.saveInProgress = true;

  updateSaveStatus('Saving...');

  const codeViewHtml = getCodeViewHtml();
  if (codeViewHtml !== null) {
    editor.commands.setContent(codeViewHtml);
  }

  const content = getEditorContent();
  const savedChangeCounter = editorState.editorChangeCounter;

  try {
    if (editorState.isNoteMode && editorState.currentNoteId) {
      if (!window.BSTApi) throw new Error('API client unavailable');
      const saved = await window.BSTApi.saveEditorDocument('notes', editorState.currentNoteId, {
        expectedRevision: editorState.editorRevision,
        content,
      });
      if (typeof saved.revision === 'string') {
        editorState.editorRevision = saved.revision;
      }
      const savedDoc = isRecord(saved.document) ? (saved.document as EditorDocument) : null;
      if (savedDoc) {
        const noteIndex = editorState.allNotes.findIndex((note) =>
          matchesNoteId(note, editorState.currentNoteId),
        );
        if (noteIndex !== -1) editorState.allNotes[noteIndex] = savedDoc;
      }
    } else if (editorState.currentClassId) {
      if (!window.BSTApi) throw new Error('API client unavailable');
      if (editorState.generatedOutline && editorState.generatedOutline.length > 0) {
        editorState.editorDraftUpdates = {
          ...editorState.editorDraftUpdates,
          generatedOutline: editorState.generatedOutline,
        };
      }
      const savePayload: Record<string, unknown> = {
        expectedRevision: editorState.editorRevision,
        content,
        ...editorState.editorDraftUpdates,
      };
      if (Object.keys(editorState.editorDraftUpdates).length) persistEditorDraft();
      const saved = await window.BSTApi.saveEditorDocument(
        'classes',
        editorState.currentClassId,
        savePayload,
      );
      if (typeof saved.revision === 'string') {
        editorState.editorRevision = saved.revision;
      }
      const savedDoc = isRecord(saved.document) ? (saved.document as EditorDocument) : null;
      if (savedDoc) {
        const classIndex = editorState.allClasses.findIndex((cls) =>
          matchesClassId(cls, editorState.currentClassId),
        );
        if (classIndex !== -1) editorState.allClasses[classIndex] = savedDoc;
      }
    } else {
      editorState.currentDocument = {
        id: editorState.currentDocument?.id || 'general-content',
        title: document.getElementById('document-title')?.textContent || '',
        content,
        generatedOutline: editorState.generatedOutline || [],
        lastModified: new Date().toISOString(),
      };
      localStorage.setItem('bible-study-content', JSON.stringify(editorState.currentDocument));
    }

    if (editorState.editorChangeCounter === savedChangeCounter) {
      editorState.isDirty = false;
      editorState.editorDraftUpdates = {};
      clearEditorDraft();
      updateSaveStatus('Saved');
    } else {
      editorState.isDirty = true;
      persistEditorDraft();
      updateSaveStatus('Modified');
    }
  } catch (error: unknown) {
    if (isConflictError(error)) {
      editorState.isDirty = true;
      persistEditorDraft();
      updateSaveStatus('Conflict detected - compare versions');
      openEditorConflict({
        kind: 'conflict',
        localHtml: content.html,
        latestDocument: error.payload?.latestDocument ?? null,
        latestRevision: error.payload?.latestRevision ?? '',
        localUpdates: editorState.editorDraftUpdates,
      });
      return;
    }
    console.error('Save failed:', error);
    if (editorState.isDirty) persistEditorDraft();
    updateSaveStatus('Save failed: ' + getErrorMessage(error));
  } finally {
    editorState.saveInProgress = false;
  }
}

export async function saveEditorMetadata(updates: Record<string, unknown>): Promise<boolean> {
  const { editor, currentClassId, saveInProgress, pendingEditorConflict } = editorState;
  if (!editor || !currentClassId || saveInProgress || pendingEditorConflict) return false;
  editorState.saveInProgress = true;
  updateSaveStatus('Saving...');
  const codeViewHtml = getCodeViewHtml();
  if (codeViewHtml !== null) editor.commands.setContent(codeViewHtml);
  editorState.editorDraftUpdates = { ...editorState.editorDraftUpdates, ...updates };
  persistEditorDraft();
  const savedChangeCounter = editorState.editorChangeCounter;
  try {
    if (!window.BSTApi) throw new Error('API client unavailable');
    const saved = await window.BSTApi.saveEditorDocument('classes', currentClassId, {
      expectedRevision: editorState.editorRevision,
      content: getEditorContent(),
      ...updates,
    });
    if (typeof saved.revision === 'string') {
      editorState.editorRevision = saved.revision;
    }
    const savedDoc = isRecord(saved.document) ? (saved.document as EditorDocument) : null;
    if (savedDoc) {
      const classIndex = editorState.allClasses.findIndex((cls) =>
        matchesClassId(cls, currentClassId),
      );
      if (classIndex !== -1) editorState.allClasses[classIndex] = savedDoc;
    }

    if (editorState.editorChangeCounter === savedChangeCounter) {
      editorState.isDirty = false;
      editorState.editorDraftUpdates = {};
      clearEditorDraft();
      updateSaveStatus('Saved');
    } else {
      editorState.isDirty = true;
      persistEditorDraft();
      updateSaveStatus('Modified');
    }
    return true;
  } catch (error: unknown) {
    if (isConflictError(error)) {
      editorState.isDirty = true;
      editorState.editorDraftUpdates = { ...editorState.editorDraftUpdates, ...updates };
      persistEditorDraft();
      updateSaveStatus('Conflict detected - compare versions');
      openEditorConflict({
        kind: 'conflict',
        localHtml: editor.getHTML(),
        latestDocument: error.payload?.latestDocument ?? null,
        latestRevision: error.payload?.latestRevision ?? '',
        localUpdates: updates,
      });
      return false;
    }
    console.error('Editor metadata save failed:', error);
    editorState.isDirty = true;
    editorState.editorChangeCounter += 1;
    persistEditorDraft();
    updateSaveStatus('Save failed: ' + getErrorMessage(error));
    return false;
  } finally {
    editorState.saveInProgress = false;
  }
}

export function keepLocalEditorVersion(): Promise<void> {
  return keepLocalVersionImpl(saveDocument, saveEditorMetadata);
}

export function applyMergedEditorVersion(): Promise<void> {
  return applyMergedVersionImpl(saveDocument, saveEditorMetadata);
}
