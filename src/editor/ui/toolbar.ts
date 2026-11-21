import type { Editor } from '@tiptap/core';
import { closeModal, editorState } from '../state';
import {
  applyMergedEditorVersion,
  keepLocalEditorVersion,
  saveDocument,
  saveEditorMetadata,
  useLatestEditorVersion,
} from '../services/documents';
import { markEditorDirty } from '../services/drafts';
import { insertImage, setupMediaDropSupport } from '../services/mediaSidebar';
import {
  handleVerseLookupByThought,
  insertVerseReference,
  saveBibleTranslationSetting,
} from '../services/verseLookup';
import { openVersionHistory, restoreSelectedVersion } from '../services/versions';
import { askAIQuestion, copyAIResponse, openAIAssistant } from './aiAssistant';
import { toggleCodeView } from './codeView';
import { openModal } from './modals';
import {
  applyOutlineToClass,
  copyOutlineJSON,
  enhanceCurrentOutline,
  generateAndShowOutline,
  handleOutlineMethodChange,
  openOutlineModal,
} from './outlineModal';
import { insertQAPauseMarker } from './outlinePanel';
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  replaceAll,
  replaceOne,
  setupSearchReplaceListeners,
} from './searchReplace';
import { setEditorFocusMode, setupKeyboardAndPasteListeners } from './shortcuts';

export function updateToolbarActiveStates(ed: Editor | null): void {
  if (!ed) return;

  const actionChecks: Record<string, () => boolean> = {
    bold: () => ed.isActive('bold'),
    italic: () => ed.isActive('italic'),
    underline: () => ed.isActive('underline'),
    strike: () => ed.isActive('strike'),
    bulletList: () => ed.isActive('bulletList'),
    orderedList: () => ed.isActive('orderedList'),
    blockquote: () => ed.isActive('blockquote'),
    codeBlock: () => ed.isActive('codeBlock'),
  };

  document.querySelectorAll('.toolbar-btn[data-action]').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    const action = btn.dataset.action;
    if (action && actionChecks[action]) {
      btn.classList.toggle('is-active', actionChecks[action]());
    }
  });

  let headingLevel = 'paragraph';
  for (let level = 1; level <= 6; level++) {
    if (ed.isActive('heading', { level })) {
      headingLevel = `h${level}`;
      break;
    }
  }

  const mainSelect = document.getElementById('heading-select');
  if (mainSelect instanceof HTMLSelectElement) {
    mainSelect.value = headingLevel;
  }
}

function insertLink(): void {
  const { editor } = editorState;
  if (!editor) return;
  const linkTextEl = document.getElementById('link-text');
  const linkUrlEl = document.getElementById('link-url');
  const linkText = linkTextEl instanceof HTMLInputElement ? linkTextEl.value.trim() : '';
  const linkUrl = linkUrlEl instanceof HTMLInputElement ? linkUrlEl.value.trim() : '';

  if (!linkUrl) {
    alert('Please enter a URL');
    return;
  }

  if (linkText) {
    editor.chain().focus().insertContent(`<a href="${linkUrl}">${linkText}</a> `).run();
  } else {
    editor.chain().focus().setLink({ href: linkUrl }).run();
  }

  closeModal('link-modal');
  if (linkTextEl instanceof HTMLInputElement) linkTextEl.value = '';
  if (linkUrlEl instanceof HTMLInputElement) linkUrlEl.value = '';
}

function insertTable(): void {
  const { editor } = editorState;
  if (!editor) return;
  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
}

function handleToolbarAction(action: string): void {
  const { editor } = editorState;
  if (!editor) return;

  const actions: Record<string, () => void> = {
    bold: () => editor.chain().focus().toggleBold().run(),
    italic: () => editor.chain().focus().toggleItalic().run(),
    underline: () => editor.chain().focus().toggleUnderline().run(),
    strike: () => editor.chain().focus().toggleStrike().run(),
    bulletList: () => editor.chain().focus().toggleBulletList().run(),
    orderedList: () => editor.chain().focus().toggleOrderedList().run(),
    blockquote: () => editor.chain().focus().toggleBlockquote().run(),
    codeBlock: () => editor.chain().focus().toggleCodeBlock().run(),
    horizontalRule: () => editor.chain().focus().setHorizontalRule().run(),
    undo: () => editor.chain().focus().undo().run(),
    redo: () => editor.chain().focus().redo().run(),
    verseLink: () => openModal('verse-modal'),
    insertImage: () => openModal('image-modal'),
    insertTable: () => insertTable(),
    insertLink: () => openModal('link-modal'),
    insertQAPause: () => openModal('qa-pause-modal'),
  };

  if (actions[action]) {
    actions[action]();
  }
}

