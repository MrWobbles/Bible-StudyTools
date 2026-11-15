export interface ElectronBroadcastChannel {
  addMessageHandler: (handler: (event: unknown) => void) => void;
  postMessage?: (message: unknown) => void;
  close?: () => void;
}

export type ControlChannel = ElectronBroadcastChannel | BroadcastChannel;

export interface NormalizedPausePoint extends Omit<PausePoint, 'time'> {
  time: number;
}

export interface StudentMediaSource extends MediaSource {
  type?: string;
}

export interface StudentMediaItem {
  type: string;
  title?: string;
  url?: string;
  videoId?: string;
  sources?: StudentMediaSource[];
  fullscreen?: boolean;
  prompt?: string;
  content?: string;
  reference?: string;
  translation?: string;
}

export interface RemoteCommandData {
  type: string;
  sentAt?: number | string;
  index?: number;
  media?: StudentMediaItem;
}

export interface VideoInfo {
  id: string;
  start: number;
}

export interface VerseData {
  title: string;
  lines: string[];
  sourceLabel: string;
}

export interface ApiBibleEntry {
  id?: string;
  abbreviation?: string;
  abbreviationLocal?: string;
  name?: string;
}

export interface ApiBibleListResponse {
  data?: ApiBibleEntry[];
}

export interface ApiBiblePassage {
  content?: string;
  reference?: string;
  copyright?: string;
}

export interface ApiBiblePassagesResponse {
  data?: ApiBiblePassage | ApiBiblePassage[] | { passages?: ApiBiblePassage[] };
}

export interface LabsVerseEntry {
  verse?: string | number;
  text?: string;
}

export interface BibleApiSimpleResponse {
  text?: string;
  translation_name?: string;
  reference?: string;
}

export interface VendorFullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
  mozCancelFullScreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
}

export interface VendorFullscreenElement extends Element {
  webkitRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

export interface StudentState {
  player: YouTubePlayerInstance | null;
  monitorId: ReturnType<typeof setInterval> | null;
  nextPauseIndex: number;
  channel: ControlChannel | null;
  videoId: string;
  videoStart: number;
  pausePoints: NormalizedPausePoint[];
  channelKey: string;
  storageFallbackKey: string;
  pendingMedia: StudentMediaItem | null;
  verseScrollContainer: HTMLElement | null;
  versePages: HTMLDivElement[];
  currentVersePageIndex: number;
  verseFontSize: number;
  currentVerseLines: string[];
  lastProcessedCommandId: string | null;
  apiBibleMapCache: Record<string, string> | null;
}
