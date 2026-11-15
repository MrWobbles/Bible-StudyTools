import { debug, showStatusMessage } from './debug';
import { getErrorMessage } from './state';
import type { SpeechRecognitionConstructorLike } from './types';

export function getSpeechRecognitionConstructor():
  | SpeechRecognitionConstructorLike
  | undefined {
  return (
    (window.SpeechRecognition as SpeechRecognitionConstructorLike | undefined) ||
    (window.webkitSpeechRecognition as SpeechRecognitionConstructorLike | undefined)
  );
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'Operation timed out',
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs),
    ),
  ]);
}

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
      return;
    }

    debug('🔍 Checking for on-device speech recognition language packs...');

    const availability = await withTimeout(
      SpeechRecognitionAPI.available({
        langs: ['en-US'],
        processLocally: true,
        quality: 'command',
      }),
      5000,
      'On-device availability check timed out',
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
            quality: 'command',
          }),
          30000,
          'Language pack installation timed out',
        );

        if (installed) {
          debug('✅ Language pack installed! On-device speech recognition ready.');
          window.onDeviceSpeechAvailable = true;
          localStorage.setItem(LANGUAGE_PACK_INSTALLED_KEY, 'true');
          showStatusMessage('✅ Ready! Speech recognition is offline now.', 3000);
        } else {
          debug('⚠️ Language pack installation failed');
        }
      } catch (err: unknown) {
        debug(`⚠️ Language pack installation failed: ${getErrorMessage(err)}`);
      }
    } else if (availability === 'unavailable') {
      debug('ℹ️ On-device speech recognition not available');
    }
  } catch (err: unknown) {
    debug(`ℹ️ On-device speech recognition not supported: ${getErrorMessage(err)}`);
  }
}
