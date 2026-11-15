"use strict";
// Load class configuration from JSON
(function () {
    let classConfig = null;
    const classId = new URLSearchParams(window.location.search).get('class') || '1';
    function sanitizeMediaUrl(url) {
        if (typeof url !== 'string')
            return '';
        const trimmed = url.trim();
        if (!trimmed)
            return '';
        try {
            const parsed = new URL(trimmed, window.location.origin);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return parsed.href;
            }
        }
        catch {
            // Ignore parse failures and fall back to local-path handling.
        }
        return trimmed.startsWith('/') || trimmed.startsWith('assets/') || trimmed.startsWith('./') || trimmed.startsWith('../')
            ? trimmed
            : '';
    }
    function extractYoutubeVideoInfo(value) {
        const input = String(value || '').trim();
        if (!input)
            return { id: '', start: 0 };
        const directIdMatch = input.match(/^[A-Za-z0-9_-]{11}$/);
        const id = directIdMatch
            ? directIdMatch[0]
            : (input.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/))([^&?/]+)/)?.[1] || '');
        let start = 0;
        const timeMatch = input.match(/[?&](?:t|start)=([^&\s]+)/);
        if (timeMatch && timeMatch[1]) {
            const timeStr = timeMatch[1];
            if (/^\d+$/.test(timeStr)) {
                start = parseInt(timeStr, 10);
            }
            else {
                const h = timeStr.match(/(\d+)h/i);
                const m = timeStr.match(/(\d+)m/i);
                const s = timeStr.match(/(\d+)s/i);
                start =
                    (h ? parseInt(h[1], 10) * 3600 : 0) +
                        (m ? parseInt(m[1], 10) * 60 : 0) +
                        (s ? parseInt(s[1], 10) : 0);
            }
        }
        return { id, start };
    }
    function extractYoutubeVideoId(value) {
        return extractYoutubeVideoInfo(value).id;
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
    function createPlaceholderPanel(iconName, message) {
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
        }
        else {
            link.className = 'btn-primary';
            link.style.display = 'inline-block';
            link.style.padding = '10px 20px';
            link.style.marginTop = '10px';
        }
        wrapper.appendChild(link);
        return wrapper;
    }
    function openMediaInViewer(media) {
        const playerShell = document.querySelector('.player-shell');
        if (!playerShell)
            return;
        const rawUrl = media.url || media.sources?.[0]?.url || media.sources?.[0]?.path || '';
        const url = sanitizeMediaUrl(rawUrl);
        if (media.type === 'video') {
            const videoId = extractYoutubeVideoId(rawUrl);
            if (videoId) {
                playerShell.replaceChildren();
                const playerDiv = document.createElement('div');
                playerDiv.id = 'player';
                playerShell.appendChild(playerDiv);
                if (window.YT && window.YT.Player) {
                    if (window.player) {
                        try {
                            window.player.destroy();
                        }
                        catch (e) {
                            console.warn('[Loader] Error destroying player:', e);
                        }
                    }
                    const videoInfo = extractYoutubeVideoInfo(rawUrl);
                    new YT.Player('player', {
                        height: '100%',
                        width: '100%',
                        videoId,
                        playerVars: {
                            rel: 0,
                            modestbranding: 1,
                            color: 'white',
                            playsinline: 1,
                            controls: 1,
                            fs: 1,
                            start: videoInfo.start || 0
                        },
                        events: {
                            onReady(event) {
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
                    window.VIDEO_ID = videoId;
                    console.log('[Loader] Initialized new YouTube player with video:', videoId, 'start:', videoInfo.start || 0);
                }
            }
        }
        else if (media.type === 'image' || media.type === 'images') {
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
        }
        else if (media.type === 'pdf' || media.type === 'document') {
            playerShell.replaceChildren();
            const frame = document.createElement('iframe');
            frame.src = url;
            frame.style.width = '100%';
            frame.style.height = '100%';
            frame.style.border = 'none';
            frame.style.borderRadius = '10px';
            playerShell.appendChild(frame);
        }
        else if (media.type === 'link') {
            playerShell.replaceChildren();
            playerShell.appendChild(createLinkPreview(media.title || 'External Link', url, url, true));
        }
    }
    function renderMediaGallery() {
        if (!classConfig?.media || classConfig.media.length === 0)
            return;
        const videoCard = document.getElementById('video-card');
        if (!videoCard)
            return;
        const playerShell = videoCard.querySelector('.player-shell');
        const controls = videoCard.querySelector('.controls');
        if (!playerShell || !controls)
            return;
        const primaryMedia = classConfig.media.find((m) => m.primary);
        if (primaryMedia) {
            playerShell.replaceChildren();
            if (primaryMedia.type === 'video') {
                const source = primaryMedia.sources?.[0];
                if (source?.url && source.url.trim() !== '') {
                    const playerDiv = document.createElement('div');
                    playerDiv.id = 'player';
                    playerShell.appendChild(playerDiv);
                }
                else {
                    playerShell.appendChild(createPlaceholderPanel('videocam_off', 'No video has been added yet'));
                }
            }
            else if (primaryMedia.type === 'image' || primaryMedia.type === 'images') {
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
            }
            else if (primaryMedia.type === 'pdf' || primaryMedia.type === 'document') {
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
            }
            else if (primaryMedia.type === 'audio') {
                const source = primaryMedia.sources?.[0];
                const audioUrl = sanitizeMediaUrl(source?.url);
                if (audioUrl) {
                    const audio = document.createElement('audio');
                    audio.controls = true;
                    audio.style.width = '100%';
                    audio.src = audioUrl;
                    playerShell.appendChild(audio);
                }
            }
            else if (primaryMedia.type === 'link') {
                const source = primaryMedia.sources?.[0];
                const linkUrl = sanitizeMediaUrl(source?.url);
                if (linkUrl) {
                    playerShell.appendChild(createLinkPreview(primaryMedia.title || 'External Resource', source?.description || '', linkUrl));
                }
            }
        }
    }
    function renderOutline() {
        if (!classConfig?.outline)
            return;
        const outlineContainer = document.getElementById('session-outline');
        if (!outlineContainer)
            return;
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
    function initializePageFromConfig() {
        if (!classConfig)
            return;
        document.title = `${classConfig.title || ''}`;
        const titleGroup = document.querySelector('.title-group');
        if (titleGroup) {
            const h1 = titleGroup.querySelector('h1');
            const subtitle = titleGroup.querySelector('.subtitle');
            if (h1)
                h1.textContent = classConfig.title || '';
            if (subtitle) {
                subtitle.textContent = `${classConfig.subtitle || ''} · ${classConfig.instructor || ''}`;
            }
        }
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
        renderMediaGallery();
        renderOutline();
    }
    async function loadClassConfig() {
        try {
            if (!window.BSTApi) {
                throw new Error('BSTApi is not loaded');
            }
            const raw = await window.BSTApi.getClasses();
            const classesArr = Array.isArray(raw)
                ? raw
                : raw && typeof raw === 'object' && 'classes' in raw && Array.isArray(raw.classes)
                    ? raw.classes
                    : [raw];
            classConfig =
                classesArr.find((c) => c.classNumber?.toString() === classId || c.id === classId) ||
                    classesArr[0] ||
                    {};
            if (!classConfig || !classConfig.classNumber) {
                console.error(`Class ${classId} not found in configuration`);
            }
            const primaryMedia = classConfig.media?.find((m) => m.primary && m.type === 'video');
            let videoId = '';
            if (primaryMedia?.sources?.[0]) {
                const source = primaryMedia.sources[0];
                if (source.videoId) {
                    videoId = source.videoId;
                }
                else if (source.url) {
                    const match = source.url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([^&?/]+)/);
                    videoId = match ? match[1] : '';
                }
            }
            window.BIBLE_STUDY_CONFIG = {
                videoId,
                channelName: classConfig.channelName || `class${classId}-control`,
                bibleTranslation: 'nkjv',
                pausePoints: primaryMedia?.pausePoints || []
            };
            window.BIBLE_STUDY_CONFIG_READY = true;
            window.dispatchEvent(new CustomEvent('bibleStudyConfigReady'));
            initializePageFromConfig();
        }
        catch (err) {
            console.error('Failed to load class configuration:', err);
        }
    }
    function returnToDefaultView() {
        const primaryMedia = classConfig?.media?.find((m) => m.primary);
        if (primaryMedia) {
            openMediaInViewer(primaryMedia);
        }
    }
    window.returnToDefaultView = returnToDefaultView;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            void loadClassConfig();
        });
    }
    else {
        void loadClassConfig();
    }
})();
