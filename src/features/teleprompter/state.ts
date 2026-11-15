import type { TeleprompterConfig, TeleprompterState } from './types';

export const MAX_NETWORK_RETRIES = 3; // Stop retrying after this many network errors
export const DEBUG = true; // Always on - helps users report issues
export const DEFAULT_SCROLL_VELOCITY = 23; // pixels per second

export const CONFIG: TeleprompterConfig = {
  language: 'en-US',
  continuous: true,
  interimResults: true,
  matchThreshold: 0.6, // Minimum similarity score to advance (0-1)
  autoAdvanceDelay: 500, // ms before auto-advancing
  confidenceThreshold: 0.3, // Minimum confidence for recognized speech
  maxUpcomingPoints: 3, // How many upcoming points to show

  // Best-practice settings
  SMOOTH_SCROLL_DURATION: 400, // ms for Lerp/smooth scrolling
  SLIDING_WINDOW_SIZE: 5, // Look at current ± 5 points
  AUTO_ADVANCE_THRESHOLD: 0.50, // 50% of words needed
  MIN_MATCHED_WORDS: 2, // Require at least 2 words
  CONFIDENCE_STREAK: 3, // Require 3 consecutive high-confidence matches before tracking resumes
  REWIND_THRESHOLD: 0.8, // If match score is high but below current, trigger rewind
  LOW_CONFIDENCE_FREEZE: true // Freeze display when confidence drops below threshold
};

export const state: TeleprompterState = {
  classConfig: {},
  classId: '',
  currentPointIndex: 0,
  allOutlinePoints: [], // Flat array of all points with metadata
  isListening: false,
  userInitiatedStop: false, // Track if user explicitly stopped, vs error/restart
  listeningTimeout: null,
  recognitionInstance: null,
  speechRecognitionSetup: false,
  networkErrorCount: 0, // Track consecutive network errors

  // Track confidence streaks and freezing
  consecutiveHighConfidenceMatches: 0, // For freeze/resume logic
  isTrackingFrozen: false, // Freeze when confidence drops
  targetScrollPosition: 0, // For smooth Lerp scrolling
  currentScrollPosition: 0,
  scrollAnimationId: null,

  // Constant-speed scroll mode (default mode)
  scrollVelocity: DEFAULT_SCROLL_VELOCITY,
  isScrolling: false, // Paused vs playing; user starts it with Play
  isProgrammaticScroll: false, // True while a point-jump animation owns scrollTop
  scrollRemainder: 0, // Sub-pixel carry so slow speeds still move
  lastScrollTime: Date.now(),
  scrollLoopId: null,

  // View mode state
  viewMode: 'word', // 'word' or 'scroll'
  scrollUpdateId: null,

  // Display channel shared with student.html
  displayChannel: null,
  shownMediaId: null
};

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
