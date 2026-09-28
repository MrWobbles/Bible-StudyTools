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
let spokenWords = []; // Track words that have been spoken
let networkErrorCount = 0; // Track consecutive network errors
const MAX_NETWORK_RETRIES = 3; // Stop retrying after this many network errors
const DEBUG = true; // Always on - helps users report issues

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
  maxUpcomingPoints: 3 // How many upcoming points to show
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

    // Initialize on-device speech recognition (works offline)
    await initializeOnDeviceSpeechRecognition();

    setupSpeechRecognition();
    debug(`✓ Speech recognition ready`);

    setupControls();
    debug(`✓ Controls initialized`);

    debug('✅ Teleprompter initialization complete!');
    showStatusMessage('Ready to go! Click the microphone to start.', 3000);
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
    const elements = doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li');
    elements.forEach((el) => {
      const text = el.textContent?.trim();
      if (!text) return;

      const tagName = el.tagName.toLowerCase();

      // Update section title on headings
      if (tagName.startsWith('h')) {
        currentSection = text;
        // Add heading as a point
        blocks.push({
          text: text,
          type: 'heading',
          sectionTitle: currentSection
        });
      } else if (tagName === 'p' || tagName === 'li') {
        // Add paragraph/list item as a point
        blocks.push({
          text: text,
          type: tagName === 'li' ? 'bullet' : 'paragraph',
          sectionTitle: currentSection
        });
      }
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
    document.getElementById('current-point').innerHTML = '<div class="point-text">Load some editor notes to get started.</div>';
    return;
  }

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

  // Update current point (large, prominent display)
  const currentPointEl = document.getElementById('current-point');
  const pointTextHTML = wrapWordsInSpans(currentPoint.text);

  currentPointEl.innerHTML = `
    <div class="point-type-badge">${currentPoint.type || 'text'}</div>
    <div class="point-text">${pointTextHTML}</div>
  `;

  // Update progress
  document.getElementById('progress-display').textContent =
    `${currentPointIndex + 1} / ${allOutlinePoints.length}`;

  // Reset spoken words for new point
  spokenWords = [];

  // Render upcoming points preview
  renderUpcomingPoints();

  // Scroll into view (smooth scroll)
  currentPointEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Render upcoming points in preview area
function renderUpcomingPoints() {
  const upcomingContainer = document.getElementById('upcoming-points');
  upcomingContainer.innerHTML = '';

  for (let i = 1; i <= CONFIG.maxUpcomingPoints; i++) {
    const idx = currentPointIndex + i;
    if (idx >= allOutlinePoints.length) break;

    const point = allOutlinePoints[idx];
    const el = document.createElement('div');
    el.className = 'teleprompter__point upcoming';
    el.innerHTML = `
      <div class="point-type-badge">${point.type || 'text'}</div>
      <div class="point-text">${point.text}</div>
    `;
    upcomingContainer.appendChild(el);
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
    const sanitizedWord = word.replace(/[<>]/g, ''); // Basic XSS protection
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
  const wordSpans = document.querySelectorAll('.teleprompter__word');
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

  if (!SpeechRecognitionAPI) {
    debug('⚠️ Speech Recognition API not available in this browser');
    return;
  }

  // Check if on-device speech recognition is supported
  try {
    if (!SpeechRecognitionAPI.available) {
      debug('ℹ️ On-device speech recognition not available in this browser');
      debug('ℹ️ Using standard Web Speech API (cloud-based with restricted networks)');
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

    // Check for phrase match when final transcript arrives
    if (finalTranscript && displayConfidence >= CONFIG.confidenceThreshold) {
      const now = Date.now();
      const timeSinceLastAdvance = now - lastAutoAdvanceTime;

      // Use sequential word matching with fuzzy matching
      const matchResult = matchWordsSequential(finalTranscript);
      const AUTO_ADVANCE_THRESHOLD = 0.70; // 70% of words spoken = auto-advance

      if (matchResult.percentage >= AUTO_ADVANCE_THRESHOLD && timeSinceLastAdvance > CONFIG.autoAdvanceDelay) {
        debug(`✅ Match: ${matchResult.matchedCount}/${matchResult.totalWords} words (${Math.round(matchResult.percentage * 100)}%) - auto-advancing`);
        advanceToPoint(currentPointIndex + 1);
        lastAutoAdvanceTime = now;
      } else if (matchResult.matchedCount > 0) {
        debug(`📊 Progress: ${matchResult.matchedCount}/${matchResult.totalWords} words (${Math.round(matchResult.percentage * 100)}%)`);
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

// Match spoken words sequentially to current point
function matchWordsSequential(spokenText) {
  if (!spokenText || allOutlinePoints.length === 0) return { matchedCount: 0, totalWords: 0, percentage: 0 };

  const currentPoint = allOutlinePoints[currentPointIndex];
  if (!currentPoint) return { matchedCount: 0, totalWords: 0, percentage: 0 };

  // Extract words from point, filtering common words
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'is', 'are', 'was', 'were', 'in', 'at', 'of', 'to', 'for', 'from', 'with', 'by', 'about', 'be', 'have', 'do']);
  const pointWords = currentPoint.text
    .split(/\s+/)
    .filter(w => w && w.length > 0)
    .map(w => w.replace(/[^\w]/g, '')) // Remove punctuation
    .filter(w => !commonWords.has(w.toLowerCase()) && w.length > 0);

  // Extract words from spoken text
  const spokenWords = spokenText
    .split(/\s+/)
    .filter(w => w && w.length > 0)
    .map(w => w.replace(/[^\w]/g, ''))
    .filter(w => !commonWords.has(w.toLowerCase()) && w.length > 0);

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

// Advance to a specific point
function advanceToPoint(pointIndex) {
  if (pointIndex < 0 || pointIndex >= allOutlinePoints.length) return;
  currentPointIndex = pointIndex;
  updateCurrentPointDisplay();
}

// Setup manual controls
function setupControls() {
  const toggleBtn = document.getElementById('toggle-listening');
  const nextBtn = document.getElementById('manual-next');
  const prevBtn = document.getElementById('manual-prev');
  const resetBtn = document.getElementById('reset-scroll');
  const closeBtn = document.getElementById('close-teleprompter');

  toggleBtn.addEventListener('click', toggleListening);
  nextBtn.addEventListener('click', () => advanceToPoint(currentPointIndex + 1));
  prevBtn.addEventListener('click', () => advanceToPoint(currentPointIndex - 1));
  resetBtn.addEventListener('click', () => advanceToPoint(0));
  closeBtn.addEventListener('click', () => {
    if (isListening) toggleListening();
    window.close();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      toggleListening();
    } else if (e.key === 'ArrowRight' || e.key === 'n') {
      advanceToPoint(currentPointIndex + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'p') {
      advanceToPoint(currentPointIndex - 1);
    }
  });
}

// Toggle listening on/off
// Toggle listening on/off
function toggleListening() {
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
