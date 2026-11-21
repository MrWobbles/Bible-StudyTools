import { closeModal, editorState, updateSaveStatus } from '../state';
import { matchesClassId } from '../types';
import type { VerseLookupResult } from '../types';
import { fetchVerseText, searchVersesByKeywords } from './verseApi';

export { fetchVerseText };

export async function insertVerseReference(): Promise<void> {
  const { editor } = editorState;
  if (!editor) return;
  const verseInputEl = document.getElementById('verse-input');
  const verseInput = verseInputEl instanceof HTMLInputElement ? verseInputEl.value.trim() : '';
  const insertTextEl = document.getElementById('insert-verse-text');
  const insertText = insertTextEl instanceof HTMLInputElement ? insertTextEl.checked : false;
  const translationEl = document.getElementById('bible-translation-select');
  const translation = translationEl instanceof HTMLSelectElement ? translationEl.value : 'nkjv';

  if (!verseInput) {
    alert('Please enter a verse reference');
    return;
  }

  const safeVerseInput = verseInput.replace(/"/g, '&quot;');

  if (!insertText) {
    editor
      .chain()
      .focus()
      .insertContent(`<a href="#" class="verse-reference" data-verse="${safeVerseInput}">${verseInput}</a> `)
      .run();
  } else {
    const insertBtn = document.getElementById('btn-insert-verse');
    const originalText = insertBtn ? insertBtn.innerHTML : '';
    if (insertBtn instanceof HTMLButtonElement) {
      insertBtn.innerHTML =
        '<span class="material-symbols-outlined">hourglass_empty</span>Loading...';
      insertBtn.disabled = true;
    }

    try {
      const verseData = await fetchVerseText(verseInput, translation);

      if (verseData && verseData.text) {
        const bodyHtml = verseData.text.trim().startsWith('<p>')
          ? verseData.text
          : `<p>${verseData.text}</p>`;
        const safeRef = verseData.title.replace(/"/g, '&quot;');
        editor
          .chain()
          .focus()
          .insertContent(
            `<blockquote>${bodyHtml}<p style="text-align: right; font-size: 0.9em; color: #666;">— <a href="#" class="verse-reference" data-verse="${safeRef}">${verseData.title}</a> (${verseData.translation})</p></blockquote>`,
          )
          .run();
      } else {
        console.warn('Could not fetch verse text for:', verseInput);
        editor
          .chain()
          .focus()
          .insertContent(
            `<blockquote><p><em>[Verse text not available - please add manually]</em></p><p style="text-align: right; font-size: 0.9em; color: #666;">— <a href="#" class="verse-reference" data-verse="${safeVerseInput}">${verseInput}</a></p></blockquote>`,
          )
          .run();
      }
    } catch (err: unknown) {
      console.error('Error fetching verse:', err);
    } finally {
      if (insertBtn instanceof HTMLButtonElement) {
        insertBtn.innerHTML = originalText;
        insertBtn.disabled = false;
      }
    }
  }

  closeModal('verse-modal');
  if (verseInputEl instanceof HTMLInputElement) {
    verseInputEl.value = '';
  }
}

export function loadBibleTranslationSetting(): void {
  const select = document.getElementById('bible-translation-select');
  if (!(select instanceof HTMLSelectElement)) return;

  let translation = 'nkjv';

  if (editorState.currentClassId && editorState.allClasses.length > 0) {
    const currentClass = editorState.allClasses.find((c) =>
      matchesClassId(c, editorState.currentClassId),
    );
    if (currentClass?.bibleTranslation) {
      translation = currentClass.bibleTranslation;
    }
  } else {
    translation = localStorage.getItem('bible-translation-preference') || 'nkjv';
  }

  select.value = translation;
}

export async function saveBibleTranslationSetting(
  saveMetadata: (updates: Record<string, unknown>) => Promise<boolean>,
): Promise<void> {
  const select = document.getElementById('bible-translation-select');
  if (!(select instanceof HTMLSelectElement)) return;

  const translation = select.value;

  try {
    if (editorState.currentClassId) {
      if (await saveMetadata({ bibleTranslation: translation })) {
        updateSaveStatus('Translation saved');
        setTimeout(() => updateSaveStatus('Saved'), 2000);
      }
    } else {
      localStorage.setItem('bible-translation-preference', translation);
    }
  } catch (error: unknown) {
    console.error('Failed to save translation preference:', error);
  }
}

function parseLLMVerseResults(response: string): VerseLookupResult[] {
  const results: VerseLookupResult[] = [];
  const blocks = response.split(/\n(?=Reference: )|\n(?=\d+\. Reference: )|---/g);
  for (const block of blocks) {
    const refMatch = block.match(/Reference:\s*([^\n]+)/i);
    const textMatch = block.match(/Text:\s*([\s\S]+)/i);
    if (refMatch && textMatch) {
      results.push({
        reference: refMatch[1].trim(),
        text: textMatch[1].trim().replace(/\n/g, ' '),
      });
    }
  }
  return results;
}

export async function handleVerseLookupByThought(
  openModalFn: (modalId: string) => void,
): Promise<void> {
  const { editor } = editorState;
  if (!editor) return;
  const selection = editor.state.selection;
  if (!selection || selection.empty) {
    alert('Highlight a phrase or thought to look up related verses.');
    return;
  }
  const from = selection.from;
  const to = selection.to;
  const thought = editor.state.doc.textBetween(from, to, ' ').trim();
  if (!thought) {
    alert('Highlight a phrase or thought to look up related verses.');
    return;
  }

  const queryEl = document.getElementById('verse-lookup-thought-query');
  const loadingEl = document.getElementById('verse-lookup-thought-loading');
  const resultsEl = document.getElementById('verse-lookup-thought-results');
  if (queryEl) queryEl.textContent = `Searching for: "${thought}"`;
  if (loadingEl) loadingEl.style.display = '';
  if (resultsEl) resultsEl.innerHTML = '';
  openModalFn('verse-lookup-thought-modal');

  let verses: VerseLookupResult[] = [];
  const translationEl = document.getElementById('bible-translation-select');
  const translation = translationEl instanceof HTMLSelectElement ? translationEl.value : 'nkjv';

  try {
    const canUseOllama =
      typeof window.checkOllamaAvailability === 'function' &&
      (await window.checkOllamaAvailability());
    if (canUseOllama && window.generateCompletion) {
      const prompt = `Find 3-5 Bible verses that match or relate to the following thought or topic. For each, return the reference and the verse text.\n\nThought: "${thought}"\n\nFormat:\nReference: <book chapter:verse>\nText: <verse text>\n---`;
      const response = await window.generateCompletion(prompt, {
        model: undefined,
        temperature: 0.2,
      });
      verses = parseLLMVerseResults(response);
    }
  } catch {
    // Fall back to API.Bible keyword search below
  }

  if (!verses.length) {
    try {
      verses = await searchVersesByKeywords(thought, translation);
    } catch {
      if (resultsEl) {
        resultsEl.innerHTML = '<div style="color:red;">Error searching for verses.</div>';
      }
      if (loadingEl) loadingEl.style.display = 'none';
      return;
    }
  }
  if (loadingEl) loadingEl.style.display = 'none';
  if (!verses.length) {
    if (resultsEl) resultsEl.innerHTML = '<div>No verses found.</div>';
    return;
  }
  if (resultsEl) {
    resultsEl.innerHTML = verses
      .map(
        (v, i) =>
          `<div class="verse-result" style="margin-bottom:6px; padding:4px 0; display:flex; align-items:flex-start; gap:6px;">
        <input type="checkbox" class="verse-select-checkbox" id="verse-select-${i}" data-index="${i}" style="margin-top:2px;width:15px;">
        <label for="verse-select-${i}" style="flex:1; cursor:pointer; font-size: 0.98em;"><strong>${v.reference}</strong>: <span>${v.text}</span></label>
      </div>`,
      )
      .join('');
  }
  window._verseLookupThoughtResults = { from, to, verses };

  const insertSelectedBtn = document.getElementById('btn-insert-selected-verses');
  if (insertSelectedBtn) {
    insertSelectedBtn.onclick = () => {
      const currentEditor = editorState.editor;
      if (!currentEditor) return;
      const data = window._verseLookupThoughtResults;
      if (!data || !data.verses) return;
      const checkboxes = document.querySelectorAll('.verse-select-checkbox:checked');
      if (!checkboxes.length) {
        alert('Select at least one verse to insert.');
        return;
      }
      const selected = Array.from(checkboxes)
        .filter((cb): cb is HTMLInputElement => cb instanceof HTMLInputElement)
        .map((cb) => data.verses[parseInt(cb.dataset.index || '', 10)])
        .filter((v): v is VerseLookupResult => Boolean(v));
      if (!selected.length) return;
      const insertText = selected.map((v) => `${v.reference}: ${v.text}`).join('<br>');
      currentEditor
        .chain()
        .focus()
        .insertContentAt({ from: data.from, to: data.to }, insertText + '<br>')
        .run();
      closeModal('verse-lookup-thought-modal');
    };
  }

  document.querySelectorAll('.verse-result').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.addEventListener('click', () => {
      const currentEditor = editorState.editor;
      if (!currentEditor) return;
      const idx = parseInt(el.dataset.index || '', 10);
      if (verses[idx]) {
        currentEditor
          .chain()
          .focus()
          .insertContentAt({ from, to }, `${verses[idx].reference}: ${verses[idx].text} `)
          .run();
        closeModal('verse-lookup-thought-modal');
      }
    });
  });
}
