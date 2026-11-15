import { closeModal, editorState } from '../state';
import { escapeHtml, getErrorMessage, isRecord } from '../types';
import type { EditorDocument, EditorMediaEntry } from '../types';
import { getCurrentClassForDisplayRouting } from './displayRouting';

function getMediaIconForEditor(type: string | undefined): string {
  const icons: Record<string, string> = {
    verse: 'menu_book',
    video: 'videocam',
    image: 'image',
    images: 'photo_library',
    link: 'link',
    pdf: 'description',
    document: 'assignment',
    audio: 'audio_file',
    question: 'help',
    presentation: 'bar_chart',
  };
  return (type && icons[type]) || 'attach_file';
}

function collectClassMedia(cls: EditorDocument | null): EditorMediaEntry[] {
  if (!cls || typeof cls !== 'object') {
    return [];
  }

  const orderedMedia: MediaItem[] = [];
  const classMedia = Array.isArray(cls.media) ? cls.media : [];

  orderedMedia.push(...classMedia.filter((m) => m?.primary));

  if (Array.isArray(cls.outline)) {
    cls.outline.forEach((section) => {
      const sectionWithMedia = section as ClassOutlineSection;
      if (!Array.isArray(sectionWithMedia?.media)) {
        return;
      }
      sectionWithMedia.media.forEach((media) => {
        orderedMedia.push({
          ...media,
          sectionTitle: sectionWithMedia.summary || '',
        });
      });
    });
  }

  orderedMedia.push(...classMedia.filter((m) => !m?.primary));

  return orderedMedia.filter(Boolean).map((media, idx) => ({
    ...media,
    __editorMediaId: media.id || `media-${idx}-${media.type || 'item'}`,
  }));
}

function insertMediaTile(media: EditorMediaEntry): void {
  const { editor } = editorState;
  if (!editor || !media) return;

  const title = media.title || media.reference || media.prompt || media.type || 'Media';
  const icon = getMediaIconForEditor(media.type);
  const payload = encodeURIComponent(JSON.stringify(media));

  const tileHtml = `<a href="bst-media:${payload}" class="editor-media-tile" title="${escapeHtml(title)}"><span class="material-symbols-outlined">${icon}</span><span>${escapeHtml(title)}</span></a>&nbsp;`;

  editor.chain().focus().insertContent(tileHtml).run();
}

function safeParseMediaPayload(value: string): EditorMediaEntry | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? (parsed as unknown as EditorMediaEntry) : null;
  } catch (error: unknown) {
    console.warn('Invalid media payload:', error);
    return null;
  }
}

export function setupMediaDropSupport(): void {
  const editorHost = document.getElementById('editor');
  if (!editorHost) return;

  editorHost.addEventListener('dragover', (e: DragEvent) => {
    const hasMediaPayload = Array.from(e.dataTransfer?.types || []).includes(
      'application/x-bst-media'
    );
    if (hasMediaPayload) {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    }
  });

  editorHost.addEventListener('drop', (e: DragEvent) => {
    const payload = e.dataTransfer?.getData('application/x-bst-media');
    if (!payload) return;

    e.preventDefault();
    const media = safeParseMediaPayload(payload);
    if (media) {
      insertMediaTile(media);
    }
  });
}

export function isEditorTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof globalThis.Node)) {
    return false;
  }

  const editorHost = document.getElementById('editor');
  return !!(editorHost && editorHost.contains(target));
}

export async function pasteClipboardTextIntoEditor(): Promise<boolean> {
  const { editor } = editorState;
  if (!editor || !navigator.clipboard?.readText) {
    return false;
  }

  try {
    const text = await navigator.clipboard.readText();
    if (typeof text !== 'string') {
      return false;
    }

    editor.chain().focus().insertContent(text).run();
    return true;
  } catch (error: unknown) {
    console.warn('Clipboard paste fallback failed:', error);
    return false;
  }
}

