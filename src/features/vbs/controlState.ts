import type { VbsControlState, VbsScene } from './types';

const token =
  localStorage.getItem('bst_access_token') ||
  sessionStorage.getItem('bst_access_token');

export const vbsControlState: VbsControlState = {
  rawMedia: { videos: [], audio: [] },
  scenes: [],
  editor: null,
  currentEditingSceneId: null,
  currentScriptLinks: [],
  currentSelection: null,
};

export function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function showStatus(message: string, isError = false): void {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.display = 'block';
  statusEl.style.backgroundColor = isError ? '#7f1d1d' : '#065f46';
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}

export async function sendCommand(
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    const response = await fetch('/api/vbs/command', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ type, payload }),
    });
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = `/auth.html?redirect=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      throw new Error('Command failed');
    }
    showStatus('Command sent!');
  } catch (err) {
    console.error(err);
    showStatus('Error sending command.', true);
  }
}

export function findSfxUrlInScene(scene: VbsScene, sfxLabel: string): string {
  const sfx = (scene.sound_effects ?? []).find((s) => s.label === sfxLabel);
  return sfx ? sfx.url : '';
}

export function findSfxUrl(sfxLabel: string): string {
  const sfxItems = document.querySelectorAll('#sfx-list .sfx-item');
  for (const item of sfxItems) {
    const labelInput = item.querySelector<HTMLInputElement>('input[type="text"]:first-of-type');
    if (labelInput && labelInput.value === sfxLabel) {
      const urlInput = item.querySelector<HTMLInputElement>('input[type="text"]:nth-of-type(2)');
      return urlInput?.value ?? '';
    }
  }
  return '';
}
