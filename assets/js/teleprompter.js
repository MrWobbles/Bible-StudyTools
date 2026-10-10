// Teleprompter view with speech recognition
// Uses Web Speech API to listen to the teacher and auto-advance through outline

let classConfig = {};
let classId = '';
let currentSectionIndex = 0;
let currentPointIndex = 0;
let allOutlinePoints = []; // Flat array of all points with metadata
let isListening = false;
let userInitiatedStop = false; // Track if user explicitly stopped, vs error/restart
let listeningTimeout = null;
let recognitionInstance = null;
let speechRecognitionSetup = false;
let spokenWords = []; // Track words that have been spoken
let networkErrorCount = 0; // Track consecutive network errors
const MAX_NETWORK_RETRIES = 3; // Stop retrying after this many network errors
const DEBUG = true; // Always on - helps users report issues

// Best practice: Track confidence streaks and freezing
let consecutiveHighConfidenceMatches = 0; // For freeze/resume logic
let isTrackingFrozen = false; // Freeze when confidence drops
let lastAutoAdvanceTime = 0;
let targetScrollPosition = 0; // For smooth Lerp scrolling
let currentScrollPosition = 0;
let scrollAnimationId = null;

// Constant-speed scroll mode (default mode)
let scrollVelocity = 23; // pixels per second
let isScrolling = false; // Paused vs playing; user starts it with Play
let isProgrammaticScroll = false; // True while a point-jump animation owns scrollTop
let scrollRemainder = 0; // Sub-pixel carry so slow speeds still move
let lastScrollTime = Date.now();
let scrollLoopId = null;

// View mode state
let viewMode = 'word'; // 'word' or 'scroll'
let scrollUpdateId = null;

// Error tracking for diagnostics
const errorLog = {
  errors: [],
  warnings: [],
  startTime: Date.now(),

  addError(message, context = {}) {
    const entry = {
      timestamp: Date.now(),
      timeElapsed: Date.now() - this.startTime,
      message,
      context,
      type: 'error'
    };
    this.errors.push(entry);
    debug(`❌ ERROR: ${message}`, context);
  },

  addWarning(message, context = {}) {
    const entry = {
      timestamp: Date.now(),
      timeElapsed: Date.now() - this.startTime,
      message,
      context,
      type: 'warning'
    };
    this.warnings.push(entry);
    debug(`⚠️ WARNING: ${message}`, context);
  },

  getReport() {
    return {
      uptime: Date.now() - this.startTime,
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      errors: this.errors,
      warnings: this.warnings
    };
  }
};

// Speech Recognition Setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  alert('Web Speech API is not supported in this browser. Please use Chrome, Edge, or another Chromium-based browser.');
}

// Configuration
const CONFIG = {
  language: 'en-US',
  continuous: true,
  interimResults: true,
  matchThreshold: 0.6, // Minimum similarity score to advance (0-1)
  autoAdvanceDelay: 500, // ms before auto-advancing
  confidenceThreshold: 0.3, // Minimum confidence for recognized speech
  maxUpcomingPoints: 3, // How many upcoming points to show

  // New best-practice settings
  SMOOTH_SCROLL_DURATION: 400, // ms for Lerp/smooth scrolling
  SLIDING_WINDOW_SIZE: 5, // Look at current ± 5 points
  AUTO_ADVANCE_THRESHOLD: 0.50, // 50% of words needed
  MIN_MATCHED_WORDS: 2, // Require at least 2 words
  CONFIDENCE_STREAK: 3, // Require 3 consecutive high-confidence matches before tracking resumes
  REWIND_THRESHOLD: 0.8, // If match score is high but below current, trigger rewind
  LOW_CONFIDENCE_FREEZE: true // Freeze display when confidence drops below threshold
};

// Initialize when page loads
async function initializePage() {
  try {
    debug('🚀 Initializing teleprompter...');

    classId = new URLSearchParams(window.location.search).get('class') || '1';
    debug(`📚 Class ID from URL: ${classId}`);

    // Check if BSTApi is available
    if (!window.BSTApi) {
      throw new Error('BSTApi not loaded - make sure api.js is included');
    }

    debug('🔄 Fetching classes from API...');
    const raw = await window.BSTApi.getClasses();

    if (!raw) {
      errorLog.addError('API returned null response');
      throw new Error('API returned null - check network and server');
    }

    debug(`✓ API response received: ${typeof raw}`);

    const classesArr = Array.isArray(raw) ? raw : Array.isArray(raw?.classes) ? raw.classes : [raw];
    debug(`✓ Found ${classesArr.length} class(es)`);

    classConfig = classesArr.find(c => c.classNumber?.toString() === classId || c.id === classId) || classesArr[0] || {};

    if (!classConfig || !classConfig.title) {
      errorLog.addWarning('Class config incomplete', { classId, config: classConfig });
      classConfig = classConfig || { title: 'Unknown Class', content: { html: '' } };
    }

    document.title = `Teleprompter — ${classConfig.title}`;
    debug(`✓ Loaded class: "${classConfig.title}"`);

    buildEditorNotesIndex();
    debug(`✓ Built notes index: ${allOutlinePoints.length} points`);

    renderInitialContent();
    debug(`✓ Rendered initial content`);

    setupControls();
    debug(`✓ Controls initialized`);

    debug('✅ Teleprompter initialization complete!');
    showStatusMessage('Ready to go! Click the microphone to start speech recognition.', 3000);
  } catch (err) {
    console.error('Failed to initialize teleprompter:', err);
    errorLog.addError(`Initialization failed: ${err.message}`, { error: err.toString() });

    const content = document.getElementById('teleprompter-content');
    if (content) {
      let errorHtml = `<div style="color: red; padding: 20px; font-family: monospace;">
        <strong>❌ Error loading teleprompter:</strong><br><br>
        ${err.message}<br><br>
        <small style="color: #999;">`;

      if (err.message.includes('BSTApi')) {
        errorHtml += 'Make sure api.js is loaded before teleprompter.js<br>';
      } else if (err.message.includes('API')) {
        errorHtml += 'Check your network connection and that the server is running<br>';
      }

      errorHtml += `Debug: classId=${classId}<br>Browser: ${navigator.userAgent.substring(0, 50)}...</small>
      </div>`;

      content.innerHTML = errorHtml;
    }

    // Show error in status
    showStatusMessage('❌ Failed to load: ' + err.message, 5000);
  }
}

