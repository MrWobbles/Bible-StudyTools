import { teacherState } from './state';
import { sendCommand, updateControlVisibility } from './sync';
import type { TeacherMediaItem } from './types';
import { sendVerseToStudent } from './verses';

export function getMediaIcon(type: string): string {
  const icons: Record<string, string> = {
    video: 'videocam',
    pdf: 'description',
    images: 'image',
    audio: 'audio_file',
    document: 'assignment',
    link: 'link',
    presentation: 'bar_chart',
    verse: 'menu_book'
  };
  return icons[type] || 'folder';
}

export function getMediaMarkIcon(type: string): string {
  const icons: Record<string, string> = {
    verse: 'menu_book',
    video: 'movie',
    image: 'image',
    images: 'photo_library',
    link: 'link',
    pdf: 'description',
    document: 'assignment',
    audio: 'audio_file',
    question: 'help',
    presentation: 'bar_chart'
  };
  return icons[type] || 'attach_file';
}

export function sendMediaToStudent(index: number): void {
  if (!window.teacherMediaList || index >= window.teacherMediaList.length) {
    console.error('[Teacher] Invalid media index:', index);
    return;
  }

  const media = window.teacherMediaList[index];
  console.log('[Teacher] Sending media to student:', media);
  teacherState.currentMediaType = media.type || 'unknown';
  updateControlVisibility();
  sendCommand('displayMedia', { media });
}

export function sendSectionMediaToStudent(media: TeacherMediaItem): void {
  if (!media) return;

  console.log('[Teacher] Sending section media to student:', media);

  if (media.type === 'verse') {
    const reference = media.reference || media.title || '';
    const translation = media.translation || 'nkjv';
    sendVerseToStudent(reference, translation);
    return;
  }

  if (media.type === 'video') {
    teacherState.currentMediaType = 'video';
    updateControlVisibility();

    const videoMedia: TeacherMediaItem = {
      type: 'video',
      title: media.title || 'Video'
    };

    if (media.sources) {
      videoMedia.sources = media.sources;
    } else if (media.url) {
      videoMedia.url = media.url;
    }

    sendCommand('displayMedia', { media: videoMedia });
    return;
  }

  if (media.type === 'image' || media.type === 'images') {
    teacherState.currentMediaType = 'image';
    updateControlVisibility();

    const imageMedia: TeacherMediaItem = {
      type: 'image',
      title: media.title || 'Image'
    };

    if (media.sources) {
      imageMedia.sources = media.sources;
    } else if (media.url) {
      imageMedia.url = media.url;
    }

    sendCommand('displayMedia', { media: imageMedia });
    return;
  }

  if (media.type === 'question') {
    teacherState.currentMediaType = 'question';
    updateControlVisibility();
    sendCommand('displayMedia', {
      media: {
        type: 'question',
        prompt: media.prompt || media.title || '',
        answer: media.answer || '',
        title: media.title || 'Discussion Question'
      }
    });
    return;
  }

  if (media.type === 'link') {
    teacherState.currentMediaType = 'link';
    updateControlVisibility();
    sendCommand('displayMedia', { media });
    return;
  }

  teacherState.currentMediaType = media.type || 'unknown';
  updateControlVisibility();
  sendCommand('displayMedia', { media });
}

function collectTeacherMediaItems(): TeacherMediaItem[] {
  const orderedMedia: TeacherMediaItem[] = [];
  const classMedia = Array.isArray(teacherState.classConfig?.media)
    ? teacherState.classConfig.media
    : [];

  orderedMedia.push(...classMedia.filter((m) => m?.primary));

  if (Array.isArray(teacherState.classConfig?.outline)) {
    teacherState.classConfig.outline.forEach((section) => {
      if (!Array.isArray(section?.media)) return;
      section.media.forEach((media) => {
        orderedMedia.push({
          ...media,
          sectionTitle: section.summary || ''
        });
      });
    });
  }

  orderedMedia.push(...classMedia.filter((m) => !m?.primary));
  return orderedMedia.filter(Boolean);
}

function decodeEditorMediaPayload(encodedPayload: string | null): TeacherMediaItem | null {
  if (!encodedPayload) return null;

  try {
    const decoded = decodeURIComponent(encodedPayload);
    const parsed: unknown = JSON.parse(decoded);
    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      return parsed as TeacherMediaItem;
    }
    return null;
  } catch (err: unknown) {
    console.warn('[Teacher] Failed to decode editor media payload:', err);
    return null;
  }
}

function findMediaByTileText(tileText: string | null): TeacherMediaItem | null {
  const normalizedText = String(tileText || '').trim().toLowerCase();
  if (!normalizedText) return null;

  const items = collectTeacherMediaItems();
  return (
    items.find((media) => {
      const mediaTitle = String(media?.title || media?.reference || media?.prompt || '')
        .trim()
        .toLowerCase();
      return Boolean(mediaTitle && mediaTitle === normalizedText);
    }) || null
  );
}

