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

    // Extract videoId from URL or use videoId directly
    let videoId = '';
    if (primaryMedia?.sources?.[0]) {
      const source = primaryMedia.sources[0];
      if (source.videoId) {
        videoId = source.videoId;
      } else if (source.url) {
        // Extract ID from YouTube URL (supports youtu.be and youtube.com formats)
        const match = source.url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([^&\?\/]+)/);
        videoId = match ? match[1] : '';
      }
    }

    window.BIBLE_STUDY_CONFIG = {
      videoId: videoId,
      channelName: classConfig.channelName || `class${classId}-control`,
      pausePoints: primaryMedia?.pausePoints || []
    };

    window.BIBLE_STUDY_CONFIG_READY = true;
    window.dispatchEvent(new CustomEvent('bibleStudyConfigReady'));

    window.BIBLE_STUDY_CONFIG_READY = true;
    window.dispatchEvent(new CustomEvent('bibleStudyConfigReady'));

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

  // Find primary media
  const primaryMedia = classConfig.media.find(m => m.primary);

  if (primaryMedia) {
    playerShell.innerHTML = '';

    if (primaryMedia.type === 'video') {
      // Only render video player if there's a valid URL
      const source = primaryMedia.sources?.[0];
      if (source?.url && source.url.trim() !== '') {
        // Video player will be initialized by student.js using YouTube API
        const playerDiv = document.createElement('div');
        playerDiv.id = 'player';
        playerShell.appendChild(playerDiv);
      } else {
        // Show placeholder for missing video
        playerShell.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted); text-align: center; padding: 20px;">
            <div>
              <div style="font-size: 48px; margin-bottom: 10px;">📹</div>
              <p>No video has been added yet</p>
            </div>
          </div>
        `;
      }
    } else if (primaryMedia.type === 'image' || primaryMedia.type === 'images') {
      // Render image - support both url property and sources array
      const imageUrl = primaryMedia.url || primaryMedia.sources?.[0]?.url;
      if (imageUrl) {
        playerShell.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; height: 100%; padding: 20px; overflow: auto;">
            <img src="${imageUrl}" alt="${primaryMedia.title || ''}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 10px;" />
          </div>
        `;
      }
    } else if (primaryMedia.type === 'pdf' || primaryMedia.type === 'document') {
      // Render PDF/Document viewer
      const source = primaryMedia.sources?.[0];
      if (source?.url) {
        playerShell.innerHTML = `
          <iframe src="${source.url}" style="width: 100%; height: 100%; border: none; border-radius: 10px;"></iframe>
        `;
      }
    } else if (primaryMedia.type === 'audio') {
      // Render audio player
      const source = primaryMedia.sources?.[0];
      if (source?.url) {
        playerShell.innerHTML = `
          <audio controls style="width: 100%;" src="${source.url}"></audio>
        `;
      }
    } else if (primaryMedia.type === 'link') {
      // Render link preview
      const source = primaryMedia.sources?.[0];
      if (source?.url) {
        playerShell.innerHTML = `
          <div style="padding: 20px; text-align: center;">
            <h3>${primaryMedia.title || 'External Resource'}</h3>
            <p style="color: var(--muted); margin: 10px 0;">${source.description || ''}</p>
            <a href="${source.url}" target="_blank" rel="noopener" class="btn-primary" style="display: inline-block; padding: 10px 20px; margin-top: 10px;">Open Link</a>
          </div>
        `;
      }
    }
  }

  // Collect all section media from outline
  let allSectionMedia = [];
  if (classConfig.outline) {
    classConfig.outline.forEach(section => {
      if (section.media && section.media.length > 0) {
        section.media.forEach(media => {
          allSectionMedia.push({
            ...media,
            sectionTitle: section.summary
          });
        });
      }
    });
  }

  // Media gallery removed - all media controlled from teacher view
}

function renderMediaThumbnail(media, index) {
  const icon = getMediaIcon(media.type);
  const label = media.title || media.type;
  const sectionLabel = media.sectionTitle ? `<small style="color: var(--muted); font-size: 10px; display: block; margin-top: 4px;">${media.sectionTitle}</small>` : '';

  return `
    <div class="media-item" style="
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 12px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
    " data-media-index="${index}" data-media-id="${media.id || ''}">
      <div style="font-size: 28px; margin-bottom: 8px;">${icon}</div>
      <small style="color: var(--text); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">${label}</small>
      ${sectionLabel}
    </div>
  `;
}

function openMediaInViewer(media) {
  const playerShell = document.querySelector('.player-shell');
  if (!playerShell) return;

  const url = media.url || media.sources?.[0]?.url || '';

  if (media.type === 'video') {
    // Extract YouTube ID
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([^&\?\/]+)/);
    const videoId = match ? match[1] : '';
    if (videoId) {
      // Replace the player shell with a fresh player div
      playerShell.innerHTML = '<div id="player"></div>';

      // Reinitialize the YouTube player with the new video so controls work
      if (window.YT && window.YT.Player) {
        if (window.player) {
          try {
            window.player.destroy();
          } catch (e) {
            console.warn('[Loader] Error destroying player:', e);
          }
        }

        const newPlayer = new YT.Player('player', {
          height: '100%',
          width: '100%',
          videoId: videoId,
          playerVars: {
            rel: 0,
            modestbranding: 1,
            color: 'white',
            playsinline: 1
          },
          events: {
            onReady: function (event) {
              // Update all player references
              window.player = event.target;
              if (window.updatePlayerReference) {
                window.updatePlayerReference(event.target);
              }
              if (window.onPlayerReady) {
                window.onPlayerReady(event);
              }
              console.log('[Loader] Player ready and references updated');
            },
            onStateChange: window.onPlayerStateChange
          }
        });

        // Update the global VIDEO_ID so pause points work if this video has them
        window.VIDEO_ID = videoId;
        console.log('[Loader] Initialized new YouTube player with video:', videoId);
      }
    }
  } else if (media.type === 'image' || media.type === 'images') {
    playerShell.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; padding: 20px; overflow: auto;">
        <img src="${url}" alt="${media.title || ''}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 10px;" />
      </div>
    `;
  } else if (media.type === 'pdf' || media.type === 'document') {
    playerShell.innerHTML = `
      <iframe src="${url}" style="width: 100%; height: 100%; border: none; border-radius: 10px;"></iframe>
    `;
  } else if (media.type === 'link') {
    playerShell.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px; text-align: center; gap: 20px;">
        <div style="font-size: 48px;">🔗</div>
        <h3 style="margin: 0; color: var(--text);">${media.title || 'External Link'}</h3>
        <p style="color: var(--muted); margin: 0; max-width: 500px; word-break: break-all;">${url}</p>
        <a href="${url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: var(--accent); color: #000; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 10px;">Open Link</a>
      </div>
    `;
  }
}

function getMediaIcon(type) {
  const icons = {
    video: '▶️',
    pdf: '📄',
    images: '🖼️',
    image: '🖼️',
    audio: '🔊',
    document: '📋',
    link: '🔗',
    presentation: '📊',
    verse: '📖'
  };
  return icons[type] || '📁';
}

function returnToDefaultView() {
  const primaryMedia = classConfig?.media?.find(m => m.primary);
  if (primaryMedia) {
    openMediaInViewer(primaryMedia);
  }
}

// Make returnToDefaultView globally accessible
window.returnToDefaultView = returnToDefaultView;

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
