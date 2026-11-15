import { getEl, getErrorMessage, getInput, getTextArea, isRecord } from './state';
import type { AdminWindow, MediaInputType, SaveResultPayload } from './types';

const adminWindow: AdminWindow = window;

export function toggleMediaInputMode(mediaType: MediaInputType): void {
  const checked = document.querySelector(`input[name="media-${mediaType}-mode"]:checked`);
  const mode = checked instanceof HTMLInputElement ? checked.value : undefined;
  const linkGroup = getEl(`media-${mediaType}-link-group`);
  const uploadGroup = getEl(`media-${mediaType}-upload-group`);

  if (mode === 'upload') {
    if (linkGroup) linkGroup.style.display = 'none';
    if (uploadGroup) uploadGroup.style.display = 'block';
  } else {
    if (linkGroup) linkGroup.style.display = 'block';
    if (uploadGroup) uploadGroup.style.display = 'none';
  }
}

function setLinkModeRadio(modeName: string): void {
  const radio = document.querySelector(`input[name="${modeName}"][value="link"]`);
  if (radio instanceof HTMLInputElement) {
    radio.checked = true;
  }
}

export async function handleMediaUpload(
  mediaType: MediaInputType,
  files: FileList | File | null | undefined
): Promise<void> {
  if (!files || (files instanceof FileList && files.length === 0)) {
    return;
  }

  const uploadMedia = adminWindow.bst?.uploadMedia;
  if (!uploadMedia) {
    alert(
      'File upload is only available in the desktop app. Please use the link option or run the desktop version.'
    );
    return;
  }

  try {
    if (files instanceof FileList) {
      const urls: string[] = [];
      for (const file of files) {
        const url = await uploadMedia(mediaType, file.name, await file.arrayBuffer());
        urls.push(url);
      }

      if (mediaType === 'images') {
        const imageUrlsEl = getTextArea('media-image-urls');
        if (imageUrlsEl) imageUrlsEl.value = urls.join('\n');
        setLinkModeRadio('media-images-mode');
        toggleMediaInputMode('images');
      }
    } else {
      const url = await uploadMedia(mediaType, files.name, await files.arrayBuffer());

      const singleInputMap: Partial<Record<MediaInputType, { inputId: string; radioName: string }>> = {
        video: { inputId: 'media-local-video', radioName: 'media-video-mode' },
        pdf: { inputId: 'media-pdf-url', radioName: 'media-pdf-mode' },
        audio: { inputId: 'media-audio-url', radioName: 'media-audio-mode' },
        document: { inputId: 'media-doc-url', radioName: 'media-doc-mode' },
      };

      const target = singleInputMap[mediaType];
      if (target) {
        const el = getInput(target.inputId);
        if (el) el.value = url;
        setLinkModeRadio(target.radioName);
        toggleMediaInputMode(mediaType);
      }
    }

    alert('File(s) uploaded successfully!');
  } catch (err: unknown) {
    console.error('Upload failed:', err);
    alert('Upload failed: ' + getErrorMessage(err));
  }
}

