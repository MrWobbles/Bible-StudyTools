export const classId = new URLSearchParams(window.location.search).get('class') || '1';

let currentClassConfig: ClassConfig | null = null;

export function getClassConfig(): ClassConfig | null {
  return currentClassConfig;
}

export function sanitizeMediaUrl(url: string | undefined): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // Ignore parse failures and fall back to local-path handling.
  }

  return trimmed.startsWith('/') ||
    trimmed.startsWith('assets/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../')
    ? trimmed
    : '';
}

export function extractYoutubeVideoInfo(value: string): { id: string; start: number } {
  const input = String(value || '').trim();
  if (!input) return { id: '', start: 0 };

  const directIdMatch = input.match(/^[A-Za-z0-9_-]{11}$/);
  const id = directIdMatch
    ? directIdMatch[0]
    : input.match(
        /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/))([^&?/]+)/,
      )?.[1] || '';

  let start = 0;
  const timeMatch = input.match(/[?&](?:t|start)=([^&\s]+)/);
  if (timeMatch?.[1]) {
    const timeStr = timeMatch[1];
    if (/^\d+$/.test(timeStr)) {
      start = parseInt(timeStr, 10);
    } else {
      const h = timeStr.match(/(\d+)h/i);
      const m = timeStr.match(/(\d+)m/i);
      const s = timeStr.match(/(\d+)s/i);
      start =
        (h ? parseInt(h[1], 10) * 3600 : 0) +
        (m ? parseInt(m[1], 10) * 60 : 0) +
        (s ? parseInt(s[1], 10) : 0);
    }
  }

  return { id, start };
}

function isStudentView(): boolean {
  const path = window.location.pathname.toLowerCase();
  return path.endsWith('/student.html') || path.endsWith('/student');
}

async function fetchPublicStudentClassConfig(): Promise<unknown> {
  const res = await fetch(`/api/display/class-config?class=${encodeURIComponent(classId)}`);
  if (!res.ok) {
    throw new Error(`Failed to load student class config (${res.status})`);
  }
  return res.json();
}

export async function fetchClassConfig(): Promise<ClassConfig | null> {
  if (!window.BSTApi) {
    throw new Error('BSTApi is not loaded');
  }
  let raw: unknown;
  const hasAuthToken = Boolean(window.BSTApi.getAccessToken?.() || window.BSTApi.getAdminToken?.());
  if (isStudentView() && !hasAuthToken && !window.BSTApi.isLoopbackHost?.()) {
    raw = await fetchPublicStudentClassConfig();
  } else {
    try {
      raw = await window.BSTApi.getClasses();
    } catch (err) {
      if (!isStudentView()) {
        throw err;
      }
      raw = await fetchPublicStudentClassConfig();
    }
  }

  const classesArr: ClassConfig[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && 'classes' in raw && Array.isArray(raw.classes)
      ? raw.classes
      : [raw as ClassConfig];

  currentClassConfig =
    classesArr.find((c) => c.classNumber?.toString() === classId || c.id === classId) ||
    classesArr[0] ||
    {};

  if (!currentClassConfig || !currentClassConfig.classNumber) {
    console.error(`Class ${classId} not found in configuration`);
  }

  const primaryMedia = currentClassConfig.media?.find(
    (m) => m.primary && m.type === 'video',
  );

  let videoId = '';
  if (primaryMedia?.sources?.[0]) {
    const source = primaryMedia.sources[0];
    if (source.videoId) {
      videoId = source.videoId;
    } else if (source.url) {
      const match = source.url.match(
        /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([^&?/]+)/,
      );
      videoId = match ? match[1] : '';
    }
  }

  window.BIBLE_STUDY_CONFIG = {
    videoId,
    channelName: currentClassConfig.channelName || `class${classId}-control`,
    bibleTranslation: 'nkjv',
    pausePoints: primaryMedia?.pausePoints || [],
  };

  window.BIBLE_STUDY_CONFIG_READY = true;
  window.dispatchEvent(new CustomEvent('bibleStudyConfigReady'));
  return currentClassConfig;
}
