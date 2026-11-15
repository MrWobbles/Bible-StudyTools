import { debug, errorLog } from './debug';
import { escapeAttr, safeMediaUrl } from './display';
import { getErrorMessage, state } from './state';
import type { OutlineBlock, TeleprompterMedia } from './types';

// Wrap each word in a span for highlighting
export function wrapWordsInSpans(text: string): string {
  const words = text.split(/(\s+)/); // Split while keeping whitespace
  return words.map((word, idx) => {
    // Keep whitespace as-is
    if (/^\s+$/.test(word)) {
      return word;
    }
    // Wrap actual words in spans with data-word attribute
    const sanitizedWord = word.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<span class="teleprompter__word" data-word-idx="${idx}">${sanitizedWord}</span>`;
  }).join('');
}

// Older saved notes lost data-verse, so a bare "#" link falls back to its text
export function getVerseRef(a: HTMLAnchorElement): string {
  const explicit = a.dataset?.verse?.trim();
  if (explicit) return explicit;
  const href = (a.getAttribute('href') || '').trim();
  const text = (a.textContent || '').trim();
  if ((href === '' || href === '#') && /^[1-3]?\s?[A-Za-z]+\.?\s+\d+/.test(text)) return text;
  return '';
}

// Editor media tiles carry the full media object in a bst-media: href
export function decodeTileMedia(a: HTMLAnchorElement): TeleprompterMedia | null {
  const href = (a.getAttribute('href') || '').trim();
  if (!href.startsWith('bst-media:')) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(href.slice('bst-media:'.length)));
    if (parsed && typeof parsed === 'object' && 'type' in parsed && typeof (parsed as Record<string, unknown>).type === 'string') {
      return parsed as TeleprompterMedia;
    }
    return null;
  } catch {
    return null;
  }
}

// Build a line's HTML, keeping links clickable and word-wrapping text
export function buildLineHtml(node: Node): string {
  return Array.from(node.childNodes).map((child) => {
    if (child.nodeType === Node.TEXT_NODE) return wrapWordsInSpans(child.textContent || '');
    if (!(child instanceof Element) || child.tagName === 'IMG') return '';
    // Nested list items are emitted as their own lines
    if (child.tagName === 'UL' || child.tagName === 'OL') return '';
    const inner = buildLineHtml(child);
    if (child instanceof HTMLAnchorElement) {
      const tileMedia = decodeTileMedia(child);
      if (tileMedia) {
        const label = tileMedia.title || tileMedia.reference || tileMedia.type || 'Media';
        return `<a class="teleprompter__link teleprompter__link--tile" href="#" data-media="${escapeAttr(encodeURIComponent(JSON.stringify(tileMedia)))}">${wrapWordsInSpans(label)}</a>`;
      }
      const verse = getVerseRef(child);
      if (verse) {
        return `<a class="teleprompter__link teleprompter__link--verse" href="#" data-verse="${escapeAttr(verse)}">${inner}</a>`;
      }
      const url = safeMediaUrl(child.getAttribute('href'));
      if (!url) return inner;
      return `<a class="teleprompter__link" href="${escapeAttr(url)}" data-url="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
    }
    return inner;
  }).join('');
}

