let player;
let monitorId = null;
let nextPauseIndex = 0;
let channel = null;
let VIDEO_ID = '';
let pausePoints = [];
let CHANNEL_KEY = 'class1-control';
let STORAGE_FALLBACK_KEY = 'class1-control-storage';
let pendingMedia = null;
let verseScrollContainer = null;
let versePages = [];
let currentVersePageIndex = 0;
const DEFAULT_VERSE_FONT_SIZE = 72;
const DEFAULT_VERSE_SCALE = 1.0;
const VERSE_STAGE_WIDTH = 1280;
const VERSE_STAGE_HEIGHT = 720;
let verseFontSize = 72;
let verseLineHeight = 1.6;
let currentVerseLines = [];
let lastProcessedCommandId = null;

// Function to update player reference when a new video is loaded
window.updatePlayerReference = function (newPlayer) {
  player = newPlayer;
  window.player = newPlayer;
  console.log('[Student] Player reference updated');
};

// Make player and callback functions globally accessible so loader.js can reinitialize
window.player = player;
window.VIDEO_ID = VIDEO_ID;
window.onPlayerReady = onPlayerReady;
window.onPlayerStateChange = onPlayerStateChange;

function initConfig() {
  const classId = new URLSearchParams(window.location.search).get('class') || '1';
  const config = window.BIBLE_STUDY_CONFIG || {};
  VIDEO_ID = config.videoId || '';
  window.VIDEO_ID = VIDEO_ID;
  // Normalize pausePoints: allow seconds (number) or "MM:SS" strings
  pausePoints = Array.isArray(config.pausePoints)
    ? config.pausePoints.map((p) => ({
      ...p,
      time: parseTimeValue(p.time),
    })).filter((p) => Number.isFinite(p.time))
    : [];
  CHANNEL_KEY = config.channelName || `class${classId}-control`;
  STORAGE_FALLBACK_KEY = `${CHANNEL_KEY}-storage`;
}

// Wait for config to load, then initialize YouTube API
window.addEventListener('load', () => {
  function initAfterConfig() {
    initConfig();
    setupControlChannel();

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  if (window.BIBLE_STUDY_CONFIG_READY) {
    initAfterConfig();
  } else {
    window.addEventListener('bibleStudyConfigReady', initAfterConfig, { once: true });
  }
});

// Check if we're in an iframe (preview mode)
const isInIframe = window.self !== window.top;

if (isInIframe) {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('iframe-preview');
  });
}

function onYouTubeIframeAPIReady() {
  try {
    player = new YT.Player('player', {
      height: '100%',
      width: '100%',
      videoId: VIDEO_ID,
      playerVars: {
        rel: 0,
        modestbranding: 1,
        color: 'white',
        playsinline: 1,
        mute: isInIframe ? 1 : 0
      },
      events: {
        onReady: function (event) {
          player = event.target;
          window.player = event.target;
          onPlayerReady(event);
        },
        onStateChange: onPlayerStateChange
      }
    });
  } catch (error) {
    console.error('Error initializing YouTube player:', error);
    // Fallback: show error message in the player div
    const playerDiv = document.getElementById('player');
    if (playerDiv) {
      playerDiv.innerHTML = '<p style="color: red; text-align: center; padding: 20px;">Error loading video player. Please check your browser extensions or try refreshing the page.</p>';
    }
  }
}

function onPlayerReady() {
  renderPauseList();
  resetNextPause();
  bindControls();
  handlePendingMedia();
}

