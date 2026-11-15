import { closeModal, editorState, updateSaveStatus } from '../state';
import { isRecord, matchesClassId } from '../types';
import type {
  ApiBibleItem,
  ApiBiblePassage,
  BibleApiSimpleResponse,
  FetchedVerseData,
  LabsBibleVerseItem,
  VerseLookupResult,
} from '../types';

async function fetchVerseFromLabs(
  reference: string,
  translation: string
): Promise<FetchedVerseData | null> {
  const version = String(translation || 'nkjv').toUpperCase();
  const url = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&version=${encodeURIComponent(version)}&type=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const lines = (data as LabsBibleVerseItem[]).map((item) => {
      const cleanText = String(item.text || '').replace(/<[^>]*>/g, '');
      return `<sup>${item.verse}</sup> ${cleanText}`;
    });
    return { title: reference, text: lines.join(' '), translation: version };
  } catch (err: unknown) {
    console.warn('labs.bible.org fetch failed:', err);
    return null;
  }
}

async function fetchVerseFromBibleApi(
  reference: string,
  translation: string
): Promise<FetchedVerseData | null> {
  const version = String(translation || 'web').toLowerCase();
  const url = `/api/bible/simple?reference=${encodeURIComponent(reference)}&translation=${encodeURIComponent(version)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as BibleApiSimpleResponse;
    const text = (data.text || '').trim();
    if (!text) return null;

    const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      title: data.reference || reference,
      text: cleanText,
      translation: (data.translation_name || version).toUpperCase(),
    };
  } catch (err: unknown) {
    console.warn('bible-api.com fetch failed:', err);
    return null;
  }
}

export async function fetchVerseText(
  reference: string,
  translation: string
): Promise<FetchedVerseData | null> {
  const normTrans = String(translation || 'nkjv').toLowerCase();

  // Try API.Bible proxy first
  try {
    const mapRes = await fetch('/api/bible/bibles');
    if (mapRes.ok) {
      const mapData: unknown = await mapRes.json();
      let bibleId: string | null = null;
      if (isRecord(mapData) && Array.isArray(mapData.data)) {
        for (const b of mapData.data as ApiBibleItem[]) {
          if (
            (b.abbreviation && b.abbreviation.toLowerCase() === normTrans) ||
            (b.abbreviationLocal && b.abbreviationLocal.toLowerCase() === normTrans) ||
            (b.name && b.name.toLowerCase() === normTrans)
          ) {
            bibleId = b.id || null;
            break;
          }
        }
      }
      if (!bibleId) {
        const hardcoded: Record<string, string> = {
          nkjv: '63097d2a0a2f7db3-01',
          kjv: 'de4e12af7f28f599-01',
          csb: 'a556c5305ee15c3f-01',
        };
        bibleId = hardcoded[normTrans] || null;
      }

      if (bibleId) {
        const url = `/api/bible/passages?bibleId=${encodeURIComponent(bibleId)}&reference=${encodeURIComponent(reference)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data: unknown = await res.json();
          let passage: ApiBiblePassage | undefined;
          if (isRecord(data)) {
            if (Array.isArray(data.data)) {
              passage = data.data[0] as ApiBiblePassage | undefined;
            } else if (isRecord(data.data) && Array.isArray(data.data.passages)) {
              passage = data.data.passages[0] as ApiBiblePassage | undefined;
            } else if (isRecord(data.data)) {
              passage = data.data as ApiBiblePassage;
            }
          }
          if (passage && passage.content) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = passage.content;
            tempDiv.querySelectorAll('.f, .x').forEach((el) => el.remove());
            const text = (tempDiv.textContent || '').replace(/\s+/g, ' ').trim();
            if (text) {
              return {
                title: passage.reference || reference,
                text,
                translation: normTrans.toUpperCase(),
              };
            }
          }
        }
      }
    }
  } catch (err: unknown) {
    console.warn(
      'API.Bible fetch failed in editor, your API_BIBLE_KEY may be invalid. Falling back...',
      err
    );
  }

  // Fallback to bible-api.com
  const bibleApi = await fetchVerseFromBibleApi(reference, normTrans);
  if (bibleApi) return bibleApi;

  // Fallback to labs.bible.org (NET only)
  if (normTrans === 'net') {
    const labs = await fetchVerseFromLabs(reference, normTrans);
    if (labs) return labs;
  }

  // Final fallback to WEB if everything else fails
  const fallbackWeb = await fetchVerseFromBibleApi(reference, 'web');
  if (fallbackWeb) {
    fallbackWeb.translation = 'WEB';
    return fallbackWeb;
  }

  return null;
}

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

  editor
    .chain()
    .focus()
    .insertContent(`<a href="#" class="verse-reference" data-verse="${verseInput}">${verseInput}</a> `)
    .run();

  if (insertText) {
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
        editor
          .chain()
          .focus()
          .insertContent(
            `<blockquote><p><em>${verseData.text}</em></p><p style="text-align: right; font-size: 0.9em; color: #666;">— ${verseData.title} (${verseData.translation})</p></blockquote>`
          )
          .run();
      } else {
        console.warn('Could not fetch verse text for:', verseInput);
        editor
          .chain()
          .focus()
          .insertContent(
            '<blockquote><p><em>[Verse text not available - please add manually]</em></p></blockquote>'
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
      matchesClassId(c, editorState.currentClassId)
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
  saveMetadata: (updates: Record<string, unknown>) => Promise<boolean>
): Promise<void> {
  const select = document.getElementById('bible-translation-select');
  if (!(select instanceof HTMLSelectElement)) return;

  const translation = select.value;

  try {
    if (editorState.currentClassId) {
      if (await saveMetadata({ bibleTranslation: translation })) {
        console.log('Bible translation preference saved:', translation);
        updateSaveStatus('Translation saved');
        setTimeout(() => updateSaveStatus('Saved'), 2000);
      }
    } else {
      localStorage.setItem('bible-translation-preference', translation);
      console.log('Bible translation preference saved to localStorage:', translation);
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
  openModalFn: (modalId: string) => void
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
  try {
    const prompt = `Find 3-5 Bible verses that match or relate to the following thought or topic. For each, return the reference and the verse text.\n\nThought: "${thought}"\n\nFormat:\nReference: <book chapter:verse>\nText: <verse text>\n---`;
    if (!window.generateCompletion) {
      throw new Error('LLM completion service unavailable');
    }
    const response = await window.generateCompletion(prompt, {
      model: undefined,
      temperature: 0.2,
    });
    verses = parseLLMVerseResults(response);
  } catch {
    if (resultsEl) {
      resultsEl.innerHTML = '<div style="color:red;">Error searching for verses.</div>';
    }
    if (loadingEl) loadingEl.style.display = 'none';
    return;
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
      </div>`
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
