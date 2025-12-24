const config = window.BIBLE_STUDY_CONFIG || {};
const VIDEO_ID = config.videoId || '';
const pausePoints = Array.isArray(config.pausePoints) ? config.pausePoints : [];
const CHANNEL_KEY = config.channelName || 'class1-control';
const STORAGE_FALLBACK_KEY = `${CHANNEL_KEY}-storage`;
const NOTES_KEY = 'class1-teacher-notes';
const QUESTION_PREFIX = 'class1-question-';

const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_KEY) : null;
const statusEl = document.getElementById('status');
const pauseListEl = document.getElementById('pause-list');
const notesEl = document.getElementById('notes');
const downloadBtn = document.getElementById('download-notes');
const uploadBtn = document.getElementById('upload-notes');
const fileInput = document.getElementById('notes-file');
const questionFields = Array.from(document.querySelectorAll('textarea[data-question-key]'));

function sendCommand(type, payload = {}) {
  const message = { type, ...payload, sentAt: Date.now() };
  if (channel) channel.postMessage(message);
  try { localStorage.setItem(STORAGE_FALLBACK_KEY, JSON.stringify(message)); } catch (err) { }
  flashStatus(`Sent: ${labelFor(type, payload)}`);
}

function labelFor(type, payload) {
  if (type === 'jumpToPause' && Number.isInteger(payload.index)) {
    const point = pausePoints[payload.index];
    return point ? `Jump to ${point.label}` : 'Jump to pause';
  }
  if (type === 'nextPause') return 'Skip to next pause';
  if (type === 'fullscreen') return 'Fullscreen display';
  if (type === 'restart') return 'Restart video';
  if (type === 'toggle') return 'Play / Pause';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function flashStatus(text) {
  statusEl.textContent = text;
}

function renderPauseList() {
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
    item.innerHTML = '<small>No planned pauses yet. Add them in config.js.</small>';
    pauseListEl.appendChild(item);
  }
}

function bindControls() {
  document.getElementById('toggle').onclick = () => sendCommand('toggle');
  document.getElementById('play').onclick = () => sendCommand('play');
  document.getElementById('pause').onclick = () => sendCommand('pause');
  document.getElementById('restart').onclick = () => sendCommand('restart');
  document.getElementById('next').onclick = () => sendCommand('nextPause');
  document.getElementById('fullscreen').onclick = () => sendCommand('fullscreen');
  downloadBtn.onclick = downloadNotes;
  uploadBtn.onclick = () => fileInput.click();
  fileInput.onchange = importNotes;
  document.querySelectorAll('.rte-toolbar button').forEach(btn => {
    btn.onclick = () => {
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.value || null;
      document.execCommand(cmd, false, val);
      notesEl.focus();
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
}

function hydrateNotes() {
  notesEl.innerHTML = localStorage.getItem(NOTES_KEY) || '';
  notesEl.addEventListener('input', persistNotes);
}

function persistNotes() {
  try { localStorage.setItem(NOTES_KEY, notesEl.innerHTML); } catch (err) { }
}

function downloadNotes() {
  const questions = {};
  questionFields.forEach(field => {
    questions[field.dataset.questionKey] = field.value;
  });
  const payload = {
    version: 1,
    notesHtml: notesEl.innerHTML || '',
    questions
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'class1-notes.json';
  a.click();
  URL.revokeObjectURL(url);
  flashStatus('Downloaded notes file (class1-notes.json).');
}

function importNotes(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result || '';
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        if (parsed.notesHtml) notesEl.innerHTML = parsed.notesHtml;
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

    notesEl.innerHTML = text;
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

renderPauseList();
bindControls();
hydrateNotes();
flashStatus('Ready. Open the display page on the TV (index.html).');
