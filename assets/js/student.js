let player;
let monitorId = null;
let nextPauseIndex = 0;
let channel = null;
let VIDEO_ID = '';
let pausePoints = [];
let CHANNEL_KEY = 'class1-control';
let STORAGE_FALLBACK_KEY = 'class1-control-storage';

function initConfig() {
  const config = window.BIBLE_STUDY_CONFIG || {};
  VIDEO_ID = config.videoId || '';
  // Normalize pausePoints: allow seconds (number) or "MM:SS" strings
  pausePoints = Array.isArray(config.pausePoints)
    ? config.pausePoints.map((p) => ({
        ...p,
        time: parseTimeValue(p.time),
      })).filter((p) => Number.isFinite(p.time))
    : [];
  CHANNEL_KEY = config.channelName || 'class1-control';
  STORAGE_FALLBACK_KEY = `${CHANNEL_KEY}-storage`;
}

// Wait for config to load, then initialize YouTube API
window.addEventListener('load', () => {
  initConfig();
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
});

setupControlChannel();

function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    height: '100%',
    width: '100%',
    videoId: VIDEO_ID,
    playerVars: {
      rel: 0,
      modestbranding: 1,
      color: 'white',
      playsinline: 1
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
}

function onPlayerReady() {
  renderPauseList();
  resetNextPause();
  bindControls();
}

function setupControlChannel() {
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(CHANNEL_KEY);
    channel.onmessage = handleRemoteCommand;
  }

  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_FALLBACK_KEY || !event.newValue) return;
    try {
      const data = JSON.parse(event.newValue);
      handleRemoteCommand({ data });
    } catch (err) {
      console.warn('Control message failed to parse', err);
    }
  });
}

function handleRemoteCommand(event) {
  const data = event.data || event;
  if (!data || !data.type) return;

  console.log('[Student] Received command:', data.type, data);

  switch (data.type) {
    case 'toggle':
      togglePlay();
      break;
    case 'play':
      if (player) player.playVideo();
      break;
    case 'pause':
      if (player) player.pauseVideo();
      break;
    case 'restart':
      restartVideo();
      break;
    case 'nextPause':
      skipToNextPause();
      break;
    case 'jumpToPause':
      if (Number.isInteger(data.index)) {
        const idx = Math.max(0, Math.min(data.index, pausePoints.length - 1));
        jumpToPause(idx);
      }
      break;
    case 'fullscreen':
      console.log('[Student] Executing fullscreen command');
      goFullscreen();
      break;
    default:
      break;
  }
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    resetNextPause();
    startMonitor();
  } else {
    stopMonitor();
  }
}

function startMonitor() {
  if (monitorId) return;
  monitorId = setInterval(checkForPause, 250);
}

function stopMonitor() {
  if (!monitorId) return;
  clearInterval(monitorId);
  monitorId = null;
}

function checkForPause() {
  if (!player || nextPauseIndex < 0 || nextPauseIndex >= pausePoints.length) return;
  const current = player.getCurrentTime();
  const target = pausePoints[nextPauseIndex].time;
  if (current >= target && player.getPlayerState() === YT.PlayerState.PLAYING) {
    player.pauseVideo();
    nextPauseIndex += 1;
    updateNextPauseText();
  }
}

function resetNextPause() {
  if (!player) return;
  const current = player.getCurrentTime ? player.getCurrentTime() : 0;
  nextPauseIndex = pausePoints.findIndex(p => p.time > current);
  updateNextPauseText();
}

// Accepts number (seconds) or "MM:SS" string; returns seconds as number
function parseTimeValue(val) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    // MM:SS
    const mmss = /^([0-9]{1,2}):([0-5][0-9])$/;
    const match = trimmed.match(mmss);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      return minutes * 60 + seconds;
    }
    // plain number string
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
  }
  return NaN;
}

function renderPauseList() {
  const list = document.getElementById('pause-list');
  list.innerHTML = '';
  pausePoints.forEach((point, idx) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const label = document.createElement('div');
    label.innerHTML = `<strong>${point.label}</strong><br><small>${formatTime(point.time)}</small>`;
    const btn = document.createElement('button');
    btn.textContent = 'Jump here';
    btn.onclick = () => jumpToPause(idx);
    item.appendChild(label);
    item.appendChild(btn);
    list.appendChild(item);
  });
  updateNextPauseText();
}

function updateNextPauseText() {
  const el = document.getElementById('next-stop').querySelector('strong');
  if (nextPauseIndex === -1 || nextPauseIndex >= pausePoints.length) {
    el.textContent = 'No more planned pauses';
  } else {
    const next = pausePoints[nextPauseIndex];
    el.textContent = `${next.label} · ${formatTime(next.time)}`;
  }
}

function jumpToPause(idx) {
  if (!player) return;
  const target = pausePoints[idx].time;
  player.seekTo(Math.max(0, target - 0.25), true);
  nextPauseIndex = idx;
  updateNextPauseText();
  player.playVideo();
}

function togglePlay() {
  if (!player) return;
  const state = player.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}

function restartVideo() {
  if (!player) return;
  player.seekTo(0, true);
  player.playVideo();
  resetNextPause();
}

function skipToNextPause() {
  if (!player || nextPauseIndex === -1 || nextPauseIndex >= pausePoints.length) return;
  jumpToPause(nextPauseIndex);
}

function goFullscreen() {
  const container = document.querySelector('.player-shell') || document.documentElement;

  function isFullscreenActive() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }

  const shouldEnter = !isFullscreenActive();

  if (shouldEnter) {
    const req = container.requestFullscreen?.bind(container)
      || container.webkitRequestFullscreen?.bind(container)
      || container.mozRequestFullScreen?.bind(container)
      || container.msRequestFullscreen?.bind(container);

    if (req) {
      req().catch(() => {
        // Fall back to CSS-based fullscreen mode
        document.body.classList.add('fullscreen-mode');
      });
    } else {
      document.body.classList.add('fullscreen-mode');
    }
  } else {
    const exit = document.exitFullscreen?.bind(document)
      || document.webkitExitFullscreen?.bind(document)
      || document.mozCancelFullScreen?.bind(document)
      || document.msExitFullscreen?.bind(document);
    if (exit) {
      exit().catch(() => {
        // ensure CSS class removed even if exit rejects
        document.body.classList.remove('fullscreen-mode');
      });
    }
    // Always remove CSS fullscreen class when exiting
    document.body.classList.remove('fullscreen-mode');
  }

  console.log('[Fullscreen] Toggled fullscreen-mode / request');
}

function bindControls() {
  document.getElementById('toggle-play').onclick = togglePlay;
  document.getElementById('restart').onclick = restartVideo;
  document.getElementById('next-pause').onclick = skipToNextPause;
  document.getElementById('fullscreen').onclick = goFullscreen;
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
