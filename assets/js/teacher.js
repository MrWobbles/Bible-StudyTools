// Teacher view script - classConfig and classId are declared in loader.js
// Initialize teacher-specific variables
let VIDEO_ID = '';
let pausePoints = [];
let CHANNEL_KEY = 'class-control';
let STORAGE_FALLBACK_KEY = 'class-control-storage';
let NOTES_KEY = 'class-teacher-notes';
let QUESTION_PREFIX = 'class-question-';
let currentMediaType = null;
let allClassesData = null; // Store full classes data for saving

let channel = null;
let statusEl = null;
let pauseListEl = null;
let notesEl = null;
let downloadBtn = null;
let uploadBtn = null;
let fileInput = null;
let questionFields = [];
let displayWindow = null;
let displayWindowCheckInterval = null;
const PREVIEW_THUMB_WIDTH = 400;
const PREVIEW_THUMB_HEIGHT = 225;
const DEFAULT_DISPLAY_WIDTH = 1280;
const DEFAULT_DISPLAY_HEIGHT = 720;

async function loadClassConfig() {
  try {
    const raw = await window.BSTApi.getClasses();

    // Store full data for saving
    allClassesData = raw;

    // Normalize to array: supports {classes:[...]}, [ ... ], or single object
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

    const primaryMedia = classConfig.media?.find(m => m.primary && m.type === 'video');
    VIDEO_ID = primaryMedia?.sources?.[0]?.videoId || '';
    pausePoints = primaryMedia?.pausePoints || [];

    // Normalize pausePoints to objects: { time: seconds, label: 'M:SS' }
    pausePoints = (pausePoints || []).map(p => {
      if (p == null) return null;
      if (typeof p === 'number') return { time: p, label: formatTime(p) };
      if (typeof p === 'string') {
        const parts = p.split(':').map(n => Number(n));
        let secs = 0;
        if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
        else secs = Number(p) || 0;
        return { time: secs, label: formatTime(secs) };
      }
      if (typeof p === 'object') {
        const t = Number(p.time);
        const timeVal = Number.isFinite(t) ? t : (typeof p.time === 'string' ? (p.time.split(':').reduce((acc, cur) => acc * 60 + Number(cur), 0)) : 0);
        return { time: timeVal, label: p.label || formatTime(timeVal) };
      }
      return null;
    }).filter(Boolean);

    CHANNEL_KEY = classConfig.channelName || `class${classId}-control`;
    STORAGE_FALLBACK_KEY = `${CHANNEL_KEY}-storage`;
    NOTES_KEY = `class${classId}-teacher-notes`;
    QUESTION_PREFIX = `class${classId}-question-`;

    window.BIBLE_STUDY_CONFIG = {
      videoId: VIDEO_ID,
      channelName: CHANNEL_KEY,
      pausePoints: pausePoints
    };

    initializePage();
  } catch (err) {
    console.error('Failed to load class configuration:', err);
  }
}

function initializePage() {
  document.title = `Presenter View — ${classConfig.title}`;

  statusEl = document.getElementById('status');
  pauseListEl = document.getElementById('pause-list');
  notesEl = document.getElementById('notes');
  downloadBtn = document.getElementById('download-notes');
  uploadBtn = document.getElementById('upload-notes');
  fileInput = document.getElementById('notes-file');

  const h1 = document.querySelector('h1');
  if (h1) h1.textContent = `Presenter View · ${classConfig.title}`;

  const subtitle = document.querySelector('.subtitle');
  if (subtitle) subtitle.textContent = `${classConfig.subtitle || ''} · Keep this on your laptop while casting the main screen.`;

  const previewIframe = document.getElementById('student-preview');
  if (previewIframe) previewIframe.src = `${window.location.origin}/student.html?class=${classId}`;

  const guideTitle = document.querySelector('h3');
  if (guideTitle) guideTitle.textContent = `${classConfig.title} guide with notes`;

  renderOutlineWithQuestions();

  // Render media gallery
  renderMediaGallery();

  // Set up tab switching
  setupOutlineTabs();

  // Render generated outline
  renderGeneratedOutline();

  // Use Electron IPC-based channel if available, otherwise native BroadcastChannel
  if (window.bst?.createBroadcastChannel) {
    channel = window.bst.createBroadcastChannel(CHANNEL_KEY);
  } else if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(CHANNEL_KEY);
  } else {
    channel = null;
  }

  bindControls();
  hydrateNotes();

  // Set up open display button
  const openDisplayBtn = document.getElementById('open-display-btn');
  if (openDisplayBtn) {
    openDisplayBtn.addEventListener('click', openDisplayWindow);
  }

  if (statusEl) statusEl.textContent = 'Ready. Open the display page on the TV (student.html).';
}

