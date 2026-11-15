import { extractYoutubeVideoInfo, getClassConfig, sanitizeMediaUrl } from './data';

function createCenteredWrapper(): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.height = '100%';
  wrapper.style.padding = '20px';
  wrapper.style.overflow = 'auto';
  return wrapper;
}

function createPlaceholderPanel(iconName: string, message: string): HTMLDivElement {
  const wrapper = createCenteredWrapper();
  wrapper.style.color = 'var(--muted)';
  wrapper.style.textAlign = 'center';

  const content = document.createElement('div');
  const iconEl = document.createElement('span');
  iconEl.className = 'material-symbols-outlined';
  iconEl.style.fontSize = '48px';
  iconEl.style.marginBottom = '10px';
  iconEl.style.display = 'inline-block';
  iconEl.textContent = iconName;

  const messageEl = document.createElement('p');
  messageEl.textContent = message;

  content.appendChild(iconEl);
  content.appendChild(messageEl);
  wrapper.appendChild(content);
  return wrapper;
}

function createLinkPreview(
  title: string,
  description: string,
  url: string,
  emphasizeUrl = false,
): HTMLDivElement {
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
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.style.fontSize = '48px';
    icon.textContent = 'link';
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

export function openMediaInViewer(media: MediaItem): void {
  const playerShell = document.querySelector('.player-shell');
  if (!playerShell) return;

  const rawUrl = media.url || media.sources?.[0]?.url || media.sources?.[0]?.path || '';
  const url = sanitizeMediaUrl(rawUrl);

  if (media.type === 'video') {
    const videoInfo = extractYoutubeVideoInfo(rawUrl);
    if (!videoInfo.id) return;
    playerShell.replaceChildren();
    const playerDiv = document.createElement('div');
    playerDiv.id = 'player';
    playerShell.appendChild(playerDiv);

    if (window.YT?.Player) {
      if (window.player) {
        try {
          window.player.destroy();
        } catch (e: unknown) {
          console.warn('[Loader] Error destroying player:', e);
        }
      }

      new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: videoInfo.id,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          color: 'white',
          playsinline: 1,
          controls: 1,
          fs: 1,
          start: videoInfo.start || 0,
        },
        events: {
          onReady(event: YouTubePlayerEvent) {
            window.player = event.target;
            window.updatePlayerReference?.(event.target);
            window.onPlayerReady?.(event);
          },
          onStateChange: window.onPlayerStateChange,
        },
      });
      window.VIDEO_ID = videoInfo.id;
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

export function renderMediaGallery(classConfig: ClassConfig): void {
  if (!classConfig?.media || classConfig.media.length === 0) return;
  const videoCard = document.getElementById('video-card');
  if (!videoCard) return;

  const playerShell = videoCard.querySelector('.player-shell');
  const controls = videoCard.querySelector('.controls');
  if (!playerShell || !controls) return;

  const primaryMedia = classConfig.media.find((m) => m.primary);
  if (!primaryMedia) return;

  playerShell.replaceChildren();

  if (primaryMedia.type === 'video') {
    const source = primaryMedia.sources?.[0];
    if (source?.url && source.url.trim() !== '') {
      const playerDiv = document.createElement('div');
      playerDiv.id = 'player';
      playerShell.appendChild(playerDiv);
    } else {
      playerShell.appendChild(
        createPlaceholderPanel('videocam_off', 'No video has been added yet'),
      );
    }
  } else if (primaryMedia.type === 'image' || primaryMedia.type === 'images') {
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
    const documentUrl = sanitizeMediaUrl(primaryMedia.sources?.[0]?.url);
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
    const audioUrl = sanitizeMediaUrl(primaryMedia.sources?.[0]?.url);
    if (audioUrl) {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.style.width = '100%';
      audio.src = audioUrl;
      playerShell.appendChild(audio);
    }
  } else if (primaryMedia.type === 'link') {
    const source = primaryMedia.sources?.[0];
    const linkUrl = sanitizeMediaUrl(source?.url);
    if (linkUrl) {
      playerShell.appendChild(
        createLinkPreview(
          primaryMedia.title || 'External Resource',
          source?.description || '',
          linkUrl,
        ),
      );
    }
  }
}

export function returnToDefaultView(): void {
  const primaryMedia = getClassConfig()?.media?.find((m) => m.primary);
  if (primaryMedia) {
    openMediaInViewer(primaryMedia);
  }
}
