import { editorState } from '../state';

export function findNext(): void {
  const { editor } = editorState;
  if (!editor) return;
  const searchInputEl = document.getElementById('search-input');
  const caseSensitiveEl = document.getElementById('case-sensitive');
  const resultsEl = document.getElementById('search-results');

  const searchTerm = searchInputEl instanceof HTMLInputElement ? searchInputEl.value : '';
  const caseSensitive =
    caseSensitiveEl instanceof HTMLInputElement ? caseSensitiveEl.checked : false;

  if (!searchTerm) {
    alert('Please enter a search term');
    return;
  }

  const content = editor.getText();
  const searchContent = caseSensitive ? content : content.toLowerCase();
  const searchFor = caseSensitive ? searchTerm : searchTerm.toLowerCase();

  const index = searchContent.indexOf(searchFor, editorState.currentSearchIndex);
  if (index !== -1) {
    editorState.currentSearchIndex = index + 1;
    if (resultsEl) resultsEl.textContent = `Found at position ${index}`;
  } else {
    editorState.currentSearchIndex = 0;
    if (resultsEl) resultsEl.textContent = 'No more results found';
  }
}

export function replaceOne(): void {
  const { editor } = editorState;
  if (!editor) return;
  const searchInputEl = document.getElementById('search-input');
  const replaceInputEl = document.getElementById('replace-input');
  const resultsEl = document.getElementById('search-results');

  const searchTerm = searchInputEl instanceof HTMLInputElement ? searchInputEl.value : '';
  const replaceTerm = replaceInputEl instanceof HTMLInputElement ? replaceInputEl.value : '';

  if (!searchTerm) {
    alert('Please enter a search term');
    return;
  }

  const html = editor.getHTML();
  const newHtml = html.replace(searchTerm, replaceTerm);
  editor.commands.setContent(newHtml);

  if (resultsEl) resultsEl.textContent = 'Replaced 1 occurrence';
}

export function replaceAll(): void {
  const { editor } = editorState;
  if (!editor) return;
  const searchInputEl = document.getElementById('search-input');
  const replaceInputEl = document.getElementById('replace-input');
  const resultsEl = document.getElementById('search-results');

  const searchTerm = searchInputEl instanceof HTMLInputElement ? searchInputEl.value : '';
  const replaceTerm = replaceInputEl instanceof HTMLInputElement ? replaceInputEl.value : '';

  if (!searchTerm) {
    alert('Please enter a search term');
    return;
  }

  const html = editor.getHTML();
  const regex = new RegExp(searchTerm, 'g');
  const newHtml = html.replace(regex, replaceTerm);
  const count = (html.match(regex) || []).length;

  editor.commands.setContent(newHtml);
  if (resultsEl) resultsEl.textContent = `Replaced ${count} occurrence(s)`;
}