// Build points from editor notes (HTML content)
function buildEditorNotesIndex() {
  try {
    allOutlinePoints = [];

    // Get editor content HTML
    const editorHtml = classConfig.content?.html;
    if (!editorHtml) {
      errorLog.addWarning('No editor content found in classConfig');
      debug('No editor content found - class may not have notes set');
      return;
    }

    debug(`📝 Parsing editor HTML (${editorHtml.length} chars)...`);

    // Parse HTML and extract text chunks
    const parser = new DOMParser();
    let doc;
    try {
      doc = parser.parseFromString(editorHtml, 'text/html');
    } catch (parseErr) {
      errorLog.addError('Failed to parse HTML', { error: parseErr.message });
      throw new Error(`Invalid HTML format: ${parseErr.message}`);
    }

    // Extract headings and paragraphs
    const blocks = [];
    let currentSection = classConfig.title || 'Notes';

    // Iterate through all block-level elements
    const elements = doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, img');
    const seenImages = new Set();
    const pushImage = (img) => {
      if (seenImages.has(img)) return;
      seenImages.add(img);
      const url = safeMediaUrl(img.getAttribute('src'));
      if (!url) return;
      blocks.push({
        text: '',
        type: 'image',
        url,
        title: img.getAttribute('alt') || 'Image',
        sectionTitle: currentSection
      });
    };

    elements.forEach((el) => {
      const tagName = el.tagName.toLowerCase();

      // A paragraph inside a list item is already covered by the li
      if (tagName === 'p' && el.closest('li')) {
        el.querySelectorAll('img').forEach(pushImage);
        return;
      }

      if (tagName === 'img') {
        pushImage(el);
        return;
      }

      const clone = el.cloneNode(true);
      clone.querySelectorAll('ul, ol').forEach(n => n.remove());
      const text = clone.textContent?.trim();
      if (text) {
        // Update section title on headings
        if (tagName.startsWith('h')) {
          currentSection = text;
          blocks.push({
            text: text,
            html: buildLineHtml(el),
            type: 'heading',
            sectionTitle: currentSection
          });
        } else if (tagName === 'p' || tagName === 'li') {
          blocks.push({
            text: text,
            html: buildLineHtml(el),
            verse: Array.from(el.querySelectorAll('a')).map(getVerseRef).find(Boolean) || '',
            media: Array.from(el.querySelectorAll('a')).map(decodeTileMedia).find(Boolean) || null,
            type: tagName === 'li' ? 'bullet' : 'paragraph',
            sectionTitle: currentSection
          });
        }
      }

      // Images nested in a text block follow it in reading order
      el.querySelectorAll('img').forEach(pushImage);
    });

    // If no blocks found, try splitting by sentences
    if (blocks.length === 0 && editorHtml) {
      const plainText = doc.body.textContent || '';
      const sentences = plainText
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      sentences.forEach((sentence) => {
        blocks.push({
          text: sentence,
          type: 'sentence',
          sectionTitle: currentSection
        });
      });
    }

    // Convert blocks to indexed points
    allOutlinePoints = blocks.map((block, idx) => ({
      index: idx,
      text: block.text,
      html: block.html,
      verse: block.verse,
      media: block.media,
      url: block.url,
      title: block.title,
      type: block.type,
      sectionTitle: block.sectionTitle,
      fullPoint: block
    }));

    debug(`✓ Parsed ${allOutlinePoints.length} points from editor notes`);

    if (allOutlinePoints.length === 0) {
      errorLog.addWarning('No text content found in editor HTML');
    }
  } catch (err) {
    errorLog.addError(`Failed to build notes index: ${err.message}`);
    console.error('buildEditorNotesIndex error:', err);
    throw err;
  }
}

// Render initial content
function renderInitialContent() {
  updateCurrentPointDisplay();
}

// Update the display based on current indices
function updateCurrentPointDisplay() {
  if (allOutlinePoints.length === 0) {
    document.getElementById('current-section-title').textContent = 'No content found';
    document.getElementById('script-flow').innerHTML = '<div class="point-text">Load some editor notes to get started.</div>';
    return;
  }

  renderScriptFlow();

  // Clamp indices to valid range
  if (currentPointIndex >= allOutlinePoints.length) {
    currentPointIndex = allOutlinePoints.length - 1;
  }
  if (currentPointIndex < 0) {
    currentPointIndex = 0;
  }

  const currentPoint = allOutlinePoints[currentPointIndex];

  // Update section title
  document.getElementById('current-section-title').textContent = currentPoint.sectionTitle || 'Content';

  // Highlight the current line
  document.querySelectorAll('#script-flow .teleprompter__line.current').forEach(el => el.classList.remove('current'));
  const currentPointEl = document.querySelector(`#script-flow [data-point-index="${currentPointIndex}"]`);
  if (currentPointEl) currentPointEl.classList.add('current');

  // Update progress
  document.getElementById('progress-display').textContent =
    `${currentPointIndex + 1} / ${allOutlinePoints.length}`;

  // Reset spoken words for new point
  spokenWords = [];

}

// Render every point once into one continuous scrollable script
function renderScriptFlow() {
  const flow = document.getElementById('script-flow');
  if (flow.dataset.rendered === String(allOutlinePoints.length)) return;

  flow.innerHTML = allOutlinePoints.map((point, idx) => {
    if (point.type === 'image') {
      return `<figure class="teleprompter__line teleprompter__line--image" data-point-index="${idx}" style="background:red;height:1px;left:-100px;width:calc(100% + 100px);"><img src="${escapeAttr(point.url)}" alt="${escapeAttr(point.title)}"></figure>`;
    }
    const tag = point.type === 'heading' ? 'h2' : 'div';
    return `<${tag} class="teleprompter__line teleprompter__line--${point.type}" data-point-index="${idx}">${point.html ?? wrapWordsInSpans(point.text)}</${tag}>`;
  }).join('');
  flow.dataset.rendered = String(allOutlinePoints.length);
}

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Only allow http(s), same-site paths and inline images
function safeMediaUrl(raw) {
  const value = (raw || '').trim();
  if (!value) return '';
  if (/^data:image\//i.test(value)) return value;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch (err) {
    return '';
  }
  return '';
}

// Older saved notes lost data-verse, so a bare "#" link falls back to its text
function getVerseRef(a) {
  const explicit = a.dataset?.verse?.trim();
  if (explicit) return explicit;
  const href = (a.getAttribute('href') || '').trim();
  const text = a.textContent.trim();
  if ((href === '' || href === '#') && /^[1-3]?\s?[A-Za-z]+\.?\s+\d+/.test(text)) return text;
  return '';
}

// Editor media tiles carry the full media object in a bst-media: href
function decodeTileMedia(a) {
  const href = (a.getAttribute('href') || '').trim();
  if (!href.startsWith('bst-media:')) return null;
  try {
    const media = JSON.parse(decodeURIComponent(href.slice('bst-media:'.length)));
    return media && typeof media === 'object' ? media : null;
  } catch (err) {
    return null;
  }
}

