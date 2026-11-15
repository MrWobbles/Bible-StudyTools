import {
  findSfxUrlInScene,
  getHeaders,
  sendCommand,
  showStatus,
  vbsControlState,
} from './controlState';
import type { VbsMediaData, VbsScene } from './types';

function renderScriptDisplay(scene: VbsScene): void {
  const displayEl = document.getElementById(`script-display-${scene.id}`);
  if (!displayEl) return;

  let html = scene.script_content ?? '';
  const sortedLinks = [...(scene.script_links ?? [])].sort(
    (a, b) => b.text_selection.length - a.text_selection.length,
  );

  sortedLinks.forEach((link) => {
    const sfxUrl = findSfxUrlInScene(scene, link.sfx_label);
    const escapedText = link.text_selection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkSpan = `<span class="script-link" data-sfx-label="${link.sfx_label}" onclick="event.stopPropagation(); sendCommand('play_sfx', { url: '${sfxUrl}' })" title="Click to play: ${link.sfx_label}">${link.text_selection}</span>`;
    html = html.replace(new RegExp(`(?<![><])${escapedText}(?![^<]*>)`, 'g'), linkSpan);
  });

  displayEl.innerHTML = html;

  displayEl.querySelectorAll<HTMLElement>('.sfx-trigger-btn').forEach((btn) => {
    const label = btn.getAttribute('data-sfx-label');
    if (!label) return;
    const sfxUrl = findSfxUrlInScene(scene, label);
    if (sfxUrl) {
      btn.onclick = (e) => {
        e.stopPropagation();
        void sendCommand('play_sfx', { url: sfxUrl });
      };
      btn.title = `Click to play: ${label}`;
    } else {
      btn.style.opacity = '0.5';
      btn.title = `SFX not found: ${label}`;
    }
  });
}

export function renderRawMedia(): void {
  const videoGrid = document.getElementById('video-grid');
  const sfxGrid = document.getElementById('sfx-grid');
  if (!videoGrid || !sfxGrid) return;

  videoGrid.innerHTML = '';
  sfxGrid.innerHTML = '';

  const { videos, audio } = vbsControlState.rawMedia;
  if (videos && videos.length > 0) {
    videos.forEach((file) => {
      const btn = document.createElement('button');
      btn.textContent = file;
      btn.onclick = () => void sendCommand('play_video', { url: `/assets/video/${file}` });
      videoGrid.appendChild(btn);
    });
  } else {
    videoGrid.innerHTML = '<p>No videos found.</p>';
  }

  if (audio && audio.length > 0) {
    audio.forEach((file) => {
      const btn = document.createElement('button');
      btn.textContent = file;
      btn.onclick = () => void sendCommand('play_sfx', { url: `/assets/audio/${file}` });
      sfxGrid.appendChild(btn);
    });
  } else {
    sfxGrid.innerHTML = '<p>No audio found.</p>';
  }
}

