import { teacherState } from './state';
import { sendCommand, updateControlVisibility } from './sync';
import type { BibleListResponse } from './types';

const BIBLE_BOOKS = [
  'Genesis', 'Gen', 'Exodus', 'Ex', 'Exo', 'Leviticus', 'Lev', 'Numbers', 'Num', 'Deuteronomy', 'Deut', 'Deu',
  'Joshua', 'Josh', 'Judges', 'Judg', 'Ruth', '1 Samuel', '2 Samuel', 'Samuel', 'Sam', '1 Kings', '2 Kings', 'Kings',
  '1 Chronicles', '2 Chronicles', 'Chronicles', 'Chron', 'Chr', 'Ezra', 'Nehemiah', 'Neh', 'Esther', 'Est',
  'Job', 'Psalm', 'Psalms', 'Ps', 'Proverbs', 'Prov', 'Pro', 'Ecclesiastes', 'Eccles', 'Ecc',
  'Song of Solomon', 'Song', 'Isaiah', 'Isa', 'Jeremiah', 'Jer', 'Lamentations', 'Lam',
  'Ezekiel', 'Ezek', 'Eze', 'Daniel', 'Dan', 'Hosea', 'Hos', 'Joel', 'Amos', 'Obadiah', 'Obad',
  'Jonah', 'Jon', 'Micah', 'Mic', 'Nahum', 'Nah', 'Habakkuk', 'Hab', 'Zephaniah', 'Zeph',
  'Haggai', 'Hag', 'Zechariah', 'Zech', 'Zec', 'Malachi', 'Mal',
  'Matthew', 'Matt', 'Mat', 'Mark', 'Luke', 'John', 'Acts',
  'Romans', 'Rom', '1 Corinthians', '2 Corinthians', 'Corinthians', 'Cor',
  'Galatians', 'Gal', 'Ephesians', 'Eph', 'Philippians', 'Phil',
  'Colossians', 'Col', '1 Thessalonians', '2 Thessalonians', 'Thessalonians', 'Thess', 'Thes',
  '1 Timothy', '2 Timothy', 'Timothy', 'Tim', 'Titus', 'Tit', 'Philemon', 'Philem',
  'Hebrews', 'Heb', 'James', 'Jam', 'Jas', '1 Peter', '2 Peter', 'Peter', 'Pet',
  '1 John', '2 John', '3 John', 'Jude', 'Revelation', 'Rev'
];

const VERSE_REFERENCE_PATTERN = new RegExp(
  `\\b(\\d\\s+)?(${BIBLE_BOOKS.join('|')})\\s+\\d+(?::\\d+)?(?:[–-]\\d+(?::\\d+)?)?\\b`,
  'gi'
);

export function sendVerseToStudent(reference: string, translation = 'nkjv'): void {
  if (!reference || !reference.trim()) return;
  teacherState.currentMediaType = 'verse';
  updateControlVisibility();
  sendCommand('displayMedia', {
    media: {
      type: 'verse',
      reference: reference.trim(),
      translation: (translation || 'nkjv').trim(),
      title: reference.trim()
    }
  });
}

export function linkifyBibleVerses(html: string): string {
  return html.replace(VERSE_REFERENCE_PATTERN, (match) => {
    return `<span class="verse-reference" data-verse="${match.trim()}">${match}</span>`;
  });
}

export function attachVerseReferenceHandlers(container: Element): void {
  const verseRefs = container.querySelectorAll('.verse-reference');
  verseRefs.forEach((ref) => {
    if (!(ref instanceof HTMLElement)) return;
    ref.addEventListener('click', (event: MouseEvent) => {
      event.preventDefault();
      const verse = (ref.dataset.verse || ref.textContent || '').trim();
      if (verse) {
        const translation =
          teacherState.classConfig?.bibleTranslation ||
          window.BIBLE_STUDY_CONFIG?.bibleTranslation ||
          'nkjv';
        sendVerseToStudent(verse, translation);
        ref.style.background = 'rgba(240, 180, 41, 0.3)';
        setTimeout(() => {
          ref.style.background = '';
        }, 500);
      }
    });
  });
}

