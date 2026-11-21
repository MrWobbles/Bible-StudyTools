import { searchHighlightPluginKey } from '../extensions/searchHighlight';
import type { SearchMatchRange } from '../extensions/searchHighlight';
import { closeModal, editorState } from '../state';

let currentMatches: SearchMatchRange[] = [];
let activeMatchIndex = -1;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSearchInputs(): {
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  wholeWord: boolean;
} {
  const searchInputEl = document.getElementById('search-input');
  const replaceInputEl = document.getElementById('replace-input');
  const caseSensitiveEl = document.getElementById('case-sensitive');
  const wholeWordEl = document.getElementById('whole-word');

  return {
    searchTerm: searchInputEl instanceof HTMLInputElement ? searchInputEl.value : '',
    replaceTerm: replaceInputEl instanceof HTMLInputElement ? replaceInputEl.value : '',
    caseSensitive: caseSensitiveEl instanceof HTMLInputElement ? caseSensitiveEl.checked : false,
    wholeWord: wholeWordEl instanceof HTMLInputElement ? wholeWordEl.checked : false,
  };
}

function findMatchesInDoc(
  searchTerm: string,
  caseSensitive: boolean,
  wholeWord: boolean,
): SearchMatchRange[] {
  const { editor } = editorState;
  if (!editor || !searchTerm) return [];

  const escaped = escapeRegExp(searchTerm);
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(pattern, flags);
  const matches: SearchMatchRange[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(node.text)) !== null) {
      if (match[0].length === 0) {
        regex.lastIndex += 1;
        continue;
      }
      matches.push({
        from: pos + match.index,
        to: pos + match.index + match[0].length,
      });
    }
  });

  return matches;
}

function applyHighlights(): void {
  const { editor } = editorState;
  if (!editor) return;
  const tr = editor.state.tr.setMeta(searchHighlightPluginKey, {
    matches: currentMatches,
    activeIndex: activeMatchIndex,
  });
  editor.view.dispatch(tr);
}

function updateResultsLabel(customMessage?: string): void {
  const resultsEl = document.getElementById('search-results');
  if (!resultsEl) return;

  if (customMessage) {
    resultsEl.textContent = customMessage;
    return;
  }

  const { searchTerm } = getSearchInputs();
  if (!searchTerm) {
    resultsEl.textContent = '';
    return;
  }

  if (currentMatches.length === 0) {
    resultsEl.textContent = '0 of 0';
    return;
  }

  const displayIndex = activeMatchIndex >= 0 ? activeMatchIndex + 1 : 0;
  resultsEl.textContent = `${displayIndex} of ${currentMatches.length}`;
}

