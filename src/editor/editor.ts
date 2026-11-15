// Bible Study Rich Text Editor
import { Editor, Node, mergeAttributes } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
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

interface QAPauseAttributes {
  sectionId?: string | null;
  sectionTitle?: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    qaPauseMarker: {
      insertQAPause: (attributes: QAPauseAttributes) => ReturnType;
    };
  }
}

interface EditorContentPayload {
  html: string;
  json: JSONContent;
  text: string;
}

interface EditorDocumentContent {
  html?: string;
  json?: JSONContent;
  text?: string;
}

interface EditorDocument {
  id?: string;
  noteId?: string;
  classNumber?: string | number;
  title?: string;
  subtitle?: string;
  channelName?: string;
  bibleTranslation?: string;
  content?: EditorDocumentContent;
  generatedOutline?: OutlineSection[];
  outline?: OutlineSection[];
  media?: MediaItem[];
  lastModified?: string;
  [key: string]: unknown;
}

interface EditorDraft {
  html: string;
  revision?: string;
  updates?: Record<string, unknown>;
  updatedAt?: string;
}

type ConflictKind = 'draft' | 'conflict';

interface EditorConflictState {
  kind: ConflictKind;
  localHtml: string;
  latestDocument: EditorDocument | null;
  latestRevision: string;
  localUpdates: Record<string, unknown>;
}

interface VerseLookupResult {
  reference: string;
  text: string;
}

export interface VerseLookupThoughtState {
  from: number;
  to: number;
  verses: VerseLookupResult[];
}

interface FetchedVerseData {
  title: string;
  text: string;
  translation: string;
}

interface EditorMediaEntry extends MediaItem {
  reference?: string;
  prompt?: string;
  __editorMediaId: string;
}

interface VersionDocTarget {
  docType: 'notes' | 'classes';
  recordId: string;
}

interface EditorVersionSummary {
  seq: string | number;
  createdAt?: string;
  kind?: string;
  bytes?: number;
}

interface HeadingEntry {
  level: number;
  text: string;
}

interface CodeMirrorEditor {
  getValue: () => string;
  setValue: (value: string) => void;
  getWrapperElement: () => HTMLElement;
  refresh: () => void;
  toTextArea: () => void;
  on: (event: string, handler: () => void) => void;
}

interface ConflictErrorShape {
  status: number;
  payload?: {
    latestDocument?: EditorDocument;
    latestRevision?: string;
  };
}

interface LabsBibleVerseItem {
  verse: string | number;
  text: string;
}

interface BibleApiSimpleResponse {
  text?: string;
  reference?: string;
  translation_name?: string;
}

interface ApiBibleItem {
  id?: string;
  abbreviation?: string;
  abbreviationLocal?: string;
  name?: string;
}

interface ApiBiblePassage {
  content?: string;
  reference?: string;
}

interface InstalledModelEntry {
  name: string;
  size: number;
}

// Custom Q&A Pause Marker Node Extension
const QAPauseMarker = Node.create({
  name: 'qaPauseMarker',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      sectionId: {
        default: null,
      },
      sectionTitle: {
        default: 'Discussion Questions',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.qa-pause-marker',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: 'qa-pause-marker',
        'data-section-id': node.attrs.sectionId,
        'data-section-title': node.attrs.sectionTitle,
      }),
      [
        'div',
        { class: 'qa-pause-icon' },
        [
          'span',
          { class: 'material-symbols-outlined' },
          'forum',
        ],
      ],
      [
        'div',
        { class: 'qa-pause-content' },
        [
          'div',
          { class: 'qa-pause-title' },
          'Pause for Q&A',
        ],
        [
          'div',
          { class: 'qa-pause-subtitle' },
          node.attrs.sectionTitle,
        ],
      ],
    ];
  },

  addCommands() {
    return {
      insertQAPause:
        (attributes: QAPauseAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },
});

let editor: Editor | null = null;
let currentDocument: EditorDocument | null = null;
let isDirty = false;
let editorRevision = '';
let editorChangeCounter = 0;
let isApplyingEditorState = false;
let saveInProgress = false;
let draftSaveTimeout: number | null = null;
let pendingEditorConflict: EditorConflictState | null = null;
let editorDraftUpdates: Record<string, unknown> = {};
let currentClassId: string | null = null; // Can be either GUID or legacy classNumber
let currentNoteId: string | null = null; // Note ID when editing notes
let allClasses: EditorDocument[] = [];
let allNotes: EditorDocument[] = [];
let generatedOutline: OutlineSection[] | null = null; // Stores the generated outline from the outline generator
let isNoteMode = false; // Flag to track if we're editing a note
let isCodeView = false; // Flag to track if we're in code view
let editorMediaItems: EditorMediaEntry[] = [];
let lastEditorInteractionAt = 0;
let eventListenersInitialized = false;
let displayControlChannel: BroadcastChannel | null = null;
let displayControlChannelName = '';
let autoSaveInterval: ReturnType<typeof setInterval> | null = null;
let focusModeExitTimer: number | null = null;
let focusModeEscapeHandled = false;
let codeMirrorInstance: CodeMirrorEditor | null = null;
let selectedVersionHtml: string | null = null;
let currentSearchIndex = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

function isConflictError(error: unknown): error is ConflictErrorShape {
  return (
    isRecord(error) &&
    error.status === 409 &&
    isRecord(error.payload) &&
    'latestDocument' in error.payload &&
    error.payload.latestDocument !== undefined
  );
}

function matchesClassId(cls: EditorDocument, classId: string | null): boolean {
  if (!classId) return false;
  return cls.id === classId || (cls.classNumber !== undefined && String(cls.classNumber) === classId);
}

function matchesNoteId(note: EditorDocument, noteId: string | null): boolean {
  if (!noteId) return false;
  return note.id === noteId || note.noteId === noteId;
}

function toOutlineEditorAdapter(ed: Editor): OutlineEditorAdapter {
  return {
    getJSON: () => ed.getJSON() as TipTapJsonNode,
    getHTML: () => ed.getHTML(),
    getText: () => ed.getText(),
  };
}

// Initialize editor on page load
window.addEventListener('DOMContentLoaded', () => {
  // Get class ID or note ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  currentClassId = urlParams.get('class');
  currentNoteId = urlParams.get('note');
  isNoteMode = !!currentNoteId;

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  });

  initializeEditor();
  setupEventListeners();
  void loadDocument();
  initializeAutoSave();
  window.addEventListener('pagehide', persistEditorDraft);
  window.addEventListener('beforeunload', (event: BeforeUnloadEvent) => {
    if (!isDirty) return;
    persistEditorDraft();
    event.preventDefault();
    event.returnValue = '';
  });
});

// Auto-save functionality
function initializeAutoSave(): void {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
  }

  autoSaveInterval = setInterval(() => {
    if (isDirty) {
      console.log('Auto-saving document...');
      void saveDocument();
    }
  }, 300000); // Auto-save every 5 minutes

  console.log('Auto-save initialized: will save every 5 minutes if changes are detected.');
}

function getEditorDraftKey(): string {
  const docType = isNoteMode ? 'notes' : currentClassId ? 'classes' : 'local';
  const recordId = currentNoteId || currentClassId || 'general-content';
  return `bst-editor-draft:${docType}:${encodeURIComponent(recordId)}`;
}

function getCodeViewHtml(): string | null {
  if (!isCodeView) return null;
  const codeTextarea = document.getElementById('editor-code-view');
  if (codeMirrorInstance && typeof codeMirrorInstance.getValue === 'function') {
    return codeMirrorInstance.getValue();
  }
  if (codeTextarea instanceof HTMLTextAreaElement) {
    return codeTextarea.value;
  }
  return editor ? editor.getHTML() : null;
}

