import { flashStatus, teacherState } from './state';
import type { SaveClassesResponse, StoppedMarkerUpdate } from './types';

let onMarkerRerender: (() => void) | null = null;

export function registerMarkerRerender(callback: () => void): void {
  onMarkerRerender = callback;
}

function formatStoppedMarkerTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function getStoppedMarkerHoverLabel(): string {
  const formattedTimestamp = formatStoppedMarkerTimestamp(
    teacherState.classConfig.stoppedMarkerUpdatedAt
  );
  if (!formattedTimestamp) return '';

  if (teacherState.classConfig.stoppedMarkerAction === 'added') {
    return `Added ${formattedTimestamp}`;
  }

  if (teacherState.classConfig.stoppedMarkerAction === 'modified') {
    return `Modified ${formattedTimestamp}`;
  }

  return `Marked ${formattedTimestamp}`;
}

export function getStoppedMarkerButtonTitle(isStoppedHere: boolean): string {
  if (!isStoppedHere) {
    return 'Mark where you stopped';
  }

  const markerHoverLabel = getStoppedMarkerHoverLabel();
  return markerHoverLabel
    ? `Click to remove marker\n${markerHoverLabel}`
    : 'Click to remove marker';
}

export function updateStoppedMarkerState({
  sectionId = null,
  headingId = null,
  lineId = null
}: StoppedMarkerUpdate): void {
  const { classConfig, allClassesData } = teacherState;
  const hadExistingMarker = Boolean(
    classConfig.stoppedAtSection ||
      classConfig.stoppedAtEditorHeading ||
      classConfig.stoppedAtEditorLine
  );
  const hasNextMarker = Boolean(sectionId || headingId || lineId);
  const stoppedMarkerUpdatedAt = hasNextMarker ? new Date().toISOString() : null;
  const stoppedMarkerAction = hasNextMarker
    ? hadExistingMarker
      ? 'modified'
      : 'added'
    : null;

  classConfig.stoppedAtSection = sectionId;
  classConfig.stoppedAtEditorHeading = headingId;
  classConfig.stoppedAtEditorLine = lineId;
  classConfig.stoppedMarkerUpdatedAt = stoppedMarkerUpdatedAt;
  classConfig.stoppedMarkerAction = stoppedMarkerAction;

  if (
    allClassesData &&
    !Array.isArray(allClassesData) &&
    'classes' in allClassesData &&
    Array.isArray(allClassesData.classes)
  ) {
    const classIndex = allClassesData.classes.findIndex(
      (c) => c.id === classConfig.id || c.classNumber === classConfig.classNumber
    );

    if (classIndex !== -1) {
      allClassesData.classes[classIndex].stoppedAtSection = sectionId;
      allClassesData.classes[classIndex].stoppedAtEditorHeading = headingId;
      allClassesData.classes[classIndex].stoppedAtEditorLine = lineId;
      allClassesData.classes[classIndex].stoppedMarkerUpdatedAt = stoppedMarkerUpdatedAt;
      allClassesData.classes[classIndex].stoppedMarkerAction = stoppedMarkerAction;
    } else {
      console.warn('Could not find class in allClassesData to update marker', {
        classConfigId: classConfig.id,
        classConfigNumber: classConfig.classNumber
      });
    }
  } else {
    console.warn('allClassesData or allClassesData.classes not available for marker update');
  }
}

export function addStoppedMarkersToEditorContent(container: Element): void {
  const lineCandidates = Array.from(container.childNodes).filter(
    (node): node is HTMLElement => node instanceof HTMLElement && Boolean(node.textContent?.trim())
  );

  let headingIndex = 0;

  lineCandidates.forEach((lineElement, index) => {
    const lineId = `editor-line-${index + 1}`;
    const isHeading = /^H[1-6]$/.test(lineElement.tagName);
    const legacyHeadingId = isHeading ? `editor-heading-${headingIndex}` : null;
    if (isHeading) headingIndex += 1;

    const isLegacyMatch =
      Boolean(legacyHeadingId) &&
      teacherState.classConfig.stoppedAtEditorHeading === legacyHeadingId;
    const isStoppedHere = teacherState.classConfig.stoppedAtEditorLine === lineId || isLegacyMatch;

    const wrapper = document.createElement('div');
    wrapper.className = `editor-line-row${isStoppedHere ? ' stopped-here' : ''}`;
    wrapper.setAttribute('data-line-id', lineId);

    const markerBtn = document.createElement('button');
    markerBtn.className = `stop-marker-btn editor-line-marker${isStoppedHere ? ' active' : ''}`;
    markerBtn.setAttribute('type', 'button');
    markerBtn.setAttribute(
      'aria-label',
      isStoppedHere
        ? `Remove stop marker from line ${index + 1}`
        : `Set stop marker at line ${index + 1}`
    );
    markerBtn.title = getStoppedMarkerButtonTitle(isStoppedHere);
    markerBtn.innerHTML = `<span class="line-number-text">${index + 1}</span>`;
    markerBtn.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      if (teacherState.classConfig.stoppedAtEditorLine === lineId) {
        void setStoppedMarkerEditorLine(null);
      } else {
        void setStoppedMarkerEditorLine(lineId);
      }
    };

    const parent = lineElement.parentNode;
    if (!parent) return;
    parent.insertBefore(wrapper, lineElement);
    wrapper.appendChild(markerBtn);
    wrapper.appendChild(lineElement);
    lineElement.classList.add('editor-line-content');
  });
}

export async function setStoppedMarkerEditorLine(lineId: string | null): Promise<void> {
  updateStoppedMarkerState({ lineId });

  const cloudWarning = await saveStoppedMarker();
  onMarkerRerender?.();

  if (cloudWarning) {
    flashStatus(`Warning: ${cloudWarning}`);
  } else if (lineId) {
    flashStatus('Marked where you stopped');
  } else {
    flashStatus('Marker removed');
  }
}

export async function setStoppedMarker(sectionId: string | null): Promise<void> {
  updateStoppedMarkerState({ sectionId });

  const cloudWarning = await saveStoppedMarker();
  onMarkerRerender?.();

  if (cloudWarning) {
    flashStatus(`Warning: ${cloudWarning}`);
  } else if (sectionId) {
    flashStatus('Marked where you stopped');
  } else {
    flashStatus('Marker removed');
  }
}

async function saveStoppedMarker(): Promise<string> {
  if (!teacherState.allClassesData) {
    console.error('Cannot save stopped marker: allClassesData not loaded');
    return 'Data not loaded - please refresh the page';
  }

  if (!window.BSTApi) {
    console.error('Cannot save stopped marker: BSTApi not available');
    return 'API client not loaded - please refresh the page';
  }

  try {
    const response = await window.BSTApi.fetch(
      '/api/save/classes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teacherState.allClassesData)
      },
      { requireAdmin: true }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Server returned ${response.status}: ${errorText}`);
    }

    const resultRaw: unknown = await response.json().catch(() => ({}));
    const result =
      resultRaw && typeof resultRaw === 'object' ? (resultRaw as SaveClassesResponse) : {};
    if (
      result.partialSuccess ||
      result.cloudSync?.ok === false ||
      result.supabaseSync === false
    ) {
      return result.warning || result.cloudSync?.message || 'Cloud sync failed.';
    }

    console.log('[OK] Saved stopped marker');
    return '';
  } catch (err: unknown) {
    console.error('Failed to save stopped marker:', err);
    const message = err instanceof Error ? err.message : 'check server';
    return `Could not save marker: ${message}`;
  }
}
