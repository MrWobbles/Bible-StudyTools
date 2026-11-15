import { debug, errorLog, showStatusMessage } from './debug';
import { checkForRewind, markWordsAsRead, matchWordsSequential } from './matcher';
import { advanceToPoint } from './scroll';
import { CONFIG, MAX_NETWORK_RETRIES, getErrorMessage, state } from './state';
import type {
  SpeechRecognitionConstructorLike,
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike
} from './types';

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructorLike | undefined {
  return (
    (window.SpeechRecognition as SpeechRecognitionConstructorLike | undefined) ||
    (window.webkitSpeechRecognition as SpeechRecognitionConstructorLike | undefined)
  );
}

// Helper: Wrap a promise with a timeout
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage = 'Operation timed out'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    )
  ]);
}

// Update listening status display
export function updateListeningStatus(listening: boolean): void {
  const statusEl = document.getElementById('listening-status');
  const toggleBtn = document.getElementById('toggle-listening');

  if (listening) {
    if (statusEl) {
      statusEl.textContent = 'Listening: ON';
      statusEl.classList.add('listening-active');
    }
    if (toggleBtn) {
      toggleBtn.classList.add('active');
      const label = toggleBtn.querySelector('.btn-label');
      if (label) label.textContent = 'Stop Listening';
    }
  } else {
    if (statusEl) {
      statusEl.textContent = 'Listening: OFF';
      statusEl.classList.remove('listening-active');
    }
    if (toggleBtn) {
      toggleBtn.classList.remove('active');
      const label = toggleBtn.querySelector('.btn-label');
      if (label) label.textContent = 'Start Listening';
    }
  }
}

// Initialize on-device speech recognition (works offline - no network required)
export async function initializeOnDeviceSpeechRecognition(): Promise<void> {
  const SpeechRecognitionAPI = getSpeechRecognitionConstructor();
  const LANGUAGE_PACK_INSTALLED_KEY = 'bst_on_device_speech_installed';

  if (!SpeechRecognitionAPI) {
    debug('⚠️ Speech Recognition API not available in this browser');
    return;
  }

  if (localStorage.getItem(LANGUAGE_PACK_INSTALLED_KEY) === 'true') {
    debug('✅ On-device language pack cached - using offline mode');
    window.onDeviceSpeechAvailable = true;
    return;
  }

  try {
    if (!SpeechRecognitionAPI.available) {
      debug('ℹ️ On-device speech recognition not available in this browser');
      debug('ℹ️ Using standard Web Speech API (cloud-based)');
      return;
    }

    debug('🔍 Checking for on-device speech recognition language packs...');

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
        if (!SpeechRecognitionAPI.install) {
          debug('⚠️ SpeechRecognition.install not available');
          return;
        }
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
      } catch (err: unknown) {
        debug(`⚠️ Language pack installation failed: ${getErrorMessage(err)}`);
        debug('ℹ️ Falling back to standard Web Speech API (cloud-based)');
      }
    } else if (availability === 'unavailable') {
      debug('ℹ️ On-device speech recognition not available');
      debug('ℹ️ Using standard Web Speech API (cloud-based)');
    }
  } catch (err: unknown) {
    debug(`ℹ️ On-device speech recognition not supported: ${getErrorMessage(err)}`);
    debug('ℹ️ Using standard Web Speech API (cloud-based)');
  }
}