function getEditorContent(): EditorContentPayload {
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

function markEditorDirty(): void {
  isDirty = true;
  editorChangeCounter += 1;
  updateSaveStatus('Modified');
  scheduleEditorDraftSave();
}

function scheduleEditorDraftSave(): void {
  if (draftSaveTimeout) {
    clearTimeout(draftSaveTimeout);
  }
  draftSaveTimeout = window.setTimeout(persistEditorDraft, 400);
}

function persistEditorDraft(): void {
  if (!editor || (!isDirty && !Object.keys(editorDraftUpdates).length)) return;
  if (draftSaveTimeout) {
    clearTimeout(draftSaveTimeout);
    draftSaveTimeout = null;
  }

  try {
    localStorage.setItem(
      getEditorDraftKey(),
      JSON.stringify({
        html: getCodeViewHtml() ?? editor.getHTML(),
        revision: editorRevision,
        updates: editorDraftUpdates,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error: unknown) {
    console.error('Could not preserve the local editor draft:', error);
    updateSaveStatus('Warning: local draft could not be stored');
  }
}

function clearEditorDraft(): void {
  try {
    localStorage.removeItem(getEditorDraftKey());
  } catch (error: unknown) {
    console.error('Could not clear the saved local editor draft:', error);
  }
}

function setEditorContent(content: string | JSONContent): void {
  if (!editor) return;
  isApplyingEditorState = true;
  try {
    editor.commands.setContent(content);
  } finally {
    isApplyingEditorState = false;
  }
}

function getHtmlText(html: string): string {
  const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
  return parsed.body.textContent || '';
}

function openEditorConflict({
  kind,
  localHtml,
  latestDocument,
  latestRevision,
  localUpdates = {},
}: EditorConflictState): void {
  const latestHtml = latestDocument?.content?.html || '';
  pendingEditorConflict = { kind, localHtml, latestDocument, latestRevision, localUpdates };

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

function checkForLocalEditorDraft(latestDocument: EditorDocument | null): void {
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
      latestRevision: editorRevision,
      localUpdates: draft.updates || {},
    });
  } else {
    clearEditorDraft();
  }
}

async function keepLocalEditorVersion(): Promise<void> {
  if (!pendingEditorConflict) return;
  const conflict = pendingEditorConflict;
  pendingEditorConflict = null;
  closeModal('editor-conflict-modal');
  if (conflict.kind === 'draft') {
    setEditorContent(conflict.localHtml);
  }
  editorRevision = conflict.latestRevision;
  editorDraftUpdates = { ...conflict.localUpdates };
  markEditorDirty();
  if (Object.keys(conflict.localUpdates).length) {
    await saveEditorMetadata(conflict.localUpdates);
  } else {
    await saveDocument();
  }
}

function useLatestEditorVersion(): void {
  if (!pendingEditorConflict) return;
  const conflict = pendingEditorConflict;
  pendingEditorConflict = null;
  setEditorContent(
    conflict.latestDocument?.content?.json || conflict.latestDocument?.content?.html || '<p></p>'
  );
  editorRevision = conflict.latestRevision;
  if (isNoteMode && conflict.latestDocument) {
    const noteIndex = allNotes.findIndex((note) => matchesNoteId(note, currentNoteId));
    if (noteIndex !== -1) allNotes[noteIndex] = conflict.latestDocument;
  } else if (currentClassId && conflict.latestDocument) {
    const classIndex = allClasses.findIndex((cls) => matchesClassId(cls, currentClassId));
    if (classIndex !== -1) allClasses[classIndex] = conflict.latestDocument;
    generatedOutline = conflict.latestDocument.generatedOutline || null;
  }
  isDirty = false;
  editorDraftUpdates = {};
  clearEditorDraft();
  closeModal('editor-conflict-modal');
  updateSaveStatus('Saved');
  updateOutlineNavigator();
}

async function applyMergedEditorVersion(): Promise<void> {
  if (!pendingEditorConflict) return;
  const conflict = pendingEditorConflict;
  const mergeEl = document.getElementById('editor-conflict-merge');
  const mergedHtml =
    mergeEl instanceof HTMLTextAreaElement || mergeEl instanceof HTMLInputElement
      ? mergeEl.value
      : '';
  pendingEditorConflict = null;
  closeModal('editor-conflict-modal');
  setEditorContent(mergedHtml);
  editorRevision = conflict.latestRevision;
  markEditorDirty();
  if (Object.keys(conflict.localUpdates).length) {
    await saveEditorMetadata(conflict.localUpdates);
  } else {
    await saveDocument();
  }
}

// Speech time estimate
const SPEECH_WPM_KEY = 'bst.editor.speechWpm';
const DEFAULT_SPEECH_WPM = 140;
let speechSelectionMode = false;

function getSpeechWpm(): number {
  const stored = Number(localStorage.getItem(SPEECH_WPM_KEY));
  return stored >= 20 && stored <= 400 ? stored : DEFAULT_SPEECH_WPM;
}

function formatSpeechTime(words: number, wpm: number): string {
  const totalSeconds = Math.round((words / wpm) * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function countWords(text: string): number {
  const matches = String(text || '').trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function updateSpeechTime(): void {
  const box = document.getElementById('speech-time-box');
  if (!box || !editor) return;
  const { from, to, empty } = editor.state.selection;
  if (empty) speechSelectionMode = false;
  const text = speechSelectionMode
    ? editor.state.doc.textBetween(from, to, ' ')
    : editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ');
  const words = countWords(text);
  const valueEl = box.querySelector('.speech-time-value');
  const wordsEl = box.querySelector('.speech-time-words');
  if (valueEl) valueEl.textContent = formatSpeechTime(words, getSpeechWpm());
  if (wordsEl) wordsEl.textContent = `${words} words`;
}

function initSpeechTimeBox(): void {
  if (document.getElementById('speech-time-box')) return;
  const box = document.createElement('div');
  box.id = 'speech-time-box';
  box.title = 'Click to show time for the highlighted selection (click again for whole text)';
  box.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:1000;padding:8px 12px;border-radius:8px;background:rgba(20,20,20,.9);color:#fff;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);text-align:right;user-select:none;';
  box.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;justify-content:flex-end">' +
    '<div><div class="speech-time-value" style="font-size:20px;font-weight:600"></div>' +
    '<div class="speech-time-words" style="font-size:11px;opacity:.8"></div></div>' +
    '<a class="speech-time-gear" href="settings.html" target="_blank" rel="noopener" title="Settings" aria-label="Settings" style="color:inherit;text-decoration:none;font-size:20px">&#9881;</a></div>';
  document.body.appendChild(box);

  box.querySelector('.speech-time-gear')?.addEventListener('click', (e: Event) => e.stopPropagation());
  // Keep the editor selection when clicking the box.
  box.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.target instanceof Element && !e.target.closest('.speech-time-gear')) {
      e.preventDefault();
    }
  });
  // Pick up a changed speed after returning from the settings tab.
  window.addEventListener('focus', updateSpeechTime);
  box.addEventListener('click', () => {
    speechSelectionMode = !speechSelectionMode && !!editor && !editor.state.selection.empty;
    updateSpeechTime();
  });
  updateSpeechTime();
}

// Initialize TipTap Editor
function initializeEditor(): void {
  const editorElement = document.querySelector('#editor');
  if (!editorElement) return;

  editor = new Editor({
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
      if (!isApplyingEditorState) {
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

  window.editor = editor;
  initSpeechTimeBox();

  console.log('Editor initialized:', editor);

  const editorHost = document.getElementById('editor');
  if (!editorHost) return;

  editorHost.addEventListener('click', (e: MouseEvent) => {
    void handleEditorLinkClick(e);
  });

  // Add click handler for Q&A pause markers
  editorHost.addEventListener('click', handleQAPauseClick);

  // Ensure clicks on empty editor chrome still place caret in the document.
  editorHost.addEventListener('mousedown', (e: MouseEvent) => {
    markEditorInteraction();

    if (e.button !== 0 || !editor || !(e.target instanceof Element)) {
      return;
    }

    const clickedEditable = e.target.closest('.ProseMirror, .tiptap, [contenteditable="true"]');
    if (!clickedEditable) {
      e.preventDefault();
      editor.commands.focus('end');
    }
  });

  // If a user right-clicks the empty editor area, focus the editor first so paste is available.
  editorHost.addEventListener('contextmenu', (e: MouseEvent) => {
    markEditorInteraction();

    if (!editor || !(e.target instanceof Element)) {
      return;
    }

    const clickedEditable = e.target.closest('.ProseMirror, .tiptap, [contenteditable="true"]');
    if (!clickedEditable) {
      editor.commands.focus('end');
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

async function handleEditorLinkClick(e: MouseEvent): Promise<void> {
  if (!(e.target instanceof Element)) return;

  const link = e.target.closest('a[href]');
  const img = e.target.closest('img');

  if (!link && !img) {
    return;
  }

  const href = link
    ? String(link.getAttribute('href') || '').trim()
    : img
      ? String(img.getAttribute('src') || '').trim()
      : '';
  if (!href || href === '#' || href.startsWith('#') || href.startsWith('bst-media:')) {
    return;
  }

  e.preventDefault();
  markEditorInteraction();

  const title = link
    ? String(link.textContent || '').trim()
    : img
      ? String(img.getAttribute('alt') || '').trim()
      : '';
  const isExplicitImage = !!img;
  const routed = await sendEditorLinkToDisplay(href, title || href, isExplicitImage);
  if (!routed) {
    const fallbackUrl = normalizeEditorLinkUrl(href);
    if (fallbackUrl) {
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    }
  }
}

function getCurrentClassForDisplayRouting(): EditorDocument | null {
  if (!currentClassId || !Array.isArray(allClasses) || allClasses.length === 0) {
    return null;
  }

  return allClasses.find((c) => matchesClassId(c, currentClassId)) || null;
}

function getDisplayChannelName(): string {
  const cls = getCurrentClassForDisplayRouting();
  if (cls?.channelName) {
    return cls.channelName;
  }
  return `class${currentClassId || '1'}-control`;
}

function getDisplayStorageFallbackKey(): string {
  return `${getDisplayChannelName()}-storage`;
}

function normalizeEditorLinkUrl(rawUrl: string): string {
  if (typeof rawUrl !== 'string') {
    return '';
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // Ignore parse failures and fall back to local paths.
  }

  return trimmed.startsWith('/') ||
    trimmed.startsWith('assets/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../')
    ? trimmed
    : '';
}

function getOrCreateDisplayChannel(): BroadcastChannel | null {
  const channelName = getDisplayChannelName();

  if (displayControlChannel && displayControlChannelName === channelName) {
    return displayControlChannel;
  }

  displayControlChannelName = channelName;

  if (window.bst?.createBroadcastChannel) {
    displayControlChannel = window.bst.createBroadcastChannel(channelName);
    return displayControlChannel;
  }

  if ('BroadcastChannel' in window) {
    displayControlChannel = new BroadcastChannel(channelName);
    return displayControlChannel;
  }

  displayControlChannel = null;
  return null;
}

async function sendEditorLinkToDisplay(
  rawUrl: string,
  title: string,
  isExplicitImage = false
): Promise<boolean> {
  const linkUrl = normalizeEditorLinkUrl(rawUrl);
  if (!linkUrl) {
    return false;
  }

  if (!isNoteMode && currentClassId) {
    window.open(`student.html?class=${currentClassId}`, 'display-screen', 'width=1280,height=720');
  }

  let mediaType = isExplicitImage ? 'image' : 'link';
  const lowerUrl = linkUrl.toLowerCase();

  if (!isExplicitImage) {
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
      mediaType = 'video';
    } else if (lowerUrl.match(/\.(mp4|webm|ogg)$/)) {
      mediaType = 'video';
    } else if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
      mediaType = 'image';
    } else if (lowerUrl.match(/\.(mp3|wav|m4a)$/)) {
      mediaType = 'audio';
    } else if (lowerUrl.match(/\.(pdf)$/)) {
      mediaType = 'pdf';
    } else if (lowerUrl.includes('lh3.googleusercontent.com/d/')) {
      mediaType = 'image';
    }
  }

  const message = {
    type: 'displayMedia',
    media: {
      type: mediaType,
      title: title || 'External Link',
      url: linkUrl,
      sources: [{ url: linkUrl }],
    },
    sentAt: Date.now(),
  };

  const channel = getOrCreateDisplayChannel();
  if (channel) {
    channel.postMessage(message);
  }

  try {
    localStorage.setItem(getDisplayStorageFallbackKey(), JSON.stringify(message));
  } catch (err: unknown) {
    console.warn('Failed to write display link fallback:', err);
  }

  return !!channel;
}

// Handle clicks on Q&A pause markers
function handleQAPauseClick(e: MouseEvent): void {
  if (!(e.target instanceof HTMLElement)) return;
  const marker = e.target.closest('.qa-pause-marker');
  if (marker instanceof HTMLElement) {
    const sectionId = marker.dataset.sectionId;

    if (sectionId && generatedOutline) {
      // Find the section and show its questions
      const section = generatedOutline.find((s) => s.id === sectionId);
      if (section && section.questions && section.questions.length > 0) {
        showQAQuestions(section);
      } else {
        alert('No questions found for this section.');
      }
    } else {
      alert(
        'This is a generic Q&A pause marker. Generate or apply an outline to link it to specific questions.'
      );
    }
  }
}

// Show Q&A questions in a modal or sidebar
function showQAQuestions(section: OutlineSection): void {
  let questionsHTML = `<div class="qa-questions-display">
        <h3>${section.summary}</h3>
        <ol class="question-list">`;

  section.questions.forEach((q) => {
    questionsHTML += `<li>
            <div class="question-prompt">${q.prompt}</div>
            ${q.answer ? `<div class="question-answer"><strong>Suggested answer:</strong> ${q.answer}</div>` : ''}
        </li>`;
  });

  questionsHTML += '</ol></div>';

  // Show in an alert for now (could enhance to a nicer modal later)
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = questionsHTML;
  const textContent = section.questions
    .map((q, i) => `${i + 1}. ${q.prompt}${q.answer ? '\n   Answer: ' + q.answer : ''}`)
    .join('\n\n');

  alert(`Questions for: ${section.summary}\n\n${textContent}`);
}

// Update toolbar button active states based on current selection
function updateToolbarActiveStates(ed: Editor | null): void {
  if (!ed) return;

  // Define which actions map to which editor checks
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

  // Update all toolbar buttons with data-action
  document.querySelectorAll('.toolbar-btn[data-action]').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    const action = btn.dataset.action;
    if (action && actionChecks[action]) {
      btn.classList.toggle('is-active', actionChecks[action]());
    }
  });

  // Update heading selects
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

// Setup Event Listeners
function setupEventListeners(): void {
  if (eventListenersInitialized) {
    return;
  }
  eventListenersInitialized = true;

  document.getElementById('btn-focus-mode')?.addEventListener('click', () => {
    setEditorFocusMode(!document.body.classList.contains('is-focus-mode'));
  });

  // Verse Lookup by Thought button
  document.getElementById('btn-verse-lookup-thought')?.addEventListener('click', async () => {
    await handleVerseLookupByThought();
  });

  // Handle Verse Lookup by Thought
  async function handleVerseLookupByThought(): Promise<void> {
    if (!editor) return;
    const selection = editor.state.selection;
    if (!selection || selection.empty) {
      alert('Highlight a phrase or thought to look up related verses.');
      return;
    }
    const from = selection.from;
    const to = selection.to;
    const thought = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!thought) {
      alert('Highlight a phrase or thought to look up related verses.');
      return;
    }

    // Show modal and loading
    const queryEl = document.getElementById('verse-lookup-thought-query');
    const loadingEl = document.getElementById('verse-lookup-thought-loading');
    const resultsEl = document.getElementById('verse-lookup-thought-results');
    if (queryEl) queryEl.textContent = `Searching for: "${thought}"`;
    if (loadingEl) loadingEl.style.display = '';
    if (resultsEl) resultsEl.innerHTML = '';
    openModal('verse-lookup-thought-modal');

    // Query LLM for relevant verses
    let verses: VerseLookupResult[] = [];
    try {
      const prompt = `Find 3-5 Bible verses that match or relate to the following thought or topic. For each, return the reference and the verse text.\n\nThought: "${thought}"\n\nFormat:\nReference: <book chapter:verse>\nText: <verse text>\n---`;
      if (!window.generateCompletion) {
        throw new Error('LLM completion service unavailable');
      }
      const response = await window.generateCompletion(prompt, {
        model: undefined,
        temperature: 0.2,
      });
      // Parse response into array of { reference, text }
      verses = parseLLMVerseResults(response);
    } catch {
      if (resultsEl) {
        resultsEl.innerHTML = '<div style="color:red;">Error searching for verses.</div>';
      }
      if (loadingEl) loadingEl.style.display = 'none';
      return;
    }
    if (loadingEl) loadingEl.style.display = 'none';
    if (!verses.length) {
      if (resultsEl) resultsEl.innerHTML = '<div>No verses found.</div>';
      return;
    }
    if (resultsEl) {
      resultsEl.innerHTML = verses
        .map(
          (v, i) =>
            `<div class="verse-result" style="margin-bottom:6px; padding:4px 0; display:flex; align-items:flex-start; gap:6px;">
        <input type="checkbox" class="verse-select-checkbox" id="verse-select-${i}" data-index="${i}" style="margin-top:2px;width:15px;">
        <label for="verse-select-${i}" style="flex:1; cursor:pointer; font-size: 0.98em;"><strong>${v.reference}</strong>: <span>${v.text}</span></label>
      </div>`
        )
        .join('');
    }
    // Store verses for later use
    window._verseLookupThoughtResults = { from, to, verses };

    // Insert selected verses from modal
    const insertSelectedBtn = document.getElementById('btn-insert-selected-verses');
    if (insertSelectedBtn) {
      insertSelectedBtn.onclick = () => {
        if (!editor) return;
        const data = window._verseLookupThoughtResults;
        if (!data || !data.verses) return;
        const checkboxes = document.querySelectorAll('.verse-select-checkbox:checked');
        if (!checkboxes.length) {
          alert('Select at least one verse to insert.');
          return;
        }
        const selected = Array.from(checkboxes)
          .filter((cb): cb is HTMLInputElement => cb instanceof HTMLInputElement)
          .map((cb) => data.verses[parseInt(cb.dataset.index || '', 10)])
          .filter((v): v is VerseLookupResult => Boolean(v));
        if (!selected.length) return;
        // Combine selected verses into a single string with line breaks
        const insertText = selected.map((v) => `${v.reference}: ${v.text}`).join('<br>');
        editor
          .chain()
          .focus()
          .insertContentAt({ from: data.from, to: data.to }, insertText + '<br>')
          .run();
        closeModal('verse-lookup-thought-modal');
      };
    }

    // Click to replace
    document.querySelectorAll('.verse-result').forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      el.addEventListener('click', () => {
        if (!editor) return;
        const idx = parseInt(el.dataset.index || '', 10);
        if (verses[idx]) {
          editor
            .chain()
            .focus()
            .insertContentAt({ from, to }, `${verses[idx].reference}: ${verses[idx].text} `)
            .run();
          closeModal('verse-lookup-thought-modal');
        }
      });
    });
  }

  // Parse LLM response for verses
  function parseLLMVerseResults(response: string): VerseLookupResult[] {
    const results: VerseLookupResult[] = [];
    // Split on each Reference: line (handles both --- and missing separators)
    const blocks = response.split(/\n(?=Reference: )|\n(?=\d+\. Reference: )|---/g);
    for (const block of blocks) {
      const refMatch = block.match(/Reference:\s*([^\n]+)/i);
      const textMatch = block.match(/Text:\s*([\s\S]+)/i);
      if (refMatch && textMatch) {
        results.push({
          reference: refMatch[1].trim(),
          text: textMatch[1].trim().replace(/\n/g, ' '),
        });
      }
    }
    return results;
  }

  // Toolbar buttons
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

  // Heading select
  document.getElementById('heading-select')?.addEventListener('change', (e: Event) => {
    if (!editor || !(e.target instanceof HTMLSelectElement)) return;
    const level = e.target.value;
    if (level === 'paragraph') {
      editor.chain().focus().setParagraph().run();
    } else {
      const headingLevel = parseInt(level.replace('h', ''), 10) as 1 | 2 | 3 | 4 | 5 | 6;
      editor.chain().focus().toggleHeading({ level: headingLevel }).run();
    }
  });

  // Color pickers
  document.getElementById('text-color')?.addEventListener('input', (e: Event) => {
    if (!editor || !(e.target instanceof HTMLInputElement)) return;
    editor.chain().focus().setColor(e.target.value).run();
  });

  document.getElementById('highlight-color')?.addEventListener('input', (e: Event) => {
    if (!editor || !(e.target instanceof HTMLInputElement)) return;
    editor.chain().focus().toggleHighlight({ color: e.target.value }).run();
  });

  // Save button
  document.getElementById('btn-save')?.addEventListener('click', () => {
    void saveDocument();
  });
  document.getElementById('btn-conflict-keep-local')?.addEventListener('click', () => {
    void keepLocalEditorVersion();
  });
  document.getElementById('btn-conflict-use-latest')?.addEventListener('click', useLatestEditorVersion);
  document.getElementById('btn-conflict-apply-merge')?.addEventListener('click', () => {
    void applyMergedEditorVersion();
  });

  // View Teacher button
  document.getElementById('btn-view-teacher')?.addEventListener('click', viewTeacher);

  // Search button
  document.getElementById('btn-search')?.addEventListener('click', () => {
    openModal('search-modal');
  });

  // Version history button
  document.getElementById('btn-version-history')?.addEventListener('click', () => {
    void openVersionHistory();
  });
  document.getElementById('btn-version-restore')?.addEventListener('click', () => {
    void restoreSelectedVersion();
  });

  // Generate Outline button - now opens modal with options
  document.getElementById('btn-generate-outline')?.addEventListener('click', () => {
    void openOutlineModal();
  });

  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      if (modalId) {
        closeModal(modalId);
      }
    });
  });

  // Close modal when clicking the backdrop
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e: Event) => {
      if (e.target === modal) {
        if (modal.hasAttribute('data-no-dismiss')) return;
        closeModal(modal.id);
      }
    });
  });

  // Verse insertion
  document.getElementById('btn-insert-verse')?.addEventListener('click', () => {
    void insertVerseReference();
  });
  document.getElementById('bible-translation-select')?.addEventListener('change', () => {
    void saveBibleTranslationSetting();
  });

  // Image insertion
  document.getElementById('btn-insert-image')?.addEventListener('click', () => {
    void insertImage();
  });

  // Link insertion
  document.getElementById('btn-insert-link')?.addEventListener('click', insertLink);

  // Q&A Pause insertion
  document.getElementById('btn-insert-qa-pause')?.addEventListener('click', insertQAPauseMarker);

  // Search functionality
  document.getElementById('btn-find-next')?.addEventListener('click', findNext);
  document.getElementById('btn-replace')?.addEventListener('click', replaceOne);
  document.getElementById('btn-replace-all')?.addEventListener('click', replaceAll);

  // Outline generation
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

  // Outline method radio buttons
  document.querySelectorAll('input[name="outline-method"]').forEach((radio) => {
    radio.addEventListener('change', handleOutlineMethodChange);
  });

  // AI Assistant
  document.getElementById('btn-ai-assistant')?.addEventListener('click', () => {
    void openAIAssistant();
  });

  // Code view
  document.getElementById('btn-code-view')?.addEventListener('click', toggleCodeView);

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

  // AI suggestion buttons
  document.querySelectorAll('.ai-suggestion-btn').forEach((btn) => {
    btn.addEventListener('click', (e: Event) => {
      if (!(e.target instanceof HTMLElement)) return;
      const question = e.target.dataset.question || '';
      const aiQuestionEl = document.getElementById('ai-question');
      if (aiQuestionEl instanceof HTMLInputElement || aiQuestionEl instanceof HTMLTextAreaElement) {
        aiQuestionEl.value = question;
      }
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', async (e: KeyboardEvent) => {
    // Ctrl+S to save
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void saveDocument();
    }
    // Ctrl+F to search
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openModal('search-modal');
    }

    // Ctrl+K to open verse linking modal with highlighted text
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

    // Ctrl+Alt+I to open image insertion modal without overriding Ctrl+I italic.
    if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      openModal('image-modal');
    }

    // Alt+B to insert verse text after highlighted address
    if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
      if (editor) {
        const selection = editor.state.selection;
        if (selection && !selection.empty) {
          const from = selection.from;
          const to = selection.to;
          const verseAddress = editor.state.doc.textBetween(from, to, ' ');
          if (verseAddress && verseAddress.trim().length > 0) {
            // Use current translation or default
            let translation = 'nkjv';
            const select = document.getElementById('bible-translation-select');
            if (select instanceof HTMLSelectElement) {
              translation = select.value;
            }
            // Fetch verse text
            const verseData = await fetchVerseText(verseAddress.trim(), translation);
            if (verseData && verseData.text) {
              // Insert verse text after the selection
              editor.chain().focus().insertContentAt(to, ` <em>${verseData.text}</em> `).run();
            } else {
              editor.chain().focus().insertContentAt(to, ' [Verse text not available] ').run();
            }
          }
        }
      }
    }

    // Alt+T to trigger verse lookup by thought
    if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      await handleVerseLookupByThought();
    }

    if (e.key === 'Escape') {
      if (pendingEditorConflict) {
        e.preventDefault();
        return;
      }
      if (document.body.classList.contains('is-focus-mode')) {
        e.preventDefault();
        if (focusModeExitTimer === null) {
          focusModeExitTimer = window.setTimeout(() => {
            focusModeExitTimer = null;
            focusModeEscapeHandled = true;
            setEditorFocusMode(false);
          }, 2000);
        }
        return;
      }
      if (focusModeEscapeHandled) {
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
    if (focusModeExitTimer !== null) {
      window.clearTimeout(focusModeExitTimer);
      focusModeExitTimer = null;
    }
    focusModeEscapeHandled = false;
  });

  window.addEventListener('blur', () => {
    if (focusModeExitTimer !== null) {
      window.clearTimeout(focusModeExitTimer);
      focusModeExitTimer = null;
    }
    focusModeEscapeHandled = false;
  });

  document.addEventListener('paste', (e: ClipboardEvent) => {
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

  setupMediaDropSupport();
}

function markEditorInteraction(): void {
  lastEditorInteractionAt = Date.now();
}

function setEditorFocusMode(enabled: boolean): void {
  const focusModeButton = document.getElementById('btn-focus-mode');
  document.body.classList.toggle('is-focus-mode', enabled);
  if (focusModeButton) {
    focusModeButton.setAttribute('aria-pressed', String(enabled));
  }

  if (enabled) {
    editor?.commands.focus();
  } else if (focusModeButton instanceof HTMLElement) {
    focusModeButton.focus();
  }
}

function hasRecentEditorInteraction(): boolean {
  return Date.now() - lastEditorInteractionAt < 5000;
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

function getMediaIconForEditor(type: string | undefined): string {
  const icons: Record<string, string> = {
    verse: 'menu_book',
    video: 'videocam',
    image: 'image',
    images: 'photo_library',
    link: 'link',
    pdf: 'description',
    document: 'assignment',
    audio: 'audio_file',
    question: 'help',
    presentation: 'bar_chart',
  };
  return (type && icons[type]) || 'attach_file';
}

function escapeHtml(value: unknown): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeClassesData(data: unknown): EditorDocument[] {
  if (Array.isArray(data)) {
    return data as EditorDocument[];
  }
  if (isRecord(data) && Array.isArray(data.classes)) {
    return data.classes as EditorDocument[];
  }
  return [];
}

function collectClassMedia(cls: EditorDocument | null): EditorMediaEntry[] {
  if (!cls || typeof cls !== 'object') {
    return [];
  }

  const orderedMedia: MediaItem[] = [];
  const classMedia = Array.isArray(cls.media) ? cls.media : [];

  orderedMedia.push(...classMedia.filter((m) => m?.primary));

  if (Array.isArray(cls.outline)) {
    cls.outline.forEach((section) => {
      const sectionWithMedia = section as ClassOutlineSection;
      if (!Array.isArray(sectionWithMedia?.media)) {
        return;
      }
      sectionWithMedia.media.forEach((media) => {
        orderedMedia.push({
          ...media,
          sectionTitle: sectionWithMedia.summary || '',
        });
      });
    });
  }

  orderedMedia.push(...classMedia.filter((m) => !m?.primary));

  return orderedMedia.filter(Boolean).map((media, idx) => ({
    ...media,
    __editorMediaId: media.id || `media-${idx}-${media.type || 'item'}`,
  }));
}

function insertMediaTile(media: EditorMediaEntry): void {
  if (!editor || !media) return;

  const title = media.title || media.reference || media.prompt || media.type || 'Media';
  const icon = getMediaIconForEditor(media.type);
  const payload = encodeURIComponent(JSON.stringify(media));

  const tileHtml = `<a href="bst-media:${payload}" class="editor-media-tile" title="${escapeHtml(title)}"><span class="material-symbols-outlined">${icon}</span><span>${escapeHtml(title)}</span></a>&nbsp;`;

  editor.chain().focus().insertContent(tileHtml).run();
}

function safeParseMediaPayload(value: string): EditorMediaEntry | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? (parsed as unknown as EditorMediaEntry) : null;
  } catch (error: unknown) {
    console.warn('Invalid media payload:', error);
    return null;
  }
}