export function setupEventListeners(onViewTeacher: () => void): void {
  if (editorState.eventListenersInitialized) {
    return;
  }
  editorState.eventListenersInitialized = true;

  document.getElementById('btn-focus-mode')?.addEventListener('click', () => {
    setEditorFocusMode(!document.body.classList.contains('is-focus-mode'));
  });

  document.getElementById('btn-verse-lookup-thought')?.addEventListener('click', async () => {
    await handleVerseLookupByThought(openModal);
  });

  document.querySelectorAll('.toolbar-btn[data-action]').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    btn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      const action = btn.dataset.action;
      if (action) {
        handleToolbarAction(action);
      }
    });
  });

  document.getElementById('heading-select')?.addEventListener('change', (e: Event) => {
    const { editor } = editorState;
    if (!editor || !(e.target instanceof HTMLSelectElement)) return;
    const level = e.target.value;
    if (level === 'paragraph') {
      editor.chain().focus().setParagraph().run();
    } else {
      const headingLevel = parseInt(level.replace('h', ''), 10) as 1 | 2 | 3 | 4 | 5 | 6;
      editor.chain().focus().toggleHeading({ level: headingLevel }).run();
    }
  });

  document.getElementById('text-color')?.addEventListener('input', (e: Event) => {
    const { editor } = editorState;
    if (!editor || !(e.target instanceof HTMLInputElement)) return;
    editor.chain().focus().setColor(e.target.value).run();
  });

  document.getElementById('highlight-color')?.addEventListener('input', (e: Event) => {
    const { editor } = editorState;
    if (!editor || !(e.target instanceof HTMLInputElement)) return;
    editor.chain().focus().toggleHighlight({ color: e.target.value }).run();
  });

  document.getElementById('btn-save')?.addEventListener('click', () => {
    void saveDocument();
  });
  document.getElementById('btn-conflict-keep-local')?.addEventListener('click', () => {
    void keepLocalEditorVersion();
  });
  document
    .getElementById('btn-conflict-use-latest')
    ?.addEventListener('click', useLatestEditorVersion);
  document.getElementById('btn-conflict-apply-merge')?.addEventListener('click', () => {
    void applyMergedEditorVersion();
  });

  document.getElementById('btn-view-teacher')?.addEventListener('click', onViewTeacher);

  document.getElementById('btn-search')?.addEventListener('click', openSearchPanel);

  document.getElementById('btn-version-history')?.addEventListener('click', () => {
    void openVersionHistory();
  });
  document.getElementById('btn-version-restore')?.addEventListener('click', () => {
    void restoreSelectedVersion();
  });

  document.getElementById('btn-generate-outline')?.addEventListener('click', () => {
    void openOutlineModal();
  });

  document.querySelectorAll('.modal-close').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      if (modalId) {
        closeModal(modalId);
      }
    });
  });

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e: Event) => {
      if (e.target === modal) {
        if (modal.hasAttribute('data-no-dismiss')) return;
        closeModal(modal.id);
      }
    });
  });

  document.getElementById('btn-insert-verse')?.addEventListener('click', () => {
    void insertVerseReference();
  });
  document.getElementById('bible-translation-select')?.addEventListener('change', () => {
    void saveBibleTranslationSetting(saveEditorMetadata);
  });

  document.getElementById('btn-insert-image')?.addEventListener('click', () => {
    void insertImage();
  });

  document.getElementById('btn-insert-link')?.addEventListener('click', insertLink);
  document.getElementById('btn-insert-qa-pause')?.addEventListener('click', insertQAPauseMarker);

  document.getElementById('btn-find-prev')?.addEventListener('click', findPrevious);
  document.getElementById('btn-find-next')?.addEventListener('click', findNext);
  document.getElementById('btn-close-search')?.addEventListener('click', closeSearchPanel);
  document.getElementById('btn-replace')?.addEventListener('click', replaceOne);
  document.getElementById('btn-replace-all')?.addEventListener('click', replaceAll);
  setupSearchReplaceListeners();

  document.getElementById('btn-start-generation')?.addEventListener('click', () => {
    void generateAndShowOutline();
  });
  document.getElementById('btn-copy-outline')?.addEventListener('click', () => {
    void copyOutlineJSON();
  });
  document.getElementById('btn-apply-outline')?.addEventListener('click', () => {
    void applyOutlineToClass();
  });
  document.getElementById('btn-enhance-outline')?.addEventListener('click', () => {
    void enhanceCurrentOutline();
  });

  document.querySelectorAll('input[name="outline-method"]').forEach((radio) => {
    radio.addEventListener('change', handleOutlineMethodChange);
  });

  document.getElementById('btn-ai-assistant')?.addEventListener('click', () => {
    void openAIAssistant();
  });

  document.getElementById('btn-code-view')?.addEventListener('click', () => {
    toggleCodeView(markEditorDirty);
  });

  const codeTextarea = document.getElementById('editor-code-view');
  if (codeTextarea) {
    codeTextarea.addEventListener('input', () => {
      markEditorDirty();
    });
  }

  document.getElementById('btn-ask-ai')?.addEventListener('click', () => {
    void askAIQuestion();
  });
  document.getElementById('btn-copy-response')?.addEventListener('click', () => {
    void copyAIResponse();
  });

  document.querySelectorAll('.ai-suggestion-btn').forEach((btn) => {
    btn.addEventListener('click', (e: Event) => {
      if (!(e.target instanceof HTMLElement)) return;
      const question = e.target.dataset.question || '';
      const aiQuestionEl = document.getElementById('ai-question');
      if (
        aiQuestionEl instanceof HTMLInputElement ||
        aiQuestionEl instanceof HTMLTextAreaElement
      ) {
        aiQuestionEl.value = question;
      }
    });
  });

  setupKeyboardAndPasteListeners();
  setupMediaDropSupport();
}
