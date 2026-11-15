import { classId, fetchClassConfig, sanitizeMediaUrl } from './data';
import { renderMediaGallery, returnToDefaultView } from './viewer';

function renderOutline(classConfig: ClassConfig): void {
  if (!classConfig?.outline) return;
  const outlineContainer = document.getElementById('session-outline');
  if (!outlineContainer) return;

  outlineContainer.replaceChildren();

  classConfig.outline.forEach((section) => {
    const details = document.createElement('details');
    details.className = 'accordion';
    if (section.defaultOpen) details.open = true;

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

function initializePageFromConfig(classConfig: ClassConfig): void {
  document.title = `${classConfig.title || ''}`;

  const titleGroup = document.querySelector('.title-group');
  if (titleGroup) {
    const h1 = titleGroup.querySelector('h1');
    const subtitle = titleGroup.querySelector('.subtitle');
    if (h1) h1.textContent = classConfig.title || '';
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
      if (item.number?.toString() === classId) link.classList.add('active');
      link.href = sanitizeMediaUrl(item.href) || '#';
      link.textContent = item.title || '';
      nav.appendChild(link);
    });
  }

  renderMediaGallery(classConfig);
  renderOutline(classConfig);
}

async function init(): Promise<void> {
  try {
    const classConfig = await fetchClassConfig();
    if (classConfig) {
      initializePageFromConfig(classConfig);
    }
  } catch (err: unknown) {
    console.error('Failed to load class configuration:', err);
  }
}

window.returnToDefaultView = returnToDefaultView;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void init();
  });
} else {
  void init();
}