function setupMediaDropSupport(): void {
  const editorHost = document.getElementById('editor');
  if (!editorHost) return;

  editorHost.addEventListener('dragover', (e: DragEvent) => {
    const hasMediaPayload = Array.from(e.dataTransfer?.types || []).includes(
      'application/x-bst-media'
    );
    if (hasMediaPayload) {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    }
  });

  editorHost.addEventListener('drop', (e: DragEvent) => {
    const payload = e.dataTransfer?.getData('application/x-bst-media');
    if (!payload) return;

    e.preventDefault();
    const media = safeParseMediaPayload(payload);
    if (media) {
      insertMediaTile(media);
    }
  });
}

function isEditorTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof globalThis.Node)) {
    return false;
  }

  const editorHost = document.getElementById('editor');
  return !!(editorHost && editorHost.contains(target));
}

export async function pasteClipboardTextIntoEditor(): Promise<boolean> {
  if (!editor || !navigator.clipboard?.readText) {
    return false;
  }

  try {
    const text = await navigator.clipboard.readText();
    if (typeof text !== 'string') {
      return false;
    }

    editor.chain().focus().insertContent(text).run();
    return true;
  } catch (error: unknown) {
    console.warn('Clipboard paste fallback failed:', error);
    return false;
  }
}

function renderEditorMediaSidebar(cls: EditorDocument | null): void {
  const mediaList = document.getElementById('editor-media-list');
  if (!mediaList) return;

  editorMediaItems = collectClassMedia(cls);

  if (editorMediaItems.length === 0) {
    mediaList.innerHTML = '<p class="editor-media-empty">No media found for this class.</p>';
    return;
  }

  mediaList.innerHTML = editorMediaItems
    .map((media, idx) => {
      const title = media.title || media.reference || media.prompt || media.type || 'Media';
      const icon = getMediaIconForEditor(media.type);
      const section = media.sectionTitle ? `<small>${escapeHtml(media.sectionTitle)}</small>` : '';
      return `
      <button type="button" class="editor-media-item" draggable="true" data-media-index="${idx}" title="Click to insert in notes, or drag into the editor">
        <span class="material-symbols-outlined">${icon}</span>
        <span class="editor-media-item-text">
          <strong>${escapeHtml(title)}</strong>
          <em>${escapeHtml(media.type || 'media')}</em>
          ${section}
        </span>
      </button>
    `;
    })
    .join('');

  mediaList.querySelectorAll('.editor-media-item').forEach((item) => {
    if (!(item instanceof HTMLElement)) return;
    item.addEventListener('click', () => {
      const idx = Number(item.dataset.mediaIndex);
      const media = editorMediaItems[idx];
      if (media) {
        insertMediaTile(media);
      }
    });

    item.addEventListener('dragstart', (e: DragEvent) => {
      const idx = Number(item.dataset.mediaIndex);
      const media = editorMediaItems[idx];
      if (!media || !e.dataTransfer) return;

      const payload = JSON.stringify(media);
      e.dataTransfer.setData('application/x-bst-media', payload);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });
}

// Handle Toolbar Actions
function handleToolbarAction(action: string): void {
  if (!editor) return;

  const currentEditor = editor;
  const actions: Record<string, () => void> = {
    bold: () => currentEditor.chain().focus().toggleBold().run(),
    italic: () => currentEditor.chain().focus().toggleItalic().run(),
    underline: () => currentEditor.chain().focus().toggleUnderline().run(),
    strike: () => currentEditor.chain().focus().toggleStrike().run(),
    bulletList: () => currentEditor.chain().focus().toggleBulletList().run(),
    orderedList: () => currentEditor.chain().focus().toggleOrderedList().run(),
    blockquote: () => currentEditor.chain().focus().toggleBlockquote().run(),
    codeBlock: () => currentEditor.chain().focus().toggleCodeBlock().run(),
    horizontalRule: () => currentEditor.chain().focus().setHorizontalRule().run(),
    undo: () => currentEditor.chain().focus().undo().run(),
    redo: () => currentEditor.chain().focus().redo().run(),
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

// Fetch verse data from Bible APIs
async function fetchVerseFromLabs(
  reference: string,
  translation: string
): Promise<FetchedVerseData | null> {
  const version = String(translation || 'nkjv').toUpperCase();
  const url = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&version=${encodeURIComponent(version)}&type=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const lines = (data as LabsBibleVerseItem[]).map((item) => {
      // Strip HTML tags from text
      const cleanText = String(item.text || '').replace(/<[^>]*>/g, '');
      return `<sup>${item.verse}</sup> ${cleanText}`;
    });
    return { title: reference, text: lines.join(' '), translation: version };
  } catch (err: unknown) {
    console.warn('labs.bible.org fetch failed:', err);
    return null;
  }
}

async function fetchVerseFromBibleApi(
  reference: string,
  translation: string
): Promise<FetchedVerseData | null> {
  const version = String(translation || 'web').toLowerCase();
  const url = `/api/bible/simple?reference=${encodeURIComponent(reference)}&translation=${encodeURIComponent(version)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as BibleApiSimpleResponse;
    const text = (data.text || '').trim();
    if (!text) return null;

    // Clean up newlines and extra spaces
    const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      title: data.reference || reference,
      text: cleanText,
      translation: (data.translation_name || version).toUpperCase(),
    };
  } catch (err: unknown) {
    console.warn('bible-api.com fetch failed:', err);
    return null;
  }
}

async function fetchVerseText(
  reference: string,
  translation: string
): Promise<FetchedVerseData | null> {
  const normTrans = String(translation || 'nkjv').toLowerCase();

  // Try API.Bible proxy first
  try {
    const mapRes = await fetch('/api/bible/bibles');
    if (mapRes.ok) {
      const mapData: unknown = await mapRes.json();
      let bibleId: string | null = null;
      if (isRecord(mapData) && Array.isArray(mapData.data)) {
        for (const b of mapData.data as ApiBibleItem[]) {
          if (
            (b.abbreviation && b.abbreviation.toLowerCase() === normTrans) ||
            (b.abbreviationLocal && b.abbreviationLocal.toLowerCase() === normTrans) ||
            (b.name && b.name.toLowerCase() === normTrans)
          ) {
            bibleId = b.id || null;
            break;
          }
        }
      }
      // hardcoded fallbacks if API list fails
      if (!bibleId) {
        const hardcoded: Record<string, string> = {
          nkjv: '63097d2a0a2f7db3-01',
          kjv: 'de4e12af7f28f599-01',
          csb: 'a556c5305ee15c3f-01',
        };
        bibleId = hardcoded[normTrans] || null;
      }

      if (bibleId) {
        const url = `/api/bible/passages?bibleId=${encodeURIComponent(bibleId)}&reference=${encodeURIComponent(reference)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data: unknown = await res.json();
          let passage: ApiBiblePassage | undefined;
          if (isRecord(data)) {
            if (Array.isArray(data.data)) {
              passage = data.data[0] as ApiBiblePassage | undefined;
            } else if (isRecord(data.data) && Array.isArray(data.data.passages)) {
              passage = data.data.passages[0] as ApiBiblePassage | undefined;
            } else if (isRecord(data.data)) {
              passage = data.data as ApiBiblePassage;
            }
          }
          if (passage && passage.content) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = passage.content;
            tempDiv.querySelectorAll('.f, .x').forEach((el) => el.remove());
            const text = (tempDiv.textContent || '').replace(/\s+/g, ' ').trim();
            if (text) {
              return {
                title: passage.reference || reference,
                text,
                translation: normTrans.toUpperCase(),
              };
            }
          }
        }
      }
    }
  } catch (err: unknown) {
    console.warn(
      'API.Bible fetch failed in editor, your API_BIBLE_KEY may be invalid. Falling back...',
      err
    );
  }

  // Fallback to bible-api.com
  const bibleApi = await fetchVerseFromBibleApi(reference, normTrans);
  if (bibleApi) return bibleApi;

  // Fallback to labs.bible.org (NET only)
  if (normTrans === 'net') {
    const labs = await fetchVerseFromLabs(reference, normTrans);
    if (labs) return labs;
  }

  // Final fallback to WEB if everything else fails
  const fallbackWeb = await fetchVerseFromBibleApi(reference, 'web');
  if (fallbackWeb) {
    fallbackWeb.translation = 'WEB';
    return fallbackWeb;
  }

  return null;
}

