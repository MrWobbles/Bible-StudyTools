import { enhanceOutlineWithLLM, generateOutline, generateOutlineWithLLM } from './llm';
import {
  exportOutlineJSON,
  extractVerseReferences,
  formatOutlineHTML,
  generateOutlineFromEditor,
  parseEditorToOutline
} from './parser';

const exported = {
  generateOutlineFromEditor,
  parseEditorToOutline,
  extractVerseReferences,
  formatOutlineHTML,
  exportOutlineJSON,
  generateOutlineWithLLM,
  generateOutline,
  enhanceOutlineWithLLM
};

if (typeof window !== 'undefined') {
  window.generateOutlineFromEditor = generateOutlineFromEditor;
  window.parseEditorToOutline = parseEditorToOutline;
  window.extractVerseReferences = extractVerseReferences;
  window.formatOutlineHTML = formatOutlineHTML;
  window.exportOutlineJSON = exportOutlineJSON;
  window.generateOutlineWithLLM = generateOutlineWithLLM;
  window.generateOutline = generateOutline;
  window.enhanceOutlineWithLLM = enhanceOutlineWithLLM;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
}
