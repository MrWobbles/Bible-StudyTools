import { onPlayerReady, onPlayerStateChange, resetNextPause } from './player';
import { isInIframe, setPlayer, studentState } from './state';
import type { VendorFullscreenDocument, VendorFullscreenElement } from './types';
import { fitVerseStage } from './verses';

/**
 * Toggle fullscreen mode using the Fullscreen API with CSS class fallback.
 */
export function goFullscreen(): void {
  const container = (document.querySelector('.player-shell') || document.documentElement) as VendorFullscreenElement;
  const doc = document as VendorFullscreenDocument;

  function isFullscreenActive(): boolean {
    return !!(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement ||
      document.body.classList.contains('fullscreen-mode')
    );
  }

  const shouldEnter = !isFullscreenActive();
  console.log('[Fullscreen] Current state:', isFullscreenActive(), '-> Should enter:', shouldEnter);

  if (shouldEnter) {
    document.body.classList.add('fullscreen-mode');

    const req =
      container.requestFullscreen?.bind(container) ||
      container.webkitRequestFullscreen?.bind(container) ||
      container.mozRequestFullScreen?.bind(container) ||
      container.msRequestFullscreen?.bind(container);

    if (req) {
      req()
        .then(() => {
          console.log('[Fullscreen] Entered fullscreen via API');
        })
        .catch(() => {
          console.log('[Fullscreen] API failed, using CSS fallback');
          document.body.classList.add('fullscreen-mode');
        });
    } else {
      console.log('[Fullscreen] No API available, using CSS fallback');
      document.body.classList.add('fullscreen-mode');
    }
  } else {
    const exit =
      doc.exitFullscreen?.bind(doc) ||
      doc.webkitExitFullscreen?.bind(doc) ||
      doc.mozCancelFullScreen?.bind(doc) ||
      doc.msExitFullscreen?.bind(doc);
    if (exit) {
      exit()
        .then(() => {
          console.log('[Fullscreen] Exited fullscreen via API');
        })
        .catch(() => {
          console.log('[Fullscreen] Exit failed, removing CSS class');
          document.body.classList.remove('fullscreen-mode');
        });
    }
    document.body.classList.remove('fullscreen-mode');
    console.log('[Fullscreen] Exited fullscreen');
  }
}

/**
 * Fade out any displayed image and restore the default YouTube player view.
 */
export function returnToDefaultView(): void {
  const playerDiv = document.querySelector('.player-shell');
  if (!(playerDiv instanceof HTMLElement)) return;

  const shownImg = playerDiv.querySelector(':scope > img');
  if (shownImg instanceof HTMLElement && !playerDiv.dataset.fadingOut) {
    playerDiv.dataset.fadingOut = '1';
    shownImg.style.transition = 'opacity 450ms ease, transform 450ms ease';
    shownImg.style.opacity = '0';
    shownImg.style.transform = 'scale(0.98)';
    studentState.pendingMedia = null;
    setTimeout(() => {
      delete playerDiv.dataset.fadingOut;
      if (studentState.pendingMedia) return;
      resetToDefaultViewNow();
    }, 450);
    return;
  }

  resetToDefaultViewNow();
}

function resetToDefaultViewNow(): void {
  const playerDiv = document.querySelector('.player-shell');
  if (!playerDiv) return;

  studentState.pendingMedia = null;
  studentState.versePages = [];
  studentState.currentVersePageIndex = 0;
  studentState.currentVerseLines = [];
  studentState.verseScrollContainer = null;

  const doc = document as VendorFullscreenDocument;
  const exit =
    doc.exitFullscreen?.bind(doc) ||
    doc.webkitExitFullscreen?.bind(doc) ||
    doc.mozCancelFullScreen?.bind(doc) ||
    doc.msExitFullscreen?.bind(doc);

  if (
    exit &&
    (doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement)
  ) {
    exit().catch(() => {
      // ignore exit failures and continue resetting view
    });
  }

  document.body.classList.remove('fullscreen-mode');

  if (studentState.player && typeof studentState.player.destroy === 'function') {
    try {
      studentState.player.destroy();
    } catch (err) {
      console.warn('[Student] Failed to destroy player while clearing screen', err);
    }
  }
  setPlayer(null);

  playerDiv.innerHTML = '<div id="player"></div>';

  if (typeof YT !== 'undefined' && YT.Player && studentState.videoId) {
    studentState.player = new YT.Player('player', {
      height: '100%',
      width: '100%',
      videoId: studentState.videoId,
      playerVars: {
        rel: 0,
        modestbranding: 1,
        color: 'white',
        playsinline: 1,
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
  }

  resetNextPause();
}

/**
 * Sync `fullscreen-mode` body class and refit the verse stage on fullscreen transitions.
 */
export function syncFullscreenClass(): void {
  const doc = document as VendorFullscreenDocument;
  const isFullscreen = !!(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement
  );
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
