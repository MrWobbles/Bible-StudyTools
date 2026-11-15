import {
  closeModal,
  editorState,
  getEditorContent,
  setEditorContent,
  updateSaveStatus,
} from '../state';
import {
  getErrorMessage,
  isConflictError,
  isRecord,
  matchesClassId,
  matchesNoteId,
  normalizeClassesData,
} from '../types';
import type { EditorDocument } from '../types';
import { getCodeViewHtml } from '../ui/codeView';
import {
  updateOutlineNavigator,
  updateOutlineNavigatorFromGenerated,
} from '../ui/outlinePanel';
import {
  checkForLocalEditorDraft,
  clearEditorDraft,
  markEditorDirty,
  openEditorConflict,
  persistEditorDraft,
} from './drafts';
import { renderEditorMediaSidebar } from './mediaSidebar';
import { getNoteStarterTemplate, getSampleContent, getStarterTemplate } from './templates';

export function initializeAutoSave(): void {
  if (editorState.autoSaveInterval) {
    clearInterval(editorState.autoSaveInterval);
  }

  editorState.autoSaveInterval = setInterval(() => {
    if (editorState.isDirty) {
      console.log('Auto-saving document...');
      void saveDocument();
    }
  }, 300000); // Auto-save every 5 minutes

  console.log('Auto-save initialized: will save every 5 minutes if changes are detected.');
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
          matchesNoteId(note, editorState.currentNoteId)
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
        savePayload
      );
      if (typeof saved.revision === 'string') {
        editorState.editorRevision = saved.revision;
      }
      const savedDoc = isRecord(saved.document) ? (saved.document as EditorDocument) : null;
      if (savedDoc) {
        const classIndex = editorState.allClasses.findIndex((cls) =>
          matchesClassId(cls, editorState.currentClassId)
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
        matchesClassId(cls, currentClassId)
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

export async function keepLocalEditorVersion(): Promise<void> {
  if (!editorState.pendingEditorConflict) return;
  const conflict = editorState.pendingEditorConflict;
  editorState.pendingEditorConflict = null;
  closeModal('editor-conflict-modal');
  if (conflict.kind === 'draft') {
    setEditorContent(conflict.localHtml);
  }
  editorState.editorRevision = conflict.latestRevision;
  editorState.editorDraftUpdates = { ...conflict.localUpdates };
  markEditorDirty();
  if (Object.keys(conflict.localUpdates).length) {
    await saveEditorMetadata(conflict.localUpdates);
  } else {
    await saveDocument();
  }
}

export function useLatestEditorVersion(): void {
  if (!editorState.pendingEditorConflict) return;
  const conflict = editorState.pendingEditorConflict;
  editorState.pendingEditorConflict = null;
  setEditorContent(
    conflict.latestDocument?.content?.json || conflict.latestDocument?.content?.html || '<p></p>'
  );
  editorState.editorRevision = conflict.latestRevision;
  if (editorState.isNoteMode && conflict.latestDocument) {
    const noteIndex = editorState.allNotes.findIndex((note) =>
      matchesNoteId(note, editorState.currentNoteId)
    );
    if (noteIndex !== -1) editorState.allNotes[noteIndex] = conflict.latestDocument;
  } else if (editorState.currentClassId && conflict.latestDocument) {
    const classIndex = editorState.allClasses.findIndex((cls) =>
      matchesClassId(cls, editorState.currentClassId)
    );
    if (classIndex !== -1) editorState.allClasses[classIndex] = conflict.latestDocument;
    editorState.generatedOutline = conflict.latestDocument.generatedOutline || null;
  }
  editorState.isDirty = false;
  editorState.editorDraftUpdates = {};
  clearEditorDraft();
  closeModal('editor-conflict-modal');
  updateSaveStatus('Saved');
  updateOutlineNavigator();
}

export async function applyMergedEditorVersion(): Promise<void> {
  if (!editorState.pendingEditorConflict) return;
  const conflict = editorState.pendingEditorConflict;
  const mergeEl = document.getElementById('editor-conflict-merge');
  const mergedHtml =
    mergeEl instanceof HTMLTextAreaElement || mergeEl instanceof HTMLInputElement
      ? mergeEl.value
      : '';
  editorState.pendingEditorConflict = null;
  closeModal('editor-conflict-modal');
  setEditorContent(mergedHtml);
  editorState.editorRevision = conflict.latestRevision;
  markEditorDirty();
  if (Object.keys(conflict.localUpdates).length) {
    await saveEditorMetadata(conflict.localUpdates);
  } else {
    await saveDocument();
  }
}

export async function loadDocument(onLoaded?: () => void): Promise<void> {
  try {
    let loadedEditorDocument: EditorDocument | null = null;
    if (editorState.isNoteMode && editorState.currentNoteId) {
      if (!window.BSTApi) throw new Error('API client unavailable');
      const [data, versioned] = await Promise.all([
        window.BSTApi.getNotes(),
        window.BSTApi.getEditorDocument('notes', editorState.currentNoteId),
      ]);
      editorState.allNotes =
        isRecord(data) && Array.isArray(data.notes) ? (data.notes as EditorDocument[]) : [];
      const versionedDoc = isRecord(versioned.document)
        ? (versioned.document as EditorDocument)
        : null;
      if (versionedDoc) {
        const noteIndex = editorState.allNotes.findIndex((note) =>
          matchesNoteId(note, editorState.currentNoteId)
        );
        if (noteIndex !== -1) editorState.allNotes[noteIndex] = versionedDoc;
      }
      loadedEditorDocument = versionedDoc;
      editorState.editorRevision = typeof versioned.revision === 'string' ? versioned.revision : '';
      const note = loadedEditorDocument;
      if (note) {
        const docTitleEl = document.getElementById('document-title');
        if (docTitleEl) docTitleEl.textContent = note.title || 'Note';

        if (note.content && (note.content.json || note.content.html)) {
          setEditorContent(note.content.json || note.content.html || '');
        } else {
          setEditorContent(getNoteStarterTemplate(note));
        }
      } else {
        setEditorContent('<p>Note not found. Creating new content...</p>');
      }
    } else if (editorState.currentClassId) {
      if (!window.BSTApi) throw new Error('API client unavailable');
      const [data, versioned] = await Promise.all([
        window.BSTApi.getClasses(),
        window.BSTApi.getEditorDocument('classes', editorState.currentClassId),
      ]);
      editorState.allClasses = normalizeClassesData(data);
      const versionedDoc = isRecord(versioned.document)
        ? (versioned.document as EditorDocument)
        : null;
      if (versionedDoc) {
        const classIndex = editorState.allClasses.findIndex((cls) =>
          matchesClassId(cls, editorState.currentClassId)
        );
        if (classIndex !== -1) editorState.allClasses[classIndex] = versionedDoc;
      }
      loadedEditorDocument = versionedDoc;
      editorState.editorRevision = typeof versioned.revision === 'string' ? versioned.revision : '';

      const cls = loadedEditorDocument;
      if (cls) {
        const docTitleEl = document.getElementById('document-title');
        if (docTitleEl) docTitleEl.textContent = cls.title || 'Class Content';

        if (cls.content && (cls.content.json || cls.content.html)) {
          setEditorContent(cls.content.json || cls.content.html || '');
        } else {
          setEditorContent(getStarterTemplate(cls));
        }

        if (cls.generatedOutline) {
          editorState.generatedOutline = cls.generatedOutline;
          console.log('[Editor] Loaded generatedOutline:', editorState.generatedOutline);
        }

        renderEditorMediaSidebar(cls);
      } else {
        setEditorContent('<p>Class not found. Creating new content...</p>');
        renderEditorMediaSidebar(null);
      }
    } else {
      const saved = localStorage.getItem('bible-study-content');

      if (saved) {
        editorState.currentDocument = JSON.parse(saved) as EditorDocument;
        setEditorContent(
          editorState.currentDocument.content?.json ||
            editorState.currentDocument.content?.html ||
            '<p></p>'
        );
        loadedEditorDocument = editorState.currentDocument;
      } else {
        setEditorContent(getSampleContent());
        loadedEditorDocument = { content: { html: editorState.editor ? editorState.editor.getHTML() : '' } };
      }

      renderEditorMediaSidebar(null);
    }

    if (
      !editorState.isNoteMode &&
      editorState.generatedOutline &&
      editorState.generatedOutline.length > 0
    ) {
      updateOutlineNavigatorFromGenerated(editorState.generatedOutline);
    } else {
      updateOutlineNavigator();
    }
    editorState.isDirty = false;
    checkForLocalEditorDraft(loadedEditorDocument);
    if (!editorState.pendingEditorConflict) updateSaveStatus('Saved');
    onLoaded?.();
  } catch (error: unknown) {
    console.error('Load failed:', error);
    setEditorContent('<p>Failed to load content. Start editing here...</p>');
    renderEditorMediaSidebar(null);
  }
}
