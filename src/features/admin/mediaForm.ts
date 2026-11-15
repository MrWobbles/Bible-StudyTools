import { getEl, getInput, getSelect, getTextArea } from './state';
import type { AdminMediaItem } from './types';

export function updateMediaForm(): void {
  const type = getSelect('media-type')?.value ?? '';
  const fieldsContainer = getEl('media-fields');
  if (!fieldsContainer) return;
  fieldsContainer.innerHTML = '';

  if (type === 'video') {
    fieldsContainer.innerHTML = `
      <div class="form-group">
        <label for="media-youtube-id">YouTube Video ID</label>
        <input type="text" id="media-youtube-id" placeholder="dQw4w9WgXcQ" />
        <button type="button" class="btn-secondary" onclick="downloadYouTubeVideo()" style="margin-top: 8px; width: 100%;">Download YouTube Video to Local</button>
        <small>Enter a YouTube video ID to stream online or download for offline use</small>
      </div>

      <div class="form-group" style="margin-top: 20px;">
        <label style="font-weight: 600; margin-bottom: 10px;">Local Video Source</label>
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-video-mode" value="link" checked onchange="toggleMediaInputMode('video')" />
            <span>Link to Video</span>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-video-mode" value="upload" onchange="toggleMediaInputMode('video')" />
            <span>Upload Video</span>
          </label>
        </div>

        <div id="media-video-link-group">
          <input type="text" id="media-local-video" placeholder="assets/video/example.mp4" />
          <button type="button" class="btn-secondary" onclick="downloadMediaToLocal('video')" style="margin-top: 8px; width: 100%;">Download URL to Local</button>
          <small>Paste a video URL to download and store locally</small>
        </div>

        <div id="media-video-upload-group" style="display: none;">
          <input type="file" id="media-video-file" accept="video/*" onchange="handleMediaUpload('video', this.files[0])" />
          <small>Supported formats: MP4, WebM, MOV</small>
        </div>
      </div>

      <div class="form-group">
        <label for="media-duration">Duration (seconds)</label>
        <input type="number" id="media-duration" placeholder="e.g., 3600" />
        <small>Total video length in seconds</small>
      </div>

      <div class="form-group">
        <label for="media-pause-points">Pause Points (comma-separated timestamps)</label>
        <input type="text" id="media-pause-points" placeholder="30, 120, 450" />
        <small>Times in seconds where the video should pause for discussion</small>
      </div>
    `;
  } else if (type === 'pdf') {
    fieldsContainer.innerHTML = `
      <div class="form-group">
        <label style="font-weight: 600; margin-bottom: 10px;">PDF Source</label>
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-pdf-mode" value="link" checked onchange="toggleMediaInputMode('pdf')" />
            <span>Link to PDF</span>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-pdf-mode" value="upload" onchange="toggleMediaInputMode('pdf')" />
            <span>Upload PDF</span>
          </label>
        </div>

        <div id="media-pdf-link-group">
          <input type="text" id="media-pdf-url" placeholder="assets/documents/example.pdf" />
          <button type="button" class="btn-secondary" onclick="downloadMediaToLocal('pdf')" style="margin-top: 8px; width: 100%;">Download to Local</button>
          <small>Paste a PDF URL to download and store locally</small>
        </div>

        <div id="media-pdf-upload-group" style="display: none;">
          <input type="file" id="media-pdf-file" accept=".pdf" onchange="handleMediaUpload('pdf', this.files[0])" />
          <small>Upload a PDF document</small>
        </div>
      </div>
    `;
  } else if (type === 'images') {
    fieldsContainer.innerHTML = `
      <div class="form-group">
        <label style="font-weight: 600; margin-bottom: 10px;">Image Source</label>
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-images-mode" value="link" checked onchange="toggleMediaInputMode('images')" />
            <span>Link to Images</span>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-images-mode" value="upload" onchange="toggleMediaInputMode('images')" />
            <span>Upload Images</span>
          </label>
        </div>

        <div id="media-images-link-group">
          <textarea id="media-image-urls" rows="5" placeholder="assets/images/img1.jpg&#10;assets/images/img2.jpg&#10;assets/images/img3.jpg"></textarea>
          <button type="button" class="btn-secondary" onclick="downloadMediaToLocal('images')" style="margin-top: 8px; width: 100%;">Download All to Local</button>
          <small>Enter one image URL per line</small>
        </div>

        <div id="media-images-upload-group" style="display: none;">
          <input type="file" id="media-images-files" accept="image/*" multiple onchange="handleMediaUpload('images', this.files)" />
          <small>Select multiple image files (JPG, PNG, GIF, etc.)</small>
        </div>
      </div>
    `;
  } else if (type === 'audio') {
    fieldsContainer.innerHTML = `
      <div class="form-group">
        <label style="font-weight: 600; margin-bottom: 10px;">Audio Source</label>
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-audio-mode" value="link" checked onchange="toggleMediaInputMode('audio')" />
            <span>Link to Audio</span>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-audio-mode" value="upload" onchange="toggleMediaInputMode('audio')" />
            <span>Upload Audio</span>
          </label>
        </div>

        <div id="media-audio-link-group">
          <input type="text" id="media-audio-url" placeholder="assets/audio/podcast.mp3" />
          <button type="button" class="btn-secondary" onclick="downloadMediaToLocal('audio')" style="margin-top: 8px; width: 100%;">Download to Local</button>
          <small>Paste an audio URL to download and store locally</small>
        </div>

        <div id="media-audio-upload-group" style="display: none;">
          <input type="file" id="media-audio-file" accept="audio/*" onchange="handleMediaUpload('audio', this.files[0])" />
          <small>Supported formats: MP3, WAV, OGG, etc.</small>
        </div>
      </div>
    `;
  } else if (type === 'document') {
    fieldsContainer.innerHTML = `
      <div class="form-group">
        <label style="font-weight: 600; margin-bottom: 10px;">Document Source</label>
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-doc-mode" value="link" checked onchange="toggleMediaInputMode('document')" />
            <span>Link to Document</span>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-doc-mode" value="upload" onchange="toggleMediaInputMode('document')" />
            <span>Upload Document</span>
          </label>
        </div>

        <div id="media-doc-link-group">
          <input type="text" id="media-doc-url" placeholder="assets/documents/notes.docx" />
          <button type="button" class="btn-secondary" onclick="downloadMediaToLocal('document')" style="margin-top: 8px; width: 100%;">Download to Local</button>
          <small>Paste a document URL to download and store locally</small>
        </div>

        <div id="media-doc-upload-group" style="display: none;">
          <input type="file" id="media-doc-file" accept=".doc,.docx,.txt,.rtf" onchange="handleMediaUpload('document', this.files[0])" />
          <small>Supported formats: DOC, DOCX, TXT, RTF</small>
        </div>
      </div>
    `;
  } else if (type === 'link') {
    fieldsContainer.innerHTML = `
      <div class="form-group">
        <label for="media-link-url">External Link URL</label>
        <input type="text" id="media-link-url" placeholder="https://example.com" />
        <small>Link to an external website or resource</small>
      </div>
    `;
  }
}

