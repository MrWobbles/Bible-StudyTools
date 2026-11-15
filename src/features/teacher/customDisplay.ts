import { teacherState } from './state';
import { sendCommand, updateControlVisibility } from './sync';

export function sendTextToStudent(title: string, content: string): void {
  if (!content || !content.trim()) return;
  teacherState.currentMediaType = 'text';
  updateControlVisibility();
  sendCommand('displayMedia', {
    media: {
      type: 'text',
      title: (title || 'Key Point').trim(),
      content: content.trim()
    }
  });
}

export function renderTextDrawer(): void {
  let textDrawer = document.getElementById('text-drawer');
  if (!textDrawer) {
    textDrawer = document.createElement('aside');
    textDrawer.id = 'text-drawer';
    textDrawer.className = 'verse-drawer';
    textDrawer.innerHTML = `
      <div class="media-drawer-header">
        <div>
          <div class="tag">Custom Display</div>
          <h3 style="margin: 6px 0 0;">Custom Text</h3>
        </div>
        <button id="text-close-btn" aria-label="Close custom text panel" title="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="media-drawer-body" id="text-panel"></div>
    `;
    document.body.appendChild(textDrawer);
  }

  const textPanel = document.getElementById('text-panel');
  if (textPanel) {
    textPanel.innerHTML = `
      <div style="padding: 16px; display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label for="text-title-input" style="display: block; margin-bottom: 8px; font-weight: 500;">Title (optional)</label>
          <input id="text-title-input" class="quick-verse-input" type="text" placeholder="e.g., Key Point" style="width: 100%; box-sizing: border-box; margin: 0;" />
        </div>
        <div>
          <label for="text-content-input" style="display: block; margin-bottom: 8px; font-weight: 500;">Text Content</label>
          <textarea id="text-content-input" class="quick-verse-input" placeholder="Type what you want to display on the screen..." style="width: 100%; min-height: 120px; box-sizing: border-box; resize: vertical; margin: 0; padding: 12px; font-family: inherit; font-size: 14px; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 6px; color: inherit;"></textarea>
        </div>
        <button id="text-send-btn" class="btn-primary" style="width: 100%; padding: 12px;">Display on Screen</button>
      </div>
    `;

    const textTitleInput = document.getElementById('text-title-input');
    const textContentInput = document.getElementById('text-content-input');
    const textSendBtn = document.getElementById('text-send-btn');

    if (
      textSendBtn instanceof HTMLButtonElement &&
      textContentInput instanceof HTMLTextAreaElement
    ) {
      const titleInputEl = textTitleInput instanceof HTMLInputElement ? textTitleInput : null;
      textSendBtn.onclick = () => {
        const title = titleInputEl ? titleInputEl.value.trim() : '';
        const content = textContentInput.value.trim();
        if (content) {
          sendTextToStudent(title, content);
        }
      };
    }
  }

  const page = document.querySelector('.page');
  const textToggleBtn = document.getElementById('toggle-text-btn');
  const textCloseBtn = document.getElementById('text-close-btn');
  if (textToggleBtn instanceof HTMLElement) {
    textToggleBtn.onclick = () => {
      textDrawer?.classList.toggle('open');
      page?.classList.toggle('verse-drawer-open');
    };
  }
  if (textCloseBtn instanceof HTMLElement) {
    textCloseBtn.onclick = () => {
      textDrawer?.classList.remove('open');
      page?.classList.remove('verse-drawer-open');
    };
  }
}

function handleTeacherLinkClick(e: MouseEvent, element: HTMLElement): void {
  if (element.classList.contains('editor-media-tile')) {
    return;
  }

  const isImg = element.tagName.toLowerCase() === 'img';
  const href = isImg
    ? element.getAttribute('src') || ''
    : element.getAttribute('href') || '';

  if (!href || href.startsWith('bst-media:') || href === '#' || href.startsWith('#')) {
    return;
  }

  e.preventDefault();

  if (e.altKey) {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }

  let mediaType = isImg ? 'image' : 'link';
  const lowerUrl = href.toLowerCase();

  if (!isImg) {
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

  const title = isImg
    ? String(element.getAttribute('alt') || '').trim() || href
    : String(element.textContent || '').trim() || href;

  sendCommand('displayMedia', {
    media: {
      type: mediaType,
      title,
      url: href,
      sources: [{ url: href }]
    }
  });

  const originalStyle = isImg ? element.style.outline : element.style.color;
  if (isImg) {
    element.style.outline = '3px solid #4CAF50';
  } else {
    element.style.color = '#4CAF50';
  }

  element.title = 'Sent to display screen (Hold Alt to open locally)';
  setTimeout(() => {
    if (isImg) {
      element.style.outline = originalStyle;
    } else {
      element.style.color = originalStyle;
    }
    element.title = '';
  }, 1500);
}

let linkDelegationInitialized = false;

export function setupTeacherLinkDelegation(): void {
  if (linkDelegationInitialized) return;
  linkDelegationInitialized = true;

  document.addEventListener('click', (e: MouseEvent) => {
    if (!(e.target instanceof Element)) return;

    const link = e.target.closest('a[href]');
    const img = e.target.closest('img');

    if (!link && !img) return;

    const targetEl = link || img;
    if (!(targetEl instanceof HTMLElement)) return;

    const inNotes = teacherState.notesEl && teacherState.notesEl.contains(targetEl);
    const inDisplay = document.querySelector('.editor-content-display')?.contains(targetEl);
    const inGuide = document.getElementById('guide-content')?.contains(targetEl);

    if (inNotes || inDisplay || inGuide) {
      handleTeacherLinkClick(e, targetEl);
    }
  });
}
