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

    if (window.self !== window.top) {
      const scale = 400 / 1280;
      document.body.style.transform = `scale(${scale})`;
      document.body.style.transformOrigin = 'top left';
      document.body.style.width = '1280px';
      document.body.style.height = '720px';
      document.body.style.overflow = 'hidden';
    }

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

  if ('BroadcastChannel' in window) {
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
        console.log('[Student] Ignoring fullscreen command in iframe');
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
}

function bindControls() {
  document.getElementById('toggle-play').onclick = togglePlay;
  document.getElementById('restart').onclick = restartVideo;
  document.getElementById('next-pause').onclick = skipToNextPause;
  document.getElementById('fullscreen').onclick = goFullscreen;
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
      videoUrl = source.url || '';
    } else if (pendingMedia.url) {
      videoUrl = pendingMedia.url;
    } else if (pendingMedia.videoId) {
      videoId = pendingMedia.videoId;
    }

    const newVideoId = videoId || extractVideoId(videoUrl);
    console.log('[Student] Extracted video ID:', newVideoId, 'from URL:', videoUrl);

    if (newVideoId) {
      VIDEO_ID = newVideoId;
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
    // Support both sources array and direct url
    let imgUrl = '';
    if (pendingMedia.sources && pendingMedia.sources[0]) {
      imgUrl = pendingMedia.sources[0].url;
    } else if (pendingMedia.url) {
      imgUrl = pendingMedia.url;
    }

    if (imgUrl) {
      // Destroy player if exists
      if (player) {
        player.destroy();
        player = null;
      }
      playerDiv.innerHTML = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:contain;" alt="${pendingMedia.title || 'Image'}">`;
      pendingMedia = null;
    }
  } else if (pendingMedia.type === 'verse') {
    const media = pendingMedia;
    pendingMedia = null;
    renderVerseMedia(media);
  }
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
    const preferredTranslations = media.translation
      ? [media.translation]
      : ['nkjv', 'kjv'];

    const verseData = await fetchVerseData(reference, preferredTranslations);
    if (!verseData) throw new Error('Failed to fetch passage');

    const title = verseData.title || reference;
    const sourceLabel = verseData.sourceLabel || 'Scripture';
    const allParagraphs = verseData.lines
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => `<p style="margin:0; padding:0; line-height:2.4; font-size:72px;">${escapeHtml(line)}</p>`)
      .join('');

    playerDiv.innerHTML = `
      <div style="padding:40px;display:flex;flex-direction:column;gap:0;height:100%;overflow:hidden;background: rgba(0 0 0 / 75%);margin: 20px;width: calc(100% - 80px);height: calc(100% - 40px);">
        <div style="font-size:28px; color:var(--muted); margin-bottom:20px;">${escapeHtml(sourceLabel)}</div>
        <h2 style="margin:0 0 30px 0; font-size:80px;">${escapeHtml(title)}</h2>
        <div id="verse-content" style="font-size:72px; overflow:hidden; flex:1; padding-bottom:80px;">
          ${allParagraphs}
        </div>
      </div>
    `;

    verseScrollContainer = document.getElementById('verse-content');
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

function nextVersePage() {
  if (!verseScrollContainer) return;
  const scrollHeight = verseScrollContainer.clientHeight;
  verseScrollContainer.scrollTop += scrollHeight;
}

function previousVersePage() {
  if (!verseScrollContainer) return;
  const scrollHeight = verseScrollContainer.clientHeight;
  verseScrollContainer.scrollTop = Math.max(0, verseScrollContainer.scrollTop - scrollHeight);
}

function extractVideoId(url) {
  if (!url) return '';
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([^&\?\/]+)/);
  return match ? match[1] : '';
}