// Build a line's HTML, keeping links clickable and word-wrapping text
function buildLineHtml(node) {
  return Array.from(node.childNodes).map((child) => {
    if (child.nodeType === Node.TEXT_NODE) return wrapWordsInSpans(child.textContent);
    if (child.nodeType !== Node.ELEMENT_NODE || child.tagName === 'IMG') return '';
    // Nested list items are emitted as their own lines
    if (child.tagName === 'UL' || child.tagName === 'OL') return '';
    const inner = buildLineHtml(child);
    if (child.tagName === 'A') {
      const tileMedia = decodeTileMedia(child);
      if (tileMedia) {
        const label = tileMedia.title || tileMedia.reference || tileMedia.type || 'Media';
        return `<a class="teleprompter__link teleprompter__link--tile" href="#" data-media="${escapeAttr(encodeURIComponent(JSON.stringify(tileMedia)))}">${wrapWordsInSpans(label)}</a>`;
      }
      const verse = getVerseRef(child);
      if (verse) {
        return `<a class="teleprompter__link teleprompter__link--verse" href="#" data-verse="${escapeAttr(verse)}">${inner}</a>`;
      }
      const url = safeMediaUrl(child.getAttribute('href'));
      if (!url) return inner;
      return `<a class="teleprompter__link" href="${escapeAttr(url)}" data-url="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
    }
    return inner;
  }).join('');
}

// Display channel shared with student.html
let displayChannel = null;
let shownMediaId = null;

function getDisplayChannelKey() {
  return classConfig.channelName || `class${classId}-control`;
}

function sendDisplayMessage(message) {
  const payload = { ...message, sentAt: Date.now() };
  if (!displayChannel) {
    if (window.bst?.createBroadcastChannel) {
      displayChannel = window.bst.createBroadcastChannel(getDisplayChannelKey());
    } else if ('BroadcastChannel' in window) {
      displayChannel = new BroadcastChannel(getDisplayChannelKey());
    }
  }
  if (displayChannel) displayChannel.postMessage(payload);
  try { localStorage.setItem(`${getDisplayChannelKey()}-storage`, JSON.stringify(payload)); } catch (err) { }
}

function showImageOnDisplay(point) {
  sendDisplayMessage({
    type: 'displayMedia',
    media: { type: 'image', title: point.title || 'Image', url: point.url, sources: [{ url: point.url }], fullscreen: true }
  });
}

function showVerseOnDisplay(reference, translationOverride) {
  let translation = translationOverride || 'nkjv';
  if (!translationOverride) {
    try { translation = localStorage.getItem('bible-translation-preference') || 'nkjv'; } catch (err) { }
  }
  sendDisplayMessage({
    type: 'displayMedia',
    media: { type: 'verse', reference, translation, title: reference, fullscreen: true }
  });
}

function showMediaOnDisplay(media) {
  if (media.type === 'verse') {
    showVerseOnDisplay(media.reference || media.title || '', media.translation);
    return;
  }
  const type = media.type === 'images' ? 'image' : media.type;
  sendDisplayMessage({
    type: 'displayMedia',
    media: { ...media, type, fullscreen: type === 'image' }
  });
}

function showLinkOnDisplay(url) {
  const lower = url.toLowerCase();
  let type = 'link';
  if (lower.includes('youtube.com') || lower.includes('youtu.be') || /\.(mp4|webm|ogg)(\?|$)/.test(lower)) type = 'video';
  else if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/.test(lower)) type = 'image';
  sendDisplayMessage({
    type: 'displayMedia',
    media: { type, title: 'Link', url, sources: [{ url }], fullscreen: type === 'image' }
  });
}

function clearDisplay() {
  shownMediaId = null;
  sendDisplayMessage({ type: 'clearScreen' });
}

// Images show when reached; a verse shows once the line before it is current
function triggerMediaForIndex(index) {
  let active = null;
  const last = Math.min(index + 1, allOutlinePoints.length - 1);
  for (let i = 0; i <= last; i++) {
    const point = allOutlinePoints[i];
    if (point.type === 'image' && i <= index) {
      active = { id: `image-${i}`, show: () => showImageOnDisplay(point) };
    } else if (point.media && Math.max(0, i - 1) <= index) {
      active = { id: `media-${i}`, show: () => showMediaOnDisplay(point.media) };
    } else if (point.verse && Math.max(0, i - 1) <= index) {
      active = { id: `verse-${i}`, show: () => showVerseOnDisplay(point.verse) };
    }
  }

  const activeId = active ? active.id : null;
  if (activeId === shownMediaId) return;
  const hadMedia = shownMediaId !== null;
  shownMediaId = activeId;
  if (active) active.show();
  else if (hadMedia) sendDisplayMessage({ type: 'clearScreen' });
}

// Keep the current index in sync with the line at the reading position while scrolling
function syncCurrentPointToScroll(container) {
  const readingLine = container.getBoundingClientRect().top + container.clientHeight * 0.30;
  const lines = document.querySelectorAll('#script-flow .teleprompter__line');
  let found = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].getBoundingClientRect().top <= readingLine) found = i;
    else break;
  }
  if (found !== currentPointIndex) {
    currentPointIndex = found;
    updateCurrentPointDisplay();
    triggerMediaForIndex(found);
  }
}

// Wrap each word in a span for highlighting
function wrapWordsInSpans(text) {
  const words = text.split(/(\s+)/); // Split while keeping whitespace
  return words.map((word, idx) => {
    // Keep whitespace as-is
    if (/^\s+$/.test(word)) {
      return word;
    }
    // Wrap actual words in spans with data-word attribute
    const sanitizedWord = word.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<span class="teleprompter__word" data-word-idx="${idx}">${sanitizedWord}</span>`;
  }).join('');
}

// Mark words as read based on spoken transcript
function markWordsAsRead(transcript) {
  if (!transcript || transcript.trim().length === 0) return;

  // Get the current point text
  const currentPoint = allOutlinePoints[currentPointIndex];
  if (!currentPoint) return;

  // Split transcript into words and normalize
  const transcriptWords = transcript.toLowerCase().split(/\s+/).filter(w => w.length > 0);

  // Get all word spans
  const wordSpans = document.querySelectorAll('#script-flow .teleprompter__line.current .teleprompter__word');
  if (wordSpans.length === 0) return;

  // Build current point text words (normalized)
  const pointWords = currentPoint.text.toLowerCase().split(/(\s+)/).filter(w => w.length > 0 && !/^\s+$/.test(w));

  // Track which point words have been covered
  let pointWordIdx = 0;

  transcriptWords.forEach(transcriptWord => {
    // Find matching word in current point
    while (pointWordIdx < pointWords.length) {
      const pointWord = pointWords[pointWordIdx];

      // Check if words are similar (handle punctuation, partial matches)
      const stripped = pointWord.replace(/[^\w]/g, '');
      if (stripped.startsWith(transcriptWord) || transcriptWord.startsWith(stripped)) {
        // Mark this word as read
        wordSpans.forEach(span => {
          const spanText = span.textContent.toLowerCase().replace(/[^\w]/g, '');
          if (spanText === stripped) {
            span.classList.add('read');
          }
        });
        pointWordIdx++;
        break;
      }

      // If no match, move to next point word
      pointWordIdx++;
    }
  });
}

// Helper: Wrap a promise with a timeout
function withTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    )
  ]);
}