export async function downloadMediaToLocal(mediaType: MediaInputType): Promise<void> {
  const downloadMedia = adminWindow.bst?.downloadMedia;
  if (!downloadMedia) {
    alert('Download feature is only available in the desktop app.');
    return;
  }

  const evtTarget = window.event?.target;
  const button = evtTarget instanceof HTMLButtonElement ? evtTarget : null;
  const originalText = button?.textContent ?? '';

  try {
    let urls: string[] = [];

    if (mediaType === 'video') {
      const url = getInput('media-local-video')?.value.trim() ?? '';
      if (!url) {
        alert('Please enter a video URL first');
        return;
      }
      urls = [url];
    } else if (mediaType === 'pdf') {
      const url = getInput('media-pdf-url')?.value.trim() ?? '';
      if (!url) {
        alert('Please enter a PDF URL first');
        return;
      }
      urls = [url];
    } else if (mediaType === 'images') {
      const urlsText = getTextArea('media-image-urls')?.value.trim() ?? '';
      if (!urlsText) {
        alert('Please enter image URLs first');
        return;
      }
      urls = urlsText
        .split('\n')
        .map((u) => u.trim())
        .filter((u) => u);
    } else if (mediaType === 'audio') {
      const url = getInput('media-audio-url')?.value.trim() ?? '';
      if (!url) {
        alert('Please enter an audio URL first');
        return;
      }
      urls = [url];
    } else if (mediaType === 'document') {
      const url = getInput('media-doc-url')?.value.trim() ?? '';
      if (!url) {
        alert('Please enter a document URL first');
        return;
      }
      urls = [url];
    }

    if (button) {
      button.disabled = true;
      button.style.opacity = '0.7';
    }
    const totalFiles = urls.length;
    let downloaded = 0;

    const newUrls: string[] = [];
    for (const url of urls) {
      if (url.startsWith('assets/')) {
        newUrls.push(url);
        continue;
      }

      downloaded++;
      if (button) {
        button.textContent =
          totalFiles > 1 ? `Downloading ${downloaded}/${totalFiles}...` : 'Downloading...';
      }

      const newUrl = await downloadMedia(mediaType, url);
      newUrls.push(newUrl);
    }

    if (mediaType === 'video') {
      const el = getInput('media-local-video');
      if (el) el.value = newUrls[0] ?? '';
    } else if (mediaType === 'pdf') {
      const el = getInput('media-pdf-url');
      if (el) el.value = newUrls[0] ?? '';
    } else if (mediaType === 'images') {
      const el = getTextArea('media-image-urls');
      if (el) el.value = newUrls.join('\n');
    } else if (mediaType === 'audio') {
      const el = getInput('media-audio-url');
      if (el) el.value = newUrls[0] ?? '';
    } else if (mediaType === 'document') {
      const el = getInput('media-doc-url');
      if (el) el.value = newUrls[0] ?? '';
    }

    if (button) {
      button.textContent = 'Download Complete!';
      button.style.opacity = '1';
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 2000);
    }
  } catch (err: unknown) {
    console.error('Download failed:', err);
    if (button) {
      button.textContent = originalText;
      button.disabled = false;
      button.style.opacity = '1';
    }
    alert('Download failed: ' + getErrorMessage(err));
  }
}

export async function downloadYouTubeVideo(): Promise<void> {
  const youtubeId = getInput('media-youtube-id')?.value.trim() ?? '';

  if (!youtubeId) {
    alert('Please enter a YouTube Video ID first');
    return;
  }

  const evtTarget = window.event?.target;
  const button = evtTarget instanceof HTMLButtonElement ? evtTarget : null;
  const originalText = button?.textContent ?? '';

  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Attempting download...';
      button.style.opacity = '0.7';
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

    try {
      if (!window.BSTApi) {
        throw new Error('BSTApi is not available');
      }
      const response = await window.BSTApi.fetch(
        '/api/download/youtube',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: youtubeUrl }),
        },
        { requireAdmin: true }
      );

      if (response.ok) {
        const rawResult: unknown = await response.json();
        const result: SaveResultPayload = isRecord(rawResult)
          ? (rawResult as SaveResultPayload)
          : {};
        const localVideoEl = getInput('media-local-video');
        if (localVideoEl) localVideoEl.value = result.localPath ?? '';
        if (button) {
          button.textContent = 'Download Complete!';
          button.style.opacity = '1';
          setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
          }, 2000);
        }
        return;
      }

      const rawError: unknown = await response.json();
      const errorObj: SaveResultPayload = isRecord(rawError)
        ? (rawError as SaveResultPayload)
        : {};
      throw new Error(errorObj.error || 'Download failed');
    } catch (apiErr: unknown) {
      console.warn('API download failed:', getErrorMessage(apiErr));

      const instructions = `
YouTube is blocking automated downloads.

You can download the video manually using:
1. Download from YouTube directly using a download service
2. Use a tool like yt-dlp or ffmpeg

Video URL: ${youtubeUrl}

For now, you can:
- Keep the YouTube link as the source
- Or manually download and place in: assets/video/${youtubeId}.mp4

Copy the URL and use an external downloader.
      `;

      alert(instructions);
      if (button) {
        button.textContent = originalText;
        button.disabled = false;
        button.style.opacity = '1';
      }
    }
  } catch (err: unknown) {
    console.error('Download error:', err);
    if (button) {
      button.textContent = originalText;
      button.disabled = false;
      button.style.opacity = '1';
    }
    alert('Download error: ' + getErrorMessage(err));
  }
}
