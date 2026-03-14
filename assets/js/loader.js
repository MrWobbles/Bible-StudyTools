// Load class configuration from JSON
let classConfig = null;
let classId = new URLSearchParams(window.location.search).get('class') || '1';

async function loadClassConfig() {
  try {
    const raw = await window.BSTApi.getClasses();

    // Normalize to an array of classes to support shapes:
    // - { classes: [...] }
    // - [ ... ]
    // - { ...singleClass }
    const classesArr = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.classes)
        ? raw.classes
        : [raw];

    // Find class by either id (GUID) or classNumber for backward compatibility
    classConfig = classesArr.find(c =>
      c.classNumber?.toString() === classId || c.id === classId
    ) || classesArr[0] || {};

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
  document.title = `${classConfig.title}`;

  // Update header
  const titleGroup = document.querySelector('.title-group');
  if (titleGroup) {
    const h1 = titleGroup.querySelector('h1');
    const subtitle = titleGroup.querySelector('.subtitle');
    if (h1) h1.textContent = classConfig.title;
    if (subtitle) {
      subtitle.textContent = `${classConfig.subtitle} · ${classConfig.instructor}`;
    }
  }

  // Update navigation
  const nav = document.querySelector('nav');
  if (nav && classConfig.navigation) {
    nav.replaceChildren();

    classConfig.navigation.forEach((item) => {
      const link = document.createElement('a');
      link.className = 'pill';
      if (item.number?.toString() === classId) {
        link.classList.add('active');
      }
      link.href = sanitizeMediaUrl(item.href) || '#';
      link.textContent = item.title || '';
      nav.appendChild(link);
    });
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
    playerShell.replaceChildren();

    if (primaryMedia.type === 'video') {
      // Only render video player if there's a valid URL
      const source = primaryMedia.sources?.[0];
      if (source?.url && source.url.trim() !== '') {
        // Video player will be initialized by student.js using YouTube API
        const playerDiv = document.createElement('div');
        playerDiv.id = 'player';
        playerShell.appendChild(playerDiv);
      } else {
        playerShell.appendChild(createPlaceholderPanel('📹', 'No video has been added yet'));
      }
    } else if (primaryMedia.type === 'image' || primaryMedia.type === 'images') {
      // Render image - support both url property and sources array
      const imageUrl = sanitizeMediaUrl(primaryMedia.url || primaryMedia.sources?.[0]?.url);
      if (imageUrl) {
        const wrapper = createCenteredWrapper();
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = primaryMedia.title || '';
        image.style.maxWidth = '100%';
        image.style.maxHeight = '100%';
        image.style.objectFit = 'contain';
        image.style.borderRadius = '10px';
        wrapper.appendChild(image);
        playerShell.appendChild(wrapper);
      }
    } else if (primaryMedia.type === 'pdf' || primaryMedia.type === 'document') {
      // Render PDF/Document viewer
      const source = primaryMedia.sources?.[0];
      const documentUrl = sanitizeMediaUrl(source?.url);
      if (documentUrl) {
        const frame = document.createElement('iframe');
        frame.src = documentUrl;
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.style.border = 'none';
        frame.style.borderRadius = '10px';
        playerShell.appendChild(frame);
      }
    } else if (primaryMedia.type === 'audio') {
      // Render audio player
      const source = primaryMedia.sources?.[0];
      const audioUrl = sanitizeMediaUrl(source?.url);
      if (audioUrl) {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.style.width = '100%';
        audio.src = audioUrl;
        playerShell.appendChild(audio);
      }
    } else if (primaryMedia.type === 'link') {
      // Render link preview
      const source = primaryMedia.sources?.[0];
      const linkUrl = sanitizeMediaUrl(source?.url);
      if (linkUrl) {
        playerShell.appendChild(createLinkPreview(primaryMedia.title || 'External Resource', source.description || '', linkUrl));
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
      <span class="material-symbols-outlined" style="font-size: 28px; display: block; margin-bottom: 8px;">${icon}</span>
      <small style="color: var(--text); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">${label}</small>
      ${sectionLabel}
    </div>
  `;
}

function openMediaInViewer(media) {
  const playerShell = document.querySelector('.player-shell');
  if (!playerShell) return;

  const url = sanitizeMediaUrl(media.url || media.sources?.[0]?.url || '');

  if (media.type === 'video') {
    // Extract YouTube ID
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([^&\?\/]+)/);
    const videoId = match ? match[1] : '';
    if (videoId) {
      // Replace the player shell with a fresh player div
      playerShell.replaceChildren();
      const playerDiv = document.createElement('div');
      playerDiv.id = 'player';
      playerShell.appendChild(playerDiv);

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
    playerShell.replaceChildren();
    const wrapper = createCenteredWrapper();
    const image = document.createElement('img');
    image.src = url;
    image.alt = media.title || '';
    image.style.maxWidth = '100%';
    image.style.maxHeight = '100%';
    image.style.objectFit = 'contain';
    image.style.borderRadius = '10px';
    wrapper.appendChild(image);
    playerShell.appendChild(wrapper);
  } else if (media.type === 'pdf' || media.type === 'document') {
    playerShell.replaceChildren();
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.border = 'none';
    frame.style.borderRadius = '10px';
    playerShell.appendChild(frame);
  } else if (media.type === 'link') {
    playerShell.replaceChildren();
    playerShell.appendChild(createLinkPreview(media.title || 'External Link', url, url, true));
  }
}

function sanitizeMediaUrl(url) {
  if (typeof url !== 'string') return '';

  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch (err) {
    // Ignore parse failures and fall back to local-path handling.
  }

  return trimmed.startsWith('/') || trimmed.startsWith('assets/') || trimmed.startsWith('./') || trimmed.startsWith('../')
    ? trimmed
    : '';
}

function createCenteredWrapper() {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.height = '100%';
  wrapper.style.padding = '20px';
  wrapper.style.overflow = 'auto';
  return wrapper;
}

function createPlaceholderPanel(icon, message) {
  const wrapper = createCenteredWrapper();
  wrapper.style.color = 'var(--muted)';
  wrapper.style.textAlign = 'center';

  const content = document.createElement('div');
  const iconEl = document.createElement('div');
  iconEl.style.fontSize = '48px';
  iconEl.style.marginBottom = '10px';
  iconEl.textContent = icon;

  const messageEl = document.createElement('p');
  messageEl.textContent = message;

  content.appendChild(iconEl);
  content.appendChild(messageEl);
  wrapper.appendChild(content);
  return wrapper;
}

function createLinkPreview(title, description, url, emphasizeUrl = false) {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.height = '100%';
  wrapper.style.padding = emphasizeUrl ? '40px' : '20px';
  wrapper.style.textAlign = 'center';
  wrapper.style.gap = emphasizeUrl ? '20px' : '10px';

  if (emphasizeUrl) {
    const icon = document.createElement('div');
    icon.style.fontSize = '48px';
    icon.textContent = '🔗';
    wrapper.appendChild(icon);
  }

  const heading = document.createElement('h3');
  heading.style.margin = '0';
  heading.style.color = 'var(--text)';
  heading.textContent = title;
  wrapper.appendChild(heading);

  const descriptionEl = document.createElement('p');
  descriptionEl.style.color = 'var(--muted)';
  descriptionEl.style.margin = emphasizeUrl ? '0' : '10px 0';
  if (emphasizeUrl) {
    descriptionEl.style.maxWidth = '500px';
    descriptionEl.style.wordBreak = 'break-all';
  }
  descriptionEl.textContent = description;
  wrapper.appendChild(descriptionEl);

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open Link';
  if (emphasizeUrl) {
    link.style.display = 'inline-block';
    link.style.background = 'var(--accent)';
    link.style.color = '#000';
    link.style.padding = '14px 32px';
    link.style.borderRadius = '10px';
    link.style.textDecoration = 'none';
    link.style.fontWeight = '600';
    link.style.marginTop = '10px';
  } else {
    link.className = 'btn-primary';
    link.style.display = 'inline-block';
    link.style.padding = '10px 20px';
    link.style.marginTop = '10px';
  }
  wrapper.appendChild(link);

  return wrapper;
}

function getMediaIcon(type) {
  const icons = {
    video: 'videocam',
    pdf: 'description',
    images: 'image',
    image: 'image',
    audio: 'audio_file',
    document: 'assignment',
    link: 'link',
    presentation: 'bar_chart',
    verse: '📖'
  };
  return icons[type] || 'folder';
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

  outlineContainer.replaceChildren();

  classConfig.outline.forEach((section) => {
    const details = document.createElement('details');
    details.className = 'accordion';
    if (section.defaultOpen) {
      details.open = true;
    }

    const summary = document.createElement('summary');
    summary.textContent = section.summary || '';
    details.appendChild(summary);

    const list = document.createElement('ul');
    (section.points || []).forEach((point) => {
      const item = document.createElement('li');
      item.textContent = typeof point === 'object' ? point.text || '' : point || '';
      list.appendChild(item);
    });

    details.appendChild(list);
    outlineContainer.appendChild(details);
  });
}

// Load config when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadClassConfig);
} else {
  loadClassConfig();
}