// Initialize on-device speech recognition (works offline - no network required)
async function initializeOnDeviceSpeechRecognition() {
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  const LANGUAGE_PACK_INSTALLED_KEY = 'bst_on_device_speech_installed';

  if (!SpeechRecognitionAPI) {
    debug('⚠️ Speech Recognition API not available in this browser');
    return;
  }

  // Check if language pack has been previously installed
  if (localStorage.getItem(LANGUAGE_PACK_INSTALLED_KEY) === 'true') {
    debug('✅ On-device language pack cached - using offline mode');
    window.onDeviceSpeechAvailable = true;
    return;
  }

  // Check if on-device speech recognition is supported
  try {
    if (!SpeechRecognitionAPI.available) {
      debug('ℹ️ On-device speech recognition not available in this browser');
      debug('ℹ️ Using standard Web Speech API (cloud-based)');
      return;
    }

    debug('🔍 Checking for on-device speech recognition language packs...');

    // Add timeout to prevent hanging
    const availability = await withTimeout(
      SpeechRecognitionAPI.available({
        langs: ['en-US'],
        processLocally: true,
        quality: 'command'
      }),
      5000,
      'On-device availability check timed out'
    );

    if (availability === 'available') {
      debug('✅ On-device speech recognition ready (offline mode)');
      window.onDeviceSpeechAvailable = true;
      localStorage.setItem(LANGUAGE_PACK_INSTALLED_KEY, 'true');
    } else if (availability === 'downloading' || availability === 'downloadable') {
      debug('📥 Downloading on-device speech recognition language pack...');
      showStatusMessage('Downloading speech language pack...', 5000);

      try {
        // Add timeout to prevent hanging during install
        const installed = await withTimeout(
          SpeechRecognitionAPI.install({
            langs: ['en-US'],
            processLocally: true,
            quality: 'command'
          }),
          30000,
          'Language pack installation timed out'
        );

        if (installed) {
          debug('✅ Language pack installed! On-device speech recognition ready.');
          window.onDeviceSpeechAvailable = true;
          localStorage.setItem(LANGUAGE_PACK_INSTALLED_KEY, 'true');
          showStatusMessage('✅ Ready! Speech recognition is offline now.', 3000);
        } else {
          debug('⚠️ Language pack installation failed');
          debug('ℹ️ Will use standard Web Speech API instead');
        }
      } catch (err) {
        debug(`⚠️ Language pack installation failed: ${err.message}`);
        debug('ℹ️ Falling back to standard Web Speech API (cloud-based)');
      }
    } else if (availability === 'unavailable') {
      debug('ℹ️ On-device speech recognition not available');
      debug('ℹ️ Using standard Web Speech API (cloud-based)');
    }
  } catch (err) {
    debug(`ℹ️ On-device speech recognition not supported: ${err.message}`);
    debug('ℹ️ Using standard Web Speech API (cloud-based)');
  }
}

// Setup Web Speech API
function setupSpeechRecognition() {
  if (!SpeechRecognition) return;

  recognitionInstance = new SpeechRecognition();
  recognitionInstance.continuous = CONFIG.continuous;
  recognitionInstance.interimResults = CONFIG.interimResults;
  recognitionInstance.language = CONFIG.language;

  // Use on-device speech recognition if available (works offline)
  if (window.onDeviceSpeechAvailable) {
    recognitionInstance.processLocally = true;
    debug('🎤 Using on-device speech recognition (offline mode)');
  }

  let lastAutoAdvanceTime = 0;

  recognitionInstance.onstart = () => {
    debug('🎤 Speech recognition started');
    // Note: Don't reset error count here - let it accumulate through restart attempts
    updateListeningStatus(true);
  };

  recognitionInstance.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';
    let maxConfidence = 0;

    // Aggregate results
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      const confidence = event.results[i][0].confidence || 0;

      // Track highest confidence
      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
        maxConfidence = Math.max(maxConfidence, confidence);
      } else {
        interimTranscript += transcript;
      }
    }

    const displayText = finalTranscript || interimTranscript;
    const displayConfidence = finalTranscript ? maxConfidence : 0;

    // Display transcript and confidence
    document.getElementById('speech-transcript').textContent = displayText;
    const confDisplay = document.getElementById('current-confidence');
    if (displayConfidence > 0) {
      confDisplay.textContent = `Confidence: ${Math.round(displayConfidence * 100)}%`;
      confDisplay.style.display = 'inline';
    } else {
      confDisplay.style.display = 'none';
    }

    // Mark words as read based on both interim and final transcripts
    const textToMatch = finalTranscript || interimTranscript;
    markWordsAsRead(textToMatch);

    // Only process final, high-confidence results (best practice: proper debouncing)
    if (finalTranscript && displayConfidence >= CONFIG.confidenceThreshold) {
      const now = Date.now();
      const timeSinceLastAdvance = now - lastAutoAdvanceTime;

      // Use sequential word matching with fuzzy matching
      const matchResult = matchWordsSequential(finalTranscript);

      // Check for rewind (user repeating earlier lines)
      const rewindIndex = checkForRewind(finalTranscript);
      if (rewindIndex !== null && displayConfidence > 0.85) {
        // High confidence match in past - they're repeating
        advanceToPoint(rewindIndex);
        debug(`🔄 Rewind: Moving back to point ${rewindIndex}`);
        return;
      }

      // Implement confidence streak: require N consecutive matches before tracking
      if (matchResult.percentage >= CONFIG.AUTO_ADVANCE_THRESHOLD &&
        matchResult.matchedCount >= CONFIG.MIN_MATCHED_WORDS) {
        consecutiveHighConfidenceMatches++;

        if (consecutiveHighConfidenceMatches >= CONFIG.CONFIDENCE_STREAK &&
          timeSinceLastAdvance > CONFIG.autoAdvanceDelay &&
          !isTrackingFrozen) {
          debug(`✅ Match (streak ${consecutiveHighConfidenceMatches}): ${matchResult.matchedCount}/${matchResult.totalWords} (${Math.round(matchResult.percentage * 100)}%) - auto-advancing`);
          advanceToPoint(currentPointIndex + 1);
          lastAutoAdvanceTime = now;
          consecutiveHighConfidenceMatches = 0;
        } else {
          debug(`📊 Progress (streak ${consecutiveHighConfidenceMatches}/${CONFIG.CONFIDENCE_STREAK}): ${matchResult.matchedCount}/${matchResult.totalWords} (${Math.round(matchResult.percentage * 100)}%)`);
        }
      } else {
        // Low confidence match - reset streak and potentially freeze
        consecutiveHighConfidenceMatches = 0;
        if (CONFIG.LOW_CONFIDENCE_FREEZE && displayConfidence < 0.5) {
          isTrackingFrozen = true;
          debug('❄️ FROZEN: Low confidence - waiting for strong match to resume');
          showStatusMessage('⚠️ Low confidence - tracking paused', 2000);
        }
      }
    } else if (finalTranscript) {
      // Final result but low confidence - freeze tracking
      consecutiveHighConfidenceMatches = 0;
      if (CONFIG.LOW_CONFIDENCE_FREEZE) {
        isTrackingFrozen = true;
        debug('❄️ FROZEN: Confidence below threshold');
      }
    }

    debug(`Transcript: "${displayText}" (confidence: ${displayConfidence.toFixed(2)})`);
  };

  recognitionInstance.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    errorLog.addError(`Speech recognition error: ${event.error}`);
    debug(`❌ Error: ${event.error}`);

    // Handle different error types
    if (event.error === 'network') {
      networkErrorCount++;
      if (networkErrorCount >= MAX_NETWORK_RETRIES) {
        debug(`🛑 Network error limit reached (${networkErrorCount} attempts)`);
        showStatusMessage('❌ Network unavailable - cannot reach speech service. Check your internet connection.', 5000);
        isListening = false;
        updateListeningStatus(false);
        errorLog.addError(`Network errors exceeded max retries (${MAX_NETWORK_RETRIES})`);
      } else {
        debug(`🔄 Network error (${networkErrorCount}/${MAX_NETWORK_RETRIES}) - will auto-restart via onend handler`);
        debug('   (Trying to reconnect to speech service...)');
        showStatusMessage(`Network issue - reconnecting... (${networkErrorCount}/${MAX_NETWORK_RETRIES})`, 2000);
      }
    } else if (event.error === 'language-not-supported') {
      debug('⚠️ Language pack not available for on-device recognition, falling back to cloud-based');
      // Fall back to cloud-based if on-device language not supported
      if (recognitionInstance.processLocally) {
        recognitionInstance.processLocally = false;
        showStatusMessage('Switching to cloud-based speech recognition...', 2000);
      }
    } else if (event.error === 'no-speech') {
      debug('⏱️ No speech detected (this is normal if you haven\'t spoken yet)');
    } else if (event.error === 'audio-capture') {
      showStatusMessage('⚠️ No microphone found - check your device settings', 4000);
      errorLog.addError('No audio input device detected');
      isListening = false;
      updateListeningStatus(false);
    } else if (event.error === 'not-allowed') {
      showStatusMessage('⚠️ Microphone permission denied - check your browser settings', 4000);
      errorLog.addError('Microphone permission not granted');
      isListening = false;
      updateListeningStatus(false);
    } else {
      // Other errors
      debug(`⚠️ Speech recognition error: ${event.error}`);
      showStatusMessage(`Error: ${event.error}`, 2000);
    }
  };

  recognitionInstance.onend = () => {
    debug('Speech recognition ended');

    // Only update UI if user explicitly stopped, not for internal restarts
    if (userInitiatedStop) {
      isListening = false;
      networkErrorCount = 0;
      updateListeningStatus(false);
      userInitiatedStop = false;
    } else if (isListening && networkErrorCount < MAX_NETWORK_RETRIES) {
      // Keep trying to restart if still listening and haven't exceeded retry limit
      debug('Restarting speech recognition...');
      setTimeout(() => {
        if (isListening && networkErrorCount < MAX_NETWORK_RETRIES) {
          try {
            recognitionInstance.start();
          } catch (e) {
            debug(`Failed to auto-restart: ${e.message}`);
          }
        }
      }, 500);
    } else if (networkErrorCount >= MAX_NETWORK_RETRIES) {
      // Stop if we've hit the retry limit
      isListening = false;
      updateListeningStatus(false);
      debug('Stopping due to network error limit');
    }
  };
}

