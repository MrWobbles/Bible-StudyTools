import {
  DEFAULT_VERSE_FONT_SIZE,
  DEFAULT_VERSE_SCALE,
  VERSE_LINE_HEIGHT,
  VERSE_STAGE_HEIGHT,
  VERSE_STAGE_WIDTH,
  escapeHtml,
  studentState,
} from './state';
import type { StudentMediaItem } from './types';
import { fetchVerseData } from './verseApi';
import { applyVerseTypography, buildVersePages, ensureVersePagesFit } from './versePagination';

/**
 * Scale and center the fixed-size verse stage inside `#verse-stage-wrap`.
 */
export function fitVerseStage(): void {
  const stageWrap = document.getElementById('verse-stage-wrap');
  const stage = document.getElementById('verse-stage');
  if (!stageWrap || !stage) return;

  const wrapWidth = stageWrap.clientWidth;
  const wrapHeight = stageWrap.clientHeight;
  if (!wrapWidth || !wrapHeight) return;

  const scale =
    Math.min(wrapWidth / VERSE_STAGE_WIDTH, wrapHeight / VERSE_STAGE_HEIGHT) * DEFAULT_VERSE_SCALE;

  if (!Number.isFinite(scale) || scale <= 0) return;
  const offsetX = (wrapWidth - VERSE_STAGE_WIDTH * scale) / 2;
  const offsetY = (wrapHeight - VERSE_STAGE_HEIGHT * scale) / 2;
  stage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

async function waitForVerseFonts(timeoutMs = 1500): Promise<void> {
  if (!document.fonts || typeof document.fonts.ready === 'undefined') {
    return;
  }

  try {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // Ignore font-loading errors and continue rendering.
  }
}

/**
 * Fetch and render a scripture passage onto the student stage with automatic pagination.
 */
export async function renderVerseMedia(media: StudentMediaItem): Promise<void> {
  const playerDiv = document.querySelector('.player-shell');
  if (!playerDiv) return;

  const reference = (media.reference || media.title || '').trim();
  if (!reference) return;

  if (media.fullscreen) document.body.classList.add('fullscreen-mode');

  if (studentState.player) {
    studentState.player.destroy();
    studentState.player = null;
  }

  playerDiv.innerHTML = `
    <div style="padding:24px; display:flex; flex-direction:column; gap:12px; height:100%; overflow:auto;">
      <div style="font-size:14px; color:var(--muted);">Loading passage…</div>
    </div>
  `;

  try {
    // Start each new verse render from a stable baseline so both windows paginate similarly.
    studentState.verseFontSize = DEFAULT_VERSE_FONT_SIZE;

    const preferredTranslations = media.translation ? [media.translation] : ['nkjv', 'kjv'];

    const verseData = await fetchVerseData(reference, preferredTranslations);
    if (!verseData) throw new Error('Failed to fetch passage');

    const title = verseData.title || reference;
    const sourceLabel = verseData.sourceLabel || 'Scripture';
    studentState.currentVerseLines = Array.isArray(verseData.lines) ? verseData.lines : [];

    playerDiv.innerHTML = `
      <div id="verse-stage-wrap" style="height:100%; width:100%; position:relative; overflow:hidden; background:#fff;">
        <div id="verse-stage" style="width:${VERSE_STAGE_WIDTH}px; height:${VERSE_STAGE_HEIGHT}px; position:absolute; top:0; left:0; background:#fff; transform-origin: top left;">
          <div id="verse-content" class="verse-content" style="position:absolute; left:40px; right:40px; top:40px; bottom:120px; font-size:${studentState.verseFontSize}px; line-height:${VERSE_LINE_HEIGHT}; overflow:visible; word-wrap:break-word; overflow-wrap:break-word; color:#000; font-family:'Source Sans Pro','Segoe UI',Arial,sans-serif;"></div>
          <div class="verse-meta" style="position:absolute;bottom:30px;right:40px;text-align:right;">
            <h2 class="verse-title" style="color:#000;font-size:24px;margin:0 0 8px 0;">${escapeHtml(title)}</h2>
            <div class="verse-source" style="color:#666;font-size:18px;">${escapeHtml(sourceLabel)}</div>
          </div>
        </div>
      </div>
    `;

    studentState.verseScrollContainer = document.getElementById('verse-content');
    fitVerseStage();
    buildVersePages(studentState.currentVerseLines);
    ensureVersePagesFit();
    // Re-run after layout settles; first paint timing can differ between windows.
    setTimeout(() => {
      fitVerseStage();
      buildVersePages(studentState.currentVerseLines);
      ensureVersePagesFit();
    }, 120);
    setTimeout(() => {
      fitVerseStage();
      buildVersePages(studentState.currentVerseLines);
      ensureVersePagesFit();
    }, 320);

    await waitForVerseFonts();
    fitVerseStage();
    buildVersePages(studentState.currentVerseLines);
    ensureVersePagesFit();
  } catch {
    playerDiv.innerHTML = `
      <div style="padding:24px; color:var(--muted);">
        Unable to load passage. Please check the reference and try again.
      </div>
    `;
  }
}

/**
 * Adjust the displayed verse font size within [60, 180] and repaginate.
 */
export function adjustVerseFont(delta: number): void {
  if (!studentState.currentVerseLines.length) return;
  const nextSize = Math.max(60, Math.min(180, studentState.verseFontSize + delta));
  if (nextSize === studentState.verseFontSize) return;
  studentState.verseFontSize = nextSize;
  applyVerseTypography();
  buildVersePages(studentState.currentVerseLines);
}

/**
 * Advance to the next verse page if available.
 */
export function nextVersePage(): void {
  if (!studentState.versePages.length && studentState.currentVerseLines.length) {
    buildVersePages(studentState.currentVerseLines);
    ensureVersePagesFit();
  }
  if (!studentState.versePages.length) return;

  const nextIndex = Math.min(studentState.versePages.length - 1, studentState.currentVersePageIndex + 1);
  console.log(
    `[Verse Nav] Next: current=${studentState.currentVersePageIndex}, next=${nextIndex}, total pages=${studentState.versePages.length}`
  );
  if (nextIndex === studentState.currentVersePageIndex) {
    console.log('[Verse Nav] Already at last page');
    return;
  }

  studentState.versePages.forEach((page, index) => {
    page.style.display = index === nextIndex ? 'block' : 'none';
  });
  studentState.currentVersePageIndex = nextIndex;
  console.log(`[Verse Nav] Displaying page ${studentState.currentVersePageIndex}`);
}

/**
 * Return to the previous verse page if available.
 */
export function previousVersePage(): void {
  if (!studentState.versePages.length && studentState.currentVerseLines.length) {
    buildVersePages(studentState.currentVerseLines);
    ensureVersePagesFit();
  }
  if (!studentState.versePages.length) return;

  const prevIndex = Math.max(0, studentState.currentVersePageIndex - 1);
  console.log(
    `[Verse Nav] Previous: current=${studentState.currentVersePageIndex}, prev=${prevIndex}, total pages=${studentState.versePages.length}`
  );
  if (prevIndex === studentState.currentVersePageIndex) {
    console.log('[Verse Nav] Already at first page');
    return;
  }

  studentState.versePages.forEach((page, index) => {
    page.style.display = index === prevIndex ? 'block' : 'none';
  });
  studentState.currentVersePageIndex = prevIndex;
  console.log(`[Verse Nav] Displaying page ${studentState.currentVersePageIndex}`);
}