function scrollActiveMatchIntoView(): void {
  const { editor } = editorState;
  if (!editor || activeMatchIndex < 0 || activeMatchIndex >= currentMatches.length) return;

  requestAnimationFrame(() => {
    const activeEl = editor.view.dom.querySelector('.search-match-active');
    if (activeEl instanceof HTMLElement) {
      activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
}

export function refreshSearchMatches(preserveIndex = false): void {
  const { searchTerm, caseSensitive, wholeWord } = getSearchInputs();
  currentMatches = findMatchesInDoc(searchTerm, caseSensitive, wholeWord);

  if (currentMatches.length === 0) {
    activeMatchIndex = -1;
  } else if (preserveIndex && activeMatchIndex >= 0) {
    activeMatchIndex = Math.min(activeMatchIndex, currentMatches.length - 1);
  } else {
    activeMatchIndex = 0;
  }

  applyHighlights();
  updateResultsLabel();
  if (activeMatchIndex >= 0) {
    scrollActiveMatchIntoView();
  }
}

export function openSearchPanel(): void {
  const panel = document.getElementById('search-modal');
  const searchInputEl = document.getElementById('search-input');
  if (!panel) return;

  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');

  const { editor } = editorState;
  if (editor && searchInputEl instanceof HTMLInputElement) {
    const { from, to, empty } = editor.state.selection;
    if (!empty) {
      const selectedText = editor.state.doc.textBetween(from, to, ' ').trim();
      if (selectedText && !selectedText.includes('\n')) {
        searchInputEl.value = selectedText;
      }
    }
    searchInputEl.focus();
    searchInputEl.select();
  }

  refreshSearchMatches(false);
}

export function closeSearchPanel(): void {
  closeModal('search-modal');
  currentMatches = [];
  activeMatchIndex = -1;
  applyHighlights();
  updateResultsLabel();
}

export function findNext(): void {
  const { searchTerm } = getSearchInputs();
  if (!searchTerm) return;

  if (currentMatches.length === 0) {
    refreshSearchMatches(false);
    return;
  }

  activeMatchIndex = (activeMatchIndex + 1) % currentMatches.length;
  applyHighlights();
  updateResultsLabel();
  scrollActiveMatchIntoView();
}

export function findPrevious(): void {
  const { searchTerm } = getSearchInputs();
  if (!searchTerm) return;

  if (currentMatches.length === 0) {
    refreshSearchMatches(false);
    return;
  }

  activeMatchIndex = (activeMatchIndex - 1 + currentMatches.length) % currentMatches.length;
  applyHighlights();
  updateResultsLabel();
  scrollActiveMatchIntoView();
}

export function replaceOne(): void {
  const { editor } = editorState;
  if (!editor) return;

  const { searchTerm, replaceTerm } = getSearchInputs();
  if (!searchTerm) return;

  if (currentMatches.length === 0 || activeMatchIndex < 0) {
    refreshSearchMatches(false);
    if (currentMatches.length === 0 || activeMatchIndex < 0) return;
  }

  const target = currentMatches[activeMatchIndex];
  const tr = editor.state.tr.insertText(replaceTerm, target.from, target.to);
  editor.view.dispatch(tr);

  refreshSearchMatches(true);
}

export function replaceAll(): void {
  const { editor } = editorState;
  if (!editor) return;

  const { searchTerm, replaceTerm, caseSensitive, wholeWord } = getSearchInputs();
  if (!searchTerm) return;

  const matches = findMatchesInDoc(searchTerm, caseSensitive, wholeWord);
  if (matches.length === 0) {
    currentMatches = [];
    activeMatchIndex = -1;
    applyHighlights();
    updateResultsLabel('0 replaced');
    return;
  }

  const tr = editor.state.tr;
  for (let i = matches.length - 1; i >= 0; i--) {
    tr.insertText(replaceTerm, matches[i].from, matches[i].to);
  }
  editor.view.dispatch(tr);

  const count = matches.length;
  currentMatches = [];
  activeMatchIndex = -1;
  applyHighlights();
  updateResultsLabel(`Replaced ${count}`);
}

export function setupSearchReplaceListeners(): void {
  const searchInputEl = document.getElementById('search-input');
  const replaceInputEl = document.getElementById('replace-input');
  const caseSensitiveEl = document.getElementById('case-sensitive');
  const wholeWordEl = document.getElementById('whole-word');
  const panel = document.getElementById('search-modal');

  searchInputEl?.addEventListener('input', () => {
    refreshSearchMatches(false);
  });

  searchInputEl?.addEventListener('keydown', (e: Event) => {
    if (!(e instanceof KeyboardEvent)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        findPrevious();
      } else {
        findNext();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchPanel();
    }
  });

  replaceInputEl?.addEventListener('keydown', (e: Event) => {
    if (!(e instanceof KeyboardEvent)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      replaceOne();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchPanel();
    }
  });

  panel?.addEventListener('keydown', (e: Event) => {
    if (e instanceof KeyboardEvent && e.key === 'Escape') {
      e.preventDefault();
      closeSearchPanel();
    }
  });

  caseSensitiveEl?.addEventListener('change', () => {
    refreshSearchMatches(false);
  });

  wholeWordEl?.addEventListener('change', () => {
    refreshSearchMatches(false);
  });
}