// Insert Bible Verse Reference
async function insertVerseReference(): Promise<void> {
  if (!editor) return;
  const verseInputEl = document.getElementById('verse-input');
  const verseInput = verseInputEl instanceof HTMLInputElement ? verseInputEl.value.trim() : '';
  const insertTextEl = document.getElementById('insert-verse-text');
  const insertText = insertTextEl instanceof HTMLInputElement ? insertTextEl.checked : false;
  const translationEl = document.getElementById('bible-translation-select');
  const translation = translationEl instanceof HTMLSelectElement ? translationEl.value : 'nkjv';

  if (!verseInput) {
    alert('Please enter a verse reference');
    return;
  }

  // Insert the verse reference link first
  editor
    .chain()
    .focus()
    .insertContent(`<a href="#" class="verse-reference" data-verse="${verseInput}">${verseInput}</a> `)
    .run();

  // If user wants verse text inserted as well
  if (insertText) {
    // Show loading indicator
    const insertBtn = document.getElementById('btn-insert-verse');
    const originalText = insertBtn ? insertBtn.innerHTML : '';
    if (insertBtn instanceof HTMLButtonElement) {
      insertBtn.innerHTML =
        '<span class="material-symbols-outlined">hourglass_empty</span>Loading...';
      insertBtn.disabled = true;
    }

    try {
      const verseData = await fetchVerseText(verseInput, translation);

      if (verseData && verseData.text) {
        // Insert blockquote with verse text
        editor
          .chain()
          .focus()
          .insertContent(
            `<blockquote><p><em>${verseData.text}</em></p><p style="text-align: right; font-size: 0.9em; color: #666;">— ${verseData.title} (${verseData.translation})</p></blockquote>`
          )
          .run();
      } else {
        console.warn('Could not fetch verse text for:', verseInput);
        // Insert a placeholder blockquote
        editor
          .chain()
          .focus()
          .insertContent(
            '<blockquote><p><em>[Verse text not available - please add manually]</em></p></blockquote>'
          )
          .run();
      }
    } catch (err: unknown) {
      console.error('Error fetching verse:', err);
    } finally {
      if (insertBtn instanceof HTMLButtonElement) {
        insertBtn.innerHTML = originalText;
        insertBtn.disabled = false;
      }
    }
  }

  closeModal('verse-modal');
  if (verseInputEl instanceof HTMLInputElement) {
    verseInputEl.value = '';
  }
}

