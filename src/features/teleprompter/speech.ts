import { debug, errorLog, showStatusMessage } from './debug';
import { checkForRewind, markWordsAsRead, matchWordsSequential } from './matcher';
import { advanceToPoint } from './scroll';
import {
  getSpeechRecognitionConstructor,
  initializeOnDeviceSpeechRecognition,
  updateListeningStatus,
} from './speechInit';
import { CONFIG, MAX_NETWORK_RETRIES, getErrorMessage, state } from './state';
import type {
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
} from './types';

export {
  getSpeechRecognitionConstructor,
  initializeOnDeviceSpeechRecognition,
  updateListeningStatus,
};

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
            `✅ Match (streak ${state.consecutiveHighConfidenceMatches}): ${matchResult.matchedCount}/${matchResult.totalWords} (${Math.round(matchResult.percentage * 100)}%) - auto-advancing`,
          );
          advanceToPoint(state.currentPointIndex + 1);
          lastAutoAdvanceTime = now;
          state.consecutiveHighConfidenceMatches = 0;
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
        showStatusMessage(
          '❌ Network unavailable - cannot reach speech service. Check your internet connection.',
          5000,
        );
        state.isListening = false;
        updateListeningStatus(false);
        errorLog.addError(`Network errors exceeded max retries (${MAX_NETWORK_RETRIES})`);
      } else {
        showStatusMessage(
          `Network issue - reconnecting... (${state.networkErrorCount}/${MAX_NETWORK_RETRIES})`,
          2000,
        );
      }
    } else if (event.error === 'language-not-supported') {
      if (instance.processLocally) {
        instance.processLocally = false;
        showStatusMessage('Switching to cloud-based speech recognition...', 2000);
      }
    } else if (event.error === 'no-speech') {
      debug("⏱️ No speech detected (this is normal if you haven't spoken yet)");
    } else if (event.error === 'audio-capture') {
      showStatusMessage('⚠️ No microphone found - check your device settings', 4000);
      errorLog.addError('No audio input device detected');
      state.isListening = false;
      updateListeningStatus(false);
    } else if (event.error === 'not-allowed') {
      showStatusMessage(
        '⚠️ Microphone permission denied - check your browser settings',
        4000,
      );
      errorLog.addError('Microphone permission not granted');
      state.isListening = false;
      updateListeningStatus(false);
    } else {
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
    }
  };
}

export async function toggleListening(): Promise<void> {
  if (!state.speechRecognitionSetup) {
    await initializeOnDeviceSpeechRecognition();
    setupSpeechRecognition();
    state.speechRecognitionSetup = true;
  }

  if (!state.recognitionInstance) {
    errorLog.addError('Web Speech API not available');
    showStatusMessage('❌ Web Speech API not available', 3000);
    return;
  }

  const activeRecognition = state.recognitionInstance;

  if (state.isListening) {
    state.userInitiatedStop = true;
    activeRecognition.stop();
    if (state.listeningTimeout !== null) clearTimeout(state.listeningTimeout);
    return;
  }

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
    showStatusMessage('❌ Failed to start listening: ' + errMsg, 3000);
    return;
  }

  if (state.listeningTimeout !== null) clearTimeout(state.listeningTimeout);
  state.listeningTimeout = setTimeout(() => {
    if (state.isListening && !state.userInitiatedStop) {
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