function setupControlChannel() {
  console.log('[Student] Setting up control channel:', CHANNEL_KEY, 'STORAGE_FALLBACK_KEY:', STORAGE_FALLBACK_KEY);
  console.log('[Student] Is in iframe:', window.self !== window.top);

  // Use Electron IPC-based channel if available, otherwise native BroadcastChannel
  if (window.bst?.createBroadcastChannel) {
    channel = window.bst.createBroadcastChannel(CHANNEL_KEY);
    channel.addMessageHandler((event) => {
      console.log('[Student] Electron IPC message received:', event);
      handleRemoteCommand(event);
    });
    console.log('[Student] Electron IPC BroadcastChannel set up');
  } else if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(CHANNEL_KEY);
    channel.onmessage = (event) => {
      console.log('[Student] BroadcastChannel message received');
      handleRemoteCommand(event);
    };
    console.log('[Student] BroadcastChannel set up');
  }

  window.addEventListener('storage', event => {
    console.log('[Student] Storage event received, key:', event.key);
    if (event.key !== STORAGE_FALLBACK_KEY || !event.newValue) return;
    console.log('[Student] Processing storage event');
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

  // Deduplicate: skip if we just processed this exact command
  const commandId = `${data.type}-${data.sentAt}`;
  if (commandId === lastProcessedCommandId) {
    console.log('[Student] Ignoring duplicate command:', data.type);
    return;
  }
  lastProcessedCommandId = commandId;

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
      // Only execute fullscreen in the actual window, not in iframe preview
      if (!isInIframe) {
        console.log('[Student] Executing fullscreen command');
        goFullscreen();
      } else {
        // Simulate fullscreen in iframe preview by toggling the CSS class
        document.body.classList.toggle('fullscreen-mode');
        console.log('[Student] Simulated fullscreen in iframe preview:', document.body.classList.contains('fullscreen-mode'));
      }
      break;
    case 'displayMedia':
      console.log('[Student] Received displayMedia:', data.media);
      pendingMedia = data.media;
      // Try to handle immediately if DOM is ready, otherwise it will be handled on player ready
      if (document.readyState === 'complete') {
        handlePendingMedia();
      }
      break;
    case 'clearScreen':
      if (typeof window.returnToDefaultView === 'function') {
        console.log('[Student] Clearing screen and returning to default view');
        window.returnToDefaultView();
      }
      break;
    case 'verseNext':
      nextVersePage();
      break;
    case 'versePrevious':
      previousVersePage();
      break;
    case 'verseFontIncrease':
      adjustVerseFont(4);
      break;
    case 'verseFontDecrease':
      adjustVerseFont(-4);
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
    btn.innerHTML = '<span class="material-symbols-outlined">skip_next</span>Jump here';
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
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      document.body.classList.contains('fullscreen-mode')
    );
  }

  const shouldEnter = !isFullscreenActive();
  console.log('[Fullscreen] Current state:', isFullscreenActive(), '-> Should enter:', shouldEnter);

  if (shouldEnter) {
    document.body.classList.add('fullscreen-mode');

    const req = container.requestFullscreen?.bind(container)
      || container.webkitRequestFullscreen?.bind(container)
      || container.mozRequestFullScreen?.bind(container)
      || container.msRequestFullscreen?.bind(container);

    if (req) {
      req().then(() => {
        console.log('[Fullscreen] Entered fullscreen via API');
      }).catch(() => {
        console.log('[Fullscreen] API failed, using CSS fallback');
        document.body.classList.add('fullscreen-mode');
      });
    } else {
      console.log('[Fullscreen] No API available, using CSS fallback');
      document.body.classList.add('fullscreen-mode');
    }
  } else {
    const exit = document.exitFullscreen?.bind(document)
      || document.webkitExitFullscreen?.bind(document)
      || document.mozCancelFullScreen?.bind(document)
      || document.msExitFullscreen?.bind(document);
    if (exit) {
      exit().then(() => {
        console.log('[Fullscreen] Exited fullscreen via API');
      }).catch(() => {
        console.log('[Fullscreen] Exit failed, removing CSS class');
        document.body.classList.remove('fullscreen-mode');
      });
    }
    // Always remove CSS fullscreen class when exiting
    document.body.classList.remove('fullscreen-mode');
    console.log('[Fullscreen] Exited fullscreen');
  }
}