// Insert Image
async function insertImage(): Promise<void> {
  if (!editor) return;
  const imageUrlEl = document.getElementById('image-url');
  const imageAltEl = document.getElementById('image-alt');
  const fileInputEl = document.getElementById('image-upload');

  let imageUrl = imageUrlEl instanceof HTMLInputElement ? imageUrlEl.value.trim() : '';
  const imageAlt = imageAltEl instanceof HTMLInputElement ? imageAltEl.value.trim() : '';
  const file = fileInputEl instanceof HTMLInputElement ? fileInputEl.files?.[0] : undefined;

  if (!imageUrl && file) {
    const insertBtn = document.getElementById('btn-insert-image');
    const originalHtml = insertBtn ? insertBtn.innerHTML : '';
    if (insertBtn instanceof HTMLButtonElement) {
      insertBtn.disabled = true;
      insertBtn.textContent = 'Uploading to Google Drive...';
    }
    try {
      const notebookName =
        getCurrentClassForDisplayRouting()?.title ||
        document.getElementById('document-title')?.textContent?.trim() ||
        'Bible Study Images';
      if (!window.BSTApi) {
        throw new Error('API client unavailable');
      }
      const result = await window.BSTApi.uploadImageToDrive(notebookName, file);
      if (typeof result.url === 'string') {
        imageUrl = result.url;
      }
    } catch (err: unknown) {
      console.error('Drive upload failed:', err);
      alert(`Image upload failed: ${getErrorMessage(err)}`);
      return;
    } finally {
      if (insertBtn instanceof HTMLButtonElement) {
        insertBtn.innerHTML = originalHtml;
        insertBtn.disabled = false;
      }
    }
  }

  if (!imageUrl) {
    alert('Please enter an image URL or upload an image');
    return;
  }

  // Convert Google Drive share links to thumbnail/direct image links
  const gdriveRegex =
    /(?:https?:\/\/)?(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/i;
  const match = imageUrl.match(gdriveRegex);
  if (match && match[1]) {
    imageUrl = `https://lh3.googleusercontent.com/d/${match[1]}`;
  }

  editor
    .chain()
    .focus()
    .setImage({ src: imageUrl, alt: imageAlt || 'Bible Study Image' })
    .run();

  closeModal('image-modal');
  if (imageUrlEl instanceof HTMLInputElement) imageUrlEl.value = '';
  if (imageAltEl instanceof HTMLInputElement) imageAltEl.value = '';
  if (fileInputEl instanceof HTMLInputElement) fileInputEl.value = '';
}

// Insert Link
function insertLink(): void {
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

// Insert Table
function insertTable(): void {
  if (!editor) return;
  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
}

// Insert Q&A Pause Marker
function insertQAPauseMarker(): void {
  if (!editor) return;
  const sectionSelect = document.getElementById('qa-section-select');
  if (!(sectionSelect instanceof HTMLSelectElement)) return;
  const selectedOption = sectionSelect.options[sectionSelect.selectedIndex];

  const sectionId = selectedOption?.value || null;
  const sectionTitle =
    selectedOption && selectedOption.text !== '-- Generic pause --'
      ? selectedOption.text
      : 'Discussion Questions';

  editor
    .chain()
    .focus()
    .insertQAPause({
      sectionId,
      sectionTitle,
    })
    .run();

  closeModal('qa-pause-modal');
}

// Modal Functions
function openModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  if (modal) {
    // Populate Q&A section dropdown if opening that modal
    if (modalId === 'qa-pause-modal') {
      populateQASectionDropdown();
    }
    // Load current Bible translation setting for verse modal
    if (modalId === 'verse-modal') {
      loadBibleTranslationSetting();
    }
    document.querySelectorAll('.modal.is-open').forEach((openModalEl) => {
      openModalEl.classList.remove('is-open');
      openModalEl.setAttribute('aria-hidden', 'true');
    });
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }
}

// Load Bible translation setting from class config
function loadBibleTranslationSetting(): void {
  const select = document.getElementById('bible-translation-select');
  if (!(select instanceof HTMLSelectElement)) return;

  // Try to get from class config first, then fallback to localStorage or default
  let translation = 'nkjv'; // default

  if (currentClassId && allClasses.length > 0) {
    const currentClass = allClasses.find((c) => matchesClassId(c, currentClassId));
    if (currentClass?.bibleTranslation) {
      translation = currentClass.bibleTranslation;
    }
  } else {
    // Fallback to localStorage
    translation = localStorage.getItem('bible-translation-preference') || 'nkjv';
  }

  select.value = translation;
}

// Save Bible translation setting
async function saveBibleTranslationSetting(): Promise<void> {
  const select = document.getElementById('bible-translation-select');
  if (!(select instanceof HTMLSelectElement)) return;

  const translation = select.value;

  try {
    if (currentClassId) {
      if (await saveEditorMetadata({ bibleTranslation: translation })) {
        console.log('Bible translation preference saved:', translation);
        updateSaveStatus('Translation saved');
        setTimeout(() => updateSaveStatus('Saved'), 2000);
      }
    } else {
      // Fallback to localStorage
      localStorage.setItem('bible-translation-preference', translation);
      console.log('Bible translation preference saved to localStorage:', translation);
    }
  } catch (error: unknown) {
    console.error('Failed to save translation preference:', error);
  }
}

// Populate the Q&A section dropdown with available sections from the generated outline
function populateQASectionDropdown(): void {
  const select = document.getElementById('qa-section-select');
  if (!(select instanceof HTMLSelectElement)) return;
  select.innerHTML = '<option value="">-- Generic pause --</option>';

  if (generatedOutline && Array.isArray(generatedOutline)) {
    generatedOutline.forEach((section) => {
      if (section.questions && section.questions.length > 0) {
        const option = document.createElement('option');
        option.value = section.id;
        option.textContent = section.summary;
        select.appendChild(option);
      }
    });
  }
}

// Automatically inject Q&A pause markers based on outline qa-break points
function injectQAPauseMarkers(outline: OutlineSection[] | null): void {
  if (!outline || !Array.isArray(outline) || !editor) {
    console.log('Cannot inject markers: missing outline or editor');
    return;
  }

  // Get the current document JSON structure
  const docJSON = editor.getJSON();

  // Track sections with qa-break points or questions
  const sectionsWithQA = outline.filter((section) => {
    const hasQABreak =
      section.points &&
      section.points.some((point) => typeof point === 'object' && point.type === 'qa-break');
    const hasQuestions = section.questions && section.questions.length > 0;
    return hasQABreak || hasQuestions;
  });

  if (sectionsWithQA.length === 0) {
    console.log('No Q&A breaks or questions found in outline');
    return;
  }

  console.log(
    `Found ${sectionsWithQA.length} sections with Q&A:`,
    sectionsWithQA.map((s) => s.summary)
  );

  // Get all content blocks (paragraphs, headings, etc.)
  const contentBlocks = docJSON.content || [];
  const totalBlocks = contentBlocks.length;

  if (totalBlocks === 0) {
    console.log('No content blocks in document');
    return;
  }

  // Strategy: Distribute markers evenly throughout the document
  // This works even if the document doesn't have headings that match the AI outline
  const newContent: JSONContent[] = [];
  const markerInterval = Math.floor(totalBlocks / (sectionsWithQA.length + 1));
  let currentSectionIdx = 0;
  let blocksSinceLastMarker = 0;

  for (let i = 0; i < contentBlocks.length; i++) {
    const node = contentBlocks[i];
    newContent.push(node);
    blocksSinceLastMarker++;

    // Try to find matching heading first (if exists)
    let matchingSection: OutlineSection | undefined;
    if (node.type === 'heading' && node.content) {
      const headingText = node.content
        .map((n) => ('text' in n && typeof n.text === 'string' ? n.text : ''))
        .join('')
        .trim();
      matchingSection = sectionsWithQA.find((section) => {
        const summary = section.summary.trim().toLowerCase();
        const heading = headingText.toLowerCase();
        return summary.includes(heading) || heading.includes(summary) || summary === heading;
      });

      if (matchingSection) {
        console.log(`Matched heading "${headingText}" to section "${matchingSection.summary}"`);
      }
    }

    // Insert marker after heading match OR at regular intervals
    const shouldInsertMarker =
      matchingSection ||
      (blocksSinceLastMarker >= markerInterval &&
        currentSectionIdx < sectionsWithQA.length &&
        i < contentBlocks.length - 1);

    if (shouldInsertMarker && currentSectionIdx < sectionsWithQA.length) {
      const section = matchingSection || sectionsWithQA[currentSectionIdx];

      newContent.push({
        type: 'qaPauseMarker',
        attrs: {
          sectionId: section.id,
          sectionTitle: section.summary,
        },
      });

      console.log(`Inserted marker for section: ${section.summary}`);
      currentSectionIdx++;
      blocksSinceLastMarker = 0;
    }
  }

  // Insert any remaining markers at the end
  while (currentSectionIdx < sectionsWithQA.length) {
    const section = sectionsWithQA[currentSectionIdx];
    newContent.push({
      type: 'qaPauseMarker',
      attrs: {
        sectionId: section.id,
        sectionTitle: section.summary,
      },
    });
    console.log(`Inserted marker at end for section: ${section.summary}`);
    currentSectionIdx++;
  }

  // Set the new content with markers
  editor.commands.setContent({ type: 'doc', content: newContent });

  console.log(`[OK] Successfully injected ${sectionsWithQA.length} Q&A pause markers`);
}

function closeModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }
}

// Search Functions
function findNext(): void {
  if (!editor) return;
  const searchInputEl = document.getElementById('search-input');
  const caseSensitiveEl = document.getElementById('case-sensitive');
  const resultsEl = document.getElementById('search-results');

  const searchTerm = searchInputEl instanceof HTMLInputElement ? searchInputEl.value : '';
  const caseSensitive =
    caseSensitiveEl instanceof HTMLInputElement ? caseSensitiveEl.checked : false;

  if (!searchTerm) {
    alert('Please enter a search term');
    return;
  }

  // Simple implementation - would need enhancement for highlighting
  const content = editor.getText();
  const searchContent = caseSensitive ? content : content.toLowerCase();
  const searchFor = caseSensitive ? searchTerm : searchTerm.toLowerCase();

  const index = searchContent.indexOf(searchFor, currentSearchIndex);
  if (index !== -1) {
    currentSearchIndex = index + 1;
    if (resultsEl) resultsEl.textContent = `Found at position ${index}`;
  } else {
    currentSearchIndex = 0;
    if (resultsEl) resultsEl.textContent = 'No more results found';
  }
}

function replaceOne(): void {
  if (!editor) return;
  const searchInputEl = document.getElementById('search-input');
  const replaceInputEl = document.getElementById('replace-input');
  const resultsEl = document.getElementById('search-results');

  const searchTerm = searchInputEl instanceof HTMLInputElement ? searchInputEl.value : '';
  const replaceTerm = replaceInputEl instanceof HTMLInputElement ? replaceInputEl.value : '';

  if (!searchTerm) {
    alert('Please enter a search term');
    return;
  }

  // This is a simplified version - actual implementation would be more sophisticated
  const html = editor.getHTML();
  const newHtml = html.replace(searchTerm, replaceTerm);
  editor.commands.setContent(newHtml);

  if (resultsEl) resultsEl.textContent = 'Replaced 1 occurrence';
}

function replaceAll(): void {
  if (!editor) return;
  const searchInputEl = document.getElementById('search-input');
  const replaceInputEl = document.getElementById('replace-input');
  const resultsEl = document.getElementById('search-results');

  const searchTerm = searchInputEl instanceof HTMLInputElement ? searchInputEl.value : '';
  const replaceTerm = replaceInputEl instanceof HTMLInputElement ? replaceInputEl.value : '';

  if (!searchTerm) {
    alert('Please enter a search term');
    return;
  }

  const html = editor.getHTML();
  const regex = new RegExp(searchTerm, 'g');
  const newHtml = html.replace(regex, replaceTerm);
  const count = (html.match(regex) || []).length;

  editor.commands.setContent(newHtml);
  if (resultsEl) resultsEl.textContent = `Replaced ${count} occurrence(s)`;
}

// Update Outline Navigator
function updateOutlineNavigator(): void {
  if (!editor) return;
  const outlineTree = document.getElementById('outline-tree');
  if (!outlineTree) return;
  const json = editor.getJSON();

  // Extract headings from content
  const headings: HeadingEntry[] = [];

  function extractHeadings(node: JSONContent): void {
    if (node.type === 'heading') {
      const rawLevel = node.attrs?.level;
      headings.push({
        level: typeof rawLevel === 'number' ? rawLevel : 1,
        text: node.content
          ? node.content.map((n) => ('text' in n && typeof n.text === 'string' ? n.text : '')).join('')
          : '',
      });
    }

    if (node.content) {
      node.content.forEach((child) => extractHeadings(child));
    }
  }

  if (json.content) {
    json.content.forEach((node) => extractHeadings(node));
  }

  // Build outline HTML
  let outlineHTML = '<ul class="outline-list">';
  headings.forEach((heading, index) => {
    outlineHTML += `
            <li class="outline-item outline-level-${heading.level}">
                <a href="#" data-heading-index="${index}">${heading.text || 'Untitled'}</a>
            </li>
        `;
  });
  outlineHTML += '</ul>';

  outlineTree.innerHTML = outlineHTML || '<p class="outline-empty">No headings yet</p>';

  // Add click handlers for navigation
  outlineTree.querySelectorAll('[data-heading-index]').forEach((link) => {
    if (!(link instanceof HTMLElement)) return;
    link.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      const headingIndex = parseInt(link.dataset.headingIndex || '0', 10);
      scrollToHeading(headingIndex);
    });
  });
}

// Helper function to shorten outline text
function shortenText(text: string, maxLength = 50): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '…';
}

// Helper function to scroll editor to a specific section
function scrollToSection(sectionId: string | null, summary: string | null): void {
  if (!editor) return;

  try {
    const editorElement = document.querySelector('.tiptap');
    if (!editorElement) {
      editor.commands.focus();
      return;
    }

    // First priority: Look for QA pause marker with matching section ID
    if (sectionId) {
      const pauseMarker = editorElement.querySelector(
        `.qa-pause-marker[data-section-id="${sectionId}"]`
      );
      if (pauseMarker instanceof HTMLElement) {
        pauseMarker.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight the marker briefly
        pauseMarker.style.background = 'rgba(240, 180, 41, 0.2)';
        setTimeout(() => {
          pauseMarker.style.background = '';
        }, 1500);
        return;
      }
    }

    // Second priority: Look for heading with matching text
    if (summary) {
      const summaryText = String(summary).trim();
      const headings = editorElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (const heading of headings) {
        if (!(heading instanceof HTMLElement)) continue;
        const headingText = (heading.textContent || '').trim();
        if (
          headingText === summaryText ||
          headingText.toLowerCase() === summaryText.toLowerCase()
        ) {
          heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
          heading.focus();
          return;
        }
      }
    }

    // Fallback: just focus the editor
    editor.commands.focus();
  } catch (e: unknown) {
    console.error('Error scrolling to section:', e);
    editor.commands.focus();
  }
}

// Helper function to scroll editor to a specific heading
function scrollToHeading(summary: string | number): void {
  if (!editor || (!summary && summary !== 0)) return;

  // Ensure summary is a string
  const summaryText = String(summary).trim();

  try {
    // Find heading in the DOM and scroll to it
    const editorElement = document.querySelector('.tiptap');
    if (editorElement) {
      // Look for the heading text in the editor's rendered content
      const headings = editorElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (const heading of headings) {
        if (!(heading instanceof HTMLElement)) continue;
        const headingText = (heading.textContent || '').trim();
        if (
          headingText === summaryText ||
          headingText.toLowerCase() === summaryText.toLowerCase()
        ) {
          heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
          heading.focus();
          return;
        }
      }
    }

    // Fallback: just focus the editor
    editor.commands.focus();
  } catch (e: unknown) {
    console.error('Error scrolling to heading:', e);
    editor.commands.focus();
  }
}

