import { editorState, markEditorInteraction } from '../state';
import { matchesClassId } from '../types';
import type { EditorDocument } from '../types';

export function getCurrentClassForDisplayRouting(): EditorDocument | null {
  const { currentClassId, allClasses } = editorState;
  if (!currentClassId || !Array.isArray(allClasses) || allClasses.length === 0) {
    return null;
  }

  return allClasses.find((c) => matchesClassId(c, currentClassId)) || null;
}

function getDisplayChannelName(): string {
  const cls = getCurrentClassForDisplayRouting();
  if (cls?.channelName) {
    return cls.channelName;
  }
  return `class${editorState.currentClassId || '1'}-control`;
}

function getDisplayStorageFallbackKey(): string {
  return `${getDisplayChannelName()}-storage`;
}

function normalizeEditorLinkUrl(rawUrl: string): string {
  if (typeof rawUrl !== 'string') {
    return '';
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // Ignore parse failures and fall back to local paths.
  }

  return trimmed.startsWith('/') ||
    trimmed.startsWith('assets/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../')
    ? trimmed
    : '';
}

function getOrCreateDisplayChannel(): BroadcastChannel | null {
  const channelName = getDisplayChannelName();

  if (editorState.displayControlChannel && editorState.displayControlChannelName === channelName) {
    return editorState.displayControlChannel;
  }

  editorState.displayControlChannelName = channelName;

  if (window.bst?.createBroadcastChannel) {
    editorState.displayControlChannel = window.bst.createBroadcastChannel(channelName);
    return editorState.displayControlChannel;
  }

  if ('BroadcastChannel' in window) {
    editorState.displayControlChannel = new BroadcastChannel(channelName);
    return editorState.displayControlChannel;
  }

  editorState.displayControlChannel = null;
  return null;
}

export async function sendEditorLinkToDisplay(
  rawUrl: string,
  title: string,
  isExplicitImage = false
): Promise<boolean> {
  const linkUrl = normalizeEditorLinkUrl(rawUrl);
  if (!linkUrl) {
    return false;
  }

  if (!editorState.isNoteMode && editorState.currentClassId) {
    window.open(
      `student.html?class=${editorState.currentClassId}`,
      'display-screen',
      'width=1280,height=720'
    );
  }

  let mediaType = isExplicitImage ? 'image' : 'link';
  const lowerUrl = linkUrl.toLowerCase();

  if (!isExplicitImage) {
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
      mediaType = 'video';
    } else if (lowerUrl.match(/\.(mp4|webm|ogg)$/)) {
      mediaType = 'video';
    } else if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
      mediaType = 'image';
    } else if (lowerUrl.match(/\.(mp3|wav|m4a)$/)) {
      mediaType = 'audio';
    } else if (lowerUrl.match(/\.(pdf)$/)) {
      mediaType = 'pdf';
    } else if (lowerUrl.includes('lh3.googleusercontent.com/d/')) {
      mediaType = 'image';
    }
  }

  const message = {
    type: 'displayMedia',
    media: {
      type: mediaType,
      title: title || 'External Link',
      url: linkUrl,
      sources: [{ url: linkUrl }],
    },
    sentAt: Date.now(),
  };

  const channel = getOrCreateDisplayChannel();
  if (channel) {
    channel.postMessage(message);
  }

  try {
    localStorage.setItem(getDisplayStorageFallbackKey(), JSON.stringify(message));
  } catch (err: unknown) {
    console.warn('Failed to write display link fallback:', err);
  }

  void window.BSTApi?.sendDisplayCommand(getDisplayChannelName(), message);

  return !!channel;
}

export async function handleEditorLinkClick(e: MouseEvent): Promise<void> {
  if (!(e.target instanceof Element)) return;

  const link = e.target.closest('a[href]');
  const img = e.target.closest('img');

  if (!link && !img) {
    return;
  }

  const href = link
    ? String(link.getAttribute('href') || '').trim()
    : img
      ? String(img.getAttribute('src') || '').trim()
      : '';
  if (!href || href === '#' || href.startsWith('#') || href.startsWith('bst-media:')) {
    return;
  }

  e.preventDefault();
  markEditorInteraction();

  const title = link
    ? String(link.textContent || '').trim()
    : img
      ? String(img.getAttribute('alt') || '').trim()
      : '';
  const isExplicitImage = !!img;
  const routed = await sendEditorLinkToDisplay(href, title || href, isExplicitImage);
  if (!routed) {
    const fallbackUrl = normalizeEditorLinkUrl(href);
    if (fallbackUrl) {
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    }
  }
}