// Find the best match for spoken text in upcoming points
function findBestMatch(spokenText, confidence) {
  if (!spokenText || allOutlinePoints.length === 0) return null;

  // Only check points ahead of current (or current)
  let bestMatch = null;
  let bestScore = CONFIG.matchThreshold;

  // Check current and next 5 points for better matching
  const checkRange = Math.min(currentPointIndex + 5, allOutlinePoints.length);
  for (let i = currentPointIndex; i < checkRange; i++) {
    const point = allOutlinePoints[i];
    const score = calculateSimilarity(spokenText.toLowerCase(), point.text.toLowerCase());

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        index: i,
        text: point.text,
        score: score,
        confidence: confidence
      };
    }
  }

  return bestMatch;
}

// Levenshtein distance for fuzzy word matching
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

// Calculate fuzzy match score (0-1) between two words
function fuzzyMatchWords(spokenWord, expectedWord) {
  const s1 = spokenWord.toLowerCase();
  const s2 = expectedWord.toLowerCase();

  // Exact match = perfect score
  if (s1 === s2) return 1;

  // Allow phonetic variations (similar start = higher score)
  if (s1.startsWith(s2.substring(0, 3)) || s2.startsWith(s1.substring(0, 3))) {
    return 0.85;
  }

  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshteinDistance(s1, s2);
  const similarity = 1 - (distance / maxLen);

  // Only return matches with >60% similarity
  return similarity > 0.6 ? similarity : 0;
}

// Smooth scrolling with Lerp (Linear Interpolation) - best practice for pro teleprompters
function smoothScrollToPoint(pointIndex) {
  const pointElement = document.querySelector(`[data-point-index="${pointIndex}"]`);
  if (!pointElement) return;

  const container = document.getElementById('content-area');
  const containerTop = container.getBoundingClientRect().top;
  const targetOffset = container.scrollTop + pointElement.getBoundingClientRect().top - containerTop - (container.clientHeight * 0.30); // Keep at 30% from top
  targetScrollPosition = Math.max(0, targetOffset);
  currentScrollPosition = container.scrollTop;
  isProgrammaticScroll = true;

  // Cancel any existing animation
  if (scrollAnimationId) {
    cancelAnimationFrame(scrollAnimationId);
  }

  // Animate using Lerp over CONFIG.SMOOTH_SCROLL_DURATION ms
  const startTime = Date.now();
  const startPosition = currentScrollPosition;

  function animateScroll() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / CONFIG.SMOOTH_SCROLL_DURATION, 1);

    // Ease-in-out cubic for smooth deceleration
    const easeProgress = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    currentScrollPosition = startPosition + (targetScrollPosition - startPosition) * easeProgress;
    container.scrollTop = currentScrollPosition;

    if (progress < 1) {
      scrollAnimationId = requestAnimationFrame(animateScroll);
    } else {
      container.scrollTop = targetScrollPosition;
      currentScrollPosition = targetScrollPosition;
      isProgrammaticScroll = false;
      scrollRemainder = 0;
    }
  }

  animateScroll();
}

// Sliding window strategy: match against nearby points, not the entire script
function getWindowedPoints(centerIndex, windowSize = CONFIG.SLIDING_WINDOW_SIZE) {
  const start = Math.max(0, centerIndex - 2);
  const end = Math.min(allOutlinePoints.length, centerIndex + windowSize);
  return allOutlinePoints.slice(start, end).map((point, idx) => ({
    ...point,
    windowIndex: start + idx
  }));
}

// Detect rewinds: if user repeats a line they already said, move backward
function checkForRewind(spokenText) {
  if (currentPointIndex === 0) return null; // Can't rewind at start

  // Check if spoken text matches previous points (common rewind/repeat pattern)
  for (let i = Math.max(0, currentPointIndex - 3); i < currentPointIndex; i++) {
    const prevPoint = allOutlinePoints[i];
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'is', 'are', 'was', 'were', 'in', 'at', 'of', 'to', 'for', 'from', 'with', 'by', 'about', 'be', 'have', 'do']);
    const isNumericWord = (w) => /^\d+$/.test(w);

    // Extract key words from previous point
    const prevWords = prevPoint.text
      .split(/\s+/)
      .filter(w => w && w.length > 0)
      .map(w => w.replace(/[^\w]/g, ''))
      .filter(w => !commonWords.has(w.toLowerCase()) && !isNumericWord(w) && w.length > 0);

    // Extract key words from spoken text
    const spokenWords = spokenText
      .split(/\s+/)
      .filter(w => w && w.length > 0)
      .map(w => w.replace(/[^\w]/g, ''))
      .filter(w => !commonWords.has(w.toLowerCase()) && !isNumericWord(w) && w.length > 0);

    if (prevWords.length === 0 || spokenWords.length === 0) continue;

    // Calculate match percentage
    let matchedCount = 0;
    for (const spokenWord of spokenWords) {
      for (const prevWord of prevWords) {
        if (fuzzyMatchWords(spokenWord, prevWord) > 0.7) {
          matchedCount++;
          break;
        }
      }
    }

    const matchPercentage = matchedCount / Math.max(prevWords.length, spokenWords.length);
    if (matchPercentage > CONFIG.REWIND_THRESHOLD) {
      debug(`🔄 REWIND DETECTED: Speaker repeated "${prevPoint.text.substring(0, 40)}..."`);
      return i; // Return index to rewind to
    }
  }

  return null;
}

