// Load class configuration from JSON
let classConfig = null;
let classId = new URLSearchParams(window.location.search).get('class') || '1';

async function loadClassConfig() {
  try {
    const response = await fetch('assets/data/classes.json');
    const raw = await response.json();

    // Normalize to an array of classes to support shapes:
    // - { classes: [...] }
    // - [ ... ]
    // - { ...singleClass }
    const classesArr = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.classes)
        ? raw.classes
        : [raw];

    classConfig = classesArr.find(c => c.classNumber?.toString() === classId) || classesArr[0] || {};

    if (!classConfig || !classConfig.classNumber) {
      console.error(`Class ${classId} not found in configuration`);
    }

    // Set up the global config for backward compatibility
    const primaryMedia = classConfig.media?.find(m => m.primary && m.type === 'video');
    window.BIBLE_STUDY_CONFIG = {
      videoId: primaryMedia?.sources?.[0]?.videoId || '',
      channelName: classConfig.channelName || `class${classId}-control`,
      pausePoints: primaryMedia?.pausePoints || []
    };

    initializePageFromConfig();
  } catch (err) {
    console.error('Failed to load class configuration:', err);
  }
}

function initializePageFromConfig() {
  if (!classConfig) return;

  // Update page title
  document.title = `${classConfig.title} — Class ${classConfig.classNumber}`;

  // Update header
  const titleGroup = document.querySelector('.title-group');
  if (titleGroup) {
    const h1 = titleGroup.querySelector('h1');
    const subtitle = titleGroup.querySelector('.subtitle');
    if (h1) h1.textContent = classConfig.title;
    if (subtitle) {
      subtitle.textContent = `Class ${classConfig.classNumber} · ${classConfig.subtitle} · ${classConfig.instructor}`;
    }
  }

  // Update navigation
  const nav = document.querySelector('nav');
  if (nav && classConfig.navigation) {
    nav.innerHTML = classConfig.navigation
      .map(item => `<a class="pill ${item.number.toString() === classId ? 'active' : ''}" href="${item.href}">${item.title}</a>`)
      .join('');
  }

  // Render media gallery
  renderMediaGallery();

  // Render outline sections
  renderOutline();
}

function renderMediaGallery() {
  if (!classConfig.media || classConfig.media.length === 0) return;

  const videoCard = document.getElementById('video-card');
  if (!videoCard) return;

  // Clear existing content but keep the structure for dynamic rendering
  const playerShell = videoCard.querySelector('.player-shell');
  const controls = videoCard.querySelector('.controls');

  if (!playerShell || !controls) return;

  // Find primary video
  const primaryVideo = classConfig.media.find(m => m.primary && m.type === 'video');
  if (primaryVideo) {
    // Video player will be initialized by student.js using YouTube API
    // Just ensure the player div exists
    if (!playerShell.querySelector('#player')) {
      const playerDiv = document.createElement('div');
      playerDiv.id = 'player';
      playerShell.innerHTML = '';
      playerShell.appendChild(playerDiv);
    }
  }

  // Add media gallery below pause list if there are additional media
  const additionalMedia = classConfig.media.filter(m => !m.primary);
  if (additionalMedia.length > 0) {
    let galleryContainer = videoCard.querySelector('#media-gallery');
    if (!galleryContainer) {
      galleryContainer = document.createElement('div');
      galleryContainer.id = 'media-gallery';
      galleryContainer.className = 'media-gallery';
      videoCard.appendChild(galleryContainer);
    }

    galleryContainer.innerHTML = `
      <h4 style="margin: 16px 0 10px; font-size: 16px; font-weight: 600;">Additional materials</h4>
      <div style="display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));">
        ${additionalMedia.map(media => renderMediaThumbnail(media)).join('')}
      </div>
    `;
  }
}

function renderMediaThumbnail(media) {
  const icon = getMediaIcon(media.type);
  const label = media.title || media.type;

  return `
    <div class="media-item" style="
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 12px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
    " data-media-id="${media.id}">
      <div style="font-size: 28px; margin-bottom: 8px;">${icon}</div>
      <small style="color: var(--muted); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${label}</small>
    </div>
  `;
}

function getMediaIcon(type) {
  const icons = {
    video: '▶️',
    pdf: '📄',
    images: '🖼️',
    audio: '🔊',
    document: '📋',
    link: '🔗',
    presentation: '📊'
  };
  return icons[type] || '📁';
}

function renderOutline() {
  if (!classConfig.outline) return;

  const outlineContainer = document.getElementById('session-outline');
  if (!outlineContainer) return;

  outlineContainer.innerHTML = classConfig.outline
    .map((section, idx) => {
      const isOpen = section.defaultOpen ? ' open' : '';
      const pointsHtml = section.points
        .map(point => `<li>${point}</li>`)
        .join('');

      return `
        <details class="accordion"${isOpen}>
          <summary>${section.summary}</summary>
          <ul>
            ${pointsHtml}
          </ul>
        </details>
      `;
    })
    .join('');
}

// Load config when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadClassConfig);
} else {
  loadClassConfig();
}
