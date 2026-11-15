// Bible Study Rich Text Editor
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Strike from '@tiptap/extension-strike';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Underline from '@tiptap/extension-underline';
import { QAPauseMarker } from './extensions/qaPauseMarker';
import { handleEditorLinkClick } from './services/displayRouting';
import { initializeAutoSave, loadDocument } from './services/documents';
import { markEditorDirty, persistEditorDraft } from './services/drafts';
import { editorState, markEditorInteraction } from './state';
import { handleQAPauseClick, updateOutlineNavigator } from './ui/outlinePanel';
import { initSpeechTimeBox, updateSpeechTime } from './ui/speechTime';
import { setupEventListeners, updateToolbarActiveStates } from './ui/toolbar';

export type { VerseLookupThoughtState } from './types';
export { pasteClipboardTextIntoEditor } from './services/mediaSidebar';
export { extractText } from './ui/outlinePanel';

function initializeEditor(): void {
  const editorElement = document.querySelector('#editor');
  if (!editorElement) return;

  const editor = new Editor({
    element: editorElement,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        strike: false,
      }),
      Strike,
      TextStyle,
      Color,
      Underline,
      Highlight.configure({ multicolor: true }),
      Link.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            'data-verse': {
              default: null,
              parseHTML: (el: HTMLElement) => el.getAttribute('data-verse'),
              renderHTML: (attrs: Record<string, unknown>) =>
                attrs['data-verse'] ? { 'data-verse': attrs['data-verse'] } : {},
            },
          };
        },
      }).configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'editor-link',
          rel: 'noopener noreferrer',
        },
      }),
      Image.configure({
        inline: true,
        HTMLAttributes: {
          class: 'editor-image',
        },
      }),
      QAPauseMarker,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: '<p>Loading content...</p>',
    editorProps: {
      attributes: {
        class: 'prose',
      },
    },
    onUpdate: () => {
      if (!editorState.isApplyingEditorState) {
        markEditorDirty();
      }
      updateOutlineNavigator();
      updateSpeechTime();
    },
    onSelectionUpdate: ({ editor: updatedEditor }) => {
      updateToolbarActiveStates(updatedEditor);
      updateSpeechTime();
    },
  });

  editorState.editor = editor;
  window.editor = editor;
  initSpeechTimeBox();

  console.log('Editor initialized:', editor);

  const editorHost = document.getElementById('editor');
  if (!editorHost) return;

  editorHost.addEventListener('click', (e: MouseEvent) => {
    void handleEditorLinkClick(e);
  });

  editorHost.addEventListener('click', handleQAPauseClick);

  // Ensure clicks on empty editor chrome still place caret in the document.
  editorHost.addEventListener('mousedown', (e: MouseEvent) => {
    markEditorInteraction();

    if (e.button !== 0 || !editorState.editor || !(e.target instanceof Element)) {
      return;
    }

    const clickedEditable = e.target.closest('.ProseMirror, .tiptap, [contenteditable="true"]');
    if (!clickedEditable) {
      e.preventDefault();
      editorState.editor.commands.focus('end');
    }
  });

  // If a user right-clicks the empty editor area, focus the editor first so paste is available.
  editorHost.addEventListener('contextmenu', (e: MouseEvent) => {
    markEditorInteraction();

    if (!editorState.editor || !(e.target instanceof Element)) {
      return;
    }

    const clickedEditable = e.target.closest('.ProseMirror, .tiptap, [contenteditable="true"]');
    if (!clickedEditable) {
      editorState.editor.commands.focus('end');
    }
  });

  // Prevent navigating away when media tiles inside the editor are clicked
  editorHost.addEventListener('click', (e: MouseEvent) => {
    markEditorInteraction();

    if (!(e.target instanceof Element)) return;
    const mediaTile = e.target.closest('.editor-media-tile');
    if (mediaTile) {
      e.preventDefault();
    }
  });
}

export function showPreview(): void {
  const { editor } = editorState;
  if (!editor) return;
  const previewWindow = window.open('', 'Preview', 'width=800,height=600');
  if (!previewWindow) return;
  previewWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Preview</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
                h1, h2, h3, h4, h5, h6 { color: #333; }
                blockquote { border-left: 4px solid #ccc; padding-left: 16px; color: #666; }
                .verse-reference { color: #1976d2; text-decoration: none; font-weight: bold; }
            </style>
        </head>
        <body>
            ${editor.getHTML()}
        </body>
        </html>
    `);
}

function viewTeacher(): void {
  if (!editorState.currentClassId) {
    alert('No class selected. Please open this editor from a specific class.');
    return;
  }
  window.open(
    `teacher.html?class=${editorState.currentClassId}`,
    'TeacherView',
    'width=1200,height=800'
  );
}

window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  editorState.currentClassId = urlParams.get('class');
  editorState.currentNoteId = urlParams.get('note');
  editorState.isNoteMode = !!editorState.currentNoteId;

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  });

  initializeEditor();
  setupEventListeners(viewTeacher);
  void loadDocument(() => updateToolbarActiveStates(editorState.editor));
  initializeAutoSave();
  window.addEventListener('pagehide', persistEditorDraft);
  window.addEventListener('beforeunload', (event: BeforeUnloadEvent) => {
    if (!editorState.isDirty) return;
    persistEditorDraft();
    event.preventDefault();
    event.returnValue = '';
  });
});

// Export for debugging
window.editor = editorState.editor;