// Match spoken words sequentially to current point
function matchWordsSequential(spokenText) {
  if (!spokenText || allOutlinePoints.length === 0) return { matchedCount: 0, totalWords: 0, percentage: 0 };

  const currentPoint = allOutlinePoints[currentPointIndex];
  if (!currentPoint) return { matchedCount: 0, totalWords: 0, percentage: 0 };

  // Extract words from point, filtering common words and numbers
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'is', 'are', 'was', 'were', 'in', 'at', 'of', 'to', 'for', 'from', 'with', 'by', 'about', 'be', 'have', 'do']);
  const isNumericWord = (w) => /^\d+$/.test(w); // Skip pure numbers like "60", "2024", etc

  const pointWords = currentPoint.text
    .split(/\s+/)
    .filter(w => w && w.length > 0)
    .map(w => w.replace(/[^\w]/g, '')) // Remove punctuation
    .filter(w => !commonWords.has(w.toLowerCase()) && !isNumericWord(w) && w.length > 0);

  // Extract words from spoken text
  const spokenWords = spokenText
    .split(/\s+/)
    .filter(w => w && w.length > 0)
    .map(w => w.replace(/[^\w]/g, ''))
    .filter(w => !commonWords.has(w.toLowerCase()) && !isNumericWord(w) && w.length > 0);

  if (pointWords.length === 0) return { matchedCount: 0, totalWords: 0, percentage: 0 };

  // Try to match spoken words to point words sequentially
  let matchedCount = 0;
  let pointWordIndex = 0;

  for (const spokenWord of spokenWords) {
    if (pointWordIndex >= pointWords.length) break;

    const expectedWord = pointWords[pointWordIndex];
    const matchScore = fuzzyMatchWords(spokenWord, expectedWord);

    if (matchScore > 0.65) {
      matchedCount++;
      pointWordIndex++;
    }
  }

  const percentage = pointWords.length > 0 ? (matchedCount / pointWords.length) : 0;

  return {
    matchedCount,
    totalWords: pointWords.length,
    percentage: percentage,
    spokenWords,
    pointWords
  };
}

// Simple text similarity calculation (Levenshtein-like)
function calculateSimilarity(str1, str2) {
  // Extract key words (filter out common words)
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'is', 'are', 'was', 'were', 'in', 'at', 'of', 'to', 'for', 'from', 'with', 'by', 'about']);
  const getKeyWords = (s) => s
    .split(/\s+/)
    .filter(w => w.length > 2 && !commonWords.has(w))
    .map(w => w.substring(0, 5)); // Use first 5 chars for fuzzy matching

  const words1 = new Set(getKeyWords(str1));
  const words2 = new Set(getKeyWords(str2));

  if (words1.size === 0 || words2.size === 0) return 0;

  // Calculate Jaccard similarity
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

// Advance to a specific point with smooth scrolling
function advanceToPoint(pointIndex) {
  if (pointIndex < 0 || pointIndex >= allOutlinePoints.length) return;
  if (pointIndex === currentPointIndex) return; // No change needed

  currentPointIndex = pointIndex;
  updateCurrentPointDisplay();
  triggerMediaForIndex(pointIndex);
  smoothScrollToPoint(pointIndex); // Use Lerp scrolling instead of instant snap
  consecutiveHighConfidenceMatches = 0; // Reset streak on manual advance
  isTrackingFrozen = false;
}

// Small live preview of the student display, same approach as the teacher view
function setupStudentPreview() {
  if (document.getElementById('student-preview-shell')) return;
  const shell = document.createElement('div');
  shell.id = 'student-preview-shell';
  shell.style.cssText = 'position:fixed;bottom:20px;right:20px;width:320px;height:180px;border:1px solid #ccc;z-index:1000;pointer-events:none;overflow:hidden;background:#000;';
  const frame = document.createElement('iframe');
  frame.id = 'student-preview';
  frame.title = 'Student display preview';
  frame.src = `${window.location.origin}/student.html?class=${encodeURIComponent(classId)}`;
  frame.style.cssText = 'position:absolute;top:0;left:0;border:0;width:1280px;height:720px;transform:scale(0.25);transform-origin:top left;';
  shell.appendChild(frame);
  document.body.appendChild(shell);
}

// Setup manual controls
function setupControls() {
  setupStudentPreview();
  const toggleBtn = document.getElementById('toggle-listening');
  const nextBtn = document.getElementById('manual-next');
  const prevBtn = document.getElementById('manual-prev');
  const resetBtn = document.getElementById('reset-scroll');
  const closeBtn = document.getElementById('close-teleprompter');
  const viewModeToggleBtn = document.getElementById('toggle-view-mode');

  // New: Speed controls for constant-speed scroll mode
  const playPauseBtn = document.getElementById('play-pause-scroll');
  const speedUpBtn = document.getElementById('speed-up');
  const speedDownBtn = document.getElementById('speed-down');
  const speedResetBtn = document.getElementById('speed-reset');
  const speedDisplay = document.getElementById('speed-display');

  toggleBtn.addEventListener('click', toggleListening);
  nextBtn.addEventListener('click', () => advanceToPoint(currentPointIndex + 1));
  prevBtn.addEventListener('click', () => advanceToPoint(currentPointIndex - 1));
  resetBtn.addEventListener('click', () => advanceToPoint(0));
  document.getElementById('open-display')?.addEventListener('click', () => {
    window.open(`student.html?class=${classId}`, 'display-screen', 'width=1280,height=720');
  });
  document.getElementById('clear-display')?.addEventListener('click', clearDisplay);
  closeBtn.addEventListener('click', () => {
    if (isListening) toggleListening();
    if (scrollLoopId) cancelAnimationFrame(scrollLoopId);
    window.close();
  });

  // View mode toggle
  if (viewModeToggleBtn) {
    viewModeToggleBtn.addEventListener('click', toggleViewMode);
  }

  // Speed control listeners
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', toggleScrolling);
  }

  // Edit speed button
  const editSpeedBtn = document.getElementById('edit-speed');
  const speedEditControls = document.getElementById('speed-edit-controls');
  const speedDoneBtn = document.getElementById('speed-done');

  if (editSpeedBtn) {
    editSpeedBtn.addEventListener('click', () => {
      speedEditControls.style.display = speedEditControls.style.display === 'none' ? 'flex' : 'none';
      if (speedEditControls.style.display === 'flex') {
        document.getElementById('speed-input')?.focus();
      }
    });
  }

  if (speedDoneBtn) {
    speedDoneBtn.addEventListener('click', () => {
      speedEditControls.style.display = 'none';
    });
  }

  if (speedUpBtn) {
    speedUpBtn.addEventListener('click', (e) => changeScrollSpeed(e.shiftKey ? 1 : 5));
  }
  if (speedDownBtn) {
    speedDownBtn.addEventListener('click', (e) => changeScrollSpeed(e.shiftKey ? -1 : -5));
  }
  if (speedResetBtn) {
    speedResetBtn.addEventListener('click', () => resetScrollSpeed());
  }
  const speedInput = document.getElementById('speed-input');
  if (speedInput) {
    const applyTypedSpeed = () => {
      const value = Number(speedInput.value);
      if (Number.isFinite(value) && speedInput.value !== '') setScrollSpeed(value);
      else updateSpeedDisplay();
    };
    speedInput.addEventListener('change', applyTypedSpeed);
    speedInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { applyTypedSpeed(); speedInput.blur(); }
    });
    speedInput.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  }
  document.getElementById('verse-prev')?.addEventListener('click', () => sendDisplayMessage({ type: 'versePrevious' }));
  document.getElementById('verse-next')?.addEventListener('click', () => sendDisplayMessage({ type: 'verseNext' }));

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input[type="range"]')) e.target.blur();
    const step = e.shiftKey ? 1 : 5;
    if (e.key === ' ') {
      e.preventDefault();
      toggleScrolling(); // Space for play/pause instead of speech toggle
    } else if (e.key === 'Tab') {
      e.preventDefault();
      toggleViewMode(); // Tab for view mode toggle
    } else if (e.key === 'ArrowRight' || e.key === '+' || e.key === '=') {
      e.preventDefault();
      changeScrollSpeed(step);
    } else if (e.key === 'ArrowLeft' || e.key === '-' || e.key === '_') {
      e.preventDefault();
      changeScrollSpeed(-step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      sendDisplayMessage({ type: 'verseNext' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sendDisplayMessage({ type: 'versePrevious' });
    } else if (e.key === 'r' || e.key === 'R') {
      resetScrollSpeed();
    } else if (e.key === 'c' || e.key === 'C') {
      sendDisplayMessage({ type: 'blackout' });
    }
  });

  // Scroll sync and link clicks
  const contentArea = document.getElementById('content-area');
  if (contentArea) {
    contentArea.addEventListener('scroll', () => {
      if (!isProgrammaticScroll) syncCurrentPointToScroll(contentArea);
    }, { passive: true });

    contentArea.addEventListener('click', (e) => {
      const link = e.target.closest('a.teleprompter__link');
      if (!link) return;
      e.preventDefault();
      if (link.dataset.media) {
        try { showMediaOnDisplay(JSON.parse(decodeURIComponent(link.dataset.media))); } catch (err) { }
      } else if (link.dataset.verse) showVerseOnDisplay(link.dataset.verse);
      else showLinkOnDisplay(link.dataset.url);
    });
  }

  updateSpeedDisplay();
  startScrollLoop(); // Start constant-speed scrolling by default
  initClockAndMarker();
}

