import { clearVisualEffects } from './effects';

let currentVideo: HTMLVideoElement | null = null;

function getElements() {
  return {
    videoContainer: document.getElementById('video-container'),
    sfxPlayer: document.getElementById('sfx-player') as HTMLAudioElement | null,
    overlay: document.getElementById('loading-overlay'),
    textOverlay: document.getElementById('text-overlay'),
  };
}

export function showText(text: string, color = '#fff'): void {
  const { textOverlay } = getElements();
  if (!textOverlay) return;
  textOverlay.textContent = text;
  textOverlay.style.color = color;
  textOverlay.style.opacity = '1';
}

export function hideText(): void {
  const { textOverlay } = getElements();
  if (!textOverlay) return;
  textOverlay.style.opacity = '0';
}

export function clearEffects(): void {
  hideText();
  const { sfxPlayer } = getElements();
  if (sfxPlayer) {
    sfxPlayer.pause();
    sfxPlayer.src = '';
  }
  clearVisualEffects();
}

export function playVideo(url: string): void {
  const { videoContainer, overlay } = getElements();
  if (!videoContainer) return;

  if (currentVideo) {
    currentVideo.pause();
    currentVideo.remove();
  }

  clearEffects();

  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 500);
  }

  const video = document.createElement('video');
  video.src = url;
  video.preload = 'auto';
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');

  video.onerror = () => {
    const err = video.error;
    let msg = 'Unknown Error';
    if (err) {
      switch (err.code) {
        case 1:
          msg = 'MEDIA_ERR_ABORTED';
          break;
        case 2:
          msg = 'MEDIA_ERR_NETWORK';
          break;
        case 3:
          msg = 'MEDIA_ERR_DECODE (Codec not supported by this browser)';
          break;
        case 4:
          msg = 'MEDIA_ERR_SRC_NOT_SUPPORTED (File not found or format not supported)';
          break;
      }
    }
    console.error('Video Error:', msg, url);
    alert(`Video Error: ${msg}\nURL: ${url}`);
  };

  videoContainer.appendChild(video);
  currentVideo = video;
}

export function playSfx(url: string, loop = false): void {
  const { sfxPlayer } = getElements();
  if (!sfxPlayer) return;
  sfxPlayer.src = url;
  sfxPlayer.loop = loop;
  sfxPlayer.play().catch((err: unknown) => console.error('Failed to play SFX:', err));
}

export function stopAll(): void {
  if (currentVideo) {
    currentVideo.pause();
    currentVideo.remove();
    currentVideo = null;
  }

  clearEffects();

  const { overlay } = getElements();
  if (overlay) {
    overlay.style.display = 'flex';
    setTimeout(() => {
      overlay.style.opacity = '1';
    }, 10);
  }
}
