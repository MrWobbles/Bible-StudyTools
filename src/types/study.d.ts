type ThemeId = 'dark' | 'light' | 'sepia' | 'night' | 'vivid';

interface ThemeOption {
  readonly id: ThemeId;
  readonly label: string;
}

type RgbColor = [number, number, number];

interface HslColor {
  h: number;
  s: number;
  l: number;
}

interface PaletteSurfaces {
  page: RgbColor;
  subtle: RgbColor;
  primary: RgbColor;
  secondary: RgbColor;
  elevated: RgbColor;
}

interface PaletteTextColors {
  primary: RgbColor;
  secondary: RgbColor;
  muted: RgbColor;
}

interface PaletteAccentColors {
  purple: RgbColor;
  purpleSoft: RgbColor;
  purpleNeon: RgbColor;
  pink: RgbColor;
  pinkSoft: RgbColor;
  blue: RgbColor;
  blueSoft: RgbColor;
}

interface PaletteStatusColors {
  success: RgbColor;
  error: RgbColor;
  warning: RgbColor;
  info: RgbColor;
}

interface PaletteRaw {
  S: PaletteSurfaces;
  text: PaletteTextColors;
  accent: PaletteAccentColors;
  fill: RgbColor;
  fillHover: RgbColor;
  status: PaletteStatusColors;
  inputBg: RgbColor;
  inputBorder: RgbColor;
  pageWorst: RgbColor;
  glassWorst: RgbColor;
  textBackgrounds: RgbColor[];
  surfaces: RgbColor[];
  textInverse: RgbColor;
}

interface PaletteResult {
  vars: Record<string, string>;
  raw: PaletteRaw;
}

interface BackgroundPhoto {
  url: string;
  color?: string;
  photographer?: string;
  photographerUrl?: string;
  photoUrl?: string;
}

interface BackgroundCache {
  at?: number;
  photo: BackgroundPhoto;
  palette: number[];
}

interface PausePoint {
  label: string;
  time: string | number;
  id?: string;
  title?: string;
  sectionId?: string;
  [key: string]: unknown;
}

interface BibleStudyConfig {
  videoId: string;
  channelName: string;
  bibleTranslation: string;
  pausePoints: PausePoint[];
  classId?: string;
  title?: string;
  videoType?: string;
  [key: string]: unknown;
}

interface AuthSession {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

interface AuthUser {
  id?: string;
  email?: string;
  username?: string;
  role?: string | null;
  isAdmin?: boolean;
  displayName?: string;
  [key: string]: unknown;
}

interface IconOptions {
  size?: string;
  className?: string;
  style?: string;
  fill?: boolean;
}

type DjTrackStatus = 'pending' | 'approved' | 'played' | 'rejected';

interface DjTrack {
  id: string;
  title: string;
  artist: string;
  url?: string;
  thumbnail?: string;
  requestedBy?: string;
  dedication?: string;
  votes?: number;
  status?: DjTrackStatus;
  isPreApproved?: boolean;
}

interface LlmModelInfo {
  readonly id: string;
  readonly name: string;
  readonly size: string;
}

interface LlmConfig {
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly timeout: number;
  readonly availableModels: readonly LlmModelInfo[];
}

interface LlmGenerateOptions {
  model?: string;
  temperature?: number;
  stream?: boolean;
  system?: string | null;
}

interface OutlinePointObject {
  type: string;
  text: string;
}

type OutlinePoint = string | OutlinePointObject;

interface OutlineQuestion {
  key: string;
  prompt: string;
  answer: string;
}

interface OutlineSection {
  id: string;
  summary: string;
  defaultOpen: boolean;
  points: OutlinePoint[];
  verses: string[];
  questions: OutlineQuestion[];
}

interface TipTapJsonNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TipTapJsonNode[];
}

interface OutlineEditorAdapter {
  getJSON: () => TipTapJsonNode;
  getHTML: () => string;
  getText: () => string;
}

interface MediaSource {
  url?: string;
  path?: string;
  videoId?: string;
  description?: string;
}

interface MediaItem {
  id?: string;
  type: string;
  title?: string;
  url?: string;
  primary?: boolean;
  sources?: MediaSource[];
  pausePoints?: PausePoint[];
  sectionTitle?: string;
}

interface NavigationItem {
  number?: string | number;
  title?: string;
  href?: string;
}

interface ClassOutlineSection extends OutlineSection {
  media?: MediaItem[];
}

interface ClassConfig {
  id?: string;
  classNumber?: string | number;
  title?: string;
  subtitle?: string;
  instructor?: string;
  channelName?: string;
  navigation?: NavigationItem[];
  media?: MediaItem[];
  outline?: ClassOutlineSection[];
  [key: string]: unknown;
}

interface SignupRequest {
  id: string;
  display_name?: string;
  username?: string;
  email?: string;
  status?: string;
  requested_at?: string;
  source_ip?: string;
  message?: string;
  invite_code?: string;
}

interface UserAccount {
  user_id?: string;
  username?: string;
  email?: string;
  created_at?: string;
}

interface ApiSecurityConfig {
  requireAdmin?: boolean;
  retryOnUnauthorized?: boolean;
  tryRefreshOnUnauthorized?: boolean;
  tryInteractiveLoginOnUnauthorized?: boolean;
  promptForAdminTokenOnUnauthorized?: boolean;
}
