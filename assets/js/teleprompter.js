// Teleprompter view with speech recognition
// Uses Web Speech API to listen to the teacher and auto-advance through outline

let classConfig = {};
let classId = '';
let currentSectionIndex = 0;
let currentPointIndex = 0;
let allOutlinePoints = []; // Flat array of all points with metadata
let isListening = false;
let listeningTimeout = null;
let recognitionInstance = null;
let spokenWords = []; // Track words that have been spoken
const DEBUG = false;

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
    classId = new URLSearchParams(window.location.search).get('class') || '1';
    const raw = await window.BSTApi.getClasses();
    const classesArr = Array.isArray(raw) ? raw : Array.isArray(raw?.classes) ? raw.classes : [raw];
    classConfig = classesArr.find(c => c.classNumber?.toString() === classId || c.id === classId) || classesArr[0] || {};

    if (!classConfig) {
      throw new Error('Class not found');
    }

    document.title = `Teleprompter — ${classConfig.title}`;
    buildEditorNotesIndex();
    renderInitialContent();
    setupSpeechRecognition();
    setupControls();

    debug(`Loaded class: ${classConfig.title}`);
    debug(`Total points: ${allOutlinePoints.length}`);
  } catch (err) {
    console.error('Failed to initialize teleprompter:', err);
    const content = document.getElementById('teleprompter-content');
    if (content) {
      content.innerHTML = `<div style="color: red; padding: 20px;"><strong>Error loading class:</strong> ${err.message}</div>`;
    }
  }
}

// Build points from editor notes (HTML content)
function buildEditorNotesIndex() {
  allOutlinePoints = [];

  // Get editor content HTML
  const editorHtml = classConfig.content?.html;
  if (!editorHtml) {
    debug('No editor content found');
    return;
  }

  // Parse HTML and extract text chunks
  const parser = new DOMParser();
  const doc = parser.parseFromString(editorHtml, 'text/html');

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

  debug(`Parsed ${allOutlinePoints.length} points from editor notes`);
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

// Setup Web Speech API
function setupSpeechRecognition() {
  if (!SpeechRecognition) return;

  recognitionInstance = new SpeechRecognition();
  recognitionInstance.continuous = CONFIG.continuous;
  recognitionInstance.interimResults = CONFIG.interimResults;
  recognitionInstance.language = CONFIG.language;

  let lastAutoAdvanceTime = 0;

  recognitionInstance.onstart = () => {
    debug('Speech recognition started');
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

      // Try to match against upcoming points
      const match = findBestMatch(finalTranscript, displayConfidence);
      if (match && timeSinceLastAdvance > CONFIG.autoAdvanceDelay) {
        debug(`Match found: "${match.text}" (score: ${match.score.toFixed(2)})`);
        advanceToPoint(match.index);
        lastAutoAdvanceTime = now;
      }
    }

    debug(`Transcript: "${displayText}" (confidence: ${displayConfidence.toFixed(2)})`);
  };

  recognitionInstance.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    debug(`Error: ${event.error}`);

    // Don't show alert for normal "no-speech" errors
    if (event.error !== 'no-speech' && event.error !== 'network') {
      // Silently handle common errors
    }
  };

  recognitionInstance.onend = () => {
    debug('Speech recognition ended');
    updateListeningStatus(false);
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
function toggleListening() {
  if (!recognitionInstance) {
    alert('Web Speech API not available');
    return;
  }

  if (isListening) {
    recognitionInstance.stop();
    isListening = false;
  } else {
    // Clear transcript display when starting
    document.getElementById('speech-transcript').textContent = '';
    document.getElementById('current-confidence').style.display = 'none';
    recognitionInstance.start();
    isListening = true;

    // Set timeout to restart if no speech detected
    clearTimeout(listeningTimeout);
    listeningTimeout = setTimeout(() => {
      if (isListening) {
        recognitionInstance.stop();
        recognitionInstance.start();
      }
    }, 10000);
  }

  updateListeningStatus(isListening);
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

// Debug output
function debug(msg) {
  if (DEBUG) {
    console.log(`[Teleprompter] ${msg}`);
    const debugPanel = document.getElementById('debug-panel');
    if (debugPanel) {
      const debugOutput = document.getElementById('debug-output');
      const line = document.createElement('div');
      line.textContent = msg;
      debugOutput.insertBefore(line, debugOutput.firstChild);
      if (debugOutput.children.length > 20) {
        debugOutput.removeChild(debugOutput.lastChild);
      }
    }
  }
}

// Start initialization when page loads
window.addEventListener('DOMContentLoaded', initializePage);
