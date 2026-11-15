import { getMediaMarkIcon, sendSectionMediaToStudent } from './media';
import { formatTime, teacherState } from './state';
import { getStoppedMarkerButtonTitle, setStoppedMarker } from './stopMarkers';
import { findPauseIndexForSection, sendCommand } from './sync';
import { sendVerseToStudent } from './verses';

const POINT_ICONS: Record<string, string> = {
  verse: 'menu_book',
  question: 'help',
  example: 'lightbulb',
  note: 'edit_note',
  heading: '',
  point: 'radio_button_unchecked'
};

export function renderOutlineWithQuestions(): void {
  const { classConfig, pausePoints } = teacherState;
  if (!classConfig.outline) return;

  const questionBank = document.getElementById('question-bank');
  if (!questionBank) return;

  const outlineContainer = questionBank.querySelector('div.list') || questionBank;

  const existingAccordions = outlineContainer.querySelectorAll('details.accordion');
  existingAccordions.forEach((acc) => acc.remove());

  const titleH3 = outlineContainer.querySelector('h3');
  const insertPoint = titleH3 ? titleH3.nextSibling : outlineContainer.firstChild;

  classConfig.outline.forEach((section) => {
    const isOpen = section.defaultOpen ? ' open' : '';
    const isStoppedHere = classConfig.stoppedAtSection === section.id;
    const detailsEl = document.createElement('details');
    detailsEl.className = `accordion${isOpen}${isStoppedHere ? ' stopped-here' : ''}`;
    detailsEl.setAttribute('data-section-id', section.id || '');

    const summaryEl = document.createElement('summary');

    const summaryContent = document.createElement('span');
    summaryContent.className = 'summary-text';
    summaryContent.textContent = section.summary;
    summaryEl.appendChild(summaryContent);

    if (isStoppedHere) {
      const stoppedIndicator = document.createElement('span');
      stoppedIndicator.className = 'stopped-indicator';
      stoppedIndicator.innerHTML = '<span class="material-icons">location_on</span> Stopped here';
      summaryEl.appendChild(stoppedIndicator);
    }

    const stopMarkerBtn = document.createElement('button');
    stopMarkerBtn.className = 'stop-marker-btn' + (isStoppedHere ? ' active' : '');
    stopMarkerBtn.innerHTML = isStoppedHere
      ? '<span class="material-icons">check</span> Marked'
      : '<span class="material-icons">location_on</span>';
    stopMarkerBtn.title = getStoppedMarkerButtonTitle(isStoppedHere);
    stopMarkerBtn.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (isStoppedHere) {
        void setStoppedMarker(null);
      } else {
        void setStoppedMarker(section.id);
      }
    };
    summaryEl.appendChild(stopMarkerBtn);

    detailsEl.appendChild(summaryEl);

    const actionsRow = document.createElement('div');
    actionsRow.style.display = 'flex';
    actionsRow.style.gap = '10px';
    actionsRow.style.alignItems = 'center';
    actionsRow.style.margin = '8px 0 6px';

    const pauseIdx = findPauseIndexForSection(section);
    if (pauseIdx != null && pauseIdx >= 0) {
      const info = document.createElement('div');
      info.style.fontSize = '13px';
      info.style.color = 'var(--muted)';
      info.style.marginRight = '8px';
      const timeText =
        pausePoints[pauseIdx] && typeof pausePoints[pauseIdx].time === 'number'
          ? formatTime(pausePoints[pauseIdx].time)
          : '';
      info.textContent = `${section.summary}${timeText ? ' · ' + timeText : ''}`;
      actionsRow.appendChild(info);

      const jumpBtn = document.createElement('button');
      jumpBtn.innerHTML = '<span class="material-symbols-outlined">skip_next</span>Jump here';
      jumpBtn.onclick = () => sendCommand('jumpToPause', { index: pauseIdx });
      actionsRow.appendChild(jumpBtn);
    }
    if (actionsRow.children.length > 0) {
      detailsEl.appendChild(actionsRow);
    }

    if (Array.isArray(section.points) && section.points.length > 0) {
      const pointsContainer = document.createElement('div');
      pointsContainer.className = 'points-container';

      section.points.forEach((pt) => {
        const pointType = typeof pt === 'object' ? pt.type || 'point' : 'point';
        const pointText = typeof pt === 'object' ? pt.text : pt;

        const pointDiv = document.createElement('div');
        pointDiv.className = `point point-${pointType}`;

        const icon = POINT_ICONS[pointType] || 'radio_button_unchecked';
        if (pointType === 'heading') {
          pointDiv.innerHTML = `<strong>${pointText}</strong>`;
        } else {
          pointDiv.innerHTML = `<span class="point-icon material-symbols-outlined">${icon}</span><span class="point-text">${pointText}</span>`;
        }

        const versePattern = /^([1-3]?\s?[A-Za-z]+)\s+(\d+(?::\d+(?:[–-]\d+(?::\d+)?)?)?)$/;
        const verseMatch = pointText.match(versePattern);
        if (verseMatch || pointType === 'verse') {
          pointDiv.classList.add('clickable-mark');
          pointDiv.title = 'Click to display on student screen';
          pointDiv.onclick = () => {
            sendVerseToStudent(pointText, 'nkjv');
            pointDiv.classList.add('mark-active');
            setTimeout(() => pointDiv.classList.remove('mark-active'), 500);
          };
        }

        pointsContainer.appendChild(pointDiv);
      });

      detailsEl.appendChild(pointsContainer);
    }

    if (Array.isArray(section.media) && section.media.length > 0) {
      const mediaMarksContainer = document.createElement('div');
      mediaMarksContainer.className = 'media-marks-container';

      const mediaMarksLabel = document.createElement('div');
      mediaMarksLabel.className = 'media-marks-label';
      mediaMarksLabel.innerHTML =
        '<small><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: text-bottom;">push_pin</span> Media marks (click to display)</small>';
      mediaMarksContainer.appendChild(mediaMarksLabel);

      const mediaMarksList = document.createElement('div');
      mediaMarksList.className = 'media-marks-list';

      section.media.forEach((media) => {
        const markItem = document.createElement('button');
        markItem.className = `media-mark media-mark-${media.type}`;
        markItem.title = `Display ${media.title || media.type} on student screen`;

        const markIcon = getMediaMarkIcon(media.type);
        markItem.innerHTML = `<span class="mark-icon">${markIcon}</span><span class="mark-title">${media.title || media.reference || media.type}</span>`;

        markItem.onclick = () => {
          sendSectionMediaToStudent(media);
          markItem.classList.add('mark-active');
          setTimeout(() => markItem.classList.remove('mark-active'), 500);
        };

        mediaMarksList.appendChild(markItem);
      });

      mediaMarksContainer.appendChild(mediaMarksList);
      detailsEl.appendChild(mediaMarksContainer);
    }

    if (section.questions && section.questions.length > 0) {
      section.questions.forEach((q) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question';

        const questionHeader = document.createElement('div');
        questionHeader.className = 'question-header';

        const promptP = document.createElement('p');
        promptP.textContent = q.prompt;
        questionHeader.appendChild(promptP);

        const displayBtn = document.createElement('button');
        displayBtn.className = 'question-display-btn';
        displayBtn.innerHTML = '<span class="material-symbols-outlined">live_tv</span> Show';
        displayBtn.title = 'Display this question on the student screen';
        displayBtn.onclick = (e: MouseEvent) => {
          e.stopPropagation();
          sendSectionMediaToStudent({
            type: 'question',
            prompt: q.prompt,
            title: q.prompt
          });
          displayBtn.classList.add('mark-active');
          setTimeout(() => displayBtn.classList.remove('mark-active'), 500);
        };
        questionHeader.appendChild(displayBtn);

        questionDiv.appendChild(questionHeader);

        if (q.answer) {
          const answerP = document.createElement('div');
          answerP.className = 'question-notes';
          answerP.textContent = q.answer;
          questionDiv.appendChild(answerP);
        }

        const textarea = document.createElement('textarea');
        textarea.setAttribute('data-question-key', q.key);
        questionDiv.appendChild(textarea);

        detailsEl.appendChild(questionDiv);
      });
    }

    if (titleH3 && titleH3.parentNode === outlineContainer) {
      titleH3.parentNode.insertBefore(detailsEl, titleH3.nextSibling);
    } else {
      outlineContainer.insertBefore(detailsEl, insertPoint);
    }
  });

  teacherState.questionFields = Array.from(
    document.querySelectorAll('textarea[data-question-key]')
  ).filter((el): el is HTMLTextAreaElement => el instanceof HTMLTextAreaElement);
}

