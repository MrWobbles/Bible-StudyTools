import { handlePendingMedia } from './media';
import {
  initConfig,
  onPlayerReady,
  onPlayerStateChange,
  onYouTubeIframeAPIReady,
  setFullscreenHandler,
  setMediaReadyHandler,
} from './player';
import { isInIframe, setPlayer, studentState } from './state';
import { setupControlChannel } from './sync';
import { fitVerseStage } from './verses';
import { goFullscreen, returnToDefaultView, syncFullscreenClass } from './view';

setMediaReadyHandler(handlePendingMedia);
setFullscreenHandler(goFullscreen);

// Function to update player reference when a new video is loaded
window.updatePlayerReference = function (newPlayer: YouTubePlayerInstance) {
  setPlayer(newPlayer);
  console.log('[Student] Player reference updated');
};

// Make player and callback functions globally accessible so loader can reinitialize
window.player = studentState.player ?? undefined;
window.VIDEO_ID = studentState.videoId;
window.onPlayerReady = onPlayerReady;
window.onPlayerStateChange = onPlayerStateChange;
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
window.returnToDefaultView = returnToDefaultView;

// Wait for config to load, then initialize YouTube API
window.addEventListener('load', () => {
  function initAfterConfig(): void {
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

if (isInIframe) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.classList.add('iframe-preview');
    });
  } else {
    document.body.classList.add('iframe-preview');
  }
}

// Listen for fullscreen changes to keep CSS class in sync
document.addEventListener('fullscreenchange', syncFullscreenClass);
document.addEventListener('webkitfullscreenchange', syncFullscreenClass);
document.addEventListener('mozfullscreenchange', syncFullscreenClass);
document.addEventListener('MSFullscreenChange', syncFullscreenClass);

window.addEventListener('resize', () => {
  fitVerseStage();
});
