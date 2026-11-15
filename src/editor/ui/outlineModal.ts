import { closeModal, editorState } from '../state';
import { getErrorMessage, isRecord, matchesClassId } from '../types';
import type { InstalledModelEntry } from '../types';
import { saveEditorMetadata } from '../services/documents';
import { openModal } from './modals';
import {
  injectQAPauseMarkers,
  toOutlineEditorAdapter,
  updateOutlineNavigatorFromGenerated,
} from './outlinePanel';

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
          '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">check_circle</span> Ollama is running and ready';
      }

      try {
        const rawModels = window.getInstalledModels ? await window.getInstalledModels() : [];
        const models = rawModels.filter(
          (m): m is InstalledModelEntry =>
            isRecord(m) && typeof m.name === 'string' && typeof m.size === 'number'
        );
        if (models.length > 0) {
          const select = document.getElementById('llm-model-select');
          if (select instanceof HTMLSelectElement) {
            select.innerHTML = models
              .map(
                (m) => `<option value="${m.name}">${m.name} (${(m.size / 1e9).toFixed(1)}GB)</option>`
              )
              .join('');
          }
        }
      } catch (e: unknown) {
        console.warn('Could not get installed models:', e);
      }
    } else {
      if (statusDiv) statusDiv.style.display = 'none';
      const standardRadio = document.querySelector('input[name="outline-method"][value="standard"]');
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
  const selectedMethod = checkedRadio instanceof HTMLInputElement ? checkedRadio.value : 'standard';
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
  const selectedMethod = checkedRadio instanceof HTMLInputElement ? checkedRadio.value : 'standard';
  const useAI = selectedMethod === 'llm';

  const startBtn = document.getElementById('btn-start-generation');
  const previewDiv = document.getElementById('outline-preview');

  if (startBtn instanceof HTMLButtonElement) {
    startBtn.disabled = true;
    startBtn.textContent = useAI ? 'Generating with AI...' : 'Generating...';
  }
  if (previewDiv) {
    previewDiv.innerHTML = `
        <div style="text-align: center; padding: 60px; color: var(--text-muted);">
            <div style="font-size: 48px; margin-bottom: 16px;"><span class="material-symbols-outlined" style="font-size: 48px;">hourglass_bottom</span></div>
            <div style="font-size: 16px; margin-bottom: 8px;">${useAI ? 'AI is analyzing your content...' : 'Parsing content structure...'}</div>
            <div style="font-size: 13px;">${useAI ? 'This may take 1-3 minutes (first run is slower)' : 'This should be quick'}</div>
            ${useAI ? '<div style="font-size: 12px; margin-top: 12px; color: var(--text-muted);"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: text-bottom;">lightbulb</span> Tip: Try "Phi-3" model for faster results</div>' : ''}
        </div>
    `;
  }

  try {
    let options: LlmGenerateOptions = {};
    if (useAI) {
      const modelSelect = document.getElementById('llm-model-select');
      const selectedModel = modelSelect instanceof HTMLSelectElement ? modelSelect.value : undefined;
      options = { model: selectedModel };
    }

    if (!window.generateOutline || !window.formatOutlineHTML) {
      throw new Error('Outline generator is unavailable');
    }

    editorState.generatedOutline = await window.generateOutline(
      toOutlineEditorAdapter(editor),
      useAI,
      options
    );

    if (!editorState.generatedOutline || editorState.generatedOutline.length === 0) {
      if (useAI) {
        throw new Error(
          'Could not generate outline from content. Please add more text (at least a few paragraphs).'
        );
      } else {
        throw new Error(
          'No headings found in document. For standard generation, use headings (H1-H6). Or try AI-Enhanced mode which works with any content.'
        );
      }
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

    console.log('Generated outline:', editorState.generatedOutline);

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
    let suggestions = '';

    if (errorMsg.includes('timed out') || errorMsg.includes('timeout')) {
      suggestions = `
                <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 6px; margin-top: 16px; text-align: left;">
                    <strong>⏱️ The AI is taking longer than expected</strong>
                    <div style="margin-top: 8px; font-size: 13px;">
                        <p style="margin: 8px 0;">This can happen when:</p>
                        <ul style="margin: 4px 0; padding-left: 20px;">
                            <li>Your content is very long (try with shorter content first)</li>
                            <li>The model is still loading into memory (first run is slower)</li>
                            <li>Your computer is using CPU instead of GPU</li>
                        </ul>
                        <p style="margin: 12px 0 4px 0;"><strong>Try these solutions:</strong></p>
                        <ul style="margin: 4px 0; padding-left: 20px;">
                            <li>Use a faster model: Select "Phi-3 (Fastest)" from the dropdown</li>
                            <li>Reduce your content to 1-2 pages of text</li>
                            <li>Wait a minute and try again (model might still be loading)</li>
                            <li>Use "Standard" mode instead (instant, no AI needed)</li>
                        </ul>
                    </div>
                </div>
            `;
    } else if (
      errorMsg.includes('Ollama') ||
      errorMsg.includes('Not Found') ||
      errorMsg.includes('404')
    ) {
      suggestions = `
                <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 6px; margin-top: 16px; text-align: left;">
                    <strong><span class="material-symbols-outlined" style="font-size: 16px; vertical-align: text-bottom;">lightbulb</span> To use AI generation:</strong>
                    <ol style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13px;">
                        <li>Download Ollama from <a href="https://ollama.ai" target="_blank" style="color: #0066cc;">ollama.ai</a></li>
                        <li>Install and start it (should auto-start)</li>
                        <li>Open PowerShell and run: <code style="background: #000; color: #0f0; padding: 2px 6px; border-radius: 3px;">ollama pull llama3.1</code></li>
                        <li>Wait for download to complete (~4.7GB)</li>
                        <li>Reload this page and try again</li>
                    </ol>
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #ffc107;">
                        <strong>Or use Standard generation:</strong><br>
                        <span style="font-size: 13px;">Switch to "Standard" mode above - works instantly without AI (requires headings in your document)</span>
                    </div>
                </div>
            `;
    }

    if (previewDiv) {
      previewDiv.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 16px;"><span class="material-symbols-outlined" style="font-size: 48px;">warning</span></div>
                <div style="font-size: 16px; margin-bottom: 8px; color: var(--danger);"><strong>AI Generation Failed</strong></div>
                <div style="font-size: 14px; color: var(--text-muted); margin-bottom: 8px;">${errorMsg}</div>
                ${suggestions}
            </div>
        `;
    }

    if (startBtn instanceof HTMLButtonElement) {
      startBtn.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">refresh</span>Try Again';
      startBtn.disabled = false;
    }
  }
}

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
      toOutlineEditorAdapter(editor)
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
    console.log(
      `Looking for class with id/classNumber: ${currentClassId}, found at index: ${classIndex}`
    );

    if (classIndex !== -1) {
      allClasses[classIndex].generatedOutline = generatedOutline;
      allClasses[classIndex].outline = generatedOutline;
      console.log(`Updated class at index ${classIndex} with outline`);
      console.log('Outline structure:', generatedOutline);

      console.log('Saving outline with the current document revision');
      const saved = await saveEditorMetadata({
        generatedOutline,
        outline: generatedOutline,
      });
      if (!saved) return;

      updateOutlineNavigatorFromGenerated(generatedOutline);

      alert('Outline applied to class successfully!');
      closeModal('outline-modal');
      console.log('Applied outline:', generatedOutline);
    } else {
      throw new Error('Class not found');
    }
  } catch (error: unknown) {
    console.error('Apply outline failed:', error);
    alert('Failed to apply outline: ' + getErrorMessage(error));
  }
}
