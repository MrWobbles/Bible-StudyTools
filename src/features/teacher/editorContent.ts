import { setupEditorMediaTiles } from './media';
import { setupQAPauseMarkerHandlers } from './outline';
import { sanitizeRichTextHtml } from './sanitize';
import { teacherState } from './state';
import { addStoppedMarkersToEditorContent } from './stopMarkers';
import { attachVerseReferenceHandlers, linkifyBibleVerses } from './verses';

export function renderGeneratedOutline(): void {
  const displayContainer = document.querySelector('.editor-content-display');
  if (!displayContainer) return;

  const editorContent = teacherState.classConfig.content;

  if (!editorContent || !editorContent.html) {
    displayContainer.innerHTML = '';
    return;
  }

  let html = sanitizeRichTextHtml(editorContent.html);
  html = linkifyBibleVerses(html);
  displayContainer.innerHTML = sanitizeRichTextHtml(html);

  attachVerseReferenceHandlers(displayContainer);
  setupEditorMediaTiles(displayContainer);

  if (
    teacherState.classConfig.generatedOutline &&
    teacherState.classConfig.generatedOutline.length > 0
  ) {
    insertQABreakMarkers(displayContainer, teacherState.classConfig.generatedOutline);
  }

  addStoppedMarkersToEditorContent(displayContainer);
  setupQAPauseMarkerHandlers();
}

export function insertQABreakMarkers(
  container: Element,
  generatedOutline: OutlineSection[]
): void {
  const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'));

  generatedOutline.forEach((section) => {
    const qaBreaks = (section.points || []).filter(
      (p): p is OutlinePointObject => typeof p === 'object' && p.type === 'qa-break'
    );

    if (qaBreaks.length === 0) return;

    let matchingHeading: Element | null = null;
    for (const heading of headings) {
      const headingText = (heading.textContent || '').trim().toLowerCase();
      const sectionText = section.summary.trim().toLowerCase();

      if (headingText.includes(sectionText) || sectionText.includes(headingText)) {
        matchingHeading = heading;
      }
    }

    if (matchingHeading) {
      const headingParent = matchingHeading.parentElement;
      const grandParent = headingParent?.parentNode;
      if (!headingParent || !grandParent) return;

      qaBreaks.forEach((qaBreak) => {
        const marker = document.createElement('div');
        marker.className = 'qa-break-marker';
        const iconWrap = document.createElement('div');
        iconWrap.className = 'qa-break-icon';

        const icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.textContent = 'forum';
        iconWrap.appendChild(icon);

        const content = document.createElement('div');
        content.className = 'qa-break-content';

        const title = document.createElement('strong');
        title.textContent = 'Q&A Discussion Point';

        const text = document.createElement('p');
        text.textContent = qaBreak.text || 'Pause for discussion - See class guide';

        const button = document.createElement('button');
        button.className = 'qa-break-btn';
        button.dataset.sectionId = section.id;

        const buttonIcon = document.createElement('span');
        buttonIcon.className = 'material-icons';
        buttonIcon.textContent = 'assignment';
        button.appendChild(buttonIcon);
        button.appendChild(document.createTextNode('View Class Guide'));

        content.appendChild(title);
        content.appendChild(text);
        content.appendChild(button);

        marker.appendChild(iconWrap);
        marker.appendChild(content);

        const insertPoint = headingParent.nextSibling;
        if (insertPoint) {
          grandParent.insertBefore(marker, insertPoint);
        } else {
          grandParent.appendChild(marker);
        }

        const btn = marker.querySelector('.qa-break-btn');
        if (btn) {
          btn.addEventListener('click', () => {
            const guidTab = document.querySelector('.outline-tab[data-tab="guide"]');
            const editorTab = document.querySelector('.outline-tab[data-tab="editor"]');
            const guideContent = document.getElementById('guide-content');
            const editorContent = document.getElementById('editor-content');

            if (guidTab && editorTab && guideContent && editorContent) {
              guidTab.classList.add('active');
              editorTab.classList.remove('active');
              guideContent.classList.add('active');
              editorContent.classList.remove('active');

              const accordion = document.querySelector(
                `details.accordion[data-section-id="${section.id}"]`
              );
              if (accordion) {
                accordion.setAttribute('open', '');
                accordion.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }
          });
        }
      });
    }
  });
}