function updateOutlineNavigatorFromGenerated(outline: OutlineSection[]): void {
  if (!outline || outline.length === 0) return;

  const outlineTree = document.getElementById('outline-tree');
  if (!outlineTree) return;
  let outlineHTML = '<ul class="outline-list">';

  outline.forEach((section) => {
    const shortTitle = shortenText(section.summary, 50);
    outlineHTML += `
            <li class="outline-item outline-level-1">
                <a href="#" data-section-id="${section.id || ''}" data-section-summary="${section.summary}" title="${section.summary}">
                    ${shortTitle}
                </a>
            </li>
        `;
  });

  outlineHTML += '</ul>';
  outlineTree.innerHTML = outlineHTML;

  // Add click handlers for section navigation
  outlineTree.querySelectorAll('a[data-section-summary]').forEach((link) => {
    link.addEventListener('click', (e: Event) => {
      e.preventDefault();
      const sectionId = link.getAttribute('data-section-id');
      const summary = link.getAttribute('data-section-summary');
      scrollToSection(sectionId, summary);
    });
  });
}

// Helper function to extract text from node (reuse from outlineGenerator if available)
export function extractText(node: TipTapJsonNode | null | undefined): string {
  if (!node) return '';
  if (node.text) return node.text;
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractText).join(' ');
  }
  return '';
}

// Code View Toggle Function
function toggleCodeView(): void {
  if (!editor) return;

  const editorDiv = document.getElementById('editor');
  const codeTextarea = document.getElementById('editor-code-view');
  const codeBtn = document.getElementById('btn-code-view');

  if (!editorDiv || !(codeTextarea instanceof HTMLTextAreaElement) || !codeBtn) return;

  isCodeView = !isCodeView;

  if (isCodeView) {
    // Switch to Code View
    let currentHtml = editor.getHTML();

    // Format HTML if js-beautify is available
    if (window.html_beautify) {
      currentHtml = window.html_beautify(currentHtml, {
        indent_size: 2,
        wrap_attributes: 'auto',
        preserve_newlines: false,
      });
    }

    codeTextarea.value = currentHtml;
    editorDiv.style.display = 'none';
    codeTextarea.style.display = 'block';
    codeBtn.classList.add('is-active');

    // Initialize CodeMirror if available
    if (window.CodeMirror && !codeMirrorInstance) {
      const cm = window.CodeMirror.fromTextArea(codeTextarea, {
        mode: 'htmlmixed',
        theme: 'material-darker',
        lineNumbers: true,
        lineWrapping: true,
        viewportMargin: Infinity,
      });
      codeMirrorInstance = cm;

      // Sync changes from CodeMirror back to textarea
      cm.on('change', () => {
        codeTextarea.value = cm.getValue();
        markEditorDirty();
      });
    }

    if (codeMirrorInstance) {
      const cm = codeMirrorInstance;
      cm.getWrapperElement().style.display = 'block';
      cm.setValue(currentHtml);
      // Wait for display to take effect before refreshing
      setTimeout(() => cm.refresh(), 10);
    }
  } else {
    // Switch back to Rich Text View
    const newHtml = codeMirrorInstance ? codeMirrorInstance.getValue() : codeTextarea.value;
    editor.commands.setContent(newHtml);

    if (codeMirrorInstance) {
      codeMirrorInstance.getWrapperElement().style.display = 'none';
      codeMirrorInstance.toTextArea(); // Destroy CodeMirror instance
      codeMirrorInstance = null;
    } else {
      codeTextarea.style.display = 'none';
    }

    editorDiv.style.display = 'block';
    codeBtn.classList.remove('is-active');

    // Save document since we might have made changes in code view
    markEditorDirty();
  }
}

// Version history
function getVersionDocTarget(): VersionDocTarget | null {
  if (isNoteMode && currentNoteId) return { docType: 'notes', recordId: currentNoteId };
  if (currentClassId) return { docType: 'classes', recordId: currentClassId };
  return null;
}

async function openVersionHistory(): Promise<void> {
  const target = getVersionDocTarget();
  const status = document.getElementById('version-history-status');
  const list = document.getElementById('version-history-list');
  const preview = document.getElementById('version-history-preview');
  const restoreBtn = document.getElementById('btn-version-restore');
  selectedVersionHtml = null;
  if (restoreBtn instanceof HTMLButtonElement) restoreBtn.disabled = true;
  if (list) list.textContent = '';
  if (preview) preview.textContent = '';
  openModal('version-history-modal');

  if (!target) {
    if (status) {
      status.textContent = 'Version history is only available for saved classes and notes.';
    }
    return;
  }

  if (status) status.textContent = 'Loading...';
  try {
    if (!window.BSTApi) {
      throw new Error('API client unavailable');
    }
    const response: unknown = await window.BSTApi.listEditorVersions(
      target.docType,
      target.recordId
    );
    const versions =
      isRecord(response) && Array.isArray(response.versions)
        ? (response.versions as EditorVersionSummary[])
        : [];
    if (status) {
      status.textContent = versions.length
        ? 'Select a version to preview it. Restoring saves it as a new version.'
        : 'No versions yet. A version is recorded each time you save.';
    }
    versions.forEach((version) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-secondary';
      button.style.cssText = 'width: 100%; text-align: left; margin-bottom: 4px;';
      const when = version.createdAt ? new Date(version.createdAt).toLocaleString() : 'Unknown time';
      button.textContent = `${when} (${version.kind === 'snapshot' ? 'full copy' : 'change'}, ${version.bytes ?? 0} B)`;
      button.addEventListener('click', () => {
        void previewVersion(target, version.seq, status);
      });
      item.appendChild(button);
      list?.appendChild(item);
    });
  } catch (error: unknown) {
    if (status) {
      status.textContent = `Could not load version history: ${getErrorMessage(error)}`;
    }
  }
}

async function previewVersion(
  target: VersionDocTarget,
  seq: string | number,
  status: HTMLElement | null
): Promise<void> {
  const preview = document.getElementById('version-history-preview');
  const restoreBtn = document.getElementById('btn-version-restore');
  selectedVersionHtml = null;
  if (restoreBtn instanceof HTMLButtonElement) restoreBtn.disabled = true;
  if (preview) preview.textContent = 'Loading...';
  try {
    if (!window.BSTApi) {
      throw new Error('API client unavailable');
    }
    const version: unknown = await window.BSTApi.getEditorVersion(
      target.docType,
      target.recordId,
      seq
    );
    const html = isRecord(version) && typeof version.html === 'string' ? version.html : '';
    selectedVersionHtml = html;
    if (preview) preview.textContent = getHtmlText(html);
    if (restoreBtn instanceof HTMLButtonElement) restoreBtn.disabled = false;
  } catch (error: unknown) {
    if (preview) preview.textContent = '';
    if (status) {
      status.textContent = `Could not load that version: ${getErrorMessage(error)}`;
    }
  }
}

async function restoreSelectedVersion(): Promise<void> {
  if (selectedVersionHtml === null) return;
  const html = selectedVersionHtml;
  closeModal('version-history-modal');
  if (isCodeView) {
    if (codeMirrorInstance) {
      codeMirrorInstance.setValue(html);
    } else {
      const codeView = document.getElementById('editor-code-view');
      if (codeView instanceof HTMLTextAreaElement) codeView.value = html;
    }
  }
  setEditorContent(html);
  markEditorDirty();
  await saveDocument();
}

// Save Document
async function saveDocument(): Promise<void> {
  if (!editor || saveInProgress || pendingEditorConflict) return;
  saveInProgress = true;

  updateSaveStatus('Saving...');

  const codeViewHtml = getCodeViewHtml();
  if (codeViewHtml !== null) {
    editor.commands.setContent(codeViewHtml);
  }

  const content = getEditorContent();
  const savedChangeCounter = editorChangeCounter;

  try {
    if (isNoteMode && currentNoteId) {
      if (!window.BSTApi) throw new Error('API client unavailable');
      const saved = await window.BSTApi.saveEditorDocument('notes', currentNoteId, {
        expectedRevision: editorRevision,
        content,
      });
      if (typeof saved.revision === 'string') {
        editorRevision = saved.revision;
      }
      const savedDoc = isRecord(saved.document) ? (saved.document as EditorDocument) : null;
      if (savedDoc) {
        const noteIndex = allNotes.findIndex((note) => matchesNoteId(note, currentNoteId));
        if (noteIndex !== -1) allNotes[noteIndex] = savedDoc;
      }
    } else if (currentClassId) {
      if (!window.BSTApi) throw new Error('API client unavailable');
      if (generatedOutline && generatedOutline.length > 0) {
        editorDraftUpdates = { ...editorDraftUpdates, generatedOutline };
      }
      const savePayload: Record<string, unknown> = {
        expectedRevision: editorRevision,
        content,
        ...editorDraftUpdates,
      };
      if (Object.keys(editorDraftUpdates).length) persistEditorDraft();
      const saved = await window.BSTApi.saveEditorDocument('classes', currentClassId, savePayload);
      if (typeof saved.revision === 'string') {
        editorRevision = saved.revision;
      }
      const savedDoc = isRecord(saved.document) ? (saved.document as EditorDocument) : null;
      if (savedDoc) {
        const classIndex = allClasses.findIndex((cls) => matchesClassId(cls, currentClassId));
        if (classIndex !== -1) allClasses[classIndex] = savedDoc;
      }
    } else {
      // Fallback to localStorage if no class number or note ID
      currentDocument = {
        id: currentDocument?.id || 'general-content',
        title: document.getElementById('document-title')?.textContent || '',
        content,
        generatedOutline: generatedOutline || [],
        lastModified: new Date().toISOString(),
      };
      localStorage.setItem('bible-study-content', JSON.stringify(currentDocument));
    }

    if (editorChangeCounter === savedChangeCounter) {
      isDirty = false;
      editorDraftUpdates = {};
      clearEditorDraft();
      updateSaveStatus('Saved');
    } else {
      isDirty = true;
      persistEditorDraft();
      updateSaveStatus('Modified');
    }
  } catch (error: unknown) {
    if (isConflictError(error)) {
      isDirty = true;
      persistEditorDraft();
      updateSaveStatus('Conflict detected - compare versions');
      openEditorConflict({
        kind: 'conflict',
        localHtml: content.html,
        latestDocument: error.payload?.latestDocument ?? null,
        latestRevision: error.payload?.latestRevision ?? '',
        localUpdates: editorDraftUpdates,
      });
      return;
    }
    console.error('Save failed:', error);
    if (isDirty) persistEditorDraft();
    updateSaveStatus('Save failed: ' + getErrorMessage(error));
  } finally {
    saveInProgress = false;
  }
}