export function populateMediaForm(media: AdminMediaItem): void {
  const type = getSelect('media-type')?.value ?? '';
  const sources = media.sources;

  if (type === 'video' && sources) {
    const youtubeSource = sources.find((s) => s.type === 'youtube' || s.format === 'youtube');
    const localSource = sources.find((s) => s.type === 'local');

    if (youtubeSource) {
      const ytInput = getInput('media-youtube-id');
      if (ytInput) ytInput.value = youtubeSource.url || youtubeSource.videoId || '';
    }
    if (localSource) {
      const localInput = getInput('media-local-video');
      if (localInput) localInput.value = localSource.url || '';
    }

    if (media.duration !== undefined) {
      const durationInput = getInput('media-duration');
      if (durationInput) durationInput.value = String(media.duration);
    }

    if (media.pausePoints && media.pausePoints.length > 0) {
      const points = media.pausePoints
        .map((p) => (typeof p === 'object' ? p.time : p))
        .join(', ');
      const pauseInput = getInput('media-pause-points');
      if (pauseInput) pauseInput.value = points;
    }
  } else if (type === 'pdf' && sources) {
    const source = sources[0];
    const pdfInput = getInput('media-pdf-url');
    if (source && pdfInput) {
      pdfInput.value = source.url || '';
    }
  } else if (type === 'images' && sources) {
    const urls = sources.map((s) => s.url || '').join('\n');
    const imageUrlsInput = getTextArea('media-image-urls');
    if (imageUrlsInput) imageUrlsInput.value = urls;
  } else if (type === 'audio' && sources) {
    const source = sources[0];
    const audioInput = getInput('media-audio-url');
    if (source && audioInput) {
      audioInput.value = source.url || '';
    }
  } else if (type === 'document' && sources) {
    const source = sources[0];
    const docInput = getInput('media-doc-url');
    if (source && docInput) {
      docInput.value = source.url || '';
    }
  } else if (type === 'link' && sources) {
    const source = sources[0];
    const linkInput = getInput('media-link-url');
    if (source && linkInput) {
      linkInput.value = source.url || '';
    }
  }
}
