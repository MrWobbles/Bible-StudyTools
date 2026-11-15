import { saveEditorMetadata } from '../services/documents';
import { closeModal, editorState } from '../state';
import { getErrorMessage, matchesClassId } from '../types';
import {
  injectQAPauseMarkers,
  toOutlineEditorAdapter,
  updateOutlineNavigatorFromGenerated,
} from './outlinePanel';

export async function enhanceCurrentOutline(): Promise<void> {
  const { editor, generatedOutline } = editorState;
  if (!editor || !generatedOutline || generatedOutline.length === 0) {
    alert('No outline to enhance');
    return;
  }

  const enhanceBtn = document.getElementById('btn-enhance-outline');
  const previewDiv = document.getElementById('outline-preview');

  try {
    const isAvailable = await checkOllamaAvailability();
    if (!isAvailable) {
      alert('Ollama is not running. Please start Ollama to use AI enhancement.');
      return;
    }

    if (enhanceBtn instanceof HTMLButtonElement) {
      enhanceBtn.disabled = true;
      enhanceBtn.innerHTML =
        '<span class="material-symbols-outlined rotating" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">progress_activity</span>Enhancing...';
    }

    if (!window.enhanceOutlineWithLLM || !window.formatOutlineHTML) {
      throw new Error('Outline enhancement service unavailable');
    }

    const enhanced = await window.enhanceOutlineWithLLM(
      generatedOutline,
      toOutlineEditorAdapter(editor),
    );
    editorState.generatedOutline = enhanced;

    const html = window.formatOutlineHTML(enhanced);
    if (previewDiv) previewDiv.innerHTML = html;

    injectQAPauseMarkers(enhanced);

    if (enhanceBtn instanceof HTMLButtonElement) {
      enhanceBtn.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">check_circle</span>Enhanced';
      setTimeout(() => {
        enhanceBtn.innerHTML =
          '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">auto_fix_high</span>Enhance with AI';
        enhanceBtn.disabled = false;
      }, 2000);
    }
  } catch (error: unknown) {
    console.error('Enhancement failed:', error);
    alert('Failed to enhance outline: ' + getErrorMessage(error));
    if (enhanceBtn instanceof HTMLButtonElement) {
      enhanceBtn.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">auto_fix_high</span>Enhance with AI';
      enhanceBtn.disabled = false;
    }
  }
}

export async function copyOutlineJSON(): Promise<void> {
  const { generatedOutline } = editorState;
  if (!generatedOutline) {
    alert('No outline generated yet');
    return;
  }

  const exportJson = window.exportOutlineJSON
    ? window.exportOutlineJSON(generatedOutline)
    : JSON.stringify(generatedOutline, null, 2);

  try {
    await navigator.clipboard.writeText(exportJson);

    const btn = document.getElementById('btn-copy-outline');
    if (btn) {
      const originalHtml = btn.innerHTML;
      btn.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">done</span>Copied!';
      setTimeout(() => {
        btn.innerHTML = originalHtml;
      }, 2000);
    }
  } catch (error: unknown) {
    console.error('Copy failed:', error);
    const textarea = document.createElement('textarea');
    textarea.value = exportJson;
    textarea.style.cssText =
      'position: fixed; top: 50%; left: 50%; width: 80%; height: 300px; z-index: 10000;';
    document.body.appendChild(textarea);
    textarea.select();
    alert('Select all and copy the JSON below');
  }
}

export async function applyOutlineToClass(): Promise<void> {
  const { generatedOutline, currentClassId, allClasses } = editorState;
  if (!generatedOutline) {
    alert('No outline generated yet');
    return;
  }

  if (!currentClassId) {
    alert('No class selected. Open this editor from a specific class to apply the outline.');
    return;
  }

  try {
    const classIndex = allClasses.findIndex((c) => matchesClassId(c, currentClassId));
    if (classIndex === -1) {
      throw new Error('Class not found');
    }

    allClasses[classIndex].generatedOutline = generatedOutline;
    allClasses[classIndex].outline = generatedOutline;

    const saved = await saveEditorMetadata({
      generatedOutline,
      outline: generatedOutline,
    });
    if (!saved) return;

    updateOutlineNavigatorFromGenerated(generatedOutline);
    alert('Outline applied to class successfully!');
    closeModal('outline-modal');
  } catch (error: unknown) {
    console.error('Apply outline failed:', error);
    alert('Failed to apply outline: ' + getErrorMessage(error));
  }
}