// Setup Web Speech API
export function setupSpeechRecognition(): void {
  const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
  if (!SpeechRecognitionCtor) return;

  const instance = new SpeechRecognitionCtor();
  state.recognitionInstance = instance;
  instance.continuous = CONFIG.continuous;
  instance.interimResults = CONFIG.interimResults;
  instance.language = CONFIG.language;

  if (window.onDeviceSpeechAvailable) {
    instance.processLocally = true;
    debug('🎤 Using on-device speech recognition (offline mode)');
  }

  let lastAutoAdvanceTime = 0;

  instance.onstart = () => {
    debug('🎤 Speech recognition started');
    updateListeningStatus(true);
  };

  instance.onresult = (event: SpeechRecognitionEventLike) => {
    let interimTranscript = '';
    let finalTranscript = '';
    let maxConfidence = 0;

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      const confidence = event.results[i][0].confidence || 0;

      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
        maxConfidence = Math.max(maxConfidence, confidence);
      } else {
        interimTranscript += transcript;
      }
    }

    const displayText = finalTranscript || interimTranscript;
    const displayConfidence = finalTranscript ? maxConfidence : 0;

    const transcriptEl = document.getElementById('speech-transcript');
    if (transcriptEl) transcriptEl.textContent = displayText;
    const confDisplay = document.getElementById('current-confidence');
    if (confDisplay) {
      if (displayConfidence > 0) {
        confDisplay.textContent = `Confidence: ${Math.round(displayConfidence * 100)}%`;
        confDisplay.style.display = 'inline';
      } else {
        confDisplay.style.display = 'none';
      }
    }

    const textToMatch = finalTranscript || interimTranscript;
    markWordsAsRead(textToMatch);

    if (finalTranscript && displayConfidence >= CONFIG.confidenceThreshold) {
      const now = Date.now();
      const timeSinceLastAdvance = now - lastAutoAdvanceTime;

      const matchResult = matchWordsSequential(finalTranscript);

      const rewindIndex = checkForRewind(finalTranscript);
      if (rewindIndex !== null && displayConfidence > 0.85) {
        advanceToPoint(rewindIndex);
        debug(`🔄 Rewind: Moving back to point ${rewindIndex}`);
        return;
      }

      if (
        matchResult.percentage >= CONFIG.AUTO_ADVANCE_THRESHOLD &&
        matchResult.matchedCount >= CONFIG.MIN_MATCHED_WORDS
      ) {
        state.consecutiveHighConfidenceMatches++;

        if (
          state.consecutiveHighConfidenceMatches >= CONFIG.CONFIDENCE_STREAK &&
          timeSinceLastAdvance > CONFIG.autoAdvanceDelay &&
          !state.isTrackingFrozen
        ) {
          debug(
            `✅ Match (streak ${state.consecutiveHighConfidenceMatches}): ${matchResult.matchedCount}/${matchResult.totalWords} (${Math.round(matchResult.percentage * 100)}%) - auto-advancing`
          );
          advanceToPoint(state.currentPointIndex + 1);
          lastAutoAdvanceTime = now;
          state.consecutiveHighConfidenceMatches = 0;
        } else {
          debug(
            `📊 Progress (streak ${state.consecutiveHighConfidenceMatches}/${CONFIG.CONFIDENCE_STREAK}): ${matchResult.matchedCount}/${matchResult.totalWords} (${Math.round(matchResult.percentage * 100)}%)`
          );
        }
      } else {
        state.consecutiveHighConfidenceMatches = 0;
        if (CONFIG.LOW_CONFIDENCE_FREEZE && displayConfidence < 0.5) {
          state.isTrackingFrozen = true;
          debug('❄️ FROZEN: Low confidence - waiting for strong match to resume');
          showStatusMessage('⚠️ Low confidence - tracking paused', 2000);
        }
      }
    } else if (finalTranscript) {
      state.consecutiveHighConfidenceMatches = 0;
      if (CONFIG.LOW_CONFIDENCE_FREEZE) {
        state.isTrackingFrozen = true;
        debug('❄️ FROZEN: Confidence below threshold');
      }
    }

    debug(`Transcript: "${displayText}" (confidence: ${displayConfidence.toFixed(2)})`);
  };

  instance.onerror = (event: SpeechRecognitionErrorEventLike) => {
    console.error('Speech recognition error:', event.error);
    errorLog.addError(`Speech recognition error: ${event.error}`);
    debug(`❌ Error: ${event.error}`);

    if (event.error === 'network') {
      state.networkErrorCount++;
      if (state.networkErrorCount >= MAX_NETWORK_RETRIES) {
        debug(`🛑 Network error limit reached (${state.networkErrorCount} attempts)`);
        showStatusMessage('❌ Network unavailable - cannot reach speech service. Check your internet connection.', 5000);
        state.isListening = false;
        updateListeningStatus(false);
        errorLog.addError(`Network errors exceeded max retries (${MAX_NETWORK_RETRIES})`);
      } else {
        debug(`🔄 Network error (${state.networkErrorCount}/${MAX_NETWORK_RETRIES}) - will auto-restart via onend handler`);
        debug('   (Trying to reconnect to speech service...)');
        showStatusMessage(`Network issue - reconnecting... (${state.networkErrorCount}/${MAX_NETWORK_RETRIES})`, 2000);
      }
    } else if (event.error === 'language-not-supported') {
      debug('⚠️ Language pack not available for on-device recognition, falling back to cloud-based');
      if (instance.processLocally) {
        instance.processLocally = false;
        showStatusMessage('Switching to cloud-based speech recognition...', 2000);
      }
    } else if (event.error === 'no-speech') {
      debug('⏱️ No speech detected (this is normal if you haven\'t spoken yet)');
    } else if (event.error === 'audio-capture') {
      showStatusMessage('⚠️ No microphone found - check your device settings', 4000);
      errorLog.addError('No audio input device detected');
      state.isListening = false;
      updateListeningStatus(false);
    } else if (event.error === 'not-allowed') {
      showStatusMessage('⚠️ Microphone permission denied - check your browser settings', 4000);
      errorLog.addError('Microphone permission not granted');
      state.isListening = false;
      updateListeningStatus(false);
    } else {
      debug(`⚠️ Speech recognition error: ${event.error}`);
      showStatusMessage(`Error: ${event.error}`, 2000);
    }
  };

  instance.onend = () => {
    debug('Speech recognition ended');

    if (state.userInitiatedStop) {
      state.isListening = false;
      state.networkErrorCount = 0;
      updateListeningStatus(false);
      state.userInitiatedStop = false;
    } else if (state.isListening && state.networkErrorCount < MAX_NETWORK_RETRIES) {
      debug('Restarting speech recognition...');
      setTimeout(() => {
        if (state.isListening && state.networkErrorCount < MAX_NETWORK_RETRIES) {
          try {
            instance.start();
          } catch (e: unknown) {
            debug(`Failed to auto-restart: ${getErrorMessage(e)}`);
          }
        }
      }, 500);
    } else if (state.networkErrorCount >= MAX_NETWORK_RETRIES) {
      state.isListening = false;
      updateListeningStatus(false);
      debug('Stopping due to network error limit');
    }
  };
}