function initClockAndMarker() {
  const marker = document.getElementById('reading-marker');
  const area = document.getElementById('content-area');
  const clockEl = document.getElementById('clock-display');
  const timerEl = document.getElementById('timer-display');

  // Matches the 30% reading line used by syncCurrentPointToScroll
  const placeMarker = () => {
    if (!marker || !area) return;
    marker.style.top = `${area.offsetTop + area.clientHeight * 0.30}px`;
  };
  placeMarker();
  window.addEventListener('resize', placeMarker);

  let timerMs = 0;
  let last = Date.now();
  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const now = Date.now();
    if (isScrolling) timerMs += now - last;
    last = now;
    if (clockEl) clockEl.textContent = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (timerEl) {
      const total = Math.floor(timerMs / 1000);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      timerEl.textContent = h ? `${h}:${pad(m)}:${pad(total % 60)}` : `${pad(m)}:${pad(total % 60)}`;
    }
  };
  const reset = () => { timerMs = 0; last = Date.now(); tick(); };
  timerEl?.addEventListener('click', reset);
  timerEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.stopPropagation(); reset(); }
  });
  tick();
  setInterval(tick, 500);
}

// Toggle scrolling on/off (play/pause)
function toggleScrolling() {
  isScrolling = !isScrolling;
  lastScrollTime = Date.now();
  const btn = document.getElementById('play-pause-scroll');
  if (btn) {
    btn.innerHTML = `<span class="material-icons">${isScrolling ? 'pause' : 'play_arrow'}</span><span class="btn-label">${isScrolling ? 'Pause' : 'Play'}</span>`;
  }
  debug(`${isScrolling ? '▶️ PLAYING' : '⏸️ PAUSED'} at ${scrollVelocity} px/s`);
  showStatusMessage(`${isScrolling ? '▶️ Playing' : '⏸️ Paused'} - Speed: ${scrollVelocity} px/s`, 1500);
}

// Adjust scroll speed
function changeScrollSpeed(delta) {
  setScrollSpeed(scrollVelocity + delta);
}

function setScrollSpeed(value) {
  scrollVelocity = Math.max(5, Math.min(300, Math.round(value)));
  updateSpeedDisplay();
  showStatusMessage(`📊 Speed: ${scrollVelocity} px/s (${(scrollVelocity / 23 * 100).toFixed(0)}%)`, 1200);
  debug(`Speed changed to: ${scrollVelocity} px/s`);
}

// Reset scroll speed to default
function resetScrollSpeed() {
  scrollVelocity = 23;
  updateSpeedDisplay();
  showStatusMessage(`🔄 Speed reset to: ${scrollVelocity} px/s`, 1500);
  debug('Speed reset to default: 23 px/s');
}

// Update speed display element
function updateSpeedDisplay() {
  const speedDisplay = document.getElementById('speed-display');
  const speedInput = document.getElementById('speed-input');
  if (speedInput) speedInput.value = scrollVelocity;
  if (speedDisplay) {
    const percentage = Math.round((scrollVelocity / 23) * 100);
    speedDisplay.textContent = `${scrollVelocity} px/s (${percentage}%)`;
  }
}

// Constant-speed scroll loop (runs continuously)
function startScrollLoop() {
  function scroll() {
    const now = Date.now();
    const deltaTime = (now - lastScrollTime) / 1000; // Convert to seconds
    lastScrollTime = now;

    if (!isScrolling || isProgrammaticScroll) {
      scrollLoopId = requestAnimationFrame(scroll);
      return;
    }

    // Choose scroll target based on view mode
    const scrollTarget = viewMode === 'scroll'
      ? document.getElementById('scroll-viewport')
      : document.getElementById('content-area');

    if (scrollTarget) {
      scrollRemainder += scrollVelocity * deltaTime;
      const whole = Math.floor(scrollRemainder);
      if (whole > 0) {
        scrollRemainder -= whole;
        scrollTarget.scrollTop += whole;
      }
    }

    scrollLoopId = requestAnimationFrame(scroll);
  }

  scroll();
}

// Toggle view mode between 'word' and 'scroll'
function toggleViewMode() {
  viewMode = viewMode === 'word' ? 'scroll' : 'word';
  const container = document.getElementById('content-area');
  const wordView = document.getElementById('teleprompter-content');
  const scrollView = document.getElementById('scroll-view-container');
  const btn = document.getElementById('toggle-view-mode');

  if (viewMode === 'scroll') {
    container.setAttribute('data-view-mode', 'scroll');
    wordView.style.display = 'none';
    scrollView.style.display = 'flex';
    if (btn) btn.textContent = '📋 Scroll View';
    renderScrollView();
    startScrollViewUpdater();
    debug('🔄 Switched to SCROLL view');
    showStatusMessage('📋 Scroll View - Center line highlighted', 1500);
  } else {
    container.setAttribute('data-view-mode', 'word');
    wordView.style.display = 'block';
    scrollView.style.display = 'none';
    if (btn) btn.textContent = '✏️ Word View';
    if (scrollUpdateId) cancelAnimationFrame(scrollUpdateId);
    debug('🔄 Switched to WORD view');
    showStatusMessage('✏️ Word View - Speech recognition mode', 1500);
  }
}

