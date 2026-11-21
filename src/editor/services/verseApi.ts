import { isRecord } from '../types';
import type {
  ApiBibleItem,
  ApiBiblePassage,
  BibleApiSimpleResponse,
  FetchedVerseData,
  LabsBibleVerseItem,
} from '../types';

const CHRIST_WORDS_COLOR = '#b91c1c';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatApiBibleHtml(content: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  tempDiv.querySelectorAll('.f, .x').forEach((el) => el.remove());

  const lines: string[] = [];
  let currentLine = '';

  const flushLine = (): void => {
    const cleaned = currentLine.replace(/\s+/g, ' ').trim();
    if (cleaned) {
      lines.push(`<p>${cleaned}</p>`);
    }
    currentLine = '';
  };

  const renderInline = (node: Node, inChristWords = false): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      return escapeHtml(text);
    }
    if (!(node instanceof Element)) return '';

    if (node.classList.contains('v')) {
      const verseNum = (node.getAttribute('data-number') || node.textContent || '').trim();
      flushLine();
      return verseNum ? `<sup>${escapeHtml(verseNum)}</sup> ` : '';
    }

    const isWj = inChristWords || node.classList.contains('wj');
    const isItalic =
      node.tagName === 'EM' || node.tagName === 'I' || node.classList.contains('add');

    if (node.tagName === 'BR') {
      return ' ';
    }

    let inner = '';
    node.childNodes.forEach((child) => {
      inner += renderInline(child, isWj);
    });

    if (!inner) return '';

    if (node.classList.contains('wj') && !inChristWords) {
      inner = `<span style="color: ${CHRIST_WORDS_COLOR};">${inner}</span>`;
    }
    if (isItalic) {
      inner = `<em>${inner}</em>`;
    }
    if (node.tagName === 'P' || node.tagName === 'DIV') {
      if (currentLine.trim()) {
        currentLine += ` ${inner}`;
      } else {
        currentLine += inner;
      }
      return '';
    }

    return inner;
  };

  tempDiv.childNodes.forEach((child) => {
    const rendered = renderInline(child, false);
    if (rendered) {
      currentLine += rendered;
    }
  });
  flushLine();

  if (lines.length > 0) {
    return lines.join('');
  }

  const fallbackText = (tempDiv.textContent || '').replace(/\s+/g, ' ').trim();
  return fallbackText ? `<p>${escapeHtml(fallbackText)}</p>` : '';
}

async function fetchVerseFromLabs(
  reference: string,
  translation: string,
): Promise<FetchedVerseData | null> {
  const version = String(translation || 'nkjv').toUpperCase();
  const url = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&version=${encodeURIComponent(version)}&type=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const lines = (data as LabsBibleVerseItem[]).map((item) => {
      const cleanText = String(item.text || '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return `<p><sup>${escapeHtml(String(item.verse))}</sup> ${escapeHtml(cleanText)}</p>`;
    });
    return { title: reference, text: lines.join(''), translation: version };
  } catch (err: unknown) {
    console.warn('labs.bible.org fetch failed:', err);
    return null;
  }
}

async function fetchVerseFromBibleApi(
  reference: string,
  translation: string,
): Promise<FetchedVerseData | null> {
  const version = String(translation || 'web').toLowerCase();
  const url = `/api/bible/simple?reference=${encodeURIComponent(reference)}&translation=${encodeURIComponent(version)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as BibleApiSimpleResponse;

    let formatted = '';
    if (Array.isArray(data.verses) && data.verses.length > 0) {
      formatted = data.verses
        .map((v) => {
          const cleanText = String(v.text || '').replace(/\s+/g, ' ').trim();
          const num = v.verse !== undefined ? `<sup>${escapeHtml(String(v.verse))}</sup> ` : '';
          return cleanText ? `<p>${num}${escapeHtml(cleanText)}</p>` : '';
        })
        .filter(Boolean)
        .join('');
    }

    if (!formatted) {
      const text = (data.text || '').trim();
      if (!text) return null;
      const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      formatted = `<p>${escapeHtml(cleanText)}</p>`;
    }

    return {
      title: data.reference || reference,
      text: formatted,
      translation: (data.translation_name || version).toUpperCase(),
    };
  } catch (err: unknown) {
    console.warn('bible-api.com fetch failed:', err);
    return null;
  }
}

const BIBLE_API_SUPPORTED = new Set([
  'web',
  'kjv',
  'asv',
  'bbe',
  'darby',
  'dra',
  'ylt',
  'oeb-cw',
  'oeb-us',
  'webbe',
  'clementine',
  'almeida',
  'rccv',
]);

export async function fetchVerseText(
  reference: string,
  translation: string,
): Promise<FetchedVerseData | null> {
  const normTrans = String(translation || 'nkjv').toLowerCase();

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
            const text = formatApiBibleHtml(passage.content);
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
      err,
    );
  }

  if (BIBLE_API_SUPPORTED.has(normTrans)) {
    const bibleApi = await fetchVerseFromBibleApi(reference, normTrans);
    if (bibleApi) return bibleApi;
  }

  if (normTrans === 'net') {
    const labs = await fetchVerseFromLabs(reference, normTrans);
    if (labs) return labs;
  }

  const fallbackWeb = await fetchVerseFromBibleApi(reference, 'web');
  if (fallbackWeb) {
    fallbackWeb.translation = 'WEB';
    return fallbackWeb;
  }

  return null;
}
