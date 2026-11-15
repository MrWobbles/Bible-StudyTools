import { VERSE_LINE_HEIGHT, studentState } from './state';

/**
 * Apply current verse font size and line height to the verse container.
 */
export function applyVerseTypography(): void {
  const container = studentState.verseScrollContainer || document.getElementById('verse-content');
  if (!container) return;
  container.style.fontSize = `${studentState.verseFontSize}px`;
  container.style.lineHeight = `${VERSE_LINE_HEIGHT}`;
}

/**
 * Wrap a single line of text into word-bounded lines up to `maxChars`.
 */
export function wrapLineByWords(text: string, maxChars: number): string[] {
  const limit = Math.max(1, Number(maxChars) || 100);
  const words = String(text || '')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];

  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }

    const next = `${current} ${word}`;
    if (next.length <= limit) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  });

  if (current) lines.push(current);
  return lines;
}

/**
 * Estimate the maximum number of characters that fit per line in the container.
 */
export function estimateMaxCharsPerLine(
  container: HTMLElement | null,
  computedStyle: CSSStyleDeclaration,
  safetyBuffer = 12
): number {
  const width = container?.clientWidth || 0;
  if (!width) return Math.max(1, 100 - safetyBuffer);

  const measurer = document.createElement('span');
  measurer.style.position = 'absolute';
  measurer.style.visibility = 'hidden';
  measurer.style.pointerEvents = 'none';
  measurer.style.left = '-9999px';
  measurer.style.top = '0';
  measurer.style.whiteSpace = 'nowrap';
  measurer.style.fontSize = computedStyle.fontSize;
  measurer.style.fontFamily = computedStyle.fontFamily;
  measurer.style.fontWeight = computedStyle.fontWeight;
  measurer.style.letterSpacing = computedStyle.letterSpacing;
  measurer.textContent = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  document.body.appendChild(measurer);

  const measuredWidth = measurer.getBoundingClientRect().width || 1;
  document.body.removeChild(measurer);

  const avgCharWidth = measuredWidth / measurer.textContent.length;
  const maxChars = Math.floor(width / avgCharWidth);
  return Math.max(1, maxChars - safetyBuffer);
}