export function renderVerseDrawer(): void {
  let verseDrawer = document.getElementById('verse-drawer');
  if (!verseDrawer) {
    verseDrawer = document.createElement('aside');
    verseDrawer.id = 'verse-drawer';
    verseDrawer.className = 'verse-drawer';
    verseDrawer.innerHTML = `
      <div class="media-drawer-header">
        <div>
          <div class="tag">Bible verse</div>
          <h3 style="margin: 6px 0 0;">Quick verse</h3>
        </div>
        <button id="verse-close-btn" aria-label="Close quick verse panel" title="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="media-drawer-body" id="verse-panel"></div>
    `;
    document.body.appendChild(verseDrawer);
  }

  const versePanel = document.getElementById('verse-panel');
  if (!versePanel) return;

  versePanel.innerHTML = `
    <div class="quick-verse-form-row quick-verse-main-row">
      <input id="verse-ref-input" class="quick-verse-input" type="text" placeholder="e.g., John 3:16–18" />
      <input id="verse-translation-input" class="quick-verse-input" list="bible-versions" placeholder="e.g. NKJV" aria-label="Bible version" style="width: 120px;" value="NKJV" />
      <datalist id="bible-versions">
        <option value="NKJV">New King James Version</option>
        <option value="KJV">King James Version</option>
        <option value="CSB">Christian Standard Bible</option>
      </datalist>
      <button id="verse-send-btn" class="quick-verse-btn">Show</button>
    </div>
    <div class="quick-verse-form-row quick-verse-nav-row">
      <button id="verse-prev" class="quick-verse-btn quick-verse-btn-nav"><span class="material-symbols-outlined">navigate_before</span>Previous</button>
      <button id="verse-next" class="quick-verse-btn quick-verse-btn-nav"><span class="material-symbols-outlined">navigate_next</span>Next</button>
    </div>
    <div class="quick-verse-help">
      Defaults to NKJV. Uses API.Bible for exact premium matches. Falls back to WEB, KJV, or NET (labs.bible.org) if the exact translation is unavailable.
    </div>
  `;

  const verseRefInput = document.getElementById('verse-ref-input');
  const verseTranslationInput = document.getElementById('verse-translation-input');
  const verseSendBtn = document.getElementById('verse-send-btn');
  const datalist = document.getElementById('bible-versions');

  const bibleListUrl = '/api/bible/bibles';
  console.debug('[Teacher] fetching Bible list from proxy:', bibleListUrl);
  fetch(bibleListUrl)
    .then((res) => res.json())
    .then((raw: unknown) => {
      const data = raw as BibleListResponse | null;
      if (data && Array.isArray(data.data) && datalist instanceof HTMLDataListElement) {
        datalist.innerHTML = '';
        data.data.forEach((b) => {
          const option = document.createElement('option');
          option.value = b.abbreviation || b.name || '';
          option.textContent = `${b.name || ''} (${b.language?.name || ''})`;
          datalist.appendChild(option);
        });
        const fallbacks = ['WEB', 'ESV', 'NIV', 'NASB', 'NLT', 'AMP'];
        fallbacks.forEach((f) => {
          const option = document.createElement('option');
          option.value = f;
          datalist.appendChild(option);
        });
      }
    })
    .catch((err: unknown) => console.error('Failed to fetch API.Bible list for typeahead:', err));

  if (verseSendBtn instanceof HTMLButtonElement && verseRefInput instanceof HTMLInputElement) {
    const translationEl =
      verseTranslationInput instanceof HTMLInputElement ? verseTranslationInput : null;
    verseSendBtn.onclick = () =>
      sendVerseToStudent(verseRefInput.value, translationEl?.value || 'NKJV');
  }

  const page = document.querySelector('.page');
  const verseToggleBtn = document.getElementById('toggle-verse-btn');
  const verseCloseBtn = document.getElementById('verse-close-btn');
  if (verseToggleBtn instanceof HTMLElement) {
    verseToggleBtn.onclick = () => {
      verseDrawer?.classList.toggle('open');
      page?.classList.toggle('verse-drawer-open');
    };
  }
  if (verseCloseBtn instanceof HTMLElement) {
    verseCloseBtn.onclick = () => {
      verseDrawer?.classList.remove('open');
      page?.classList.remove('verse-drawer-open');
    };
  }
}

export function bindVerseControls(): void {
  const versePrevBtn = document.getElementById('verse-prev');
  const verseNextBtn = document.getElementById('verse-next');
  if (versePrevBtn) versePrevBtn.onclick = () => sendCommand('versePrevious');
  if (verseNextBtn) verseNextBtn.onclick = () => sendCommand('verseNext');

  const globalVersePrev = document.getElementById('global-verse-prev');
  const globalVerseNext = document.getElementById('global-verse-next');
  if (globalVersePrev) globalVersePrev.onclick = () => sendCommand('versePrevious');
  if (globalVerseNext) globalVerseNext.onclick = () => sendCommand('verseNext');

  const verseFontDecrease = document.getElementById('verse-font-decrease');
  const verseFontIncrease = document.getElementById('verse-font-increase');
  if (verseFontDecrease) verseFontDecrease.onclick = () => sendCommand('verseFontDecrease');
  if (verseFontIncrease) verseFontIncrease.onclick = () => sendCommand('verseFontIncrease');
}
