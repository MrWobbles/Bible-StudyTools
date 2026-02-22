// Teacher view script - classConfig and classId are declared in loader.js
// Initialize teacher-specific variables
let VIDEO_ID = '';
let pausePoints = [];
let CHANNEL_KEY = 'class-control';
let STORAGE_FALLBACK_KEY = 'class-control-storage';
let NOTES_KEY = 'class-teacher-notes';
let QUESTION_PREFIX = 'class-question-';

let channel = null;
let statusEl = null;
let pauseListEl = null;
let notesEl = null;
let downloadBtn = null;
let uploadBtn = null;
let fileInput = null;
let questionFields = [];

async function loadClassConfig() {
  try {
    const response = await fetch('assets/data/classes.json');
    const raw = await response.json();

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
  document.title = `Presenter View — ${classConfig.title} · Class ${classConfig.classNumber}`;

  statusEl = document.getElementById('status');
  pauseListEl = document.getElementById('pause-list');
  notesEl = document.getElementById('notes');
  downloadBtn = document.getElementById('download-notes');
  uploadBtn = document.getElementById('upload-notes');
  fileInput = document.getElementById('notes-file');

  const h1 = document.querySelector('h1');
  if (h1) h1.textContent = `Presenter View · ${classConfig.title}`;

  const subtitle = document.querySelector('.subtitle');
  if (subtitle) subtitle.textContent = `Class ${classConfig.classNumber} · Keep this on your laptop while casting the main screen.`;

  const guideTitle = document.querySelector('h3');
  if (guideTitle) guideTitle.textContent = `Class ${classConfig.classNumber} guide with notes`;

  renderOutlineWithQuestions();

  // Render media gallery
  renderMediaGallery();

  channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_KEY) : null;

  bindControls();
  hydrateNotes();

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
    const detailsEl = document.createElement('details');
    detailsEl.className = `accordion${isOpen}`;

    const summaryEl = document.createElement('summary');
    summaryEl.textContent = section.summary;
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
      jumpBtn.textContent = 'Jump here';
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
          verse: '📖',
          question: '❓',
          example: '💡',
          note: '📝',
          heading: '',
          point: '•'
        };
        
        const icon = icons[pointType] || '•';
        if (pointType === 'heading') {
          pointDiv.innerHTML = `<strong>${pointText}</strong>`;
        } else {
          pointDiv.innerHTML = `<span class="point-icon">${icon}</span><span class="point-text">${pointText}</span>`;
        }
        
        pointsContainer.appendChild(pointDiv);
      });
      
      detailsEl.appendChild(pointsContainer);
    }

    // Questions with answer fields + notes
    if (section.questions && section.questions.length > 0) {
      section.questions.forEach(q => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question';

        const promptP = document.createElement('p');
        promptP.textContent = q.prompt;
        questionDiv.appendChild(promptP);

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
  if (!classConfig.media || classConfig.media.length === 0) return;

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

  // Combine class-level media with section media
  const allMedia = [...classConfig.media, ...allSectionMedia];

  // Find the control panel container
  const controlPanel = document.querySelector('section.card.sticky');
  if (!controlPanel) return;

  // Ensure media panel exists after the control panel (right column)
  let mediaPanel = document.getElementById('media-panel');
  if (!mediaPanel) {
    mediaPanel = document.createElement('section');
    mediaPanel.className = 'card';
    mediaPanel.id = 'media-panel';
    mediaPanel.style.marginTop = '14px';
    // Insert after controlPanel to keep controls on top and materials below
    if (controlPanel.parentNode) {
      controlPanel.parentNode.insertBefore(mediaPanel, controlPanel.nextSibling);
    }
  }

  // Render a compact vertical list of class materials
  const mediaHTML = `
    <div class="tag">Media resources</div>
    <h3 style="margin: 10px 0 12px;">Class materials</h3>
    <div class="materials-list">
      ${allMedia.map((media, idx) => {
        const sectionLabel = media.sectionTitle ? `<div style="font-size:10px; color:var(--muted); margin-top:2px;">${media.sectionTitle}</div>` : '';
        const url = media.url || (media.sources && media.sources[0] && (media.sources[0].url || media.sources[0].path)) || '#';
        
        return `
          <div class="list-item" title="${media.title || media.type}">
            <div style="display:flex; gap:10px; align-items:center;">
              <span class="material-symbols-outlined" style="font-size:20px;">${getMediaIcon(media.type)}</span>
              <div style="min-width:0;">
                <div style="font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${media.title || media.type}</div>
                <div style="font-size:12px; color:var(--muted)">${media.type}${media.primary ? ' (primary)' : ''}</div>
                ${sectionLabel}
              </div>
            </div>
            <div style="display:flex; gap:8px;">
              ${media.type === 'link' 
                ? `<a href="${url}" target="_blank" rel="noopener"><button>Open</button></a>` 
                : `<button onclick="sendMediaToStudent(${idx})">Show</button>`}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  mediaPanel.innerHTML = mediaHTML;
  
  // Store media list for sendMediaToStudent function
  window.teacherMediaList = allMedia;
}

function getMediaIcon(type) {
  const icons = {
    video: 'videocam',
    pdf: 'description',
    images: 'image',
    audio: 'audio_file',
    document: 'assignment',
    link: 'link',
    presentation: 'bar_chart'
  };
  return icons[type] || 'folder';
}

function sendMediaToStudent(index) {
  if (!window.teacherMediaList || index >= window.teacherMediaList.length) {
    console.error('[Teacher] Invalid media index:', index);
    return;
  }
  
  const media = window.teacherMediaList[index];
  console.log('[Teacher] Sending media to student:', media);
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
    btn.textContent = 'Jump here';
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadClassConfig);
} else {
  loadClassConfig();
}