function splitLongLine(text: string, measurer: HTMLElement, maxHeight: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [text];

  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    measurer.innerHTML = `<p style="margin:0; padding:0; word-wrap: break-word; overflow-wrap: break-word;">${candidate}</p>`;
    const para = measurer.firstElementChild;
    const height = para ? para.getBoundingClientRect().height : 0;

    if (height <= maxHeight) {
      current = candidate;
    } else {
      if (current) chunks.push(current);

      measurer.innerHTML = `<p style="margin:0; padding:0; word-wrap: break-word; overflow-wrap: break-word;">${word}</p>`;
      const wordPara = measurer.firstElementChild;
      const wordHeight = wordPara ? wordPara.getBoundingClientRect().height : 0;

      if (wordHeight > maxHeight) {
        chunks.push(word);
        current = '';
      } else {
        current = word;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

function createVersePageElement(): HTMLDivElement {
  const page = document.createElement('div');
  page.className = 'verse-page';
  page.style.display = 'none';
  page.style.height = '100%';
  page.style.overflow = 'visible';
  page.style.wordWrap = 'break-word';
  page.style.overflowWrap = 'break-word';
  page.style.boxSizing = 'border-box';
  return page;
}

/**
 * Measure and paginate verse lines into `.verse-page` elements inside `#verse-content`.
 */
export function buildVersePages(lines: string[]): void {
  const container = studentState.verseScrollContainer || document.getElementById('verse-content');
  if (!container) return;

  container.innerHTML = '';
  studentState.versePages = [];
  studentState.currentVersePageIndex = 0;

  const rawLines = (lines || []).map((line) => line.trim()).filter(Boolean);
  if (!rawLines.length) return;

  const computed = window.getComputedStyle(container);
  const paddingTop = parseFloat(computed.paddingTop) || 0;
  const paddingBottom = parseFloat(computed.paddingBottom) || 0;
  const availableHeight = Math.max(0, container.clientHeight - paddingTop - paddingBottom);

  if (!availableHeight) {
    const fallbackPage = document.createElement('div');
    fallbackPage.className = 'verse-page';
    fallbackPage.style.display = 'block';
    fallbackPage.style.height = '100%';
    fallbackPage.style.overflow = 'hidden';
    fallbackPage.innerHTML = rawLines.map((line) => `<p style="margin:0; padding:0;">${line}</p>`).join('');
    container.appendChild(fallbackPage);
    studentState.versePages.push(fallbackPage);
    return;
  }

  const measurer = document.createElement('div');
  measurer.style.position = 'absolute';
  measurer.style.visibility = 'hidden';
  measurer.style.pointerEvents = 'none';
  measurer.style.left = '-9999px';
  measurer.style.top = '0';
  measurer.style.width = `${container.clientWidth}px`;
  measurer.style.fontSize = computed.fontSize;
  measurer.style.lineHeight = computed.lineHeight;
  measurer.style.fontFamily = computed.fontFamily;
  measurer.style.fontWeight = computed.fontWeight;
  measurer.style.letterSpacing = computed.letterSpacing;
  measurer.style.whiteSpace = 'normal';
  measurer.style.margin = '0';
  measurer.style.padding = '0';
  measurer.style.boxSizing = 'border-box';
  measurer.style.wordWrap = 'break-word';
  measurer.style.overflowWrap = 'break-word';
  document.body.appendChild(measurer);

  let currentPage = createVersePageElement();
  let currentHeight = 0;

  const finalizePage = () => {
    if (currentPage.childNodes.length === 0) return;
    container.appendChild(currentPage);
    studentState.versePages.push(currentPage);
    currentPage = createVersePageElement();
    currentHeight = 0;
  };

  rawLines.forEach((line, index) => {
    measurer.innerHTML = `<p style="margin:0; padding:0;">${line}</p>`;
    const para = measurer.firstElementChild;
    const paraHeight = para ? para.getBoundingClientRect().height : 0;

    if (paraHeight === 0) {
      console.log(`[Verse] Skipping verse ${index} - paraHeight is 0:`, line.substring(0, 50));
      return;
    }

    const pageHeightThreshold = availableHeight * 0.95;

    let linesToAdd = [line];
    if (paraHeight > pageHeightThreshold) {
      console.log(
        `[Verse] Line ${index} too long (${paraHeight}px > ${pageHeightThreshold}px), splitting...`,
        line.substring(0, 50)
      );
      linesToAdd = splitLongLine(line, measurer, pageHeightThreshold * 0.9);
      console.log(`[Verse] Split into ${linesToAdd.length} chunks`);
    }

    linesToAdd.forEach((chunk) => {
      measurer.innerHTML = `<p style="margin:0; padding:0; word-wrap: break-word; overflow-wrap: break-word;">${chunk}</p>`;
      const chunkPara = measurer.firstElementChild;
      const chunkHeight = chunkPara ? chunkPara.getBoundingClientRect().height : 0;

      if (currentHeight + chunkHeight > pageHeightThreshold && currentPage.childNodes.length > 0) {
        console.log(
          `[Verse] Page ${studentState.versePages.length} finalized with ${currentPage.childNodes.length} lines, height ${currentHeight}/${pageHeightThreshold}`
        );
        finalizePage();
      }

      const p = document.createElement('p');
      p.style.margin = '0';
      p.style.padding = '0';
      p.style.wordWrap = 'break-word';
      p.style.overflowWrap = 'break-word';
      p.innerHTML = chunk;
      currentPage.appendChild(p);
      currentHeight += chunkHeight;
    });
  });

  finalizePage();
  console.log(`[Verse] Total pages created: ${studentState.versePages.length}`);
  document.body.removeChild(measurer);

  if (studentState.versePages.length > 0) {
    studentState.currentVersePageIndex = 0;
    studentState.versePages.forEach((page, index) => {
      page.style.display = index === 0 ? 'block' : 'none';
    });
  }
}

/**
 * Shrink verse font size incrementally until all paginated pages fit without vertical overflow.
 */
export function ensureVersePagesFit(): void {
  const container = studentState.verseScrollContainer || document.getElementById('verse-content');
  if (!container || !studentState.versePages.length) return;

  // Skip fitting until we have a real rendered box size; prevents accidental over-shrinking.
  if (container.clientWidth < 200 || container.clientHeight < 200) {
    return;
  }

  const maxIterations = 10;
  let iterations = 0;

  while (iterations < maxIterations) {
    const containerHeight = container.clientHeight;
    if (!containerHeight) break;

    const hasOverflow = studentState.versePages.some((page) => pageOverflows(page, containerHeight));
    if (!hasOverflow) break;

    const nextSize = Math.max(40, studentState.verseFontSize - 2);
    if (nextSize === studentState.verseFontSize) break;
    studentState.verseFontSize = nextSize;
    applyVerseTypography();
    buildVersePages(studentState.currentVerseLines);
    iterations += 1;
  }
}

function pageOverflows(page: HTMLDivElement, containerHeight: number): boolean {
  if (!page) return false;
  const prevDisplay = page.style.display;
  const prevVisibility = page.style.visibility;
  const prevPosition = page.style.position;
  const prevPointerEvents = page.style.pointerEvents;
  const prevWidth = page.style.width;

  page.style.display = 'block';
  page.style.visibility = 'hidden';
  page.style.position = 'absolute';
  page.style.pointerEvents = 'none';
  page.style.width = '100%';

  const overflow = page.scrollHeight > containerHeight + 1;

  page.style.display = prevDisplay;
  page.style.visibility = prevVisibility;
  page.style.position = prevPosition;
  page.style.pointerEvents = prevPointerEvents;
  page.style.width = prevWidth;

  return overflow;
}