// Render all points in scroll view
function renderScrollView() {
  const container = document.getElementById('all-points-container');
  if (!container) return;

  container.innerHTML = '';

  allOutlinePoints.forEach((point, idx) => {
    const pointEl = document.createElement('div');
    pointEl.className = 'teleprompter__point';
    pointEl.setAttribute('data-point-index', idx);
    pointEl.innerHTML = `
      <div class="point-text">${point.text}</div>
    `;
    container.appendChild(pointEl);
  });

  updateScrollViewClasses();
}

// Update visual hierarchy based on scroll position
function updateScrollViewClasses() {
  const viewport = document.getElementById('scroll-viewport');
  const points = document.querySelectorAll('#all-points-container .teleprompter__point');

  if (!viewport || points.length === 0) return;

  const viewportCenter = viewport.scrollTop + viewport.clientHeight / 2;

  points.forEach((point, idx) => {
    const rect = point.getBoundingClientRect();
    const pointCenter = viewport.scrollTop + rect.top - viewport.getBoundingClientRect().top + rect.height / 2;
    const distance = Math.abs(pointCenter - viewportCenter);
    const maxDistance = viewport.clientHeight;

    // Remove all classes first
    point.classList.remove('scroll-center', 'scroll-near', 'scroll-far', 'scroll-fading');

    // Add appropriate class based on distance
    if (distance < 100) {
      point.classList.add('scroll-center');
    } else if (distance < 250) {
      point.classList.add('scroll-near');
    } else if (distance < 500) {
      point.classList.add('scroll-far');
    } else {
      point.classList.add('scroll-fading');
    }
  });
}

// Start continuous scroll view updater
function startScrollViewUpdater() {
  function update() {
    if (viewMode === 'scroll') {
      updateScrollViewClasses();
      scrollUpdateId = requestAnimationFrame(update);
    }
  }
  update();
}

// Scroll wheel support - manual velocity fallback (best practice)
async function toggleListening() {
  // Lazy-initialize speech recognition on first use
  if (!speechRecognitionSetup) {
    await initializeOnDeviceSpeechRecognition();
    setupSpeechRecognition();
    speechRecognitionSetup = true;
    debug('✓ Speech recognition initialized on first use');
  }

  if (!recognitionInstance) {
    errorLog.addError('Web Speech API not available');
    showStatusMessage('❌ Web Speech API not available', 3000);
    return;
  }

  if (isListening) {
    // User is explicitly stopping
    debug('⏹️ User stopped listening');
    userInitiatedStop = true;
    recognitionInstance.stop();
    clearTimeout(listeningTimeout);
  } else {
    // User is starting to listen
    debug('🎤 User started listening');
    userInitiatedStop = false;
    networkErrorCount = 0; // Reset error counter on new listen session

    // Clear transcript display when starting
    document.getElementById('speech-transcript').textContent = '';
    document.getElementById('current-confidence').style.display = 'none';

    try {
      recognitionInstance.start();
      isListening = true;
      updateListeningStatus(true);
    } catch (e) {
      errorLog.addError(`Failed to start listening: ${e.message}`, { error: e.toString() });
      console.error('Failed to start speech recognition:', e);
      showStatusMessage('❌ Failed to start listening: ' + e.message, 3000);
      return;
    }

    // Set timeout to restart if no speech detected for 10 seconds
    clearTimeout(listeningTimeout);
    listeningTimeout = setTimeout(() => {
      if (isListening && !userInitiatedStop) {
        debug('No speech detected for 10s, restarting...');
        try {
          recognitionInstance.stop();
          setTimeout(() => {
            if (isListening && !userInitiatedStop) {
              recognitionInstance.start();
            }
          }, 100);
        } catch (e) {
          debug(`Auto-restart timeout failed: ${e.message}`);
        }
      }
    }, 10000);
  }
}

// Update listening status display
function updateListeningStatus(listening) {
  const statusEl = document.getElementById('listening-status');
  const toggleBtn = document.getElementById('toggle-listening');

  if (listening) {
    statusEl.textContent = 'Listening: ON';
    statusEl.classList.add('listening-active');
    toggleBtn.classList.add('active');
    toggleBtn.querySelector('.btn-label').textContent = 'Stop Listening';
  } else {
    statusEl.textContent = 'Listening: OFF';
    statusEl.classList.remove('listening-active');
    toggleBtn.classList.remove('active');
    toggleBtn.querySelector('.btn-label').textContent = 'Start Listening';
  }
}

// Show temporary message to user
function showStatusMessage(message, duration = 3000) {
  const statusEl = document.getElementById('listening-status');
  const originalText = statusEl.textContent;

  statusEl.textContent = message;
  statusEl.style.color = 'var(--accent-amber)';

  setTimeout(() => {
    statusEl.textContent = originalText;
    statusEl.style.color = '';
  }, duration);
}

// Debug output with timestamps and context
function debug(msg, context = {}) {
  if (DEBUG) {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
    const fullMsg = `[${time}] ${msg}`;
    console.log(`[Teleprompter] ${fullMsg}`, context);

    const debugPanel = document.getElementById('debug-panel');
    if (debugPanel) {
      const debugOutput = document.getElementById('debug-output');
      const line = document.createElement('div');
      line.style.fontSize = '11px';
      line.style.padding = '2px 4px';
      line.style.borderBottom = '1px solid #ddd';
      line.style.wordBreak = 'break-word';
      line.style.fontFamily = 'monospace';
      line.textContent = fullMsg;

      if (Object.keys(context).length > 0) {
        line.title = JSON.stringify(context, null, 2);
        line.style.cursor = 'help';
      }

      debugOutput.insertBefore(line, debugOutput.firstChild);
      if (debugOutput.children.length > 50) {
        debugOutput.removeChild(debugOutput.lastChild);
      }
    }
  }
}

// Export debug report for sharing with developers
window.getDebugReport = function () {
  const report = errorLog.getReport();
  const debugInfo = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    onLine: navigator.onLine,
    classId: classId,
    classTitle: classConfig?.title || 'N/A',
    pointsLoaded: allOutlinePoints.length,
    isListening: isListening,
    ...report
  };
  return debugInfo;
};

// Also expose as a copy-to-clipboard function
window.copyDebugReport = function () {
  const report = window.getDebugReport();
  const text = JSON.stringify(report, null, 2);
  navigator.clipboard.writeText(text).then(() => {
    console.log('Debug report copied to clipboard!');
    showStatusMessage('✓ Debug report copied to clipboard', 2000);
  }).catch(err => {
    console.error('Failed to copy:', err);
    console.log('DEBUG REPORT:', report);
  });
};

// Start initialization when page loads
window.addEventListener('DOMContentLoaded', initializePage);