export function renderScenes(): void {
  const container = document.getElementById('scenes-container');
  if (!container) return;
  container.innerHTML = '';

  if (vbsControlState.scenes.length === 0) {
    container.innerHTML = '<p>No scenes configured yet.</p>';
    return;
  }

  vbsControlState.scenes.forEach((scene) => {
    const card = document.createElement('div');
    card.className = 'scene-card';
    if (scene.id === vbsControlState.currentEditingSceneId) {
      card.classList.add('active-editing');
    }

    const textsHtml =
      scene.display_texts && scene.display_texts.length > 0
        ? `<div class="sfx-grid" style="margin-bottom: 0.5rem;">
            ${scene.display_texts
              .map(
                (textObj) => `
              <button type="button" class="btn-primary" onclick="sendCommand('show_text', { text: '${textObj.text}' })">
                ${textObj.label || 'Text'}
              </button>
            `,
              )
              .join('')}
            <button type="button" class="btn-danger" onclick="sendCommand('hide_text')">Hide Text</button>
          </div>`
        : '';

    const sfxHtml =
      scene.sound_effects && scene.sound_effects.length > 0
        ? `<div class="sfx-grid">
            ${scene.sound_effects
              .map(
                (sfx) => `
              <button type="button" class="btn-warning" onclick="sendCommand('play_sfx', { url: '${sfx.url}', loop: ${Boolean(sfx.loop)} })">
                ${sfx.label || 'SFX'}${sfx.loop ? ' ↻' : ''}
              </button>
            `,
              )
              .join('')}
          </div>`
        : '';

    const scriptHtml = scene.script_content
      ? `<div style="margin-top: 1rem; margin-bottom: 1rem;">
            <div style="font-size: 0.875rem; color: #9ca3af; margin-bottom: 0.5rem;">Script:</div>
            <div id="script-display-${scene.id}" style="background: #0f172a; border: 1px solid #4b5563; border-radius: 0.25rem; padding: 1rem; max-height: 300px; overflow-y: auto; line-height: 1.6; font-size: 0.875rem; white-space: pre-wrap;"></div>
          </div>`
      : '';

    const lowerTitle = scene.title ? scene.title.toLowerCase() : '';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between;">
        <h3>${scene.title}</h3>
        <span style="color:#9ca3af; font-size:0.875rem;">Order: ${scene.sort_order ?? 0}</span>
      </div>
      <div class="scene-actions">
        ${scene.video_url ? `<button class="btn-success" onclick="sendCommand('play_video', { url: '${scene.video_url}' })">Play Background</button>` : ''}
        <button class="btn-sm" style="background:#4b5563;" onclick="editScene('${scene.id}')">Edit</button>
        <button class="btn-sm btn-danger" onclick="deleteScene('${scene.id}')">Delete</button>
        ${lowerTitle.includes('water') ? `<button class="btn-sm" style="background:#8b5cf6; border-color:#7c3aed;" onclick="toggleCircles()">Bubbles</button><button class="btn-sm" style="background:#0ea5e9; border-color:#0284c7;" onclick="separateCircles()">Separate</button>` : ''}
        ${lowerTitle.includes('day 3') ? `<button class="btn-sm" style="background:#10b981; border-color:#059669;" onclick="triggerMatrix()">Matrix Effect</button>` : ''}
        ${lowerTitle.includes('day 4') ? `<button class="btn-sm" style="background:#f59e0b; border-color:#d97706; color:#000;" onclick="triggerSparkles()">✨ Sparkles</button>` : ''}
        ${lowerTitle.includes('day 5') ? `<button class="btn-sm" style="background:#06b6d4; border-color:#0891b2;" onclick="triggerBirds()">🦅 Birds</button>` : ''}
      </div>
      ${textsHtml}
      ${scriptHtml}
      ${sfxHtml}
    `;
    container.appendChild(card);

    if (scene.script_content) {
      renderScriptDisplay(scene);
    }
  });
}

export function populateVideoDropdown(): void {
  const select = document.getElementById('video-select') as HTMLSelectElement | null;
  if (!select) return;
  select.innerHTML = '<option value="">Select...</option>';

  (vbsControlState.rawMedia.videos ?? []).forEach((v) => {
    const val = `/assets/video/${v}`;
    select.innerHTML += `<option value="${val}">${val}</option>`;
  });
}

export async function loadData(): Promise<void> {
  try {
    const [mediaRes, scenesRes] = await Promise.all([
      fetch('/api/vbs/media', { headers: getHeaders() }),
      fetch('/api/vbs/scenes', { headers: getHeaders() }).catch(() => null),
    ]);

    if (mediaRes.status === 401 || (scenesRes && scenesRes.status === 401)) {
      window.location.href = `/auth.html?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }

    vbsControlState.rawMedia = (await mediaRes.json()) as VbsMediaData;

    if (scenesRes && scenesRes.ok) {
      const scenesData = (await scenesRes.json()) as { scenes?: VbsScene[] };
      vbsControlState.scenes = scenesData.scenes ?? [];
    } else {
      showStatus('Could not load scenes from Supabase.', true);
    }

    renderRawMedia();
    renderScenes();
    populateVideoDropdown();
  } catch (err) {
    console.error(err);
    showStatus('Error loading data.', true);
  }
}