function renderOutlineWithQuestions() {
  if (!classConfig.outline) return;

  const questionBank = document.getElementById('question-bank');
  if (!questionBank) return;

  const outlineContainer = questionBank.querySelector('div.list') || questionBank;

  const existingAccordions = outlineContainer.querySelectorAll('details.accordion');
  existingAccordions.forEach(acc => acc.remove());

  const titleH3 = outlineContainer.querySelector('h3');
  const insertPoint = titleH3 ? titleH3.nextSibling : outlineContainer.firstChild;

  classConfig.outline.forEach((section) => {
    const isOpen = section.defaultOpen ? ' open' : '';
    const isStoppedHere = classConfig.stoppedAtSection === section.id;
    const detailsEl = document.createElement('details');
    detailsEl.className = `accordion${isOpen}${isStoppedHere ? ' stopped-here' : ''}`;
    detailsEl.setAttribute('data-section-id', section.id || '');

    const summaryEl = document.createElement('summary');

    // Create summary content wrapper
    const summaryContent = document.createElement('span');
    summaryContent.className = 'summary-text';
    summaryContent.textContent = section.summary;
    summaryEl.appendChild(summaryContent);

    // Add stopped-here indicator
    if (isStoppedHere) {
      const stoppedIndicator = document.createElement('span');
      stoppedIndicator.className = 'stopped-indicator';
      stoppedIndicator.innerHTML = '<span class="material-icons">location_on</span> Stopped here';
      summaryEl.appendChild(stoppedIndicator);
    }

    // Add "Mark stopped here" button
    const stopMarkerBtn = document.createElement('button');
    stopMarkerBtn.className = 'stop-marker-btn' + (isStoppedHere ? ' active' : '');
    stopMarkerBtn.innerHTML = isStoppedHere ? '<span class="material-icons">check</span> Marked' : '<span class="material-icons">location_on</span>';
    stopMarkerBtn.title = isStoppedHere ? 'Click to remove marker' : 'Mark where you stopped';
    stopMarkerBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (isStoppedHere) {
        setStoppedMarker(null);
      } else {
        setStoppedMarker(section.id);
      }
    };
    summaryEl.appendChild(stopMarkerBtn);

    detailsEl.appendChild(summaryEl);

    // Actions row (e.g., Jump button)
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
      const timeText = (pausePoints[pauseIdx] && typeof pausePoints[pauseIdx].time === 'number') ? formatTime(pausePoints[pauseIdx].time) : '';
      // Show section title first, then the time
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

    // Points list with type support
    if (Array.isArray(section.points) && section.points.length > 0) {
      const pointsContainer = document.createElement('div');
      pointsContainer.className = 'points-container';

      section.points.forEach(pt => {
        // Support both string format (backward compatible) and object format with type
        const pointType = typeof pt === 'object' ? (pt.type || 'point') : 'point';
        const pointText = typeof pt === 'object' ? pt.text : pt;

        const pointDiv = document.createElement('div');
        pointDiv.className = `point point-${pointType}`;

        // Add icons for different types
        const icons = {
          verse: 'menu_book',
          question: 'help',
          example: 'lightbulb',
          note: 'edit_note',
          heading: '',
          point: 'radio_button_unchecked'
        };

        const icon = icons[pointType] || 'radio_button_unchecked';
        if (pointType === 'heading') {
          pointDiv.innerHTML = `<strong>${pointText}</strong>`;
        } else {
          pointDiv.innerHTML = `<span class="point-icon material-symbols-outlined">${icon}</span><span class="point-text">${pointText}</span>`;
        }

        // Check if the point text looks like a Bible verse reference and make it clickable
        const versePattern = /^([1-3]?\s?[A-Za-z]+)\s+(\d+)(:\d+(-\d+)?)?$/;
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

    // Section media marks - clickable items to display on student screen
    if (Array.isArray(section.media) && section.media.length > 0) {
      const mediaMarksContainer = document.createElement('div');
      mediaMarksContainer.className = 'media-marks-container';

      const mediaMarksLabel = document.createElement('div');
      mediaMarksLabel.className = 'media-marks-label';
      mediaMarksLabel.innerHTML = '<small><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: text-bottom;">push_pin</span> Media marks (click to display)</small>';
      mediaMarksContainer.appendChild(mediaMarksLabel);

      const mediaMarksList = document.createElement('div');
      mediaMarksList.className = 'media-marks-list';

      section.media.forEach((media, mediaIdx) => {
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

    // Questions with answer fields + notes
    if (section.questions && section.questions.length > 0) {
      section.questions.forEach(q => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question';

        // Question header with prompt and display button
        const questionHeader = document.createElement('div');
        questionHeader.className = 'question-header';

        const promptP = document.createElement('p');
        promptP.textContent = q.prompt;
        questionHeader.appendChild(promptP);

        // Add "Display on screen" button
        const displayBtn = document.createElement('button');
        displayBtn.className = 'question-display-btn';
        displayBtn.innerHTML = '<span class="material-symbols-outlined">live_tv</span> Show';
        displayBtn.title = 'Display this question on the student screen';
        displayBtn.onclick = (e) => {
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

        // Teacher notes / suggested answer
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

  questionFields = Array.from(document.querySelectorAll('textarea[data-question-key]'));
}

// Helpers to map sections to pause points
function findPauseIndexForSection(section) {
  try {
    const primaryVideo = classConfig.media?.find(m => m.primary && m.type === 'video');
    const points = primaryVideo?.pausePoints || [];
    if (!points.length) return null;

    // 1) Try by label similarity
    const sum = normalizeString(section.summary || '');
    let bestIdx = null;
    let bestScore = 0;
    points.forEach((p, idx) => {
      const lbl = normalizeString(p.label || '');
      if (!lbl) return;
      // Exact or substring match gets priority
      if (sum.includes(lbl) || lbl.includes(sum)) {
        bestIdx = idx; bestScore = 2; return;
      }
      // Token overlap as fallback
      const score = tokenOverlap(sum, lbl);
      if (score > bestScore) { bestScore = score; bestIdx = idx; }
    });
    if (bestIdx != null && bestScore > 0) return bestIdx;

    // 2) Try by timestamp in summary (e.g., 00:07:05 · ... or 7:05)
    const ts = parseTimeFromSummary(section.summary || '');
    if (ts != null) {
      let nearest = 0;
      let delta = Infinity;
      points.forEach((p, idx) => {
        const d = Math.abs((p.time || 0) - ts);
        if (d < delta) { delta = d; nearest = idx; }
      });
      // Require reasonable proximity (e.g., within 45s) to avoid bad jumps
      if (delta <= 45) return nearest;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function normalizeString(s) {
  return String(s)
    .toLowerCase()
    .replace(/\u00b7/g, ' ')
    .replace(/"|\(|\)|\[|\]|\{|\}|:|,|\.|&/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlap(a, b) {
  if (!a || !b) return 0;
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  let count = 0;
  ta.forEach(t => { if (tb.has(t)) count += 1; });
  return count;
}

function parseTimeFromSummary(summary) {
  // Supports HH:MM:SS ·, HH:MM ·, or M:SS at start
  const m = String(summary).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = m[3] ? parseInt(m[1], 10) : 0;
  const mm = m[3] ? parseInt(m[2], 10) : parseInt(m[1], 10);
  const ss = m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10);
  return h * 3600 + mm * 60 + ss;
}

function renderMediaGallery() {
  const hasMedia = classConfig.media && classConfig.media.length > 0;

  const orderedMedia = [];

  if (hasMedia) {
    const primaryMedia = classConfig.media.filter(m => m.primary);
    const otherClassMedia = classConfig.media.filter(m => !m.primary);

    orderedMedia.push(...primaryMedia);

    if (classConfig.outline) {
      classConfig.outline.forEach(section => {
        if (section.media && section.media.length > 0) {
          section.media.forEach(media => {
            orderedMedia.push({
              ...media,
              sectionTitle: section.summary
            });
          });
        }
      });
    }

    orderedMedia.push(...otherClassMedia);
  }

  let mediaDrawer = document.getElementById('media-drawer');
  if (!mediaDrawer) {
    mediaDrawer = document.createElement('aside');
    mediaDrawer.id = 'media-drawer';
    mediaDrawer.className = 'media-drawer';
    mediaDrawer.innerHTML = `
      <div class="media-drawer-header">
        <div>
          <div class="tag">Media resources</div>
          <h3 style="margin: 6px 0 0;">Lesson media</h3>
        </div>
        <button id="media-close-btn" aria-label="Close media resources panel" title="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="media-drawer-body" id="media-panel"></div>
    `;
    document.body.appendChild(mediaDrawer);
  }

  let verseDrawer = document.getElementById('verse-drawer');
  if (!verseDrawer) {
    verseDrawer = document.createElement('aside');
    verseDrawer.id = 'verse-drawer';
    verseDrawer.className = 'verse-drawer';
    verseDrawer.innerHTML = `
      <div class="media-drawer-header">
        <div>
          <div class="tag">Bible verse</div>
          <h3 style="margin: 6px 0 0;">Quick verse</h3>
        </div>
        <button id="verse-close-btn" aria-label="Close quick verse panel" title="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="media-drawer-body" id="verse-panel"></div>
    `;
    document.body.appendChild(verseDrawer);
  }

  const mediaPanel = document.getElementById('media-panel');
  if (mediaPanel) {
    // Render a compact vertical list of class materials
    if (orderedMedia.length > 0) {
      const mediaHTML = `
        <div class="media-list">
          ${orderedMedia.map((media, idx) => {
        const sectionLabel = media.sectionTitle ? `<div style="font-size:10px; color:var(--muted); margin-top:2px;">${media.sectionTitle}</div>` : '';
        const url = media.url || (media.sources && media.sources[0] && (media.sources[0].url || media.sources[0].path)) || '#';

        return `
            <div class="media-item" data-media-index="${idx}" data-media-type="${media.type}" data-media-url="${url}" title="${media.title || media.type}">
              <div style="display:flex; gap:10px; align-items:center; min-width:0;">
                <span class="material-symbols-outlined" style="font-size:20px;">${getMediaIcon(media.type)}</span>
                <div style="min-width:0;">
                  <div class="media-item-title">${media.title || media.type}</div>
                  <div class="media-item-meta">${media.type}${media.primary ? ' (primary)' : ''}</div>
                  ${sectionLabel}
                </div>
              </div>
            </div>
            `;
      }).join('')}
        </div>
      `;
      mediaPanel.innerHTML = mediaHTML;

      mediaPanel.querySelectorAll('.media-item').forEach(item => {
        item.addEventListener('click', () => {
          const idx = Number(item.dataset.mediaIndex);
          if (Number.isInteger(idx)) {
            sendMediaToStudent(idx);
          }
        });
      });
    } else {
      mediaPanel.innerHTML = `
        <div style="color: var(--muted); font-size: 14px; padding: 20px; text-align: center;">
          <span class="material-icons" style="font-size: 32px; opacity: 0.5; display: block; margin-bottom: 8px;">folder_off</span>
          No media resources for this class.<br>
          Add media in the Admin panel.
        </div>
      `;
    }
  }

  const versePanel = document.getElementById('verse-panel');
  if (!versePanel) return;

  versePanel.innerHTML = `
    <div class="quick-verse-form-row quick-verse-main-row">
      <input id="verse-ref-input" class="quick-verse-input" type="text" placeholder="e.g., John 3:16–18" />
      <select id="verse-translation-input" class="quick-verse-select" aria-label="Bible version">
        <option value="nkjv" selected>NKJV</option>
        <option value="kjv">KJV</option>
        <option value="esv">ESV</option>
        <option value="niv">NIV</option>
        <option value="nasb">NASB</option>
        <option value="nlt">NLT</option>
        <option value="amp">AMP</option>
        <option value="web">WEB</option>
      </select>
      <button id="verse-send-btn" class="quick-verse-btn">Show</button>
    </div>
    <div class="quick-verse-form-row quick-verse-nav-row">
      <button id="verse-prev" class="quick-verse-btn quick-verse-btn-nav"><span class="material-symbols-outlined">navigate_before</span>Previous</button>
      <button id="verse-next" class="quick-verse-btn quick-verse-btn-nav"><span class="material-symbols-outlined">navigate_next</span>Next</button>
    </div>
    <div class="quick-verse-help">
      Defaults to NKJV via labs.bible.org, falls back to KJV and bible-api.com
    </div>
  `;

  const verseRefInput = document.getElementById('verse-ref-input');
  const verseTranslationInput = document.getElementById('verse-translation-input');
  const verseSendBtn = document.getElementById('verse-send-btn');

  if (verseSendBtn && verseRefInput) {
    verseSendBtn.onclick = () =>
      sendVerseToStudent(verseRefInput.value, verseTranslationInput?.value || 'web');
  }

  const toggleBtn = document.getElementById('toggle-media-btn');
  const closeBtn = document.getElementById('media-close-btn');
  const page = document.querySelector('.page');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      mediaDrawer.classList.toggle('open');
      page.classList.toggle('media-drawer-open');
    };
  }
  if (closeBtn) {
    closeBtn.onclick = () => {
      mediaDrawer.classList.remove('open');
      page.classList.remove('media-drawer-open');
    };
  }

  const verseToggleBtn = document.getElementById('toggle-verse-btn');
  const verseCloseBtn = document.getElementById('verse-close-btn');
  if (verseToggleBtn) {
    verseToggleBtn.onclick = () => {
      verseDrawer.classList.toggle('open');
      page.classList.toggle('verse-drawer-open');
    };
  }
  if (verseCloseBtn) {
    verseCloseBtn.onclick = () => {
      verseDrawer.classList.remove('open');
      page.classList.remove('verse-drawer-open');
    };
  }

  // Store media list for sendMediaToStudent function
  window.teacherMediaList = orderedMedia;
}

function getMediaIcon(type) {
  const icons = {
    video: 'videocam',
    pdf: 'description',
    images: 'image',
    audio: 'audio_file',
    document: 'assignment',
    link: 'link',
    presentation: 'bar_chart',
    verse: 'menu_book'
  };
  return icons[type] || 'folder';
}

function setupOutlineTabs() {
  const tabs = document.querySelectorAll('.outline-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      // Add active class to clicked tab
      tab.classList.add('active');

      // Show corresponding content
      const tabName = tab.dataset.tab;
      const content = document.getElementById(`${tabName}-content`);
      if (content) {
        content.classList.add('active');
      }
    });
  });
}

// Switch to a specific tab programmatically
function switchToTab(tabName) {
  const tabs = document.querySelectorAll('.outline-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(t => t.classList.remove('active'));
  tabContents.forEach(c => c.classList.remove('active'));

  const tab = document.querySelector(`.outline-tab[data-tab="${tabName}"]`);
  const content = document.getElementById(`${tabName}-content`);

  if (tab) tab.classList.add('active');
  if (content) content.classList.add('active');
}

// Setup click handlers for Q&A pause markers
function setupQAPauseMarkerHandlers() {
  const markers = document.querySelectorAll('.qa-pause-marker');

  markers.forEach(marker => {
    marker.addEventListener('click', () => {
      const sectionId = marker.dataset.sectionId;
      const sectionTitle = marker.dataset.sectionTitle;

      if (sectionId) {
        // Switch to the Class Guide tab
        switchToTab('guide');

        // Wait a moment for tab to switch, then open the section
        setTimeout(() => {
          openQASection(sectionId);
        }, 150);
      } else {
        // No section linked, just switch to guide tab
        switchToTab('guide');
      }
    });
  });
}

// Open a specific Q&A section and close all others
function openQASection(sectionId) {
  // Find all accordion elements in the guide content
  const guideContent = document.getElementById('guide-content');
  if (!guideContent) return;

  const allAccordions = guideContent.querySelectorAll('details.accordion');

  // Close all sections first
  allAccordions.forEach(accordion => {
    accordion.removeAttribute('open');
  });

  // Find and open the target section
  const targetAccordion = guideContent.querySelector(`details.accordion[data-section-id="${sectionId}"]`);

  if (targetAccordion) {
    targetAccordion.setAttribute('open', 'open');

    // Scroll to the section smoothly
    setTimeout(() => {
      targetAccordion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  } else {
    console.warn(`Could not find section with ID: ${sectionId}`);
  }
}

function renderGeneratedOutline() {
  const displayContainer = document.querySelector('.editor-content-display');
  if (!displayContainer) return;

  // Display the actual editor content (HTML from TipTap editor)
  const editorContent = classConfig.content;

  if (!editorContent || !editorContent.html) {
    displayContainer.innerHTML = '';
    return;
  }

  // Render the editor content and make verse references clickable
  let html = sanitizeRichTextHtml(editorContent.html);

  // Bible verse reference pattern (matches formats like: John 3:16, Romans 5:1-8, 1 Corinthians 13, etc.)
  const bibleBooks = [
    'Genesis', 'Gen', 'Exodus', 'Ex', 'Exo', 'Leviticus', 'Lev', 'Numbers', 'Num', 'Deuteronomy', 'Deut', 'Deu',
    'Joshua', 'Josh', 'Judges', 'Judg', 'Ruth', '1 Samuel', '2 Samuel', 'Samuel', 'Sam', '1 Kings', '2 Kings', 'Kings',
    '1 Chronicles', '2 Chronicles', 'Chronicles', 'Chron', 'Chr', 'Ezra', 'Nehemiah', 'Neh', 'Esther', 'Est',
    'Job', 'Psalm', 'Psalms', 'Ps', 'Proverbs', 'Prov', 'Pro', 'Ecclesiastes', 'Eccles', 'Ecc',
    'Song of Solomon', 'Song', 'Isaiah', 'Isa', 'Jeremiah', 'Jer', 'Lamentations', 'Lam',
    'Ezekiel', 'Ezek', 'Eze', 'Daniel', 'Dan', 'Hosea', 'Hos', 'Joel', 'Amos', 'Obadiah', 'Obad',
    'Jonah', 'Jon', 'Micah', 'Mic', 'Nahum', 'Nah', 'Habakkuk', 'Hab', 'Zephaniah', 'Zeph',
    'Haggai', 'Hag', 'Zechariah', 'Zech', 'Zec', 'Malachi', 'Mal',
    'Matthew', 'Matt', 'Mat', 'Mark', 'Luke', 'John', 'Acts',
    'Romans', 'Rom', '1 Corinthians', '2 Corinthians', 'Corinthians', 'Cor',
    'Galatians', 'Gal', 'Ephesians', 'Eph', 'Philippians', 'Phil',
    'Colossians', 'Col', '1 Thessalonians', '2 Thessalonians', 'Thessalonians', 'Thess', 'Thes',
    '1 Timothy', '2 Timothy', 'Timothy', 'Tim', 'Titus', 'Tit', 'Philemon', 'Philem',
    'Hebrews', 'Heb', 'James', 'Jam', 'Jas', '1 Peter', '2 Peter', 'Peter', 'Pet',
    '1 John', '2 John', '3 John', 'Jude', 'Revelation', 'Rev'
  ];

  const versePattern = new RegExp(
    `\\b(\\d\\s+)?(${bibleBooks.join('|')})\\s+\\d+(?::\\d+)?(?:[–-]\\d+(?::\\d+)?)?\\b`,
    'gi'
  );

  // Replace verse references with clickable spans
  html = html.replace(versePattern, (match) => {
    return `<span class="verse-reference" data-verse="${match.trim()}">${match}</span>`;
  });

  displayContainer.innerHTML = sanitizeRichTextHtml(html);

  // Add click handlers to verse references
  const verseRefs = displayContainer.querySelectorAll('.verse-reference');
  verseRefs.forEach(ref => {
    ref.addEventListener('click', () => {
      const verse = ref.dataset.verse;
      if (verse) {
        // Use configured Bible translation from config
        const translation = classConfig?.bibleTranslation || window.BIBLE_STUDY_CONFIG?.bibleTranslation || 'nkjv';
        sendVerseToStudent(verse, translation);
        // Visual feedback
        ref.style.background = 'rgba(240, 180, 41, 0.3)';
        setTimeout(() => {
          ref.style.background = '';
        }, 500);
      }
    });
  });

  setupEditorMediaTiles(displayContainer);

  // Add Q&A break markers if generatedOutline exists
  if (classConfig.generatedOutline && classConfig.generatedOutline.length > 0) {
    insertQABreakMarkers(displayContainer, classConfig.generatedOutline);
  }

  // Add stopped-here markers with line numbers
  addStoppedMarkersToEditorContent(displayContainer);

  // Add click handlers to external links - require Alt key to open
  const links = displayContainer.querySelectorAll('a[href]');
  links.forEach(link => {
    if (link.classList.contains('editor-media-tile')) {
      return;
    }

    if ((link.getAttribute('href') || '').startsWith('bst-media:')) {
      return;
    }

    link.addEventListener('click', (e) => {
      // Only allow opening if Alt key is held
      if (!e.altKey) {
        e.preventDefault();
        // Show visual feedback that Alt is required
        const originalColor = link.style.color;
        link.style.color = '#ffc107';
        link.title = 'Hold Alt while clicking to open link';
        setTimeout(() => {
          link.style.color = originalColor;
          link.title = '';
        }, 1000);
      }
    });
  });

  // Set up click handlers for Q&A pause markers (from TipTap editor)
  setupQAPauseMarkerHandlers();
}

function decodeEditorMediaPayload(encodedPayload) {
  if (!encodedPayload) return null;

  try {
    const decoded = decodeURIComponent(encodedPayload);
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    console.warn('[Teacher] Failed to decode editor media payload:', err);
    return null;
  }
}

function collectTeacherMediaItems() {
  const orderedMedia = [];
  const classMedia = Array.isArray(classConfig?.media) ? classConfig.media : [];

  orderedMedia.push(...classMedia.filter(m => m?.primary));

  if (Array.isArray(classConfig?.outline)) {
    classConfig.outline.forEach((section) => {
      if (!Array.isArray(section?.media)) return;
      section.media.forEach((media) => {
        orderedMedia.push({
          ...media,
          sectionTitle: section.summary || ''
        });
      });
    });
  }

  orderedMedia.push(...classMedia.filter(m => !m?.primary));
  return orderedMedia.filter(Boolean);
}

function findMediaByTileText(tileText) {
  const normalizedText = String(tileText || '').trim().toLowerCase();
  if (!normalizedText) return null;

  const items = collectTeacherMediaItems();
  return items.find((media) => {
    const mediaTitle = String(media?.title || media?.reference || media?.prompt || '').trim().toLowerCase();
    return mediaTitle && mediaTitle === normalizedText;
  }) || null;
}

function setupEditorMediaTiles(container) {
  const mediaTiles = container.querySelectorAll('.editor-media-tile');

  mediaTiles.forEach((tile) => {
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.title = 'Click to display this media on student screen';

    if (tile.tagName === 'A') {
      tile.setAttribute('href', tile.getAttribute('href') || '#');
    }

    const activateTile = (event) => {
      if (event) {
        event.preventDefault();
      }

      const dataPayload = tile.getAttribute('data-media-json');
      const href = tile.getAttribute('href') || '';
      const hrefPayload = href.startsWith('bst-media:') ? href.slice('bst-media:'.length) : '';
      const media = decodeEditorMediaPayload(dataPayload || hrefPayload) || findMediaByTileText(tile.textContent);
      if (!media) {
        return;
      }

      sendSectionMediaToStudent(media);
      tile.classList.add('mark-active');
      setTimeout(() => tile.classList.remove('mark-active'), 500);
    };

    tile.addEventListener('click', activateTile);
    tile.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        activateTile(event);
      }
    });
  });
}

// Insert Q&A break markers into the editor content display
function insertQABreakMarkers(container, generatedOutline) {
  // Find all headings in the content
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');

  generatedOutline.forEach((section) => {
    // Check if this section has Q&A break points
    const qaBreaks = section.points?.filter(p =>
      typeof p === 'object' && p.type === 'qa-break'
    ) || [];

    if (qaBreaks.length === 0) return;

    // Find the heading that matches this section
    let matchingHeading = null;
    headings.forEach(heading => {
      const headingText = heading.textContent.trim().toLowerCase();
      const sectionText = section.summary.trim().toLowerCase();

      // Check for partial match
      if (headingText.includes(sectionText) || sectionText.includes(headingText)) {
        matchingHeading = heading;
      }
    });

    if (matchingHeading) {
      // Create Q&A break marker
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

        // Insert after the heading's parent section
        const insertPoint = matchingHeading.parentElement.nextSibling;
        if (insertPoint) {
          matchingHeading.parentElement.parentNode.insertBefore(marker, insertPoint);
        } else {
          matchingHeading.parentElement.parentNode.appendChild(marker);
        }

        // Add click handler to switch to class guide tab
        const btn = marker.querySelector('.qa-break-btn');
        if (btn) {
          btn.addEventListener('click', () => {
            // Switch to class guide tab
            const guidTab = document.querySelector('.outline-tab[data-tab="guide"]');
            const editorTab = document.querySelector('.outline-tab[data-tab="editor"]');
            const guideContent = document.getElementById('guide-content');
            const editorContent = document.getElementById('editor-content');

            if (guidTab && editorTab && guideContent && editorContent) {
              guidTab.classList.add('active');
              editorTab.classList.remove('active');
              guideContent.classList.add('active');
              editorContent.classList.remove('active');

              // Try to open the matching section in the class guide
              const accordion = document.querySelector(`details.accordion[data-section-id="${section.id}"]`);
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

function openDisplayWindow() {
  if (displayWindow && !displayWindow.closed) {
    displayWindow.location.href = `${window.location.origin}/student.html?class=${classId}`;
    displayWindow.focus();
  } else {
    displayWindow = window.open(`${window.location.origin}/student.html?class=${classId}`, 'display-screen', 'width=1280,height=720');
  }

  // Show the preview iframe
  const previewShell = document.getElementById('student-preview-shell');
  if (previewShell) {
    previewShell.style.display = 'block';
    syncPreviewViewport();
  }

  // Start checking if the window is closed
  if (displayWindowCheckInterval) clearInterval(displayWindowCheckInterval);
  displayWindowCheckInterval = setInterval(() => {
    syncPreviewViewport();

    if (displayWindow && displayWindow.closed) {
      const previewShell = document.getElementById('student-preview-shell');
      if (previewShell) {
        previewShell.style.display = 'none';
      }
      clearInterval(displayWindowCheckInterval);
      displayWindowCheckInterval = null;
    }
  }, 1000);
}

function getDisplayViewportSize() {
  if (!displayWindow || displayWindow.closed) {
    return { width: DEFAULT_DISPLAY_WIDTH, height: DEFAULT_DISPLAY_HEIGHT };
  }

  const width = Number(displayWindow.innerWidth || displayWindow.outerWidth || DEFAULT_DISPLAY_WIDTH);
  const height = Number(displayWindow.innerHeight || displayWindow.outerHeight || DEFAULT_DISPLAY_HEIGHT);

  return {
    width: Math.max(320, width),
    height: Math.max(180, height)
  };
}

function syncPreviewViewport() {
  const previewShell = document.getElementById('student-preview-shell');
  const previewIframe = document.getElementById('student-preview');
  if (!previewShell || !previewIframe) return;

  const { width, height } = getDisplayViewportSize();
  const shellWidth = previewShell.clientWidth || PREVIEW_THUMB_WIDTH;
  const shellHeight = previewShell.clientHeight || PREVIEW_THUMB_HEIGHT;

  // Fill the thumbnail box and center-crop if aspect ratios differ.
  const scale = Math.max(shellWidth / width, shellHeight / height);
  const offsetX = (shellWidth - (width * scale)) / 2;
  const offsetY = (shellHeight - (height * scale)) / 2;

  previewIframe.style.width = `${width}px`;
  previewIframe.style.height = `${height}px`;
  previewIframe.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  previewIframe.style.transformOrigin = 'top left';
}

function sendMediaToStudent(index) {
  if (!window.teacherMediaList || index >= window.teacherMediaList.length) {
    console.error('[Teacher] Invalid media index:', index);
    return;
  }

  const media = window.teacherMediaList[index];
  console.log('[Teacher] Sending media to student:', media);
  currentMediaType = media.type || 'unknown';
  updateControlVisibility();
  sendCommand('displayMedia', { media });
}

function sendVerseToStudent(reference, translation = 'nkjv') {
  if (!reference || !reference.trim()) return;
  currentMediaType = 'verse';
  updateControlVisibility();
  sendCommand('displayMedia', {
    media: {
      type: 'verse',
      reference: reference.trim(),
      translation: (translation || 'nkjv').trim(),
      title: reference.trim()
    }
  });
}

// Get icon for media mark type
function getMediaMarkIcon(type) {
  const icons = {
    verse: 'menu_book',
    video: 'movie',
    image: 'image',
    images: 'photo_library',
    link: 'link',
    pdf: 'description',
    document: 'assignment',
    audio: 'audio_file',
    question: 'help',
    presentation: 'bar_chart'
  };
  return icons[type] || 'attach_file';
}

// Send section media directly to student
function sendSectionMediaToStudent(media) {
  if (!media) return;

  console.log('[Teacher] Sending section media to student:', media);

  // Handle verse type specially
  if (media.type === 'verse') {
    const reference = media.reference || media.title || '';
    const translation = media.translation || 'nkjv';
    sendVerseToStudent(reference, translation);
    return;
  }

  // Handle video type - check for YouTube
  if (media.type === 'video') {
    currentMediaType = 'video';
    updateControlVisibility();

    // Build video media object
    const videoMedia = {
      type: 'video',
      title: media.title || 'Video'
    };

    if (media.sources) {
      videoMedia.sources = media.sources;
    } else if (media.url) {
      videoMedia.url = media.url;
    }

    sendCommand('displayMedia', { media: videoMedia });
    return;
  }

  // Handle image type
  if (media.type === 'image' || media.type === 'images') {
    currentMediaType = 'image';
    updateControlVisibility();

    const imageMedia = {
      type: 'image',
      title: media.title || 'Image'
    };

    if (media.sources) {
      imageMedia.sources = media.sources;
    } else if (media.url) {
      imageMedia.url = media.url;
    }

    sendCommand('displayMedia', { media: imageMedia });
    return;
  }

  // Handle question type - display question on student screen
  if (media.type === 'question') {
    currentMediaType = 'question';
    updateControlVisibility();
    sendCommand('displayMedia', {
      media: {
        type: 'question',
        prompt: media.prompt || media.title || '',
        answer: media.answer || '',
        title: media.title || 'Discussion Question'
      }
    });
    return;
  }

  // Handle link type - display in student window
  if (media.type === 'link') {
    currentMediaType = 'link';
    updateControlVisibility();
    sendCommand('displayMedia', { media });
    return;
  }

  // Generic media handling for other types (pdf, audio, etc.)
  currentMediaType = media.type || 'unknown';
  updateControlVisibility();
  sendCommand('displayMedia', { media });
}

function sendCommand(type, payload = {}) {
  const message = { type, ...payload, sentAt: Date.now() };
  console.log('[Teacher] Sending command:', type, message);
  if (channel) {
    channel.postMessage(message);
    console.log('[Teacher] Posted to BroadcastChannel');
  } else {
    console.warn('[Teacher] No BroadcastChannel available');
  }
  try { localStorage.setItem(STORAGE_FALLBACK_KEY, JSON.stringify(message)); } catch (err) { }
  flashStatus(`Sent: ${labelFor(type, payload)}`);
}

function labelFor(type, payload) {
  if (type === 'jumpToPause' && Number.isInteger(payload.index)) {
    const idx = payload.index;
    const point = pausePoints[idx];
    // Prefer section title if we can map the pause index back to an outline section
    if (classConfig?.outline) {
      for (const sec of classConfig.outline) {
        try {
          const found = findPauseIndexForSection(sec);
          if (found === idx) {
            const time = point && typeof point.time === 'number' ? ` · ${formatTime(point.time)}` : '';
            return `Jump to ${sec.summary}${time}`;
          }
        } catch (e) { /* ignore */ }
      }
    }
    return point ? `Jump to ${point.label}` : 'Jump to pause';
  }
  if (type === 'nextPause') return 'Skip to next pause';
  if (type === 'fullscreen') return 'Fullscreen display';
  if (type === 'restart') return 'Restart video';
  if (type === 'toggle') return 'Play / Pause';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function flashStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

// Removed local fullscreen toggle; teacher should request student to fullscreen the video.

function renderPauseList() {
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

function bindControls() {
  const toggleBtn = document.getElementById('toggle');
  const playBtn = document.getElementById('play');
  const pauseBtn = document.getElementById('pause');
  const restartBtn = document.getElementById('restart');
  const nextBtn = document.getElementById('next');
  const fullscreenBtn = document.getElementById('fullscreen');
  const clearScreenBtn = document.getElementById('clear-screen');

  if (toggleBtn) toggleBtn.onclick = () => sendCommand('toggle');
  if (playBtn) playBtn.onclick = () => sendCommand('play');
  if (pauseBtn) pauseBtn.onclick = () => sendCommand('pause');
  if (restartBtn) restartBtn.onclick = () => sendCommand('restart');
  if (nextBtn) nextBtn.onclick = () => sendCommand('nextPause');
  if (fullscreenBtn) fullscreenBtn.onclick = () => sendCommand('fullscreen');
  if (clearScreenBtn) clearScreenBtn.onclick = () => sendCommand('clearScreen');

  const versePrevBtn = document.getElementById('verse-prev');
  const verseNextBtn = document.getElementById('verse-next');
  if (versePrevBtn) versePrevBtn.onclick = () => sendCommand('versePrevious');
  if (verseNextBtn) verseNextBtn.onclick = () => sendCommand('verseNext');

  const globalVersePrev = document.getElementById('global-verse-prev');
  const globalVerseNext = document.getElementById('global-verse-next');
  if (globalVersePrev) globalVersePrev.onclick = () => sendCommand('versePrevious');
  if (globalVerseNext) globalVerseNext.onclick = () => sendCommand('verseNext');

  const verseFontDecrease = document.getElementById('verse-font-decrease');
  const verseFontIncrease = document.getElementById('verse-font-increase');
  if (verseFontDecrease) verseFontDecrease.onclick = () => sendCommand('verseFontDecrease');
  if (verseFontIncrease) verseFontIncrease.onclick = () => sendCommand('verseFontIncrease');

  if (downloadBtn) downloadBtn.onclick = downloadNotes;
  if (uploadBtn) uploadBtn.onclick = () => fileInput?.click();
  if (fileInput) fileInput.onchange = importNotes;

  document.querySelectorAll('.rte-toolbar button').forEach(btn => {
    btn.onclick = () => {
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.value || null;
      document.execCommand(cmd, false, val);
      if (notesEl) notesEl.focus();
      persistNotes();
    };
  });

  questionFields.forEach(field => {
    const key = field.dataset.questionKey;
    const stored = localStorage.getItem(QUESTION_PREFIX + key);
    if (stored) field.value = stored;
    field.addEventListener('input', () => {
      try { localStorage.setItem(QUESTION_PREFIX + key, field.value); } catch (err) { }
    });
  });

  renderPauseList();
}

function hydrateNotes() {
  if (!notesEl) return;
  notesEl.innerHTML = localStorage.getItem(NOTES_KEY) || '';
  notesEl.addEventListener('input', persistNotes);
}

function persistNotes() {
  if (!notesEl) return;
  try { localStorage.setItem(NOTES_KEY, notesEl.innerHTML); } catch (err) { }
}

function downloadNotes() {
  const questions = {};
  questionFields.forEach(field => {
    questions[field.dataset.questionKey] = field.value;
  });
  const payload = {
    version: 1,
    classNumber: classConfig.classNumber,
    notesHtml: notesEl?.innerHTML || '',
    questions
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `class${classId}-notes.json`;
  a.click();
  URL.revokeObjectURL(url);
  flashStatus(`Downloaded notes file (class${classId}-notes.json).`);
}

function importNotes(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result || '';
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        if (parsed.notesHtml && notesEl) notesEl.innerHTML = parsed.notesHtml;
        if (parsed.questions && typeof parsed.questions === 'object') {
          questionFields.forEach(field => {
            const val = parsed.questions[field.dataset.questionKey];
            if (typeof val === 'string') field.value = val;
          });
        }
        persistNotes();
        questionFields.forEach(field => {
          try { localStorage.setItem(QUESTION_PREFIX + field.dataset.questionKey, field.value); } catch (err) { }
        });
        flashStatus('Imported notes and outline fields.');
        event.target.value = '';
        return;
      }
    } catch (err) {
      // fall through to treat as raw HTML
    }

    if (notesEl) notesEl.innerHTML = text;
    persistNotes();
    flashStatus('Imported notes (rich text).');
    event.target.value = '';
  };
  reader.readAsText(file);
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateControlVisibility() {
  const controlsBar = document.querySelector('.controls-bar');
  if (!controlsBar) return;

  // Get all control elements
  const allControls = controlsBar.querySelectorAll('[data-control-type]');

  allControls.forEach(control => {
    const controlType = control.getAttribute('data-control-type');

    // Always show 'all' type controls (clear screen)
    if (controlType === 'all') {
      control.style.display = '';
      return;
    }

    // Show controls that match current media type
    if (controlType === currentMediaType) {
      control.style.display = '';
    } else {
      control.style.display = 'none';
    }
  });
}

// ===== STOPPED HERE MARKER =====

/**
 * Add stopped-here markers to editor lines with line numbers
 */
function addStoppedMarkersToEditorContent(container) {
  const lineCandidates = Array.from(container.childNodes).filter((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = /** @type {HTMLElement} */ (node);
    return !!el.textContent?.trim();
  });

  let headingIndex = 0;

  lineCandidates.forEach((lineElement, index) => {
    const lineId = `editor-line-${index + 1}`;
    const isHeading = /^H[1-6]$/.test(lineElement.tagName);
    const legacyHeadingId = isHeading ? `editor-heading-${headingIndex}` : null;
    if (isHeading) headingIndex += 1;

    const isLegacyMatch = !!legacyHeadingId && classConfig.stoppedAtEditorHeading === legacyHeadingId;
    const isStoppedHere = classConfig.stoppedAtEditorLine === lineId || isLegacyMatch;

    const wrapper = document.createElement('div');
    wrapper.className = `editor-line-row${isStoppedHere ? ' stopped-here' : ''}`;
    wrapper.setAttribute('data-line-id', lineId);

    const markerBtn = document.createElement('button');
    markerBtn.className = `stop-marker-btn editor-line-marker${isStoppedHere ? ' active' : ''}`;
    markerBtn.setAttribute('type', 'button');
    markerBtn.setAttribute('aria-label', isStoppedHere ? `Remove stop marker from line ${index + 1}` : `Set stop marker at line ${index + 1}`);
    markerBtn.title = isStoppedHere ? 'Click to remove marker' : 'Mark where you stopped';
    markerBtn.innerHTML = `<span class="line-number-text">${index + 1}</span>`;
    markerBtn.onclick = (e) => {
      e.stopPropagation();
      if (classConfig.stoppedAtEditorLine === lineId) {
        setStoppedMarkerEditorLine(null);
      } else {
        setStoppedMarkerEditorLine(lineId);
      }
    };

    const parent = lineElement.parentNode;
    if (!parent) return;
    parent.insertBefore(wrapper, lineElement);
    wrapper.appendChild(markerBtn);
    wrapper.appendChild(lineElement);
    lineElement.classList.add('editor-line-content');
  });
}

/**
 * Set the "stopped here" marker on an editor line
 * @param {string|null} lineId - Line ID to mark, or null to clear
 */
async function setStoppedMarkerEditorLine(lineId) {
  classConfig.stoppedAtSection = null;
  classConfig.stoppedAtEditorHeading = null;
  classConfig.stoppedAtEditorLine = lineId;

  if (allClassesData && allClassesData.classes) {
    const classIndex = allClassesData.classes.findIndex(c =>
      c.id === classConfig.id || c.classNumber === classConfig.classNumber
    );
    if (classIndex !== -1) {
      allClassesData.classes[classIndex].stoppedAtSection = null;
      allClassesData.classes[classIndex].stoppedAtEditorHeading = null;
      allClassesData.classes[classIndex].stoppedAtEditorLine = lineId;
    } else {
      console.warn('Could not find class in allClassesData to update marker');
    }
  } else {
    console.warn('allClassesData or allClassesData.classes not available for marker update');
  }

  const cloudWarning = await saveStoppedMarker();

  // Re-render both views to update UI (even if save failed, show local state)
  renderOutlineWithQuestions();
  renderGeneratedOutline();

  // Show feedback
  if (cloudWarning) {
    flashStatus(`Warning: ${cloudWarning}`);
  } else if (lineId) {
    flashStatus('Marked where you stopped');
  } else {
    flashStatus('Marker removed');
  }
}

/**
 * Set the "stopped here" marker on an editor heading
 * @param {string|null} headingId - Heading ID to mark, or null to clear
 */
async function setStoppedMarkerEditor(headingId) {
  // Clear any outline section marker (only one marker per class)
  classConfig.stoppedAtSection = null;
  classConfig.stoppedAtEditorHeading = headingId;
  classConfig.stoppedAtEditorLine = null;

  // Update the allClassesData
  if (allClassesData && allClassesData.classes) {
    const classIndex = allClassesData.classes.findIndex(c =>
      c.id === classConfig.id || c.classNumber === classConfig.classNumber
    );
    if (classIndex !== -1) {
      allClassesData.classes[classIndex].stoppedAtSection = null;
      allClassesData.classes[classIndex].stoppedAtEditorHeading = headingId;
      allClassesData.classes[classIndex].stoppedAtEditorLine = null;
    } else {
      console.warn('Could not find class in allClassesData to update marker');
    }
  } else {
    console.warn('allClassesData or allClassesData.classes not available for marker update');
  }

  // Save to server
  const cloudWarning = await saveStoppedMarker();

  // Re-render both views to update UI (even if save failed, show local state)
  renderOutlineWithQuestions();
  renderGeneratedOutline();

  // Show feedback
  if (cloudWarning) {
    flashStatus(`Warning: ${cloudWarning}`);
  } else if (headingId) {
    flashStatus('Marked where you stopped');
  } else {
    flashStatus('Marker removed');
  }
}

/**
 * Set the "stopped here" marker on a section
 * @param {string|null} sectionId - Section ID to mark, or null to clear
 */
async function setStoppedMarker(sectionId) {
  // Clear any editor heading marker (only one marker per class)
  classConfig.stoppedAtEditorHeading = null;
  classConfig.stoppedAtEditorLine = null;
  classConfig.stoppedAtSection = sectionId;

  // Update the allClassesData with the new marker
  if (allClassesData && allClassesData.classes) {
    const classIndex = allClassesData.classes.findIndex(c =>
      c.id === classConfig.id || c.classNumber === classConfig.classNumber
    );
    if (classIndex !== -1) {
      allClassesData.classes[classIndex].stoppedAtEditorHeading = null;
      allClassesData.classes[classIndex].stoppedAtEditorLine = null;
      allClassesData.classes[classIndex].stoppedAtSection = sectionId;
    } else {
      console.warn('Could not find class in allClassesData to update marker', {
        classConfigId: classConfig.id,
        classConfigNumber: classConfig.classNumber
      });
    }
  } else {
    console.warn('allClassesData or allClassesData.classes not available for marker update');
  }

  // Save to server
  const cloudWarning = await saveStoppedMarker();

  // Re-render both views to update UI (even if save failed, show local state)
  renderOutlineWithQuestions();
  renderGeneratedOutline();

  // Show feedback
  if (cloudWarning) {
    flashStatus(`Warning: ${cloudWarning}`);
  } else if (sectionId) {
    flashStatus('Marked where you stopped');
  } else {
    flashStatus('Marker removed');
  }
}

/**
 * Save the stopped marker to server
 */
async function saveStoppedMarker() {
  // If allClassesData is not available, can't save
  if (!allClassesData) {
    console.error('Cannot save stopped marker: allClassesData not loaded');
    return 'Data not loaded - please refresh the page';
  }

  try {
    const response = await window.BSTApi.fetch('/api/save/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(allClassesData)
    }, { requireAdmin: true });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Server returned ${response.status}: ${errorText}`);
    }

    const result = await response.json().catch(() => ({}));
    if (result?.partialSuccess || result?.cloudSync?.ok === false || result?.mongoSync === false) {
      return result.warning || result?.cloudSync?.message || 'Cloud sync failed.';
    }

    console.log('[OK] Saved stopped marker');
    return '';
  } catch (err) {
    console.error('Failed to save stopped marker:', err);
    return `Could not save marker: ${err.message || 'check server'}`;
  }
}

function sanitizeRichTextHtml(html) {
  if (typeof html !== 'string' || !html.trim()) {
    return '';
  }

  const allowedTags = new Set([
    'a', 'blockquote', 'br', 'code', 'details', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'hr', 'iframe', 'img', 'li', 'mark', 'ol', 'p', 'pre', 'span', 'strong', 'sub', 'summary',
    'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul'
  ]);
  const allowedAttributes = new Set([
    'alt', 'aria-hidden', 'class', 'colspan', 'data-section-id', 'data-verse', 'href', 'rel', 'rowspan',
    'src', 'style', 'target', 'title', 'data-media-json'
  ]);
  const allowedStyleProperties = new Set(['background-color', 'color', 'text-align']);
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  const wrapper = document.createElement('div');

  Array.from(doc.body.childNodes).forEach((child) => {
    const sanitizedNode = sanitizeRichTextNode(child, {
      allowedTags,
      allowedAttributes,
      allowedStyleProperties
    });
    if (sanitizedNode) {
      wrapper.appendChild(sanitizedNode);
    }
  });

  return wrapper.innerHTML;
}

function sanitizeRichTextNode(node, config) {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent || '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const tagName = node.tagName.toLowerCase();
  const fragment = document.createDocumentFragment();

  if (!config.allowedTags.has(tagName)) {
    Array.from(node.childNodes).forEach((child) => {
      const sanitizedChild = sanitizeRichTextNode(child, config);
      if (sanitizedChild) {
        fragment.appendChild(sanitizedChild);
      }
    });
    return fragment;
  }

  const cleanElement = document.createElement(tagName);

  Array.from(node.attributes).forEach((attribute) => {
    const attrName = attribute.name.toLowerCase();
    if (attrName.startsWith('on') || !config.allowedAttributes.has(attrName)) {
      return;
    }

    if (attrName === 'href' || attrName === 'src') {
      const safeUrl = sanitizeTeacherUrl(attribute.value);
      if (!safeUrl) {
        return;
      }
      cleanElement.setAttribute(attrName, safeUrl);
      if (tagName === 'a') {
        cleanElement.setAttribute('rel', 'noopener noreferrer');
      }
      return;
    }

    if (attrName === 'style') {
      const safeStyle = sanitizeInlineStyle(attribute.value, config.allowedStyleProperties);
      if (safeStyle) {
        cleanElement.setAttribute('style', safeStyle);
      }
      return;
    }

    if (attrName === 'class') {
      const safeClasses = attribute.value
        .split(/\s+/)
        .filter(token => /^[a-zA-Z0-9_-]+$/.test(token));
      if (safeClasses.length > 0) {
        cleanElement.setAttribute('class', safeClasses.join(' '));
      }
      return;
    }

    cleanElement.setAttribute(attrName, attribute.value);
  });

  Array.from(node.childNodes).forEach((child) => {
    const sanitizedChild = sanitizeRichTextNode(child, config);
    if (sanitizedChild) {
      cleanElement.appendChild(sanitizedChild);
    }
  });

  return cleanElement;
}

function sanitizeTeacherUrl(url) {
  if (typeof url !== 'string') {
    return '';
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('bst-media:')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch (err) {
    // Ignore parse failures and fall back to local-path validation.
  }

  return trimmed.startsWith('/') || trimmed.startsWith('assets/') || trimmed.startsWith('./') || trimmed.startsWith('../')
    ? trimmed
    : '';
}

function sanitizeInlineStyle(styleValue, allowedProperties) {
  if (typeof styleValue !== 'string') {
    return '';
  }

  return styleValue
    .split(';')
    .map(rule => rule.trim())
    .filter(Boolean)
    .map((rule) => {
      const [property, ...valueParts] = rule.split(':');
      const normalizedProperty = property?.trim().toLowerCase();
      const normalizedValue = valueParts.join(':').trim();

      if (!allowedProperties.has(normalizedProperty)) {
        return '';
      }

      if (!/^[#(),.%\-\w\s]+$/.test(normalizedValue)) {
        return '';
      }

      return `${normalizedProperty}: ${normalizedValue}`;
    })
    .filter(Boolean)
    .join('; ');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadClassConfig);
} else {
  loadClassConfig();
}
