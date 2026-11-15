import {
  fetchGoogleDoc,
  highlightText,
  insertSfxFromDropdown,
  switchScriptTab,
  updateEditorSfxDropdown,
} from './controlEditor';
import {
  clearLinkSelection,
  closeFullscriptView,
  createLink,
  previewScript,
  removeLink,
  showFullscriptView,
} from './controlLinks';
import {
  addSfxRow,
  addTextRow,
  closeSceneEditor,
  deleteScene,
  editScene,
  openSceneEditor,
  saveScene,
} from './controlSceneForm';
import { loadData } from './controlScenes';
import { sendCommand, vbsControlState } from './controlState';

const globalWindow = window as unknown as Record<string, unknown>;

Object.defineProperty(globalWindow, 'editor', {
  get: () => vbsControlState.editor,
  configurable: true,
});

Object.assign(globalWindow, {
  sendCommand,
  openSceneEditor,
  closeSceneEditor,
  saveScene,
  editScene,
  deleteScene,
  addTextRow,
  addSfxRow,
  switchScriptTab,
  highlightText,
  updateEditorSfxDropdown,
  insertSfxFromDropdown,
  previewScript,
  showFullscriptView,
  closeFullscriptView,
  createLink,
  removeLink,
  clearLinkSelection,
  fetchGoogleDoc,
  toggleCircles: () => sendCommand('toggle_bubbles'),
  separateCircles: () => sendCommand('separate_bubbles'),
  triggerMatrix: () => sendCommand('matrix_effect'),
  triggerSparkles: () => sendCommand('toggle_sparkles'),
  triggerBirds: () => sendCommand('toggle_birds'),
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('fullscreen-script-overlay');
    if (overlay?.classList.contains('active')) {
      closeFullscriptView();
    }
  }
});

void loadData();