// Build points from editor notes (HTML content)
export function buildEditorNotesIndex(): void {
  try {
    state.allOutlinePoints = [];

    const editorHtml = state.classConfig.content?.html;
    if (!editorHtml) {
      errorLog.addWarning('No editor content found in classConfig');
      debug('No editor content found - class may not have notes set');
      return;
    }

    debug(`📝 Parsing editor HTML (${editorHtml.length} chars)...`);

    const parser = new DOMParser();
    let doc: Document;
    try {
      doc = parser.parseFromString(editorHtml, 'text/html');
    } catch (parseErr: unknown) {
      const parseErrMsg = getErrorMessage(parseErr);
      errorLog.addError('Failed to parse HTML', { error: parseErrMsg });
      throw new Error(`Invalid HTML format: ${parseErrMsg}`);
    }

    const blocks: OutlineBlock[] = [];
    let currentSection = state.classConfig.title || 'Notes';

    const elements = doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, img');
    const seenImages = new Set<HTMLImageElement>();
    const pushImage = (img: Element): void => {
      if (!(img instanceof HTMLImageElement)) return;
      if (seenImages.has(img)) return;
      seenImages.add(img);
      const url = safeMediaUrl(img.getAttribute('src'));
      if (!url) return;
      blocks.push({
        text: '',
        type: 'image',
        url,
        title: img.getAttribute('alt') || 'Image',
        sectionTitle: currentSection
      });
    };

    elements.forEach((el) => {
      const tagName = el.tagName.toLowerCase();

      // A paragraph inside a list item is already covered by the li
      if (tagName === 'p' && el.closest('li')) {
        el.querySelectorAll('img').forEach(pushImage);
        return;
      }

      if (tagName === 'img') {
        pushImage(el);
        return;
      }

      const clone = el.cloneNode(true);
      if (clone instanceof Element) {
        clone.querySelectorAll('ul, ol').forEach(n => n.remove());
      }
      const text = clone.textContent?.trim();
      if (text) {
        if (tagName.startsWith('h')) {
          currentSection = text;
          blocks.push({
            text,
            html: buildLineHtml(el),
            type: 'heading',
            sectionTitle: currentSection
          });
        } else if (tagName === 'p' || tagName === 'li') {
          const anchors = Array.from(el.querySelectorAll('a'));
          blocks.push({
            text,
            html: buildLineHtml(el),
            verse: anchors.map(getVerseRef).find(Boolean) || '',
            media: anchors.map(decodeTileMedia).find(Boolean) || null,
            type: tagName === 'li' ? 'bullet' : 'paragraph',
            sectionTitle: currentSection
          });
        }
      }

      // Images nested in a text block follow it in reading order
      el.querySelectorAll('img').forEach(pushImage);
    });

    // If no blocks found, try splitting by sentences
    if (blocks.length === 0 && editorHtml) {
      const plainText = doc.body.textContent || '';
      const sentences = plainText
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      sentences.forEach((sentence) => {
        blocks.push({
          text: sentence,
          type: 'sentence',
          sectionTitle: currentSection
        });
      });
    }

    state.allOutlinePoints = blocks.map((block, idx) => ({
      index: idx,
      text: block.text,
      html: block.html,
      verse: block.verse,
      media: block.media,
      url: block.url,
      title: block.title,
      type: block.type,
      sectionTitle: block.sectionTitle,
      fullPoint: block
    }));

    debug(`✓ Parsed ${state.allOutlinePoints.length} points from editor notes`);

    if (state.allOutlinePoints.length === 0) {
      errorLog.addWarning('No text content found in editor HTML');
    }
  } catch (err: unknown) {
    errorLog.addError(`Failed to build notes index: ${getErrorMessage(err)}`);
    console.error('buildEditorNotesIndex error:', err);
    throw err;
  }
}

// Render every point once into one continuous scrollable script
export function renderScriptFlow(): void {
  const flow = document.getElementById('script-flow');
  if (!flow) return;
  if (flow.dataset.rendered === String(state.allOutlinePoints.length)) return;

  flow.innerHTML = state.allOutlinePoints.map((point, idx) => {
    if (point.type === 'image') {
      return `<figure class="teleprompter__line teleprompter__line--image" data-point-index="${idx}" style="background:red;height:1px;left:-100px;width:calc(100% + 100px);"><img src="${escapeAttr(point.url)}" alt="${escapeAttr(point.title)}"></figure>`;
    }
    const tag = point.type === 'heading' ? 'h2' : 'div';
    return `<${tag} class="teleprompter__line teleprompter__line--${point.type}" data-point-index="${idx}">${point.html ?? wrapWordsInSpans(point.text)}</${tag}>`;
  }).join('');
  flow.dataset.rendered = String(state.allOutlinePoints.length);
}

// Update the display based on current indices
export function updateCurrentPointDisplay(): void {
  const sectionTitleEl = document.getElementById('current-section-title');
  const scriptFlowEl = document.getElementById('script-flow');
  if (state.allOutlinePoints.length === 0) {
    if (sectionTitleEl) sectionTitleEl.textContent = 'No content found';
    if (scriptFlowEl) scriptFlowEl.innerHTML = '<div class="point-text">Load some editor notes to get started.</div>';
    return;
  }

  renderScriptFlow();

  if (state.currentPointIndex >= state.allOutlinePoints.length) {
    state.currentPointIndex = state.allOutlinePoints.length - 1;
  }
  if (state.currentPointIndex < 0) {
    state.currentPointIndex = 0;
  }

  const currentPoint = state.allOutlinePoints[state.currentPointIndex];

  if (sectionTitleEl) {
    sectionTitleEl.textContent = currentPoint.sectionTitle || 'Content';
  }

  document.querySelectorAll('#script-flow .teleprompter__line.current').forEach(el => el.classList.remove('current'));
  const currentPointEl = document.querySelector(`#script-flow [data-point-index="${state.currentPointIndex}"]`);
  if (currentPointEl) currentPointEl.classList.add('current');

  const progressEl = document.getElementById('progress-display');
  if (progressEl) {
    progressEl.textContent = `${state.currentPointIndex + 1} / ${state.allOutlinePoints.length}`;
  }
}

export function renderInitialContent(): void {
  updateCurrentPointDisplay();
}