export function renderEditorMediaSidebar(cls: EditorDocument | null): void {
  const mediaList = document.getElementById('editor-media-list');
  if (!mediaList) return;

  editorState.editorMediaItems = collectClassMedia(cls);

  if (editorState.editorMediaItems.length === 0) {
    mediaList.innerHTML = '<p class="editor-media-empty">No media found for this class.</p>';
    return;
  }

  mediaList.innerHTML = editorState.editorMediaItems
    .map((media, idx) => {
      const title = media.title || media.reference || media.prompt || media.type || 'Media';
      const icon = getMediaIconForEditor(media.type);
      const section = media.sectionTitle ? `<small>${escapeHtml(media.sectionTitle)}</small>` : '';
      return `
      <button type="button" class="editor-media-item" draggable="true" data-media-index="${idx}" title="Click to insert in notes, or drag into the editor">
        <span class="material-symbols-outlined">${icon}</span>
        <span class="editor-media-item-text">
          <strong>${escapeHtml(title)}</strong>
          <em>${escapeHtml(media.type || 'media')}</em>
          ${section}
        </span>
      </button>
    `;
    })
    .join('');

  mediaList.querySelectorAll('.editor-media-item').forEach((item) => {
    if (!(item instanceof HTMLElement)) return;
    item.addEventListener('click', () => {
      const idx = Number(item.dataset.mediaIndex);
      const media = editorState.editorMediaItems[idx];
      if (media) {
        insertMediaTile(media);
      }
    });

    item.addEventListener('dragstart', (e: DragEvent) => {
      const idx = Number(item.dataset.mediaIndex);
      const media = editorState.editorMediaItems[idx];
      if (!media || !e.dataTransfer) return;

      const payload = JSON.stringify(media);
      e.dataTransfer.setData('application/x-bst-media', payload);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });
}

export async function insertImage(): Promise<void> {
  const { editor } = editorState;
  if (!editor) return;
  const imageUrlEl = document.getElementById('image-url');
  const imageAltEl = document.getElementById('image-alt');
  const fileInputEl = document.getElementById('image-upload');

  let imageUrl = imageUrlEl instanceof HTMLInputElement ? imageUrlEl.value.trim() : '';
  const imageAlt = imageAltEl instanceof HTMLInputElement ? imageAltEl.value.trim() : '';
  const file = fileInputEl instanceof HTMLInputElement ? fileInputEl.files?.[0] : undefined;

  if (!imageUrl && file) {
    const insertBtn = document.getElementById('btn-insert-image');
    const originalHtml = insertBtn ? insertBtn.innerHTML : '';
    if (insertBtn instanceof HTMLButtonElement) {
      insertBtn.disabled = true;
      insertBtn.textContent = 'Uploading to Google Drive...';
    }
    try {
      const notebookName =
        getCurrentClassForDisplayRouting()?.title ||
        document.getElementById('document-title')?.textContent?.trim() ||
        'Bible Study Images';
      if (!window.BSTApi) {
        throw new Error('API client unavailable');
      }
      const result = await window.BSTApi.uploadImageToDrive(notebookName, file);
      if (typeof result.url === 'string') {
        imageUrl = result.url;
      }
    } catch (err: unknown) {
      console.error('Drive upload failed:', err);
      alert(`Image upload failed: ${getErrorMessage(err)}`);
      return;
    } finally {
      if (insertBtn instanceof HTMLButtonElement) {
        insertBtn.innerHTML = originalHtml;
        insertBtn.disabled = false;
      }
    }
  }

  if (!imageUrl) {
    alert('Please enter an image URL or upload an image');
    return;
  }

  // Convert Google Drive share links to thumbnail/direct image links
  const gdriveRegex =
    /(?:https?:\/\/)?(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/i;
  const match = imageUrl.match(gdriveRegex);
  if (match && match[1]) {
    imageUrl = `https://lh3.googleusercontent.com/d/${match[1]}`;
  }

  editor
    .chain()
    .focus()
    .setImage({ src: imageUrl, alt: imageAlt || 'Bible Study Image' })
    .run();

  closeModal('image-modal');
  if (imageUrlEl instanceof HTMLInputElement) imageUrlEl.value = '';
  if (imageAltEl instanceof HTMLInputElement) imageAltEl.value = '';
  if (fileInputEl instanceof HTMLInputElement) fileInputEl.value = '';
}
