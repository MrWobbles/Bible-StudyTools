import { saveClassToFile } from './classes';
import { populateMediaForm, updateMediaForm } from './mediaForm';
import { closeModal } from './modals';
import { adminState, getEl, getInput, getSelect, getTextArea } from './state';
import type { AdminClassConfig, AdminMediaItem, AdminMediaSource } from './types';

export function renderMediaList(cls: AdminClassConfig): void {
  const mediaList = getEl('media-list');
  if (!mediaList) return;
  mediaList.innerHTML = '';

  (cls.media || []).forEach((media, index) => {
    const item = document.createElement('div');
    item.className = 'media-item';
    item.innerHTML = `
      <div class="media-item-info">
        <div class="media-item-title">
          ${media.title || ''}
          ${media.primary ? '<span style="color: var(--accent); margin-left: 8px;">●</span>' : ''}
        </div>
        <div class="media-item-type">${media.type}</div>
      </div>
      <div class="item-actions">
        <button class="btn-icon" onclick="editMedia(${index})">Edit</button>
        <button class="btn-icon" onclick="deleteMedia(${index})">Delete</button>
      </div>
    `;
    mediaList.appendChild(item);
  });
}

export function editMedia(index: number): void {
  if (adminState.currentClass === null) return;
  const cls = adminState.allClasses[adminState.currentClass];
  const media = cls?.media?.[index];
  if (!media) return;

  adminState.currentMediaIndex = index;

  const modalTitle = getEl('media-modal-title');
  const idInput = getInput('media-id');
  const typeSelect = getSelect('media-type');
  const titleInput = getInput('media-title');
  const primaryInput = getInput('media-primary');
  const modal = getEl('media-modal');

  if (modalTitle) modalTitle.textContent = 'Edit Media';
  if (idInput) idInput.value = media.id || '';
  if (typeSelect) typeSelect.value = media.type;
  if (titleInput) titleInput.value = media.title || '';
  if (primaryInput) primaryInput.checked = Boolean(media.primary);

  updateMediaForm();
  populateMediaForm(media);

  if (modal) modal.style.display = 'flex';
}

export function addMedia(): void {
  adminState.currentMediaIndex = null;

  const modalTitle = getEl('media-modal-title');
  const idInput = getInput('media-id');
  const typeSelect = getSelect('media-type');
  const titleInput = getInput('media-title');
  const primaryInput = getInput('media-primary');
  const modal = getEl('media-modal');

  if (modalTitle) modalTitle.textContent = 'Add Media';
  if (idInput) idInput.value = '';
  if (typeSelect) typeSelect.value = 'video';
  if (titleInput) titleInput.value = '';
  if (primaryInput) primaryInput.checked = false;

  updateMediaForm();

  if (modal) modal.style.display = 'flex';
}

export function saveMedia(): void {
  if (adminState.currentClass === null) return;
  const cls = adminState.allClasses[adminState.currentClass];
  if (!cls) return;

  const type = getSelect('media-type')?.value ?? '';
  const id = getInput('media-id')?.value ?? '';
  const title = getInput('media-title')?.value ?? '';
  const primary = getInput('media-primary')?.checked ?? false;

  if (!id || !title) {
    alert('Please fill in ID and Title');
    return;
  }

  const sources: AdminMediaSource[] = [];
  const media: AdminMediaItem = {
    id,
    type,
    title,
    primary,
    sources,
  };

  if (type === 'video') {
    const youtubeId = getInput('media-youtube-id')?.value ?? '';
    const localVideo = getInput('media-local-video')?.value ?? '';

    if (youtubeId) {
      sources.push({ type: 'youtube', url: youtubeId });
    }
    if (localVideo) {
      sources.push({ type: 'local', url: localVideo });
    }

    const duration = getInput('media-duration')?.value ?? '';
    if (duration) {
      media.duration = parseInt(duration, 10);
    }

    const pausePoints = getInput('media-pause-points')?.value ?? '';
    if (pausePoints) {
      media.pausePoints = pausePoints
        .split(',')
        .map((p) => parseInt(p.trim(), 10))
        .filter((p) => !isNaN(p));
    } else {
      media.pausePoints = [];
    }
  } else if (type === 'pdf') {
    const url = getInput('media-pdf-url')?.value ?? '';
    if (url) {
      sources.push({ type: 'pdf', url });
    }
  } else if (type === 'images') {
    const urlsText = getTextArea('media-image-urls')?.value ?? '';
    const urls = urlsText.split('\n').filter((u) => u.trim());
    urls.forEach((url) => {
      sources.push({ type: 'image', url: url.trim() });
    });
  } else if (type === 'audio') {
    const url = getInput('media-audio-url')?.value ?? '';
    if (url) {
      sources.push({ type: 'audio', url });
    }
  } else if (type === 'document') {
    const url = getInput('media-doc-url')?.value ?? '';
    if (url) {
      sources.push({ type: 'document', url });
    }
  } else if (type === 'link') {
    const url = getInput('media-link-url')?.value ?? '';
    if (url) {
      sources.push({ type: 'link', url });
    }
  }

  if (!Array.isArray(cls.media)) {
    cls.media = [];
  }

  if (primary) {
    cls.media.forEach((m) => {
      m.primary = false;
    });
  }

  if (adminState.currentMediaIndex !== null) {
    cls.media[adminState.currentMediaIndex] = media;
  } else {
    cls.media.push(media);
  }

  renderMediaList(cls);
  closeModal('media-modal');
  void saveClassToFile();
}

export function deleteMedia(index: number): void {
  if (adminState.currentClass === null) return;
  const cls = adminState.allClasses[adminState.currentClass];
  if (!cls || !Array.isArray(cls.media)) return;

  if (confirm('Delete this media item?')) {
    cls.media.splice(index, 1);
    renderMediaList(cls);
    void saveClassToFile();
  }
}
