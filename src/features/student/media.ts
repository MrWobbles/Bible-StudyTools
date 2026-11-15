import { onPlayerReady, onPlayerStateChange } from './player';
import { escapeHtml, isInIframe, setPlayer, studentState } from './state';
import type { StudentMediaItem, VideoInfo } from './types';
import { renderVerseMedia } from './verses';

function destroyActivePlayer(): void {
  if (studentState.player) {
    studentState.player.destroy();
    studentState.player = null;
  }
}

/**
 * Render `studentState.pendingMedia` onto `.player-shell` if present.
 */
export function handlePendingMedia(): void {
  console.log('[Student] handlePendingMedia called, pendingMedia:', studentState.pendingMedia);
  const media = studentState.pendingMedia;
  if (!media) {
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

  console.log('[Student] Processing media:', media);

  if (media.type === 'video') {
    let videoUrl = '';
    let videoId = '';

    if (media.sources && media.sources[0]) {
      const source = media.sources[0];
      videoId = source.videoId || '';
      videoUrl = source.url || source.path || '';

      if (!videoId && source.type === 'youtube') {
        videoId = extractVideoId(videoUrl);
      }
    } else if (media.url) {
      videoUrl = media.url;
    } else if (media.videoId) {
      videoId = media.videoId;
    }

    const isLocalVideo =
      videoUrl &&
      (videoUrl.endsWith('.mp4') ||
        videoUrl.endsWith('.webm') ||
        videoUrl.endsWith('.ogg') ||
        videoUrl.startsWith('assets/') ||
        videoUrl.startsWith('./assets/'));

    if (isLocalVideo) {
      console.log('[Student] Playing local video:', videoUrl);
      destroyActivePlayer();
      playerDiv.innerHTML = `
        <video id="local-video" style="width:100%;height:100%;background:#000;" controls autoplay>
          <source src="${videoUrl}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      `;
      studentState.pendingMedia = null;
      return;
    }

    const videoInfo = extractVideoInfo(videoUrl || videoId);
    const newVideoId = videoId || videoInfo.id;
    studentState.videoStart = videoInfo.start || 0;
    window.VIDEO_ID = newVideoId;
    window.VIDEO_START = studentState.videoStart;
    console.log('[Student] Extracted video ID:', newVideoId, 'from URL:', videoUrl, 'start:', studentState.videoStart);

    if (newVideoId) {
      studentState.videoId = newVideoId;
      destroyActivePlayer();
      playerDiv.innerHTML = '<div id="player"></div>';
      console.log('[Student] Creating new YouTube player with video ID:', studentState.videoId);
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
      studentState.pendingMedia = null;
    }
  } else if (media.type === 'image' || media.type === 'images') {
    const imgUrl = getMediaSourceUrl(media);

    if (imgUrl) {
      destroyActivePlayer();
      playerDiv.innerHTML = '';
      const img = document.createElement('img');
      img.alt = media.title || 'Image';
      img.style.cssText =
        'width:100%; height:100%; object-fit:contain; opacity:0; transform:scale(0.98); transition:opacity 600ms ease, transform 600ms ease;';
      const reveal = () =>
        requestAnimationFrame(() => {
          img.style.opacity = '1';
          img.style.transform = 'scale(1)';
        });
      img.onload = reveal;
      img.onerror = reveal;
      img.src = imgUrl;
      playerDiv.appendChild(img);
      if (media.fullscreen) document.body.classList.add('fullscreen-mode');
      studentState.pendingMedia = null;
    }
  } else if (media.type === 'pdf' || media.type === 'document') {
    const docUrl = getMediaSourceUrl(media);
    if (!docUrl) return;

    destroyActivePlayer();
    playerDiv.innerHTML = `
      <iframe src="${docUrl}" style="width:100%; height:100%; border:none; border-radius:10px;"></iframe>
    `;
    studentState.pendingMedia = null;
  } else if (media.type === 'audio') {
    const audioUrl = getMediaSourceUrl(media);
    if (!audioUrl) return;

    destroyActivePlayer();
    playerDiv.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; height:100%; padding:24px;">
        <audio controls autoplay style="width:min(900px, 100%);" src="${audioUrl}"></audio>
      </div>
    `;
    studentState.pendingMedia = null;
  } else if (media.type === 'link') {
    const linkUrl = getMediaSourceUrl(media);
    if (!linkUrl) return;

    destroyActivePlayer();
    const safeTitle = escapeHtml(media.title || 'External Link');
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
    studentState.pendingMedia = null;
  } else if (media.type === 'verse') {
    studentState.pendingMedia = null;
    void renderVerseMedia(media);
  } else if (media.type === 'question') {
    studentState.pendingMedia = null;
    renderQuestionMedia(media);
  } else if (media.type === 'text') {
    studentState.pendingMedia = null;
    renderTextMedia(media);
  }
}

function getMediaSourceUrl(media: StudentMediaItem): string {
  if (!media || typeof media !== 'object') return '';
  if (typeof media.url === 'string' && media.url.trim()) return media.url.trim();
  if (Array.isArray(media.sources) && media.sources.length > 0) {
    const first = media.sources[0];
    if (typeof first?.url === 'string' && first.url.trim()) return first.url.trim();
    if (typeof first?.path === 'string' && first.path.trim()) return first.path.trim();
  }
  return '';
}

function renderQuestionMedia(media: StudentMediaItem): void {
  const playerDiv = document.querySelector('.player-shell');
  if (!playerDiv) return;

  const prompt = media.prompt || media.title || '';
  if (!prompt) return;

  destroyActivePlayer();

  playerDiv.innerHTML = `
    <div class="question-frame" style="padding:60px;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;background:linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2250%22%20r%3D%2240%22%20fill%3D%22none%22%20stroke%3D%22rgba(240%2C180%2C41%2C0.1)%22%20stroke-width%3D%220.5%22%2F%3E%3C%2Fsvg%3E') repeat;opacity:0.3;"></div>
      <div style="text-align:center;max-width:85%;position:relative;z-index:1;">
        <div style="font-size:48px;margin-bottom:24px;"><span class="material-symbols-outlined" style="font-size: 48px;">help</span></div>
        <h1 class="question-prompt" style="color:#fff;font-size:52px;line-height:1.4;font-weight:600;margin:0;text-shadow:2px 2px 4px rgba(0,0,0,0.3);">${escapeHtml(prompt)}</h1>
        ${media.title && media.title !== prompt ? `<div style="color:rgba(255,255,255,0.7);font-size:24px;margin-top:24px;">${escapeHtml(media.title)}</div>` : ''}
      </div>
    </div>
  `;
}

function renderTextMedia(media: StudentMediaItem): void {
  const playerDiv = document.querySelector('.player-shell');
  if (!playerDiv) return;

  const content = media.content || '';
  if (!content) return;

  destroyActivePlayer();

  const lines = content.split('\n').filter((line) => line.trim() !== '');
  const paragraphs = lines.map((line) => `<p style="margin: 0 0 16px 0;">${escapeHtml(line)}</p>`).join('');

  playerDiv.innerHTML = `
    <div class="text-frame" style="padding:60px;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;background:linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2250%22%20r%3D%2240%22%20fill%3D%22none%22%20stroke%3D%22rgba(240%2C180%2C41%2C0.1)%22%20stroke-width%3D%220.5%22%2F%3E%3C%2Fsvg%3E') repeat;opacity:0.3;"></div>
      <div style="text-align:left;max-width:85%;position:relative;z-index:1;background:rgba(0,0,0,0.3);padding:40px 60px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);">
        ${media.title ? `<h1 style="color:var(--brand);font-size:36px;margin:0 0 30px 0;border-bottom:2px solid rgba(240,180,41,0.3);padding-bottom:15px;">${escapeHtml(media.title)}</h1>` : ''}
        <div class="text-content" style="color:#fff;font-size:42px;line-height:1.5;font-weight:400;text-shadow:1px 1px 2px rgba(0,0,0,0.5);">
          ${paragraphs}
        </div>
      </div>
    </div>
  `;
}

/**
 * Extract a YouTube video ID and optional start timestamp (in seconds) from a URL or ID.
 */
export function extractVideoInfo(url: string): VideoInfo {
  const input = String(url || '').trim();
  if (!input) return { id: '', start: 0 };

  const directIdMatch = input.match(/^[A-Za-z0-9_-]{11}$/);
  if (directIdMatch) {
    return { id: directIdMatch[0], start: 0 };
  }

  const match = input.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/))([^&\?\/]+)/);
  const id = match ? match[1] : '';

  let start = 0;
  const timeMatch = input.match(/[?&](?:t|start)=([^&\s]+)/);
  if (timeMatch && timeMatch[1]) {
    const timeStr = timeMatch[1];
    if (/^\d+$/.test(timeStr)) {
      start = parseInt(timeStr, 10);
    } else {
      const h = timeStr.match(/(\d+)h/i);
      const m = timeStr.match(/(\d+)m/i);
      const s = timeStr.match(/(\d+)s/i);
      start =
        (h ? parseInt(h[1], 10) * 3600 : 0) +
        (m ? parseInt(m[1], 10) * 60 : 0) +
        (s ? parseInt(s[1], 10) : 0);
    }
  }

  return { id, start };
}

/**
 * Extract just the YouTube video ID from a URL or ID string.
 */
export function extractVideoId(value: string): string {
  return extractVideoInfo(value).id;
}
