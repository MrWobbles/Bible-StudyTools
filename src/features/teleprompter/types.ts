export type ViewMode = 'word' | 'scroll';
export type BlockType = 'heading' | 'bullet' | 'paragraph' | 'image' | 'sentence';
export type SpeechAvailability = 'available' | 'downloading' | 'downloadable' | 'unavailable';

export interface ClassEditorContent {
  html?: string;
}

export interface TeleprompterClassConfig extends ClassConfig {
  content?: ClassEditorContent;
}

export interface TeleprompterMedia {
  type: string;
  title?: string;
  reference?: string;
  translation?: string;
  url?: string;
  sources?: Array<{ url?: string }>;
  fullscreen?: boolean;
  [key: string]: unknown;
}

export interface OutlineBlock {
  text: string;
  html?: string;
  verse?: string;
  media?: TeleprompterMedia | null;
  url?: string;
  title?: string;
  type: BlockType;
  sectionTitle: string;
}

export interface IndexedOutlinePoint extends OutlineBlock {
  index: number;
  fullPoint: OutlineBlock;
}

export interface ErrorLogEntry {
  timestamp: number;
  timeElapsed: number;
  message: string;
  context: Record<string, unknown>;
  type: 'error' | 'warning';
}

export interface ErrorReport {
  uptime: number;
  errorCount: number;
  warningCount: number;
  errors: ErrorLogEntry[];
  warnings: ErrorLogEntry[];
}

export interface DebugReport extends ErrorReport {
  timestamp: string;
  userAgent: string;
  platform: string;
  language: string;
  onLine: boolean;
  classId: string;
  classTitle: string;
  pointsLoaded: number;
  isListening: boolean;
}

export interface DisplayMessagePayload {
  type: 'displayMedia' | 'clearScreen' | 'versePrevious' | 'verseNext' | 'blackout';
  media?: TeleprompterMedia;
  sentAt?: number;
}

export interface SequentialMatchResult {
  matchedCount: number;
  totalWords: number;
  percentage: number;
  spokenWords?: string[];
  pointWords?: string[];
}

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

export interface SpeechRecognitionInstanceLike {
  continuous: boolean;
  interimResults: boolean;
  language: string;
  processLocally?: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface SpeechRecognitionAvailabilityOptions {
  langs: string[];
  processLocally: boolean;
  quality: string;
}

export interface SpeechRecognitionConstructorLike {
  new (): SpeechRecognitionInstanceLike;
  available?: (options: SpeechRecognitionAvailabilityOptions) => Promise<SpeechAvailability>;
  install?: (options: SpeechRecognitionAvailabilityOptions) => Promise<boolean>;
}

export interface TeleprompterConfig {
  language: string;
  continuous: boolean;
  interimResults: boolean;
  matchThreshold: number;
  autoAdvanceDelay: number;
  confidenceThreshold: number;
  maxUpcomingPoints: number;
  SMOOTH_SCROLL_DURATION: number;
  SLIDING_WINDOW_SIZE: number;
  AUTO_ADVANCE_THRESHOLD: number;
  MIN_MATCHED_WORDS: number;
  CONFIDENCE_STREAK: number;
  REWIND_THRESHOLD: number;
  LOW_CONFIDENCE_FREEZE: boolean;
}

export interface TeleprompterState {
  classConfig: TeleprompterClassConfig;
  classId: string;
  currentPointIndex: number;
  allOutlinePoints: IndexedOutlinePoint[];
  isListening: boolean;
  userInitiatedStop: boolean;
  listeningTimeout: ReturnType<typeof setTimeout> | null;
  recognitionInstance: SpeechRecognitionInstanceLike | null;
  speechRecognitionSetup: boolean;
  networkErrorCount: number;
  consecutiveHighConfidenceMatches: number;
  isTrackingFrozen: boolean;
  targetScrollPosition: number;
  currentScrollPosition: number;
  scrollAnimationId: number | null;
  scrollVelocity: number;
  isScrolling: boolean;
  isProgrammaticScroll: boolean;
  scrollRemainder: number;
  lastScrollTime: number;
  scrollLoopId: number | null;
  viewMode: ViewMode;
  scrollUpdateId: number | null;
  displayChannel: BroadcastChannel | null;
  shownMediaId: string | null;
}
