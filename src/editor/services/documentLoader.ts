import {
  closeModal,
  editorState,
  setEditorContent,
  updateSaveStatus,
} from '../state';
import { isRecord, matchesClassId, matchesNoteId, normalizeClassesData } from '../types';
import type { EditorDocument } from '../types';
import {
  updateOutlineNavigator,
  updateOutlineNavigatorFromGenerated,
} from '../ui/outlinePanel';
import {
  checkForLocalEditorDraft,
  clearEditorDraft,
  markEditorDirty,
} from './drafts';
import { renderEditorMediaSidebar } from './mediaSidebar';
import { getNoteStarterTemplate, getSampleContent, getStarterTemplate } from './templates';

export async function keepLocalEditorVersion(
  saveDocumentFn: () => Promise<void>,
  saveMetadataFn: (updates: Record<string, unknown>) => Promise<boolean>,
): Promise<void> {
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
    await saveMetadataFn(conflict.localUpdates);
  } else {
    await saveDocumentFn();
  }
}

export function useLatestEditorVersion(): void {
  if (!editorState.pendingEditorConflict) return;
  const conflict = editorState.pendingEditorConflict;
  editorState.pendingEditorConflict = null;
  setEditorContent(
    conflict.latestDocument?.content?.json ||
      conflict.latestDocument?.content?.html ||
      '<p></p>',
  );
  editorState.editorRevision = conflict.latestRevision;
  if (editorState.isNoteMode && conflict.latestDocument) {
    const noteIndex = editorState.allNotes.findIndex((note) =>
      matchesNoteId(note, editorState.currentNoteId),
    );
    if (noteIndex !== -1) editorState.allNotes[noteIndex] = conflict.latestDocument;
  } else if (editorState.currentClassId && conflict.latestDocument) {
    const classIndex = editorState.allClasses.findIndex((cls) =>
      matchesClassId(cls, editorState.currentClassId),
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

export async function applyMergedEditorVersion(
  saveDocumentFn: () => Promise<void>,
  saveMetadataFn: (updates: Record<string, unknown>) => Promise<boolean>,
): Promise<void> {
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
    await saveMetadataFn(conflict.localUpdates);
  } else {
    await saveDocumentFn();
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
          matchesNoteId(note, editorState.currentNoteId),
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
          matchesClassId(cls, editorState.currentClassId),
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
            '<p></p>',
        );
        loadedEditorDocument = editorState.currentDocument;
      } else {
        setEditorContent(getSampleContent());
        loadedEditorDocument = {
          content: { html: editorState.editor ? editorState.editor.getHTML() : '' },
        };
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