export async function toggleListening(): Promise<void> {
  if (!state.speechRecognitionSetup) {
    await initializeOnDeviceSpeechRecognition();
    setupSpeechRecognition();
    state.speechRecognitionSetup = true;
    debug('✓ Speech recognition initialized on first use');
  }

  if (!state.recognitionInstance) {
    errorLog.addError('Web Speech API not available');
    showStatusMessage('❌ Web Speech API not available', 3000);
    return;
  }

  const activeRecognition = state.recognitionInstance;

  if (state.isListening) {
    debug('⏹️ User stopped listening');
    state.userInitiatedStop = true;
    activeRecognition.stop();
    if (state.listeningTimeout !== null) clearTimeout(state.listeningTimeout);
  } else {
    debug('🎤 User started listening');
    state.userInitiatedStop = false;
    state.networkErrorCount = 0;

    const transcriptEl = document.getElementById('speech-transcript');
    if (transcriptEl) transcriptEl.textContent = '';
    const confEl = document.getElementById('current-confidence');
    if (confEl) confEl.style.display = 'none';

    try {
      activeRecognition.start();
      state.isListening = true;
      updateListeningStatus(true);
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e);
      errorLog.addError(`Failed to start listening: ${errMsg}`, { error: String(e) });
      console.error('Failed to start speech recognition:', e);
      showStatusMessage('❌ Failed to start listening: ' + errMsg, 3000);
      return;
    }

    if (state.listeningTimeout !== null) clearTimeout(state.listeningTimeout);
    state.listeningTimeout = setTimeout(() => {
      if (state.isListening && !state.userInitiatedStop) {
        debug('No speech detected for 10s, restarting...');
        try {
          activeRecognition.stop();
          setTimeout(() => {
            if (state.isListening && !state.userInitiatedStop) {
              activeRecognition.start();
            }
          }, 100);
        } catch (e: unknown) {
          debug(`Auto-restart timeout failed: ${getErrorMessage(e)}`);
        }
      }
    }, 10000);
  }
}
