import { generateOutlineFromEditor } from './parser';

export async function generateOutlineWithLLM(
  editor: OutlineEditorAdapter | null | undefined,
  options: LlmGenerateOptions = {}
): Promise<OutlineSection[]> {
  if (!editor) {
    throw new Error('Editor instance is required');
  }

  const checkFn = window.checkOllamaAvailability;
  const generateFn = window.generateOutlineStructure;

  if (typeof checkFn !== 'function' || typeof generateFn !== 'function') {
    throw new Error('LLM service not loaded. Please include llmService.js');
  }

  const isAvailable = await checkFn();
  if (!isAvailable) {
    throw new Error('AI service is not available. Configure AI_API_KEY on the server or start local Ollama.');
  }

  const content = editor.getHTML();

  const div = document.createElement('div');
  div.innerHTML = content;
  const plainText = div.textContent || div.innerText || '';

  if (!plainText || plainText.trim().length < 50) {
    throw new Error('Content is too short for analysis. Please add at least a few sentences.');
  }

  try {
    const outline = await generateFn(plainText.trim(), options);

    if (!outline || outline.length === 0) {
      throw new Error('LLM returned empty outline');
    }

    return outline;
  } catch (error: unknown) {
    console.error('LLM outline generation failed:', error);
    throw error;
  }
}

export async function generateOutline(
  editor: OutlineEditorAdapter,
  useLLM = false,
  options: LlmGenerateOptions = {}
): Promise<OutlineSection[]> {
  if (useLLM) {
    return await generateOutlineWithLLM(editor, options);
  }
  return generateOutlineFromEditor(editor);
}

export async function enhanceOutlineWithLLM(
  outline: OutlineSection[],
  editor: OutlineEditorAdapter | null | undefined
): Promise<OutlineSection[]> {
  if (!editor) {
    throw new Error('Editor instance is required');
  }

  const checkFn = window.checkOllamaAvailability;
  const enhanceFn = window.enhanceOutline;

  if (typeof checkFn !== 'function' || typeof enhanceFn !== 'function') {
    throw new Error('LLM service not loaded');
  }

  const isAvailable = await checkFn();
  if (!isAvailable) {
    throw new Error('AI service is not available');
  }

  const content = editor.getText();
  return await enhanceFn(outline, content);
}