function returnToDefaultView() {
  const playerDiv = document.querySelector('.player-shell');
  if (!playerDiv) return;

  pendingMedia = null;
  versePages = [];
  currentVersePageIndex = 0;
  currentVerseLines = [];
  verseScrollContainer = null;

  const exit = document.exitFullscreen?.bind(document)
    || document.webkitExitFullscreen?.bind(document)
    || document.mozCancelFullScreen?.bind(document)
    || document.msExitFullscreen?.bind(document);

  if (exit && (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement)) {
    exit().catch(() => {
      // ignore exit failures and continue resetting view
    });
  }

  document.body.classList.remove('fullscreen-mode');

  if (player && typeof player.destroy === 'function') {
    try {
      player.destroy();
    } catch (err) {
      console.warn('[Student] Failed to destroy player while clearing screen', err);
    }
  }
  player = null;
  window.player = null;

  playerDiv.innerHTML = '<div id="player"></div>';

  if (typeof YT !== 'undefined' && YT.Player && VIDEO_ID) {
    player = new YT.Player('player', {
      height: '100%',
      width: '100%',
      videoId: VIDEO_ID,
      playerVars: {
        rel: 0,
        modestbranding: 1,
        color: 'white',
        playsinline: 1,
        mute: isInIframe ? 1 : 0
      },
      events: {
        onReady: function (event) {
          player = event.target;
          window.player = event.target;
          onPlayerReady(event);
        },
        onStateChange: onPlayerStateChange
      }
    });
  }

  resetNextPause();
}

window.returnToDefaultView = returnToDefaultView;

// Listen for fullscreen changes to keep CSS class in sync
document.addEventListener('fullscreenchange', syncFullscreenClass);
document.addEventListener('webkitfullscreenchange', syncFullscreenClass);
document.addEventListener('mozfullscreenchange', syncFullscreenClass);
document.addEventListener('MSFullscreenChange', syncFullscreenClass);

function syncFullscreenClass() {
  const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  if (isFullscreen) {
    document.body.classList.add('fullscreen-mode');
  } else {
    document.body.classList.remove('fullscreen-mode');
  }
  console.log('[Fullscreen] State synced:', isFullscreen);

  setTimeout(() => {
    fitVerseStage();
  }, 60);
}

function bindControls() {
  document.getElementById('toggle-play').onclick = togglePlay;
  document.getElementById('restart').onclick = restartVideo;
  document.getElementById('next-pause').onclick = skipToNextPause;
  document.getElementById('fullscreen').onclick = goFullscreen;
}

