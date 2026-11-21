import { editorState } from '../state';
import { getErrorMessage, isRecord } from '../types';
import type { InstalledModelEntry } from '../types';
import { openModal } from './modals';
import {
  applyOutlineToClass,
  copyOutlineJSON,
  enhanceCurrentOutline,
} from './outlineActions';
import {
  buildOutlineErrorHtml,
  buildOutlineLoadingHtml,
} from './outlineModalTemplates';
import {
  injectQAPauseMarkers,
  toOutlineEditorAdapter,
  updateOutlineNavigatorFromGenerated,
} from './outlinePanel';

export { applyOutlineToClass, copyOutlineJSON, enhanceCurrentOutline };

export async function openOutlineModal(): Promise<void> {
  openModal('outline-modal');

  const statusDiv = document.getElementById('llm-status');
  try {
    const llmAvailable = await checkOllamaAvailability();

    if (llmAvailable) {
      if (statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#d4edda';
        statusDiv.style.color = '#155724';
        statusDiv.style.border = '1px solid #c3e6cb';
        statusDiv.innerHTML =
          '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">check_circle</span> AI service is ready';
      }

      try {
        const rawModels = window.getInstalledModels ? await window.getInstalledModels() : [];
        const models = rawModels.filter(
          (m): m is InstalledModelEntry =>
            isRecord(m) && typeof m.name === 'string' && typeof m.size === 'number',
        );
        if (models.length > 0) {
          const select = document.getElementById('llm-model-select');
          if (select instanceof HTMLSelectElement) {
            select.innerHTML = models
              .map((m) =>
                m.size > 0
                  ? `<option value="${m.name}">${m.name} (${(m.size / 1e9).toFixed(1)}GB)</option>`
                  : `<option value="${m.name}">${m.name} (Gemini)</option>`,
              )
              .join('');
          }
        }
      } catch (e: unknown) {
        console.warn('Could not get installed models:', e);
      }
    } else {
      if (statusDiv) statusDiv.style.display = 'none';
      const standardRadio = document.querySelector(
        'input[name="outline-method"][value="standard"]',
      );
      if (standardRadio instanceof HTMLInputElement) {
        standardRadio.checked = true;
      }
      handleOutlineMethodChange();
    }
  } catch (error: unknown) {
    console.warn('LLM check failed:', error);
  }
}

export function handleOutlineMethodChange(): void {
  const checkedRadio = document.querySelector('input[name="outline-method"]:checked');
  const selectedMethod =
    checkedRadio instanceof HTMLInputElement ? checkedRadio.value : 'standard';
  const llmOptions = document.getElementById('llm-options');
  const llmStatus = document.getElementById('llm-status');
  const enhanceBtn = document.getElementById('btn-enhance-outline');

  if (selectedMethod === 'llm') {
    if (llmOptions) llmOptions.style.display = 'block';
    if (llmStatus && (llmStatus.textContent || '').includes('not running')) {
      llmStatus.style.display = 'block';
    }
    if (enhanceBtn) enhanceBtn.style.display = 'none';
  } else {
    if (llmOptions) llmOptions.style.display = 'none';
    if (
      editorState.generatedOutline &&
      editorState.generatedOutline.length > 0 &&
      enhanceBtn
    ) {
      enhanceBtn.style.display = 'inline-block';
    }
  }
}

export async function generateAndShowOutline(): Promise<void> {
  const { editor } = editorState;
  if (!editor) return;
  const checkedRadio = document.querySelector('input[name="outline-method"]:checked');
  const selectedMethod =
    checkedRadio instanceof HTMLInputElement ? checkedRadio.value : 'standard';
  const useAI = selectedMethod === 'llm';

  const startBtn = document.getElementById('btn-start-generation');
  const previewDiv = document.getElementById('outline-preview');

  if (startBtn instanceof HTMLButtonElement) {
    startBtn.disabled = true;
    startBtn.textContent = useAI ? 'Generating with AI...' : 'Generating...';
  }
  if (previewDiv) {
    previewDiv.innerHTML = buildOutlineLoadingHtml(useAI);
  }

  try {
    let options: LlmGenerateOptions = {};
    if (useAI) {
      const modelSelect = document.getElementById('llm-model-select');
      const selectedModel =
        modelSelect instanceof HTMLSelectElement ? modelSelect.value : undefined;
      options = { model: selectedModel };
    }

    if (!window.generateOutline || !window.formatOutlineHTML) {
      throw new Error('Outline generator is unavailable');
    }

    editorState.generatedOutline = await window.generateOutline(
      toOutlineEditorAdapter(editor),
      useAI,
      options,
    );

    if (!editorState.generatedOutline || editorState.generatedOutline.length === 0) {
      throw new Error(
        useAI
          ? 'Could not generate outline from content. Please add more text (at least a few paragraphs).'
          : 'No headings found in document. For standard generation, use headings (H1-H6). Or try AI-Enhanced mode which works with any content.',
      );
    }

    const html = window.formatOutlineHTML(editorState.generatedOutline);
    if (previewDiv) previewDiv.innerHTML = html;

    const copyOutlineBtn = document.getElementById('btn-copy-outline');
    const applyOutlineBtn = document.getElementById('btn-apply-outline');
    if (copyOutlineBtn instanceof HTMLButtonElement) copyOutlineBtn.disabled = false;
    if (applyOutlineBtn instanceof HTMLButtonElement) applyOutlineBtn.disabled = false;

    if (!useAI) {
      const enhanceBtn = document.getElementById('btn-enhance-outline');
      if (enhanceBtn instanceof HTMLButtonElement) {
        enhanceBtn.style.display = 'inline-block';
        enhanceBtn.disabled = false;
      }
    }

    updateOutlineNavigatorFromGenerated(editorState.generatedOutline);

    if (useAI) {
      injectQAPauseMarkers(editorState.generatedOutline);
    }

    if (startBtn instanceof HTMLButtonElement) {
      startBtn.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">check_circle</span>Generated Successfully';
      setTimeout(() => {
        startBtn.innerHTML =
          '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">auto_awesome</span>Generate Outline';
        startBtn.disabled = false;
      }, 2000);
    }
  } catch (error: unknown) {
    console.error('Outline generation failed:', error);
    const errorMsg = getErrorMessage(error) || 'Unknown error occurred';
    if (previewDiv) {
      previewDiv.innerHTML = buildOutlineErrorHtml(errorMsg);
    }
    if (startBtn instanceof HTMLButtonElement) {
      startBtn.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">refresh</span>Try Again';
      startBtn.disabled = false;
    }
  }
}
