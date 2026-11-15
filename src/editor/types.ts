import type { JSONContent } from '@tiptap/core';

export interface QAPauseAttributes {
  sectionId?: string | null;
  sectionTitle?: string;
}

export interface EditorContentPayload {
  html: string;
  json: JSONContent;
  text: string;
}

export interface EditorDocumentContent {
  html?: string;
  json?: JSONContent;
  text?: string;
}

export interface EditorDocument {
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

export interface EditorDraft {
  html: string;
  revision?: string;
  updates?: Record<string, unknown>;
  updatedAt?: string;
}

export type ConflictKind = 'draft' | 'conflict';

export interface EditorConflictState {
  kind: ConflictKind;
  localHtml: string;
  latestDocument: EditorDocument | null;
  latestRevision: string;
  localUpdates: Record<string, unknown>;
}

export interface VerseLookupResult {
  reference: string;
  text: string;
}

export interface VerseLookupThoughtState {
  from: number;
  to: number;
  verses: VerseLookupResult[];
}

export interface FetchedVerseData {
  title: string;
  text: string;
  translation: string;
}

export interface EditorMediaEntry extends MediaItem {
  reference?: string;
  prompt?: string;
  __editorMediaId: string;
}

export interface VersionDocTarget {
  docType: 'notes' | 'classes';
  recordId: string;
}

export interface EditorVersionSummary {
  seq: string | number;
  createdAt?: string;
  kind?: string;
  bytes?: number;
}

export interface HeadingEntry {
  level: number;
  text: string;
}

export interface CodeMirrorEditor {
  getValue: () => string;
  setValue: (value: string) => void;
  getWrapperElement: () => HTMLElement;
  refresh: () => void;
  toTextArea: () => void;
  on: (event: string, handler: () => void) => void;
}

export interface ConflictErrorShape {
  status: number;
  payload?: {
    latestDocument?: EditorDocument;
    latestRevision?: string;
  };
}

export interface LabsBibleVerseItem {
  verse: string | number;
  text: string;
}

export interface BibleApiSimpleResponse {
  text?: string;
  reference?: string;
  translation_name?: string;
}

export interface ApiBibleItem {
  id?: string;
  abbreviation?: string;
  abbreviationLocal?: string;
  name?: string;
}

export interface ApiBiblePassage {
  content?: string;
  reference?: string;
}

export interface InstalledModelEntry {
  name: string;
  size: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

export function isConflictError(error: unknown): error is ConflictErrorShape {
  return (
    isRecord(error) &&
    error.status === 409 &&
    isRecord(error.payload) &&
    'latestDocument' in error.payload &&
    error.payload.latestDocument !== undefined
  );
}

export function matchesClassId(cls: EditorDocument, classId: string | null): boolean {
  if (!classId) return false;
  return cls.id === classId || (cls.classNumber !== undefined && String(cls.classNumber) === classId);
}

export function matchesNoteId(note: EditorDocument, noteId: string | null): boolean {
  if (!noteId) return false;
  return note.id === noteId || note.noteId === noteId;
}

export function escapeHtml(value: unknown): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getHtmlText(html: string): string {
  const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
  return parsed.body.textContent || '';
}

export function normalizeClassesData(data: unknown): EditorDocument[] {
  if (Array.isArray(data)) {
    return data as EditorDocument[];
  }
  if (isRecord(data) && Array.isArray(data.classes)) {
    return data.classes as EditorDocument[];
  }
  return [];
}