function fitVerseStage() {
  const stageWrap = document.getElementById('verse-stage-wrap');
  const stage = document.getElementById('verse-stage');
  if (!stageWrap || !stage) return;

  const wrapWidth = stageWrap.clientWidth;
  const wrapHeight = stageWrap.clientHeight;
  if (!wrapWidth || !wrapHeight) return;

  const scale = Math.min(
    wrapWidth / VERSE_STAGE_WIDTH,
    wrapHeight / VERSE_STAGE_HEIGHT
  ) * DEFAULT_VERSE_SCALE;

  if (!Number.isFinite(scale) || scale <= 0) return;
  const offsetX = (wrapWidth - (VERSE_STAGE_WIDTH * scale)) / 2;
  const offsetY = (wrapHeight - (VERSE_STAGE_HEIGHT * scale)) / 2;
  stage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

async function waitForVerseFonts(timeoutMs = 1500) {
  if (!document.fonts || typeof document.fonts.ready === 'undefined') {
    return;
  }

  try {
    await Promise.race([
      document.fonts.ready,
      new Promise(resolve => setTimeout(resolve, timeoutMs))
    ]);
  } catch (_) {
    // Ignore font-loading errors and continue rendering.
  }
}

function handlePendingMedia() {
  console.log('[Student] handlePendingMedia called, pendingMedia:', pendingMedia);
  if (!pendingMedia) {
    console.log('[Student] No pending media, returning');
    return;
  }

  // Always use .player-shell as the container since YouTube API replaces #player with an iframe
  const playerDiv = document.querySelector('.player-shell');
  console.log('[Student] playerDiv:', playerDiv);
  if (!playerDiv) {
    console.log('[Student] No player div found, returning');
    return;
  }

  console.log('[Student] Processing media:', pendingMedia);

  if (pendingMedia.type === 'video') {
    // Support both sources array and direct url
    let videoUrl = '';
    let videoId = '';

    if (pendingMedia.sources && pendingMedia.sources[0]) {
      const source = pendingMedia.sources[0];
      videoId = source.videoId || '';
      videoUrl = source.url || source.path || '';

      if (!videoId && source.type === 'youtube') {
        videoId = extractVideoId(videoUrl);
      }
    } else if (pendingMedia.url) {
      videoUrl = pendingMedia.url;
    } else if (pendingMedia.videoId) {
      videoId = pendingMedia.videoId;
    }

    // Check if it's a local video file (not YouTube)
    const isLocalVideo = videoUrl && (
      videoUrl.endsWith('.mp4') || 
      videoUrl.endsWith('.webm') || 
      videoUrl.endsWith('.ogg') ||
      videoUrl.startsWith('assets/') ||
      videoUrl.startsWith('./assets/')
    );

    if (isLocalVideo) {
      console.log('[Student] Playing local video:', videoUrl);
      // Destroy YouTube player if any
      if (player) {
        player.destroy();
        player = null;
      }
      // Use HTML5 video element for local files
      playerDiv.innerHTML = `
        <video id="local-video" style="width:100%;height:100%;background:#000;" controls autoplay>
          <source src="${videoUrl}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      `;
      pendingMedia = null;
      return;
    }

    const newVideoId = videoId || extractVideoId(videoUrl);
    console.log('[Student] Extracted video ID:', newVideoId, 'from URL:', videoUrl);

    if (newVideoId) {
      VIDEO_ID = newVideoId;
      window.VIDEO_ID = VIDEO_ID;
      // Destroy existing player if any
      if (player) {
        player.destroy();
        player = null;
      }
      // Clear the container and create a new player div
      playerDiv.innerHTML = '<div id="player"></div>';
      console.log('[Student] Creating new YouTube player with video ID:', VIDEO_ID);
      // Create new player
      player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: VIDEO_ID,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          color: 'white',
          playsinline: 1,
          mute: isInIframe ? 1 : 0
        },
        events: {
          onReady: function (event) {
            player = event.target;
            window.player = event.target;
            onPlayerReady(event);
          },
          onStateChange: onPlayerStateChange
        }
      });
      pendingMedia = null;
    }
  } else if (pendingMedia.type === 'image' || pendingMedia.type === 'images') {
    const imgUrl = getMediaSourceUrl(pendingMedia);

    if (imgUrl) {
      // Destroy player if exists
      if (player) {
        player.destroy();
        player = null;
      }
      playerDiv.innerHTML = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:contain;" alt="${pendingMedia.title || 'Image'}">`;
      pendingMedia = null;
    }
  } else if (pendingMedia.type === 'pdf' || pendingMedia.type === 'document') {
    const docUrl = getMediaSourceUrl(pendingMedia);
    if (!docUrl) return;

    if (player) {
      player.destroy();
      player = null;
    }

    playerDiv.innerHTML = `
      <iframe src="${docUrl}" style="width:100%; height:100%; border:none; border-radius:10px;"></iframe>
    `;
    pendingMedia = null;
  } else if (pendingMedia.type === 'audio') {
    const audioUrl = getMediaSourceUrl(pendingMedia);
    if (!audioUrl) return;

    if (player) {
      player.destroy();
      player = null;
    }

    playerDiv.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; height:100%; padding:24px;">
        <audio controls autoplay style="width:min(900px, 100%);" src="${audioUrl}"></audio>
      </div>
    `;
    pendingMedia = null;
  } else if (pendingMedia.type === 'link') {
    const linkUrl = getMediaSourceUrl(pendingMedia);
    if (!linkUrl) return;

    if (player) {
      player.destroy();
      player = null;
    }

    const safeTitle = escapeHtml(pendingMedia.title || 'External Link');
    const safeLinkUrl = escapeHtml(linkUrl);
    playerDiv.innerHTML = `
      <div style="display:flex; flex-direction:column; height:100%; padding:16px; gap:10px; background:#0f1419;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <h3 style="margin:0; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeTitle}</h3>
          <a href="${safeLinkUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="display:inline-block; padding:8px 14px;">Open in new tab</a>
        </div>
        <iframe src="${safeLinkUrl}" style="width:100%; height:100%; border:none; border-radius:10px; background:#fff;" title="${safeTitle}"></iframe>
      </div>
    `;
    pendingMedia = null;
  } else if (pendingMedia.type === 'verse') {
    const media = pendingMedia;
    pendingMedia = null;
    renderVerseMedia(media);
  } else if (pendingMedia.type === 'question') {
    const media = pendingMedia;
    pendingMedia = null;
    renderQuestionMedia(media);
  }
}

function getMediaSourceUrl(media) {
  if (!media || typeof media !== 'object') return '';
  if (typeof media.url === 'string' && media.url.trim()) return media.url.trim();
  if (Array.isArray(media.sources) && media.sources.length > 0) {
    const first = media.sources[0];
    if (typeof first?.url === 'string' && first.url.trim()) return first.url.trim();
    if (typeof first?.path === 'string' && first.path.trim()) return first.path.trim();
  }
  return '';
}

// Render a question/discussion prompt on the student screen
function renderQuestionMedia(media) {
  const playerDiv = document.querySelector('.player-shell');
  if (!playerDiv) return;

  const prompt = media.prompt || media.title || '';
  if (!prompt) return;

  if (player) {
    player.destroy();
    player = null;
  }

  playerDiv.innerHTML = `
    <div class="question-frame" style="padding:60px;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;background:linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"none\" stroke=\"rgba(240,180,41,0.1)\" stroke-width=\"0.5\"/></svg>') repeat;opacity:0.3;"></div>
      <div style="text-align:center;max-width:85%;position:relative;z-index:1;">
        <div style="font-size:48px;margin-bottom:24px;"><span class="material-symbols-outlined" style="font-size: 48px;">help</span></div>
        <h1 class="question-prompt" style="color:#fff;font-size:52px;line-height:1.4;font-weight:600;margin:0;text-shadow:2px 2px 4px rgba(0,0,0,0.3);">${escapeHtml(prompt)}</h1>
        ${media.title && media.title !== prompt ? `<div style="color:rgba(255,255,255,0.7);font-size:24px;margin-top:24px;">${escapeHtml(media.title)}</div>` : ''}
      </div>
    </div>
  `;
}

async function renderVerseMedia(media) {
  const playerDiv = document.querySelector('.player-shell');
  if (!playerDiv) return;

  const reference = (media.reference || media.title || '').trim();
  if (!reference) return;

  if (player) {
    player.destroy();
    player = null;
  }

  playerDiv.innerHTML = `
    <div style="padding:24px; display:flex; flex-direction:column; gap:12px; height:100%; overflow:auto;">
      <div style="font-size:14px; color:var(--muted);">Loading passage…</div>
    </div>
  `;

  try {
    // Start each new verse render from a stable baseline so both windows paginate similarly.
    verseFontSize = DEFAULT_VERSE_FONT_SIZE;

    const preferredTranslations = media.translation
      ? [media.translation]
      : ['nkjv', 'kjv'];

    const verseData = await fetchVerseData(reference, preferredTranslations);
    if (!verseData) throw new Error('Failed to fetch passage');

    const title = verseData.title || reference;
    const sourceLabel = verseData.sourceLabel || 'Scripture';
    currentVerseLines = Array.isArray(verseData.lines) ? verseData.lines : [];

    playerDiv.innerHTML = `
      <div id="verse-stage-wrap" style="height:100%; width:100%; position:relative; overflow:hidden; background:#fff;">
        <div id="verse-stage" style="width:${VERSE_STAGE_WIDTH}px; height:${VERSE_STAGE_HEIGHT}px; position:absolute; top:0; left:0; background:#fff; transform-origin: top left;">
          <div id="verse-content" class="verse-content" style="position:absolute; left:40px; right:40px; top:40px; bottom:120px; font-size:${verseFontSize}px; line-height:${verseLineHeight}; overflow:hidden; color:#000; font-family:'Source Sans Pro','Segoe UI',Arial,sans-serif;"></div>
          <div class="verse-meta" style="position:absolute;bottom:30px;right:40px;text-align:right;">
            <h2 class="verse-title" style="color:#000;font-size:24px;margin:0 0 8px 0;">${escapeHtml(title)}</h2>
            <div class="verse-source" style="color:#666;font-size:18px;">${escapeHtml(sourceLabel)}</div>
          </div>
        </div>
      </div>
    `;

    verseScrollContainer = document.getElementById('verse-content');
    fitVerseStage();
    buildVersePages(currentVerseLines);
    ensureVersePagesFit();
    // Re-run after layout settles; first paint timing can differ between windows.
    setTimeout(() => {
      fitVerseStage();
      buildVersePages(currentVerseLines);
      ensureVersePagesFit();
    }, 120);
    setTimeout(() => {
      fitVerseStage();
      buildVersePages(currentVerseLines);
      ensureVersePagesFit();
    }, 320);

    await waitForVerseFonts();
    fitVerseStage();
    buildVersePages(currentVerseLines);
    ensureVersePagesFit();
  } catch (err) {
    playerDiv.innerHTML = `
      <div style="padding:24px; color:var(--muted);">
        Unable to load passage. Please check the reference and try again.
      </div>
    `;
  }
}

async function fetchVerseData(reference, preferredTranslations) {
  for (const translation of preferredTranslations) {
    const labs = await fetchFromLabs(reference, translation);
    if (labs) return labs;

    const bibleApi = await fetchFromBibleApi(reference, translation);
    if (bibleApi) return bibleApi;
  }

  return null;
}

async function fetchFromLabs(reference, translation) {
  const version = String(translation || '').toUpperCase();
  const url = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&version=${encodeURIComponent(version)}&type=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const lines = data.map(item => `${item.verse} ${item.text}`);
    const sourceLabel = `${version} via labs.bible.org`;
    return { title: reference, lines, sourceLabel };
  } catch (err) {
    return null;
  }
}

async function fetchFromBibleApi(reference, translation) {
  const version = String(translation || '').toLowerCase();
  const url = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${encodeURIComponent(version)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data.text || '').trim();
    if (!text) return null;

    const lines = text.split('\n').map(t => t.trim()).filter(Boolean);
    const sourceLabel = `${data.translation_name || version.toUpperCase()} via bible-api.com`;
    return { title: data.reference || reference, lines, sourceLabel };
  } catch (err) {
    return null;
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function adjustVerseFont(delta) {
  if (!currentVerseLines.length) return;
  const nextSize = Math.max(60, Math.min(180, verseFontSize + delta));
  if (nextSize === verseFontSize) return;
  verseFontSize = nextSize;
  applyVerseTypography();
  buildVersePages(currentVerseLines);
}

function applyVerseTypography() {
  const container = verseScrollContainer || document.getElementById('verse-content');
  if (!container) return;
  container.style.fontSize = `${verseFontSize}px`;
  container.style.lineHeight = `${verseLineHeight}`;
}

function wrapLineByWords(text, maxChars) {
  const limit = Math.max(1, Number(maxChars) || 100);
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let current = '';

  words.forEach(word => {
    if (!current) {
      current = word;
      return;
    }

    const next = `${current} ${word}`;
    if (next.length <= limit) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  });

  if (current) lines.push(current);
  return lines;
}

function estimateMaxCharsPerLine(container, computedStyle, safetyBuffer = 12) {
  const width = container?.clientWidth || 0;
  if (!width) return Math.max(1, 100 - safetyBuffer);

  const measurer = document.createElement('span');
  measurer.style.position = 'absolute';
  measurer.style.visibility = 'hidden';
  measurer.style.pointerEvents = 'none';
  measurer.style.left = '-9999px';
  measurer.style.top = '0';
  measurer.style.whiteSpace = 'nowrap';
  measurer.style.fontSize = computedStyle.fontSize;
  measurer.style.fontFamily = computedStyle.fontFamily;
  measurer.style.fontWeight = computedStyle.fontWeight;
  measurer.style.letterSpacing = computedStyle.letterSpacing;
  measurer.textContent = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  document.body.appendChild(measurer);

  const measuredWidth = measurer.getBoundingClientRect().width || 1;
  document.body.removeChild(measurer);

  const avgCharWidth = measuredWidth / measurer.textContent.length;
  const maxChars = Math.floor(width / avgCharWidth);
  return Math.max(1, maxChars - safetyBuffer);
}

function splitLongLine(text, measurer, maxHeight) {
  // Split long verse text into chunks that fit within maxHeight
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [text]; // Can't split further

  const chunks = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    measurer.innerHTML = `<p style="margin:0; padding:0;">${candidate}</p>`;
    const para = measurer.firstElementChild;
    const height = para ? para.getBoundingClientRect().height : 0;

    if (height <= maxHeight) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = word;
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

function buildVersePages(lines) {
  const container = verseScrollContainer || document.getElementById('verse-content');
  if (!container) return;

  container.innerHTML = '';
  versePages = [];
  currentVersePageIndex = 0;

  const rawLines = (lines || []).map(line => line.trim()).filter(Boolean);
  if (!rawLines.length) return;

  const computed = window.getComputedStyle(container);
  const cleanedLines = rawLines;

  const paddingTop = parseFloat(computed.paddingTop) || 0;
  const paddingBottom = parseFloat(computed.paddingBottom) || 0;
  const availableHeight = Math.max(0, container.clientHeight - paddingTop - paddingBottom);
  if (!availableHeight) {
    const fallbackPage = document.createElement('div');
    fallbackPage.className = 'verse-page';
    fallbackPage.style.display = 'block';
    fallbackPage.style.height = '100%';
    fallbackPage.style.overflow = 'hidden';
    fallbackPage.innerHTML = cleanedLines
      .map(line => `<p style="margin:0; padding:0;">${line}</p>`)
      .join('');
    container.appendChild(fallbackPage);
    versePages.push(fallbackPage);
    return;
  }
  const measurer = document.createElement('div');
  measurer.style.position = 'absolute';
  measurer.style.visibility = 'hidden';
  measurer.style.pointerEvents = 'none';
  measurer.style.left = '-9999px';
  measurer.style.top = '0';
  measurer.style.width = `${container.clientWidth}px`;
  measurer.style.fontSize = computed.fontSize;
  measurer.style.lineHeight = computed.lineHeight;
  measurer.style.fontFamily = computed.fontFamily;
  measurer.style.fontWeight = computed.fontWeight;
  measurer.style.letterSpacing = computed.letterSpacing;
  measurer.style.whiteSpace = 'normal';
  measurer.style.margin = '0';
  measurer.style.padding = '0';
  document.body.appendChild(measurer);

  let currentPage = document.createElement('div');
  currentPage.className = 'verse-page';
  currentPage.style.display = 'none';
  currentPage.style.height = '100%';
  currentPage.style.overflow = 'hidden';
  let currentHeight = 0;

  const finalizePage = () => {
    if (currentPage.childNodes.length === 0) return;
    container.appendChild(currentPage);
    versePages.push(currentPage);
    currentPage = document.createElement('div');
    currentPage.className = 'verse-page';
    currentPage.style.display = 'none';
    currentPage.style.height = '100%';
    currentPage.style.overflow = 'hidden';
    currentHeight = 0;
  };

  cleanedLines.forEach((line, index) => {
    measurer.innerHTML = `<p style="margin:0; padding:0;">${line}</p>`;
    const para = measurer.firstElementChild;
    let paraHeight = para ? para.getBoundingClientRect().height : 0;

    if (paraHeight === 0) {
      console.log(`[Verse] Skipping verse ${index} - paraHeight is 0:`, line.substring(0, 50));
      return; // Skip this line but continue with next
    }

    // Use 95% of available height as threshold to prevent overflow
    const pageHeightThreshold = availableHeight * 0.95;

    // If a single line is taller than available height, split it into chunks
    let linesToAdd = [line];
    if (paraHeight > pageHeightThreshold) {
      console.log(`[Verse] Line ${index} too long (${paraHeight}px > ${pageHeightThreshold}px), splitting...`, line.substring(0, 50));
      linesToAdd = splitLongLine(line, measurer, pageHeightThreshold * 0.9);
      console.log(`[Verse] Split into ${linesToAdd.length} chunks`);
    }

    // Add all chunks from this line
    linesToAdd.forEach((chunk, chunkIdx) => {
      if (currentHeight + paraHeight > pageHeightThreshold && currentPage.childNodes.length > 0) {
        console.log(`[Verse] Page ${versePages.length} finalized with ${currentPage.childNodes.length} lines, height ${currentHeight}/${pageHeightThreshold}`);
        finalizePage();
      }

      const p = document.createElement('p');
      p.style.margin = '0';
      p.style.padding = '0';
      p.innerHTML = chunk;
      currentPage.appendChild(p);

      // Measure the actual rendered height of this chunk
      measurer.innerHTML = `<p style="margin:0; padding:0;">${chunk}</p>`;
      const chunkPara = measurer.firstElementChild;
      const chunkHeight = chunkPara ? chunkPara.getBoundingClientRect().height : 0;
      currentHeight += chunkHeight;
    });
  });

  console.log(`[Verse] Total pages created: ${versePages.length + (currentPage.childNodes.length > 0 ? 1 : 0)}`);

  finalizePage();
  document.body.removeChild(measurer);

  if (versePages.length > 0) {
    versePages[0].style.display = 'block';
  }
}

function ensureVersePagesFit() {
  const container = verseScrollContainer || document.getElementById('verse-content');
  if (!container || !versePages.length) return;

  // Skip fitting until we have a real rendered box size; prevents accidental over-shrinking.
  if (container.clientWidth < 200 || container.clientHeight < 200) {
    return;
  }

  const maxIterations = 10;
  let iterations = 0;

  while (iterations < maxIterations) {
    const containerHeight = container.clientHeight;
    if (!containerHeight) break;

    const hasOverflow = versePages.some(page => pageOverflows(page, containerHeight));
    if (!hasOverflow) break;

    const nextSize = Math.max(40, verseFontSize - 2);
    if (nextSize === verseFontSize) break;
    verseFontSize = nextSize;
    applyVerseTypography();
    buildVersePages(currentVerseLines);
    iterations += 1;
  }
}

function pageOverflows(page, containerHeight) {
  if (!page) return false;
  const prevDisplay = page.style.display;
  const prevVisibility = page.style.visibility;
  const prevPosition = page.style.position;
  const prevPointerEvents = page.style.pointerEvents;
  const prevWidth = page.style.width;

  page.style.display = 'block';
  page.style.visibility = 'hidden';
  page.style.position = 'absolute';
  page.style.pointerEvents = 'none';
  page.style.width = '100%';

  const overflow = page.scrollHeight > containerHeight + 1;

  page.style.display = prevDisplay;
  page.style.visibility = prevVisibility;
  page.style.position = prevPosition;
  page.style.pointerEvents = prevPointerEvents;
  page.style.width = prevWidth;

  return overflow;
}

function nextVersePage() {
  if (!versePages.length) return;
  const nextIndex = Math.min(versePages.length - 1, currentVersePageIndex + 1);
  console.log(`[Verse Nav] Next: current=${currentVersePageIndex}, next=${nextIndex}, total pages=${versePages.length}`);
  if (nextIndex === currentVersePageIndex) {
    console.log(`[Verse Nav] Already at last page`);
    return;
  }
  versePages[currentVersePageIndex].style.display = 'none';
  versePages[nextIndex].style.display = 'block';
  currentVersePageIndex = nextIndex;
  console.log(`[Verse Nav] Displaying page ${currentVersePageIndex}`);
}

function previousVersePage() {
  if (!versePages.length) return;
  const prevIndex = Math.max(0, currentVersePageIndex - 1);
  console.log(`[Verse Nav] Previous: current=${currentVersePageIndex}, prev=${prevIndex}, total pages=${versePages.length}`);
  if (prevIndex === currentVersePageIndex) {
    console.log(`[Verse Nav] Already at first page`);
    return;
  }
  versePages[currentVersePageIndex].style.display = 'none';
  versePages[prevIndex].style.display = 'block';
  currentVersePageIndex = prevIndex;
  console.log(`[Verse Nav] Displaying page ${currentVersePageIndex}`);
}

function extractVideoId(url) {
  const input = String(url || '').trim();
  if (!input) return '';

  const directId = input.match(/^[A-Za-z0-9_-]{11}$/);
  if (directId) {
    return directId[0];
  }

  const match = input.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/))([^&\?\/]+)/);
  return match ? match[1] : '';
}

window.addEventListener('resize', () => {
  fitVerseStage();
});
