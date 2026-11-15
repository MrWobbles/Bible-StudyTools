import { isInIframe, setPlayer, studentState } from './state';
import type { NormalizedPausePoint } from './types';

let mediaReadyHandler: (() => void) | null = null;
let fullscreenHandler: (() => void) | null = null;

/**
 * Register the callback invoked when the player is ready to process pending media.
 */
export function setMediaReadyHandler(handler: () => void): void {
  mediaReadyHandler = handler;
}

/**
 * Register the callback invoked when the fullscreen control button is clicked.
 */
export function setFullscreenHandler(handler: () => void): void {
  fullscreenHandler = handler;
}

/**
 * Parse a numeric seconds value or `"MM:SS"` timestamp string into seconds.
 */
export function parseTimeValue(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const mmss = /^([0-9]{1,2}):([0-5][0-9])$/;
    const match = trimmed.match(mmss);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      return minutes * 60 + seconds;
    }
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
  }
  return NaN;
}

/**
 * Initialize video ID, pause points, and broadcast channel keys from `window.BIBLE_STUDY_CONFIG`.
 */
export function initConfig(): void {
  const classId = new URLSearchParams(window.location.search).get('class') || '1';
  const config: Partial<BibleStudyConfig> = window.BIBLE_STUDY_CONFIG || {};
  studentState.videoId = config.videoId || '';
  studentState.videoStart = 0;
  window.VIDEO_ID = studentState.videoId;
  window.VIDEO_START = studentState.videoStart;
  studentState.pausePoints = Array.isArray(config.pausePoints)
    ? config.pausePoints
        .map((p): NormalizedPausePoint => ({
          ...p,
          time: parseTimeValue(p.time),
        }))
        .filter((p) => Number.isFinite(p.time))
    : [];
  studentState.channelKey = config.channelName || `class${classId}-control`;
  studentState.storageFallbackKey = `${studentState.channelKey}-storage`;
}

/**
 * YouTube IFrame API ready callback that creates the initial `#player` instance.
 */
export function onYouTubeIframeAPIReady(): void {
  try {
    studentState.player = new YT.Player('player', {
      height: '100%',
      width: '100%',
      videoId: studentState.videoId,
      playerVars: {
        rel: 0,
        modestbranding: 1,
        color: 'white',
        playsinline: 1,
        controls: 1,
        fs: 1,
        start: studentState.videoStart,
        mute: isInIframe ? 1 : 0,
      },
      events: {
        onReady: function (event: YouTubePlayerEvent) {
          setPlayer(event.target);
          onPlayerReady(event);
        },
        onStateChange: onPlayerStateChange,
      },
    });
  } catch (error) {
    console.error('Error initializing YouTube player:', error);
    const playerDiv = document.getElementById('player');
    if (playerDiv) {
      playerDiv.innerHTML =
        '<p style="color: red; text-align: center; padding: 20px;">Error loading video player. Please check your browser extensions or try refreshing the page.</p>';
    }
  }
}

/**
 * Handle player ready event by rendering pause points, binding controls, and flushing pending media.
 */
export function onPlayerReady(_event?: YouTubePlayerEvent): void {
  renderPauseList();
  resetNextPause();
  bindControls();
  mediaReadyHandler?.();
}

/**
 * Start or stop the pause-point monitor when YouTube playback state changes.
 */
export function onPlayerStateChange(event: YouTubePlayerEvent): void {
  if (event.data !== undefined && event.data === YT.PlayerState?.PLAYING) {
    resetNextPause();
    startMonitor();
  } else {
    stopMonitor();
  }
}

function startMonitor(): void {
  if (studentState.monitorId) return;
  studentState.monitorId = setInterval(checkForPause, 250);
}

function stopMonitor(): void {
  if (!studentState.monitorId) return;
  clearInterval(studentState.monitorId);
  studentState.monitorId = null;
}

