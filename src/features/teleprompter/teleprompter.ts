// Teleprompter view with speech recognition
// Uses Web Speech API to listen to the teacher and auto-advance through outline

import { setupControls } from './controls';
import { debug, errorLog, registerDebugGlobals, showStatusMessage } from './debug';
import { buildEditorNotesIndex, renderInitialContent } from './outline';
import { getSpeechRecognitionConstructor } from './speech';
import { getErrorMessage, state } from './state';
import type { TeleprompterClassConfig } from './types';

if (!getSpeechRecognitionConstructor()) {
  alert('Web Speech API is not supported in this browser. Please use Chrome, Edge, or another Chromium-based browser.');
}

registerDebugGlobals();

async function initializePage(): Promise<void> {
  try {
    debug('🚀 Initializing teleprompter...');

    state.classId = new URLSearchParams(window.location.search).get('class') || '1';
    debug(`📚 Class ID from URL: ${state.classId}`);

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

    const classesArr: ClassConfig[] = Array.isArray(raw)
      ? raw
      : 'classes' in raw && Array.isArray(raw.classes)
        ? raw.classes
        : [raw];
    debug(`✓ Found ${classesArr.length} class(es)`);

    const matchedClass =
      classesArr.find(c => c.classNumber?.toString() === state.classId || c.id === state.classId) ||
      classesArr[0] ||
      {};
    state.classConfig = matchedClass as TeleprompterClassConfig;

    if (!state.classConfig || !state.classConfig.title) {
      errorLog.addWarning('Class config incomplete', { classId: state.classId, config: state.classConfig });
      state.classConfig = state.classConfig || { title: 'Unknown Class', content: { html: '' } };
    }

    document.title = `Teleprompter — ${state.classConfig.title}`;
    debug(`✓ Loaded class: "${state.classConfig.title}"`);

    buildEditorNotesIndex();
    debug(`✓ Built notes index: ${state.allOutlinePoints.length} points`);

    renderInitialContent();
    debug('✓ Rendered initial content');

    setupControls();
    debug('✓ Controls initialized');

    debug('✅ Teleprompter initialization complete!');
    showStatusMessage('Ready to go! Click the microphone to start speech recognition.', 3000);
  } catch (err: unknown) {
    const errMsg = getErrorMessage(err);
    console.error('Failed to initialize teleprompter:', err);
    errorLog.addError(`Initialization failed: ${errMsg}`, { error: String(err) });

    const content = document.getElementById('teleprompter-content');
    if (content) {
      let errorHtml = `<div style="color: red; padding: 20px; font-family: monospace;">
        <strong>❌ Error loading teleprompter:</strong><br><br>
        ${errMsg}<br><br>
        <small style="color: #999;">`;

      if (errMsg.includes('BSTApi')) {
        errorHtml += 'Make sure api.js is loaded before teleprompter.js<br>';
      } else if (errMsg.includes('API')) {
        errorHtml += 'Check your network connection and that the server is running<br>';
      }

      errorHtml += `Debug: classId=${state.classId}<br>Browser: ${navigator.userAgent.substring(0, 50)}...</small>
      </div>`;

      content.innerHTML = errorHtml;
    }

    showStatusMessage('❌ Failed to load: ' + errMsg, 5000);
  }
}

window.addEventListener('DOMContentLoaded', initializePage);
