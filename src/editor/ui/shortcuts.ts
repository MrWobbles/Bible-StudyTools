import {
  closeModal,
  editorState,
  hasRecentEditorInteraction,
  markEditorInteraction,
} from '../state';
import { saveDocument } from '../services/documents';
import { isEditorTarget } from '../services/mediaSidebar';
import { fetchVerseText, handleVerseLookupByThought } from '../services/verseLookup';
import { openModal } from './modals';
import { openSearchPanel } from './searchReplace';

export function setEditorFocusMode(enabled: boolean): void {
  const focusModeButton = document.getElementById('btn-focus-mode');
  document.body.classList.toggle('is-focus-mode', enabled);
  if (focusModeButton) {
    focusModeButton.setAttribute('aria-pressed', String(enabled));
  }

  if (enabled) {
    editorState.editor?.commands.focus();
  } else if (focusModeButton instanceof HTMLElement) {
    focusModeButton.focus();
  }
}

function isNativeTextInputTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) {
    return false;
  }

  return !!target.closest('input, textarea, [contenteditable="true"], select');
}

function shouldRoutePasteToEditor(target: EventTarget | null): boolean {
  const active = document.activeElement;

  if (isEditorTarget(target) || isEditorTarget(active)) {
    return false;
  }

  const hasOpenModal = !!document.querySelector('.modal.is-open');
  if (hasOpenModal) {
    return false;
  }

  if (isNativeTextInputTarget(active) && !isEditorTarget(active)) {
    return false;
  }

  return hasRecentEditorInteraction();
}

export function setupKeyboardAndPasteListeners(): void {
  document.addEventListener('keydown', async (e: KeyboardEvent) => {
    const { editor } = editorState;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void saveDocument();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openSearchPanel();
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (editor) {
        const selection = editor.state.selection;
        if (selection && !selection.empty) {
          const selectedText = editor.state.doc.textBetween(selection.from, selection.to, ' ');
          const verseInput = document.getElementById('verse-input');
          if (verseInput instanceof HTMLInputElement) {
            verseInput.value = selectedText;
          }
        }
      }
      openModal('verse-modal');
    }

    if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      openModal('image-modal');
    }

    if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
      if (editor) {
        const selection = editor.state.selection;
        if (selection && !selection.empty) {
          const from = selection.from;
          const to = selection.to;
          const verseAddress = editor.state.doc.textBetween(from, to, ' ');
          if (verseAddress && verseAddress.trim().length > 0) {
            let translation = 'nkjv';
            const select = document.getElementById('bible-translation-select');
            if (select instanceof HTMLSelectElement) {
              translation = select.value;
            }
            const verseData = await fetchVerseText(verseAddress.trim(), translation);
            if (verseData && verseData.text) {
              editor.chain().focus().insertContentAt(to, ` <em>${verseData.text}</em> `).run();
            } else {
              editor.chain().focus().insertContentAt(to, ' [Verse text not available] ').run();
            }
          }
        }
      }
    }

    if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      await handleVerseLookupByThought(openModal);
    }

    if (e.key === 'Escape') {
      if (editorState.pendingEditorConflict) {
        e.preventDefault();
        return;
      }
      if (document.body.classList.contains('is-focus-mode')) {
        e.preventDefault();
        if (editorState.focusModeExitTimer === null) {
          editorState.focusModeExitTimer = window.setTimeout(() => {
            editorState.focusModeExitTimer = null;
            editorState.focusModeEscapeHandled = true;
            setEditorFocusMode(false);
          }, 2000);
        }
        return;
      }
      if (editorState.focusModeEscapeHandled) {
        e.preventDefault();
        return;
      }
      const openModalElement = document.querySelector('.modal.is-open');
      if (openModalElement?.id) {
        closeModal(openModalElement.id);
      }
    }
  });

  document.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (editorState.focusModeExitTimer !== null) {
      window.clearTimeout(editorState.focusModeExitTimer);
      editorState.focusModeExitTimer = null;
    }
    editorState.focusModeEscapeHandled = false;
  });

  window.addEventListener('blur', () => {
    if (editorState.focusModeExitTimer !== null) {
      window.clearTimeout(editorState.focusModeExitTimer);
      editorState.focusModeExitTimer = null;
    }
    editorState.focusModeEscapeHandled = false;
  });

  document.addEventListener('paste', (e: ClipboardEvent) => {
    const { editor } = editorState;
    if (!shouldRoutePasteToEditor(e.target) || !editor) {
      return;
    }

    const text = e.clipboardData?.getData('text/plain');
    if (typeof text !== 'string') {
      return;
    }

    e.preventDefault();
    editor.chain().focus().insertContent(text).run();
    markEditorInteraction();
  });
}
