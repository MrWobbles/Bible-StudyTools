interface BSTPaletteApi {
  withFade: (change: () => void, ms?: number, useViewTransition?: boolean) => void;
  generate: (mode: ThemeId | string, hues?: number[]) => PaletteResult;
  apply: (hues: number[], mode?: ThemeId | string) => void;
  clear: () => void;
  applyFromCache: () => void;
  contrast: (a: RgbColor, b: RgbColor) => number;
  luminance: (rgb: RgbColor) => number;
  hslToRgb: (h: number, s: number, l: number) => RgbColor;
  toHex: (rgb: RgbColor) => string;
}

interface BSTThemeApi {
  applyTheme: (theme: string) => void;
  toggleTheme: () => void;
  initThemeToggle: () => void;
}

interface BSTBackgroundApi {
  refresh: () => Promise<void>;
}

interface BSTApiClient {
  fetch: (url: string, options?: RequestInit, config?: ApiSecurityConfig) => Promise<Response>;
  fetchJson: <T = unknown>(url: string, options?: RequestInit, config?: ApiSecurityConfig) => Promise<T>;
  getClasses: () => Promise<ClassConfig[] | { classes: ClassConfig[] } | ClassConfig>;
  getLessonPlans: () => Promise<unknown>;
  getNotes: () => Promise<unknown>;
  getEditorDocument: (docType: string, recordId: string) => Promise<Record<string, unknown>>;
  saveEditorDocument: (docType: string, recordId: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  uploadImageToDrive: (folderName: string, file: File) => Promise<Record<string, unknown>>;
  sendDisplayCommand: (channel: string, command: object) => Promise<void>;
  listEditorVersions: (docType: string, recordId: string) => Promise<unknown>;
  getEditorVersion: (docType: string, recordId: string, seq: string | number) => Promise<unknown>;
  deleteSupabaseClass: (classId: string) => Promise<unknown>;
  upsertSupabaseLessonPlan: (planId: string, lessonPlanPayload: Record<string, unknown>) => Promise<unknown>;
  deleteSupabaseLessonPlan: (planId: string) => Promise<unknown>;
  upsertSupabaseNote: (noteId: string, notePayload: Record<string, unknown>) => Promise<unknown>;
  deleteSupabaseNote: (noteId: string) => Promise<unknown>;
  getCurrentUser: () => Promise<{ user?: AuthUser }>;
  listSignupRequests: (status?: string) => Promise<{ requests?: SignupRequest[] }>;
  listUserAccounts: () => Promise<{ accounts?: UserAccount[] }>;
  approveSignupRequest: (requestId: string, payload?: Record<string, unknown>) => Promise<{ inviteCode?: string }>;
  rejectSignupRequest: (requestId: string, payload?: Record<string, unknown>) => Promise<unknown>;
  resetAccountPassword: (identifier: string, newPassword: string) => Promise<unknown>;
  removeAccount: (identifier: string) => Promise<unknown>;
  loginWithPassword: (identifier: string, password: string) => Promise<Record<string, unknown>>;
  refreshAuthSession: () => Promise<boolean>;
  ensureAuthenticated: (options?: { redirectTo?: string }) => Promise<AuthUser | null>;
  ensureAdminAccess: (options?: { redirectTo?: string }) => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  getAdminToken: () => string;
  setAdminToken: (token: string) => void;
  getAccessToken: () => string;
  getRefreshToken: () => string;
  setAuthSession: (session: AuthSession | null | undefined) => void;
  clearAuthSession: () => void;
  clearAdminToken: () => void;
  isLoopbackHost: () => boolean;
  isAdminUser: (user: unknown) => user is AuthUser;
}

interface YouTubePlayerInstance {
  destroy: () => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
  getVolume?: () => number;
  setVolume?: (volume: number) => void;
  isMuted?: () => boolean;
  mute?: () => void;
  unMute?: () => void;
  loadVideoById?: (videoId: string | { videoId: string; startSeconds?: number }) => void;
  cueVideoById?: (videoId: string | { videoId: string; startSeconds?: number }) => void;
}

interface YouTubePlayerEvent {
  target: YouTubePlayerInstance;
  data?: number;
}

interface Window {
  BIBLE_STUDY_CONFIG?: BibleStudyConfig;
  BIBLE_STUDY_CONFIG_READY?: boolean;
  VIDEO_ID?: string;
  player?: YouTubePlayerInstance;
  updatePlayerReference?: (player: YouTubePlayerInstance) => void;
  onPlayerReady?: (event: YouTubePlayerEvent) => void;
  onPlayerStateChange?: (event: YouTubePlayerEvent) => void;
  returnToDefaultView?: () => void;
  BSTPalette?: BSTPaletteApi;
  BSTTheme?: BSTThemeApi;
  BSTBackground?: BSTBackgroundApi;
  BSTApi?: BSTApiClient;
  getIconHTML?: (iconName: string, options?: IconOptions) => string;
  getMediaIcon?: (type: string) => string;
  getPointIcon?: (type: string) => string;
  ICON_MAP?: Record<string, string>;
  updateStatus?: (id: string, status: DjTrackStatus) => Promise<void>;
  deleteTrack?: (id: string) => Promise<void>;
  selectTrackForRequest?: (track: DjTrack, isPreApproved?: boolean) => void;
  upvoteTrack?: (id: string) => Promise<void>;
  checkOllamaAvailability?: () => Promise<boolean>;
  getInstalledModels?: () => Promise<unknown[]>;
  generateCompletion?: (prompt: string, options?: LlmGenerateOptions) => Promise<string>;
  generateOutlineStructure?: (content: string, options?: LlmGenerateOptions) => Promise<OutlineSection[]>;
  enhanceOutline?: (existingOutline: OutlineSection[], content: string) => Promise<OutlineSection[]>;
  generateQuestions?: (topic: string, count?: number) => Promise<OutlineQuestion[]>;
  LLM_CONFIG?: LlmConfig;
  generateOutlineFromEditor?: (editor: OutlineEditorAdapter) => OutlineSection[];
  parseEditorToOutline?: (editorContent: TipTapJsonNode) => OutlineSection[];
  extractVerseReferences?: (text: string) => string[];
  formatOutlineHTML?: (outline: OutlineSection[]) => string;
  exportOutlineJSON?: (outline: OutlineSection[]) => string;
  generateOutlineWithLLM?: (editor: OutlineEditorAdapter, options?: LlmGenerateOptions) => Promise<OutlineSection[]>;
  generateOutline?: (editor: OutlineEditorAdapter, useLLM?: boolean, options?: LlmGenerateOptions) => Promise<OutlineSection[]>;
  enhanceOutlineWithLLM?: (outline: OutlineSection[], editor: OutlineEditorAdapter) => Promise<OutlineSection[]>;
  YT?: {
    Player: new (
      elementId: string,
      options: {
        height?: string | number;
        width?: string | number;
        videoId?: string;
        playerVars?: Record<string, unknown>;
        events?: {
          onReady?: (event: YouTubePlayerEvent) => void;
          onStateChange?: (event: YouTubePlayerEvent) => void;
          onError?: (event: YouTubePlayerEvent) => void;
        };
      }
    ) => YouTubePlayerInstance;
    PlayerState?: Record<string, number>;
  };
  VIDEO_START?: number;
  onYouTubeIframeAPIReady?: () => void;
  bst?: BstDesktopBridge;
  teacherMediaList?: MediaItem[];
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  onDeviceSpeechAvailable?: boolean;
  getDebugReport?: () => unknown;
  copyDebugReport?: () => void;
  editor?: unknown;
  _verseLookupThoughtResults?: {
    from: number;
    to: number;
    verses: Array<{ reference: string; text: string }>;
  };
  html_beautify?: (
    html: string,
    options?: { indent_size?: number; wrap_attributes?: string; preserve_newlines?: boolean }
  ) => string;
  CodeMirror?: {
    fromTextArea: (textarea: HTMLTextAreaElement, options: Record<string, unknown>) => CodeMirrorInstance;
  };
}

declare const YT: NonNullable<Window['YT']>;

declare const QRCode: {
  toCanvas: (
    text: string,
    options: { width?: number; margin?: number; color?: { dark?: string; light?: string } },
    callback: (err: Error | null, canvas: HTMLCanvasElement) => void
  ) => void;
};

declare function checkOllamaAvailability(): Promise<boolean>;
declare function generateOutlineStructure(content: string, options?: LlmGenerateOptions): Promise<OutlineSection[]>;
declare function enhanceOutline(existingOutline: OutlineSection[], content: string): Promise<OutlineSection[]>;
declare function formatTime(seconds: number): string;

interface BstDesktopChannel extends BroadcastChannel {
  addMessageHandler?: (handler: (event: unknown) => void) => void;
}

interface BstDesktopBridge {
  uploadMedia?: (mediaType: string, fileName: string, data: ArrayBuffer) => Promise<string>;
  downloadMedia?: (mediaType: string, url: string) => Promise<string>;
  createBroadcastChannel?: (channelName: string) => BstDesktopChannel;
}

interface SpeechRecognitionConstructor {
  new (): unknown;
  available?: (options?: Record<string, unknown>) => Promise<string>;
  install?: (options?: Record<string, unknown>) => Promise<boolean>;
}

interface CodeMirrorInstance {
  getValue: () => string;
  setValue: (value: string) => void;
  getWrapperElement: () => HTMLElement;
  refresh: () => void;
  toTextArea: () => void;
  on: (event: string, handler: () => void) => void;
}

declare module 'qrcode' {
  export interface QRCodeToDataURLOptions {
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }
  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
}