function checkForPause(): void {
  const { player, nextPauseIndex, pausePoints } = studentState;
  if (!player || nextPauseIndex < 0 || nextPauseIndex >= pausePoints.length) return;
  const current = player.getCurrentTime?.() ?? 0;
  const target = pausePoints[nextPauseIndex].time;
  if (current >= target && player.getPlayerState?.() === YT.PlayerState?.PLAYING) {
    player.pauseVideo?.();
    studentState.nextPauseIndex += 1;
    updateNextPauseText();
  }
}

/**
 * Recompute the next upcoming pause point relative to the player's current time.
 */
export function resetNextPause(): void {
  if (!studentState.player) return;
  const current = studentState.player.getCurrentTime ? studentState.player.getCurrentTime() : 0;
  studentState.nextPauseIndex = studentState.pausePoints.findIndex((p) => p.time > current);
  updateNextPauseText();
}

function renderPauseList(): void {
  const list = document.getElementById('pause-list');
  if (!list) return;
  list.innerHTML = '';
  studentState.pausePoints.forEach((point, idx) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const label = document.createElement('div');
    label.innerHTML = `<strong>${point.label}</strong><br><small>${formatTime(point.time)}</small>`;
    const btn = document.createElement('button');
    btn.innerHTML = '<span class="material-symbols-outlined">skip_next</span>Jump here';
    btn.onclick = () => jumpToPause(idx);
    item.appendChild(label);
    item.appendChild(btn);
    list.appendChild(item);
  });
  updateNextPauseText();
}

function updateNextPauseText(): void {
  const el = document.getElementById('next-stop')?.querySelector('strong');
  if (!el) return;
  const { nextPauseIndex, pausePoints } = studentState;
  if (nextPauseIndex === -1 || nextPauseIndex >= pausePoints.length) {
    el.textContent = 'No more planned pauses';
  } else {
    const next = pausePoints[nextPauseIndex];
    el.textContent = `${next.label} · ${formatTime(next.time)}`;
  }
}

/**
 * Seek to a specific pause point and resume playback.
 */
export function jumpToPause(idx: number): void {
  const { player, pausePoints } = studentState;
  if (!player || idx < 0 || idx >= pausePoints.length) return;
  const target = pausePoints[idx].time;
  player.seekTo?.(Math.max(0, target - 0.25), true);
  studentState.nextPauseIndex = idx;
  updateNextPauseText();
  player.playVideo?.();
}

/**
 * Toggle play/pause on the active YouTube player.
 */
export function togglePlay(): void {
  const { player } = studentState;
  if (!player) return;
  const state = player.getPlayerState?.();
  if (state !== undefined && state === YT.PlayerState?.PLAYING) {
    player.pauseVideo?.();
  } else {
    player.playVideo?.();
  }
}

/**
 * Seek the video back to 0 and start playback.
 */
export function restartVideo(): void {
  const { player } = studentState;
  if (!player) return;
  player.seekTo?.(0, true);
  player.playVideo?.();
  resetNextPause();
}

/**
 * Jump to the next planned pause point.
 */
export function skipToNextPause(): void {
  const { player, nextPauseIndex, pausePoints } = studentState;
  if (!player || nextPauseIndex === -1 || nextPauseIndex >= pausePoints.length) return;
  jumpToPause(nextPauseIndex);
}

function bindControls(): void {
  const toggleBtn = document.getElementById('toggle-play');
  if (toggleBtn) toggleBtn.onclick = togglePlay;
  const restartBtn = document.getElementById('restart');
  if (restartBtn) restartBtn.onclick = restartVideo;
  const nextPauseBtn = document.getElementById('next-pause');
  if (nextPauseBtn) nextPauseBtn.onclick = skipToNextPause;
  const fullscreenBtn = document.getElementById('fullscreen');
  if (fullscreenBtn && fullscreenHandler) fullscreenBtn.onclick = fullscreenHandler;
}