async function saveEditorMetadata(updates: Record<string, unknown>): Promise<boolean> {
  if (!editor || !currentClassId || saveInProgress || pendingEditorConflict) return false;
  saveInProgress = true;
  updateSaveStatus('Saving...');
  const codeViewHtml = getCodeViewHtml();
  if (codeViewHtml !== null) editor.commands.setContent(codeViewHtml);
  editorDraftUpdates = { ...editorDraftUpdates, ...updates };
  persistEditorDraft();
  const savedChangeCounter = editorChangeCounter;
  try {
    if (!window.BSTApi) throw new Error('API client unavailable');
    const saved = await window.BSTApi.saveEditorDocument('classes', currentClassId, {
      expectedRevision: editorRevision,
      content: getEditorContent(),
      ...updates,
    });
    if (typeof saved.revision === 'string') {
      editorRevision = saved.revision;
    }
    const savedDoc = isRecord(saved.document) ? (saved.document as EditorDocument) : null;
    if (savedDoc) {
      const classIndex = allClasses.findIndex((cls) => matchesClassId(cls, currentClassId));
      if (classIndex !== -1) allClasses[classIndex] = savedDoc;
    }

    if (editorChangeCounter === savedChangeCounter) {
      isDirty = false;
      editorDraftUpdates = {};
      clearEditorDraft();
      updateSaveStatus('Saved');
    } else {
      isDirty = true;
      persistEditorDraft();
      updateSaveStatus('Modified');
    }
    return true;
  } catch (error: unknown) {
    if (isConflictError(error)) {
      isDirty = true;
      editorDraftUpdates = { ...editorDraftUpdates, ...updates };
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
    isDirty = true;
    editorChangeCounter += 1;
    persistEditorDraft();
    updateSaveStatus('Save failed: ' + getErrorMessage(error));
    return false;
  } finally {
    saveInProgress = false;
  }
}

// Update Save Status
function updateSaveStatus(status: string): void {
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

// Load Document
async function loadDocument(): Promise<void> {
  try {
    let loadedEditorDocument: EditorDocument | null = null;
    if (isNoteMode && currentNoteId) {
      if (!window.BSTApi) throw new Error('API client unavailable');
      const [data, versioned] = await Promise.all([
        window.BSTApi.getNotes(),
        window.BSTApi.getEditorDocument('notes', currentNoteId),
      ]);
      allNotes =
        isRecord(data) && Array.isArray(data.notes) ? (data.notes as EditorDocument[]) : [];
      const versionedDoc = isRecord(versioned.document)
        ? (versioned.document as EditorDocument)
        : null;
      if (versionedDoc) {
        const noteIndex = allNotes.findIndex((note) => matchesNoteId(note, currentNoteId));
        if (noteIndex !== -1) allNotes[noteIndex] = versionedDoc;
      }
      loadedEditorDocument = versionedDoc;
      editorRevision = typeof versioned.revision === 'string' ? versioned.revision : '';
      const note = loadedEditorDocument;
      if (note) {
        // Update document title
        const docTitleEl = document.getElementById('document-title');
        if (docTitleEl) docTitleEl.textContent = note.title || 'Note';

        // Load content
        if (note.content && (note.content.json || note.content.html)) {
          setEditorContent(note.content.json || note.content.html || '');
        } else {
          // No content yet, show a starter template for notes
          setEditorContent(getNoteStarterTemplate(note));
        }
      } else {
        setEditorContent('<p>Note not found. Creating new content...</p>');
      }
    } else if (currentClassId) {
      if (!window.BSTApi) throw new Error('API client unavailable');
      const [data, versioned] = await Promise.all([
        window.BSTApi.getClasses(),
        window.BSTApi.getEditorDocument('classes', currentClassId),
      ]);
      allClasses = normalizeClassesData(data);
      const versionedDoc = isRecord(versioned.document)
        ? (versioned.document as EditorDocument)
        : null;
      if (versionedDoc) {
        const classIndex = allClasses.findIndex((cls) => matchesClassId(cls, currentClassId));
        if (classIndex !== -1) allClasses[classIndex] = versionedDoc;
      }
      loadedEditorDocument = versionedDoc;
      editorRevision = typeof versioned.revision === 'string' ? versioned.revision : '';

      // Find class by id or classNumber (backward compatibility)
      const cls = loadedEditorDocument;
      if (cls) {
        // Update document title
        const docTitleEl = document.getElementById('document-title');
        if (docTitleEl) docTitleEl.textContent = cls.title || 'Class Content';

        // Load content
        if (cls.content && (cls.content.json || cls.content.html)) {
          setEditorContent(cls.content.json || cls.content.html || '');
        } else {
          // No content yet, show a starter template
          setEditorContent(getStarterTemplate(cls));
        }

        // Load generatedOutline if it exists
        if (cls.generatedOutline) {
          generatedOutline = cls.generatedOutline;
          console.log('[Editor] Loaded generatedOutline:', generatedOutline);
        }

        renderEditorMediaSidebar(cls);
      } else {
        setEditorContent('<p>Class not found. Creating new content...</p>');
        renderEditorMediaSidebar(null);
      }
    } else {
      // No class ID or note ID - load from localStorage or show sample
      const saved = localStorage.getItem('bible-study-content');

      if (saved) {
        currentDocument = JSON.parse(saved) as EditorDocument;
        setEditorContent(
          currentDocument.content?.json || currentDocument.content?.html || '<p></p>'
        );
        loadedEditorDocument = currentDocument;
      } else {
        setEditorContent(getSampleContent());
        loadedEditorDocument = { content: { html: editor ? editor.getHTML() : '' } };
      }

      renderEditorMediaSidebar(null);
    }

    // Update outline navigator - use generatedOutline if available (only for classes)
    if (!isNoteMode && generatedOutline && generatedOutline.length > 0) {
      updateOutlineNavigatorFromGenerated(generatedOutline);
    } else {
      updateOutlineNavigator();
    }
    isDirty = false;
    checkForLocalEditorDraft(loadedEditorDocument);
    if (!pendingEditorConflict) updateSaveStatus('Saved');
    updateToolbarActiveStates(editor);
  } catch (error: unknown) {
    console.error('Load failed:', error);
    setEditorContent('<p>Failed to load content. Start editing here...</p>');
    renderEditorMediaSidebar(null);
  }
}

// Get starter template for notes
function getNoteStarterTemplate(note: EditorDocument): string {
  return `
    <h1>${note.title || 'Untitled Note'}</h1>
    <p>Start writing your notes here...</p>
  `;
}

// Get Sample Content (from existing markdown)
function getSampleContent(): string {
  return `
        <h1>How do we trust scripture?</h1>

        <h2>1. What warning is repeated across these passages?</h2>

        <p>Pay attention to the language of adding, taking away, commands, words, and authority.</p>

        <h3>Proverbs 30:5–6 NKJV</h3>

        <blockquote>
            <p><em>Every word of God is pure;</em></p>
            <p><em>He is a shield to those who put their trust in Him.</em></p>
            <p><em>Do not add to His words,</em></p>
            <p><em>Lest He rebuke you, and you be found a liar.</em></p>
        </blockquote>

        <h3>A — Every word of God is pure</h3>

        <p>The words that we have are correct and accurate, they are truth. Too many times in our culture in order to tear down Scripture people will pull out verses, they will take them out of context and accuse God of being unloving, unjust, or contradictory - but anytime they do this, when we are properly prepared, we can put the verse back into context and show the purity of the word in all cases.</p>

        <p>God's Word is not something that will break under pressure - God invites doubt and intense study because <strong>truth is not afraid of the light</strong>.</p>

        <h4>Examples:</h4>

        <p><strong>Verse: Elisha and the Bears (2 Kings 2:23-25)</strong></p>

        <h5>2 Kings 2:23–25 NKJV</h5>

        <blockquote>
            <p>Then he went up from there to Bethel; and as he was going up the road, some youths came from the city and mocked him, and said to him, "Go up, you baldhead! Go up, you baldhead!"</p>
            <p>So he turned around and looked at them, and pronounced a curse on them in the name of the Lord. And two female bears came out of the woods and mauled forty-two of the youths.</p>
            <p>Then he went from there to Mount Carmel, and from there he returned to Samaria.</p>
        </blockquote>

        <p><strong>Criticism:</strong> 42 children were mauled by God just because they made fun of this prophet for being bald - that doesn't seem like a very forgiving thing to do...</p>
    `;
}

// Get Starter Template for a class
function getStarterTemplate(cls: EditorDocument): string {
  return `
        <h1>${cls.title || 'Class Title'}</h1>

        <h2>${cls.subtitle || 'Subtitle'}</h2>

        <p>Welcome to this Bible study class. Begin creating your lesson content here.</p>

        <h3>Key Topics</h3>
        <ul>
            <li>Topic 1</li>
            <li>Topic 2</li>
            <li>Topic 3</li>
        </ul>

        <h3>Discussion Questions</h3>
        <ol>
            <li>Question 1?</li>
            <li>Question 2?</li>
        </ol>

        <p>Start adding your content using the toolbar above. You can format text, add Bible references, images, and more!</p>
    `;
}

// Show Preview
export function showPreview(): void {
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

// View Teacher - Navigate to teacher view for current class
function viewTeacher(): void {
  if (!currentClassId) {
    alert('No class selected. Please open this editor from a specific class.');
    return;
  }
  window.open(`teacher.html?class=${currentClassId}`, 'TeacherView', 'width=1200,height=800');
}

// Open Outline Modal - checks LLM availability and opens modal
async function openOutlineModal(): Promise<void> {
  openModal('outline-modal');

  // Check LLM availability
  const statusDiv = document.getElementById('llm-status');
  try {
    const llmAvailable = await checkOllamaAvailability();

    if (llmAvailable) {
      if (statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#d4edda';
        statusDiv.style.color = '#155724';
        statusDiv.style.border = '1px solid #c3e6cb';
        statusDiv.innerHTML =
          '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">check_circle</span> Ollama is running and ready';
      }

      // Try to get installed models
      try {
        const rawModels = window.getInstalledModels ? await window.getInstalledModels() : [];
        const models = rawModels.filter(
          (m): m is InstalledModelEntry =>
            isRecord(m) && typeof m.name === 'string' && typeof m.size === 'number'
        );
        if (models.length > 0) {
          const select = document.getElementById('llm-model-select');
          if (select instanceof HTMLSelectElement) {
            select.innerHTML = models
              .map(
                (m) => `<option value="${m.name}">${m.name} (${(m.size / 1e9).toFixed(1)}GB)</option>`
              )
              .join('');
          }
        }
      } catch (e: unknown) {
        console.warn('Could not get installed models:', e);
      }
    } else {
      if (statusDiv) statusDiv.style.display = 'none';
      // Auto-select standard method if LLM not available
      const standardRadio = document.querySelector('input[name="outline-method"][value="standard"]');
      if (standardRadio instanceof HTMLInputElement) {
        standardRadio.checked = true;
      }
      handleOutlineMethodChange();
    }
  } catch (error: unknown) {
    console.warn('LLM check failed:', error);
  }
}

// Handle outline generation method change
function handleOutlineMethodChange(): void {
  const checkedRadio = document.querySelector('input[name="outline-method"]:checked');
  const selectedMethod = checkedRadio instanceof HTMLInputElement ? checkedRadio.value : 'standard';
  const llmOptions = document.getElementById('llm-options');
  const llmStatus = document.getElementById('llm-status');
  const enhanceBtn = document.getElementById('btn-enhance-outline');

  if (selectedMethod === 'llm') {
    if (llmOptions) llmOptions.style.display = 'block';
    if (llmStatus && (llmStatus.textContent || '').includes('not running')) {
      llmStatus.style.display = 'block';
    }
    // Show enhance button when using standard method (can enhance later)
    if (enhanceBtn) enhanceBtn.style.display = 'none';
  } else {
    if (llmOptions) llmOptions.style.display = 'none';
    // Show enhance button after standard generation
    if (generatedOutline && generatedOutline.length > 0 && enhanceBtn) {
      enhanceBtn.style.display = 'inline-block';
    }
  }
}

// Generate outline (either standard or LLM-based)
async function generateAndShowOutline(): Promise<void> {
  if (!editor) return;
  const checkedRadio = document.querySelector('input[name="outline-method"]:checked');
  const selectedMethod = checkedRadio instanceof HTMLInputElement ? checkedRadio.value : 'standard';
  const useAI = selectedMethod === 'llm';

  const startBtn = document.getElementById('btn-start-generation');
  const previewDiv = document.getElementById('outline-preview');

  // Show loading state
  if (startBtn instanceof HTMLButtonElement) {
    startBtn.disabled = true;
    startBtn.textContent = useAI ? 'Generating with AI...' : 'Generating...';
  }
  if (previewDiv) {
    previewDiv.innerHTML = `
        <div style="text-align: center; padding: 60px; color: var(--text-muted);">
            <div style="font-size: 48px; margin-bottom: 16px;"><span class="material-symbols-outlined" style="font-size: 48px;">hourglass_bottom</span></div>
            <div style="font-size: 16px; margin-bottom: 8px;">${useAI ? 'AI is analyzing your content...' : 'Parsing content structure...'}</div>
            <div style="font-size: 13px;">${useAI ? 'This may take 1-3 minutes (first run is slower)' : 'This should be quick'}</div>
            ${useAI ? '<div style="font-size: 12px; margin-top: 12px; color: var(--text-muted);"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: text-bottom;">lightbulb</span> Tip: Try "Phi-3" model for faster results</div>' : ''}
        </div>
    `;
  }

  try {
    let options: LlmGenerateOptions = {};
    if (useAI) {
      const modelSelect = document.getElementById('llm-model-select');
      const selectedModel = modelSelect instanceof HTMLSelectElement ? modelSelect.value : undefined;
      options = { model: selectedModel };
    }

    if (!window.generateOutline || !window.formatOutlineHTML) {
      throw new Error('Outline generator is unavailable');
    }

    // Generate outline using the selected method
    generatedOutline = await window.generateOutline(toOutlineEditorAdapter(editor), useAI, options);

    if (!generatedOutline || generatedOutline.length === 0) {
      if (useAI) {
        throw new Error(
          'Could not generate outline from content. Please add more text (at least a few paragraphs).'
        );
      } else {
        throw new Error(
          'No headings found in document. For standard generation, use headings (H1-H6). Or try AI-Enhanced mode which works with any content.'
        );
      }
    }

    // Format and display
    const html = window.formatOutlineHTML(generatedOutline);
    if (previewDiv) previewDiv.innerHTML = html;

    // Enable action buttons
    const copyOutlineBtn = document.getElementById('btn-copy-outline');
    const applyOutlineBtn = document.getElementById('btn-apply-outline');
    if (copyOutlineBtn instanceof HTMLButtonElement) copyOutlineBtn.disabled = false;
    if (applyOutlineBtn instanceof HTMLButtonElement) applyOutlineBtn.disabled = false;

    // Show enhance button if standard method was used
    if (!useAI) {
      const enhanceBtn = document.getElementById('btn-enhance-outline');
      if (enhanceBtn instanceof HTMLButtonElement) {
        enhanceBtn.style.display = 'inline-block';
        enhanceBtn.disabled = false;
      }
    }

    // Update outline navigator with generated structure
    updateOutlineNavigatorFromGenerated(generatedOutline);

    // Automatically inject Q&A pause markers where the AI identified qa-breaks
    if (useAI) {
      injectQAPauseMarkers(generatedOutline);
    }

    console.log('Generated outline:', generatedOutline);

    // Success feedback
    if (startBtn instanceof HTMLButtonElement) {
      startBtn.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">check_circle</span>Generated Successfully';
      setTimeout(() => {
        startBtn.innerHTML =
          '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">auto_awesome</span>Generate Outline';
        startBtn.disabled = false;
      }, 2000);
    }
  } catch (error: unknown) {
    console.error('Outline generation failed:', error);

    const errorMsg = getErrorMessage(error) || 'Unknown error occurred';
    let suggestions = '';

    // Provide helpful error messages
    if (errorMsg.includes('timed out') || errorMsg.includes('timeout')) {
      suggestions = `
                <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 6px; margin-top: 16px; text-align: left;">
                    <strong>⏱️ The AI is taking longer than expected</strong>
                    <div style="margin-top: 8px; font-size: 13px;">
                        <p style="margin: 8px 0;">This can happen when:</p>
                        <ul style="margin: 4px 0; padding-left: 20px;">
                            <li>Your content is very long (try with shorter content first)</li>
                            <li>The model is still loading into memory (first run is slower)</li>
                            <li>Your computer is using CPU instead of GPU</li>
                        </ul>
                        <p style="margin: 12px 0 4px 0;"><strong>Try these solutions:</strong></p>
                        <ul style="margin: 4px 0; padding-left: 20px;">
                            <li>Use a faster model: Select "Phi-3 (Fastest)" from the dropdown</li>
                            <li>Reduce your content to 1-2 pages of text</li>
                            <li>Wait a minute and try again (model might still be loading)</li>
                            <li>Use "Standard" mode instead (instant, no AI needed)</li>
                        </ul>
                    </div>
                </div>
            `;
    } else if (
      errorMsg.includes('Ollama') ||
      errorMsg.includes('Not Found') ||
      errorMsg.includes('404')
    ) {
      suggestions = `
                <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 6px; margin-top: 16px; text-align: left;">
                    <strong><span class="material-symbols-outlined" style="font-size: 16px; vertical-align: text-bottom;">lightbulb</span> To use AI generation:</strong>
                    <ol style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13px;">
                        <li>Download Ollama from <a href="https://ollama.ai" target="_blank" style="color: #0066cc;">ollama.ai</a></li>
                        <li>Install and start it (should auto-start)</li>
                        <li>Open PowerShell and run: <code style="background: #000; color: #0f0; padding: 2px 6px; border-radius: 3px;">ollama pull llama3.1</code></li>
                        <li>Wait for download to complete (~4.7GB)</li>
                        <li>Reload this page and try again</li>
                    </ol>
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #ffc107;">
                        <strong>Or use Standard generation:</strong><br>
                        <span style="font-size: 13px;">Switch to "Standard" mode above - works instantly without AI (requires headings in your document)</span>
                    </div>
                </div>
            `;
    }

    if (previewDiv) {
      previewDiv.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 16px;"><span class="material-symbols-outlined" style="font-size: 48px;">warning</span></div>
                <div style="font-size: 16px; margin-bottom: 8px; color: var(--danger);"><strong>AI Generation Failed</strong></div>
                <div style="font-size: 14px; color: var(--text-muted); margin-bottom: 8px;">${errorMsg}</div>
                ${suggestions}
            </div>
        `;
    }

    if (startBtn instanceof HTMLButtonElement) {
      startBtn.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">refresh</span>Try Again';
      startBtn.disabled = false;
    }
  }
}

// Enhance existing outline with AI
async function enhanceCurrentOutline(): Promise<void> {
  if (!editor || !generatedOutline || generatedOutline.length === 0) {
    alert('No outline to enhance');
    return;
  }

  const enhanceBtn = document.getElementById('btn-enhance-outline');
  const previewDiv = document.getElementById('outline-preview');

  try {
    // Check if Ollama is available
    const isAvailable = await checkOllamaAvailability();
    if (!isAvailable) {
      alert('Ollama is not running. Please start Ollama to use AI enhancement.');
      return;
    }

    if (enhanceBtn instanceof HTMLButtonElement) {
      enhanceBtn.disabled = true;
      enhanceBtn.innerHTML =
        '<span class="material-symbols-outlined rotating" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">progress_activity</span>Enhancing...';
    }

    if (!window.enhanceOutlineWithLLM || !window.formatOutlineHTML) {
      throw new Error('Outline enhancement service unavailable');
    }

    const enhanced = await window.enhanceOutlineWithLLM(
      generatedOutline,
      toOutlineEditorAdapter(editor)
    );
    generatedOutline = enhanced;

    // Update display
    const html = window.formatOutlineHTML(generatedOutline);
    if (previewDiv) previewDiv.innerHTML = html;

    // Inject Q&A markers after enhancement
    injectQAPauseMarkers(generatedOutline);

    if (enhanceBtn instanceof HTMLButtonElement) {
      enhanceBtn.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">check_circle</span>Enhanced';
      setTimeout(() => {
        enhanceBtn.innerHTML =
          '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">auto_fix_high</span>Enhance with AI';
        enhanceBtn.disabled = false;
      }, 2000);
    }
  } catch (error: unknown) {
    console.error('Enhancement failed:', error);
    alert('Failed to enhance outline: ' + getErrorMessage(error));
    if (enhanceBtn instanceof HTMLButtonElement) {
      enhanceBtn.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">auto_fix_high</span>Enhance with AI';
      enhanceBtn.disabled = false;
    }
  }
}

// Copy outline JSON to clipboard
async function copyOutlineJSON(): Promise<void> {
  if (!generatedOutline) {
    alert('No outline generated yet');
    return;
  }

  const exportJson = window.exportOutlineJSON
    ? window.exportOutlineJSON(generatedOutline)
    : JSON.stringify(generatedOutline, null, 2);

  try {
    await navigator.clipboard.writeText(exportJson);

    // Visual feedback
    const btn = document.getElementById('btn-copy-outline');
    if (btn) {
      const originalHtml = btn.innerHTML;
      btn.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">done</span>Copied!';
      setTimeout(() => {
        btn.innerHTML = originalHtml;
      }, 2000);
    }
  } catch (error: unknown) {
    console.error('Copy failed:', error);
    // Fallback: show in a textarea for manual copy
    const textarea = document.createElement('textarea');
    textarea.value = exportJson;
    textarea.style.cssText =
      'position: fixed; top: 50%; left: 50%; width: 80%; height: 300px; z-index: 10000;';
    document.body.appendChild(textarea);
    textarea.select();
    alert('Select all and copy the JSON below');
  }
}

// Apply outline to the current class
async function applyOutlineToClass(): Promise<void> {
  if (!generatedOutline) {
    alert('No outline generated yet');
    return;
  }

  if (!currentClassId) {
    alert('No class selected. Open this editor from a specific class to apply the outline.');
    return;
  }

  try {
    // Find and update the class (support both id and classNumber)
    const classIndex = allClasses.findIndex((c) => matchesClassId(c, currentClassId));
    console.log(
      `Looking for class with id/classNumber: ${currentClassId}, found at index: ${classIndex}`
    );

    if (classIndex !== -1) {
      // Save to generatedOutline field (for viewing in teacher tab)
      allClasses[classIndex].generatedOutline = generatedOutline;

      // Also save to outline field (this replaces the guide with the generated outline)
      allClasses[classIndex].outline = generatedOutline;
      console.log(`Updated class at index ${classIndex} with outline`);
      console.log('Outline structure:', generatedOutline);

      console.log('Saving outline with the current document revision');
      const saved = await saveEditorMetadata({
        generatedOutline,
        outline: generatedOutline,
      });
      if (!saved) return;

      // Update the outline navigator to reflect new structure
      updateOutlineNavigatorFromGenerated(generatedOutline);

      alert('Outline applied to class successfully!');
      closeModal('outline-modal');
      console.log('Applied outline:', generatedOutline);
    } else {
      throw new Error('Class not found');
    }
  } catch (error: unknown) {
    console.error('Apply outline failed:', error);
    alert('Failed to apply outline: ' + getErrorMessage(error));
  }
}

// AI Assistant Functions
async function openAIAssistant(): Promise<void> {
  openModal('ai-assistant-modal');

  // Check AI availability
  const statusDiv = document.getElementById('ai-status');
  if (!statusDiv) return;
  try {
    const aiAvailable = await checkOllamaAvailability();

    if (aiAvailable) {
      statusDiv.style.display = 'block';
      statusDiv.style.background = '#d4edda';
      statusDiv.style.color = '#155724';
      statusDiv.style.border = '1px solid #c3e6cb';
      statusDiv.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">check_circle</span> AI is ready to help!';
    } else {
      statusDiv.style.display = 'block';
      statusDiv.style.background = '#fff3cd';
      statusDiv.style.color = '#856404';
      statusDiv.style.border = '1px solid #ffc107';
      statusDiv.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">warning</span> Ollama is not running. Please start Ollama to use AI features.';
    }
  } catch {
    statusDiv.style.display = 'block';
    statusDiv.style.background = '#f8d7da';
    statusDiv.style.color = '#721c24';
    statusDiv.style.border = '1px solid #f5c6cb';
    statusDiv.innerHTML =
      '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">error</span> Could not connect to AI service.';
  }
}

async function askAIQuestion(): Promise<void> {
  if (!editor) return;
  const questionInput = document.getElementById('ai-question');
  const question =
    questionInput instanceof HTMLInputElement || questionInput instanceof HTMLTextAreaElement
      ? questionInput.value.trim()
      : '';

  if (!question) {
    alert('Please enter a question');
    return;
  }

  const askBtn = document.getElementById('btn-ask-ai');
  const responseContainer = document.getElementById('ai-response-container');
  const responseDiv = document.getElementById('ai-response');

  // Show loading state
  if (askBtn instanceof HTMLButtonElement) {
    askBtn.disabled = true;
    askBtn.innerHTML =
      '<span class="material-symbols-outlined rotating" style="vertical-align: middle; font-size: 18px;">progress_activity</span> Thinking...';
  }
  if (responseContainer) responseContainer.style.display = 'block';
  if (responseDiv) responseDiv.innerHTML = '<em style="color: #666;">AI is analyzing your content...</em>';

  try {
    // Check if AI is available
    const aiAvailable = await checkOllamaAvailability();
    if (!aiAvailable) {
      throw new Error('AI service is not available. Please ensure Ollama is running.');
    }

    // Get editor content
    const editorText = editor.getText();

    if (!editorText || editorText.trim().length < 10) {
      throw new Error('Please add some content to your document before asking questions.');
    }

    // Build context-aware prompt
    const systemPrompt = `You are a helpful Bible study curriculum assistant. The user is creating Bible study content and needs your expertise.

Here is the content they are working on:

${editorText}

Please answer their question thoughtfully, considering the content they've created. Provide practical, actionable suggestions that would enhance their Bible study lesson.`;

    if (!window.generateCompletion) {
      throw new Error('AI completion service is not available.');
    }

    // Generate AI response
    const response = await window.generateCompletion(question, {
      system: systemPrompt,
      temperature: 0.7,
      model: 'llama3.1',
    });

    // Display response
    if (responseDiv) responseDiv.innerHTML = response || 'No response received from AI.';
  } catch (error: unknown) {
    console.error('AI question failed:', error);
    if (responseDiv) {
      responseDiv.innerHTML = `<span style="color: #721c24;"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: text-bottom;">error</span> Error: ${getErrorMessage(error)}</span>`;
    }
  } finally {
    // Reset button
    if (askBtn instanceof HTMLButtonElement) {
      askBtn.disabled = false;
      askBtn.innerHTML =
        '<span class="material-symbols-outlined" style="vertical-align: middle; font-size: 18px;">send</span> Ask AI';
    }
  }
}

async function copyAIResponse(): Promise<void> {
  const responseDiv = document.getElementById('ai-response');
  const text = responseDiv?.textContent || '';

  try {
    await navigator.clipboard.writeText(text);

    const copyBtn = document.getElementById('btn-copy-response');
    if (copyBtn) {
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML =
        '<span class="material-symbols-outlined" style="vertical-align: middle; font-size: 18px;">check</span> Copied!';
      copyBtn.style.background = '#28a745';

      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
        copyBtn.style.background = '';
      }, 2000);
    }
  } catch (error: unknown) {
    alert('Failed to copy: ' + getErrorMessage(error));
  }
}

// Export for debugging
window.editor = editor;
