import { editorState } from '../state';
import { getErrorMessage } from '../types';
import { openModal } from './modals';

export async function openAIAssistant(): Promise<void> {
  openModal('ai-assistant-modal');

  const statusDiv = document.getElementById('ai-status');
  if (!statusDiv) return;
  try {
    const aiAvailable = await checkOllamaAvailability();

    if (aiAvailable) {
      statusDiv.style.display = 'block';
      statusDiv.style.background = '#d4edda';
      statusDiv.style.color = '#155724';
      statusDiv.style.border = '1px solid #c3e6cb';
      statusDiv.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">check_circle</span> AI is ready to help!';
    } else {
      statusDiv.style.display = 'block';
      statusDiv.style.background = '#fff3cd';
      statusDiv.style.color = '#856404';
      statusDiv.style.border = '1px solid #ffc107';
      statusDiv.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">warning</span> AI is not configured. Set AI_API_KEY on the server or start local Ollama.';
    }
  } catch {
    statusDiv.style.display = 'block';
    statusDiv.style.background = '#f8d7da';
    statusDiv.style.color = '#721c24';
    statusDiv.style.border = '1px solid #f5c6cb';
    statusDiv.innerHTML =
      '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">error</span> Could not connect to AI service.';
  }
}

export async function askAIQuestion(): Promise<void> {
  const { editor } = editorState;
  if (!editor) return;
  const questionInput = document.getElementById('ai-question');
  const question =
    questionInput instanceof HTMLInputElement || questionInput instanceof HTMLTextAreaElement
      ? questionInput.value.trim()
      : '';

  if (!question) {
    alert('Please enter a question');
    return;
  }

  const askBtn = document.getElementById('btn-ask-ai');
  const responseContainer = document.getElementById('ai-response-container');
  const responseDiv = document.getElementById('ai-response');

  if (askBtn instanceof HTMLButtonElement) {
    askBtn.disabled = true;
    askBtn.innerHTML =
      '<span class="material-symbols-outlined rotating" style="vertical-align: middle; font-size: 18px;">progress_activity</span> Thinking...';
  }
  if (responseContainer) responseContainer.style.display = 'block';
  if (responseDiv) responseDiv.innerHTML = '<em style="color: #666;">AI is analyzing your content...</em>';

  try {
    const aiAvailable = await checkOllamaAvailability();
    if (!aiAvailable) {
      throw new Error('AI service is not available. Configure AI_API_KEY on the server or start local Ollama.');
    }

    const editorText = editor.getText();

    if (!editorText || editorText.trim().length < 10) {
      throw new Error('Please add some content to your document before asking questions.');
    }

    const systemPrompt = `You are a helpful Bible study curriculum assistant. The user is creating Bible study content and needs your expertise.

Here is the content they are working on:

${editorText}

Please answer their question thoughtfully, considering the content they've created. Provide practical, actionable suggestions that would enhance their Bible study lesson.`;

    if (!window.generateCompletion) {
      throw new Error('AI completion service is not available.');
    }

    const response = await window.generateCompletion(question, {
      system: systemPrompt,
      temperature: 0.7,
      model: 'llama3.1',
    });

    if (responseDiv) responseDiv.innerHTML = response || 'No response received from AI.';
  } catch (error: unknown) {
    console.error('AI question failed:', error);
    if (responseDiv) {
      responseDiv.innerHTML = `<span style="color: #721c24;"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: text-bottom;">error</span> Error: ${getErrorMessage(error)}</span>`;
    }
  } finally {
    if (askBtn instanceof HTMLButtonElement) {
      askBtn.disabled = false;
      askBtn.innerHTML =
        '<span class="material-symbols-outlined" style="vertical-align: middle; font-size: 18px;">send</span> Ask AI';
    }
  }
}

export async function copyAIResponse(): Promise<void> {
  const responseDiv = document.getElementById('ai-response');
  const text = responseDiv?.textContent || '';

  try {
    await navigator.clipboard.writeText(text);

    const copyBtn = document.getElementById('btn-copy-response');
    if (copyBtn) {
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML =
        '<span class="material-symbols-outlined" style="vertical-align: middle; font-size: 18px;">check</span> Copied!';
      copyBtn.style.background = '#28a745';

      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
        copyBtn.style.background = '';
      }, 2000);
    }
  } catch (error: unknown) {
    alert('Failed to copy: ' + getErrorMessage(error));
  }
}