export function setupEditorMediaTiles(container: Element): void {
  const mediaTiles = container.querySelectorAll('.editor-media-tile');

  mediaTiles.forEach((tile) => {
    if (!(tile instanceof HTMLElement)) return;
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.title = 'Click to display this media on student screen';

    if (tile.tagName === 'A') {
      tile.setAttribute('href', tile.getAttribute('href') || '#');
    }

    const activateTile = (event?: Event): void => {
      if (event) {
        event.preventDefault();
      }

      const dataPayload = tile.getAttribute('data-media-json');
      const href = tile.getAttribute('href') || '';
      const hrefPayload = href.startsWith('bst-media:') ? href.slice('bst-media:'.length) : '';
      const media =
        decodeEditorMediaPayload(dataPayload || hrefPayload) ||
        findMediaByTileText(tile.textContent);
      if (!media) {
        return;
      }

      sendSectionMediaToStudent(media);
      tile.classList.add('mark-active');
      setTimeout(() => tile.classList.remove('mark-active'), 500);
    };

    tile.addEventListener('click', activateTile);
    tile.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        activateTile(event);
      }
    });
  });
}

export function renderMediaGallery(): void {
  const orderedMedia = collectTeacherMediaItems();

  let mediaDrawer = document.getElementById('media-drawer');
  if (!mediaDrawer) {
    mediaDrawer = document.createElement('aside');
    mediaDrawer.id = 'media-drawer';
    mediaDrawer.className = 'media-drawer';
    mediaDrawer.innerHTML = `
      <div class="media-drawer-header">
        <div>
          <div class="tag">Media resources</div>
          <h3 style="margin: 6px 0 0;">Lesson media</h3>
        </div>
        <button id="media-close-btn" aria-label="Close media resources panel" title="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="media-drawer-body" id="media-panel"></div>
    `;
    document.body.appendChild(mediaDrawer);
  }

  const mediaPanel = document.getElementById('media-panel');
  if (mediaPanel) {
    if (orderedMedia.length > 0) {
      const mediaHTML = `
        <div class="media-list">
          ${orderedMedia
            .map((media, idx) => {
              const sectionLabel = media.sectionTitle
                ? `<div style="font-size:10px; color:var(--muted); margin-top:2px;">${media.sectionTitle}</div>`
                : '';
              const url =
                media.url ||
                (media.sources &&
                  media.sources[0] &&
                  (media.sources[0].url || media.sources[0].path)) ||
                '#';

              return `
            <div class="media-item" data-media-index="${idx}" data-media-type="${media.type}" data-media-url="${url}" title="${media.title || media.type}">
              <div style="display:flex; gap:10px; align-items:center; min-width:0;">
                <span class="material-symbols-outlined" style="font-size:20px;">${getMediaIcon(media.type)}</span>
                <div style="min-width:0;">
                  <div class="media-item-title">${media.title || media.type}</div>
                  <div class="media-item-meta">${media.type}${media.primary ? ' (primary)' : ''}</div>
                  ${sectionLabel}
                </div>
              </div>
            </div>
            `;
            })
            .join('')}
        </div>
      `;
      mediaPanel.innerHTML = mediaHTML;

      mediaPanel.querySelectorAll('.media-item').forEach((item) => {
        if (!(item instanceof HTMLElement)) return;
        item.addEventListener('click', () => {
          const idx = Number(item.dataset.mediaIndex);
          if (Number.isInteger(idx)) {
            sendMediaToStudent(idx);
          }
        });
      });
    } else {
      mediaPanel.innerHTML = `
        <div style="color: var(--muted); font-size: 14px; padding: 20px; text-align: center;">
          <span class="material-icons" style="font-size: 32px; opacity: 0.5; display: block; margin-bottom: 8px;">folder_off</span>
          No media resources for this class.<br>
          Add media in the Admin panel.
        </div>
      `;
    }
  }

  const page = document.querySelector('.page');
  const toggleBtn = document.getElementById('toggle-media-btn');
  const closeBtn = document.getElementById('media-close-btn');
  if (toggleBtn instanceof HTMLElement) {
    toggleBtn.onclick = () => {
      mediaDrawer?.classList.toggle('open');
      page?.classList.toggle('media-drawer-open');
    };
  }
  if (closeBtn instanceof HTMLElement) {
    closeBtn.onclick = () => {
      mediaDrawer?.classList.remove('open');
      page?.classList.remove('media-drawer-open');
    };
  }

  window.teacherMediaList = orderedMedia;
}
