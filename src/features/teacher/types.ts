export type NormalizedPausePoint = {
  time: number;
  label: string;
};

export interface TeacherMediaItem extends MediaItem {
  reference?: string;
  translation?: string;
  prompt?: string;
  answer?: string;
  content?: string;
}

export interface TeacherOutlineSection extends ClassOutlineSection {
  media?: TeacherMediaItem[];
}

export interface TeacherEditorContent {
  html?: string;
  [key: string]: unknown;
}

export interface TeacherClassConfig extends ClassConfig {
  bibleTranslation?: string;
  stoppedAtSection?: string | null;
  stoppedAtEditorHeading?: string | null;
  stoppedAtEditorLine?: string | null;
  stoppedMarkerUpdatedAt?: string | null;
  stoppedMarkerAction?: string | null;
  content?: TeacherEditorContent;
  generatedOutline?: OutlineSection[];
  outline?: TeacherOutlineSection[];
}

export interface ClassesPayloadObject {
  classes?: TeacherClassConfig[];
  [key: string]: unknown;
}

export type ClassesDataStore =
  | TeacherClassConfig[]
  | ClassesPayloadObject
  | TeacherClassConfig
  | null;

export interface BroadcastChannelLike {
  postMessage: (message: unknown) => void;
  close?: () => void;
}

export interface CommandPayload {
  index?: number;
  media?: TeacherMediaItem | Record<string, unknown>;
  [key: string]: unknown;
}

export interface StoppedMarkerUpdate {
  sectionId?: string | null;
  headingId?: string | null;
  lineId?: string | null;
}

export interface SanitizeConfig {
  allowedTags: Set<string>;
  allowedAttributes: Set<string>;
  allowedStyleProperties: Set<string>;
}

export interface BibleListEntry {
  abbreviation?: string;
  name?: string;
  language?: {
    name?: string;
  };
}

export interface BibleListResponse {
  data?: BibleListEntry[];
}

export interface SaveClassesResponse {
  partialSuccess?: boolean;
  warning?: string;
  supabaseSync?: boolean;
  cloudSync?: {
    ok?: boolean;
    message?: string;
  };
}

export interface ImportedNotesPayload {
  notesHtml?: unknown;
  questions?: Record<string, unknown>;
}

export interface TeacherRuntimeState {
  classId: string;
  classConfig: TeacherClassConfig;
  videoId: string;
  pausePoints: NormalizedPausePoint[];
  channelKey: string;
  storageFallbackKey: string;
  notesKey: string;
  questionPrefix: string;
  currentMediaType: string | null;
  allClassesData: ClassesDataStore;
  channel: BroadcastChannelLike | null;
  statusEl: HTMLElement | null;
  pauseListEl: HTMLElement | null;
  notesEl: HTMLElement | null;
  downloadBtn: HTMLElement | null;
  uploadBtn: HTMLElement | null;
  fileInput: HTMLInputElement | null;
  questionFields: HTMLTextAreaElement[];
  displayWindow: Window | null;
  displayWindowCheckInterval: number | null;
  customContextMenu: HTMLDivElement | null;
}