export function setupOutlineTabs(): void {
  const tabs = document.querySelectorAll('.outline-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach((tab) => {
    if (!(tab instanceof HTMLElement)) return;
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      tab.classList.add('active');

      const tabName = tab.dataset.tab;
      const content = tabName ? document.getElementById(`${tabName}-content`) : null;
      if (content) {
        content.classList.add('active');
      }
    });
  });
}

export function switchToTab(tabName: string): void {
  const tabs = document.querySelectorAll('.outline-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach((t) => t.classList.remove('active'));
  tabContents.forEach((c) => c.classList.remove('active'));

  const tab = document.querySelector(`.outline-tab[data-tab="${tabName}"]`);
  const content = document.getElementById(`${tabName}-content`);

  if (tab) tab.classList.add('active');
  if (content) content.classList.add('active');
}

export function setupQAPauseMarkerHandlers(): void {
  const markers = document.querySelectorAll('.qa-pause-marker');

  markers.forEach((marker) => {
    if (!(marker instanceof HTMLElement)) return;
    marker.addEventListener('click', () => {
      const sectionId = marker.dataset.sectionId;

      if (sectionId) {
        switchToTab('guide');
        setTimeout(() => {
          openQASection(sectionId);
        }, 150);
      } else {
        switchToTab('guide');
      }
    });
  });
}

export function openQASection(sectionId: string): void {
  const guideContent = document.getElementById('guide-content');
  if (!guideContent) return;

  const allAccordions = guideContent.querySelectorAll('details.accordion');
  allAccordions.forEach((accordion) => {
    accordion.removeAttribute('open');
  });

  const targetAccordion = guideContent.querySelector(
    `details.accordion[data-section-id="${sectionId}"]`
  );

  if (targetAccordion) {
    targetAccordion.setAttribute('open', 'open');
    setTimeout(() => {
      targetAccordion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  } else {
    console.warn(`Could not find section with ID: ${sectionId}`);
  }
}

export function renderPauseList(): void {
  const { pauseListEl, pausePoints } = teacherState;
  if (!pauseListEl) return;

  pauseListEl.innerHTML = '';
  pausePoints.forEach((point, idx) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const label = document.createElement('div');
    label.innerHTML = `<strong>${point.label}</strong><br><small>${formatTime(point.time)}</small>`;
    const btn = document.createElement('button');
    btn.innerHTML = '<span class="material-symbols-outlined">skip_next</span>Jump here';
    btn.onclick = () => sendCommand('jumpToPause', { index: idx });
    item.appendChild(label);
    item.appendChild(btn);
    pauseListEl.appendChild(item);
  });
  if (pausePoints.length === 0) {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = '<small>No planned pauses yet. Add them in classes.json.</small>';
    pauseListEl.appendChild(item);
  }
}
