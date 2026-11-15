import { API_BIBLE_FALLBACKS, studentState } from './state';
import type {
  ApiBibleListResponse,
  ApiBiblePassage,
  ApiBiblePassagesResponse,
  BibleApiSimpleResponse,
  LabsVerseEntry,
  VerseData,
} from './types';

/**
 * Fetch and cache the translation abbreviation-to-ID map from API.Bible.
 */
export async function getApiBibleMap(): Promise<Record<string, string>> {
  if (studentState.apiBibleMapCache) return studentState.apiBibleMapCache;

  const map: Record<string, string> = {
    nkjv: '63097d2a0a2f7db3-01',
    kjv: 'de4e12af7f28f599-01',
    csb: 'a556c5305ee15c3f-01',
  };
  studentState.apiBibleMapCache = map;

  try {
    const res = await fetch('/api/bible/bibles');
    if (res.ok) {
      const data = (await res.json()) as ApiBibleListResponse;
      if (data && Array.isArray(data.data)) {
        data.data.forEach((bible) => {
          if (!bible.id) return;
          if (bible.abbreviation) map[bible.abbreviation.toLowerCase()] = bible.id;
          if (bible.abbreviationLocal) map[bible.abbreviationLocal.toLowerCase()] = bible.id;
          if (bible.name) map[bible.name.toLowerCase()] = bible.id;
        });
      }
    }
  } catch (err) {
    console.error('Failed to fetch API.Bible map:', err);
  }
  return map;
}

/**
 * Fetch a scripture passage across preferred translations with public-domain fallbacks.
 */
export async function fetchVerseData(
  reference: string,
  preferredTranslations: string[]
): Promise<VerseData | null> {
  // Dashes and nbsp from typed or pasted references break the lookup APIs
  const normalizedRef = String(reference || '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u00a0\u2000-\u200b]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const apiBibleMap = await getApiBibleMap();

  for (const translation of preferredTranslations) {
    const normTrans = String(translation || '').toLowerCase();

    if (apiBibleMap[normTrans]) {
      const apiBible = await fetchFromApiBible(normalizedRef, apiBibleMap[normTrans], normTrans);
      if (apiBible) return apiBible;
    }

    if (API_BIBLE_FALLBACKS.has(normTrans)) {
      const bibleApi = await fetchFromBibleApi(normalizedRef, normTrans);
      if (bibleApi) return bibleApi;
    }
  }

  // If requested translation was 'net', or as a fallback
  if (preferredTranslations.map((t) => String(t || '').toLowerCase()).includes('net')) {
    const labs = await fetchFromLabs(normalizedRef);
    if (labs) return labs;
  }

  // Fallbacks for copyrighted versions (NKJV, NIV, ESV, etc)
  const fallbackWeb = await fetchFromBibleApi(normalizedRef, 'web');
  if (fallbackWeb) {
    fallbackWeb.sourceLabel += ' (Fallback)';
    return fallbackWeb;
  }

  const fallbackKjv = await fetchFromBibleApi(normalizedRef, 'kjv');
  if (fallbackKjv) {
    fallbackKjv.sourceLabel += ' (Fallback)';
    return fallbackKjv;
  }

  const labsFallback = await fetchFromLabs(normalizedRef);
  if (labsFallback) {
    labsFallback.sourceLabel = 'NET via labs.bible.org (Fallback)';
    return labsFallback;
  }

  return null;
}

async function fetchFromApiBible(
  reference: string,
  bibleId: string,
  translation = ''
): Promise<VerseData | null> {
  const url = `/api/bible/passages?bibleId=${encodeURIComponent(bibleId)}&reference=${encodeURIComponent(reference)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        console.warn(`API.Bible auth failed (${res.status}). Your API_BIBLE_KEY may be invalid. Falling back...`);
      }
      return null;
    }
    const data = (await res.json()) as ApiBiblePassagesResponse;

    let passage: ApiBiblePassage | undefined;
    if (Array.isArray(data?.data)) {
      passage = data.data[0];
    } else if (data?.data && 'passages' in data.data) {
      passage = data.data.passages?.[0];
    } else {
      passage = data?.data as ApiBiblePassage | undefined;
    }

    if (!passage || !passage.content) {
      return null;
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = passage.content;
    tempDiv.querySelectorAll('.f, .x').forEach((el) => el.remove());

    const verses = tempDiv.querySelectorAll('.v');
    const lines: string[] = [];

    if (verses.length > 0) {
      verses.forEach((v) => {
        const verseNum = v.getAttribute('data-number') || (v.textContent ?? '').trim();
        let text = '';
        let sibling: ChildNode | null = v.nextSibling;
        while (sibling && (!(sibling instanceof Element) || !sibling.classList.contains('v'))) {
          text += sibling.textContent || '';
          sibling = sibling.nextSibling;
        }
        if (text.trim()) {
          lines.push(`${verseNum} ${text.replace(/\s+/g, ' ').trim()}`);
        }
      });
    } else {
      lines.push((tempDiv.textContent ?? '').replace(/\s+/g, ' ').trim());
    }

    const copyright = passage.copyright || '';
    const sourceLabel = `${translation.toUpperCase() || 'API.Bible'} via API.Bible${copyright ? ` © ${copyright}` : ''}`;

    return { title: passage.reference || reference, lines, sourceLabel };
  } catch (err) {
    console.error('API.Bible fetch error:', err);
    return null;
  }
}

async function fetchFromLabs(reference: string): Promise<VerseData | null> {
  // labs.bible.org only returns the NET Bible, regardless of requested version
  const url = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&type=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const lines = (data as LabsVerseEntry[]).map(
      (item) => `${String(item.verse ?? '')} ${String(item.text ?? '')}`
    );
    const sourceLabel = 'NET via labs.bible.org';
    return { title: reference, lines, sourceLabel };
  } catch {
    return null;
  }
}

async function fetchFromBibleApi(reference: string, translation: string): Promise<VerseData | null> {
  const version = String(translation || '').toLowerCase();
  const url = `/api/bible/simple?reference=${encodeURIComponent(reference)}&translation=${encodeURIComponent(version)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as BibleApiSimpleResponse;
    const text = (data.text || '').trim();
    if (!text) return null;

    const lines = text
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    const sourceLabel = `${data.translation_name || version.toUpperCase()} via bible-api.com`;
    return { title: data.reference || reference, lines, sourceLabel };
  } catch {
    return null;
  }
}
