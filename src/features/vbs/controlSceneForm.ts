import { initializeEditor } from './controlEditor';
import {
  attachScriptSelectionHandler,
  detachScriptSelectionHandler,
  previewScript,
  renderActiveLinks,
  updateLinkSfxSelect,
} from './controlLinks';
import { loadData, renderScenes } from './controlScenes';
import { getHeaders, vbsControlState } from './controlState';
import type { VbsDisplayText, VbsScene, VbsScriptLink, VbsSfxItem } from './types';

export function addTextRow(label = '', text = ''): void {
  const textList = document.getElementById('text-list');
  if (!textList) return;
  const div = document.createElement('div');
  div.className = 'sfx-item';
  div.innerHTML = `
    <input type="text" placeholder="Button Label" value="${label}" style="width: 30%;">
    <input type="text" placeholder="Actual Text to Display" value="${text}" style="width: 60%;">
    <button type="button" class="btn-danger btn-sm" style="width: 10%;" onclick="this.parentElement.remove()">X</button>
  `;
  textList.appendChild(div);
}

export function addSfxRow(label = '', url = '', loop = false): void {
  const sfxList = document.getElementById('sfx-list');
  if (!sfxList) return;
  const div = document.createElement('div');
  div.className = 'sfx-item';

  let options = '<option value="">Select...</option>';
  (vbsControlState.rawMedia.audio ?? []).forEach((a) => {
    options += `<option value="/assets/audio/${a}">/assets/audio/${a}</option>`;
  });

  const loopChecked = loop ? 'checked' : '';
  div.innerHTML = `
    <input type="text" placeholder="Label" value="${label}" style="width: 25%;">
    <input type="text" placeholder="URL / Path" value="${url}" style="width: 35%;">
    <select style="width: 15%;" onchange="this.previousElementSibling.value = this.value">${options}</select>
    <label style="display:flex; align-items:center; width:15%; margin:0; cursor:pointer;">
      <input type="checkbox" style="width:auto; margin-right:4px;" class="sfx-loop-cb" ${loopChecked}> Loop
    </label>
    <button type="button" class="btn-danger btn-sm" style="width: 10%;" onclick="this.parentElement.remove()">X</button>
  `;
  sfxList.appendChild(div);
}

export function openSceneEditor(scene: VbsScene | null = null): void {
  const placeholder = document.getElementById('editor-placeholder');
  if (placeholder) placeholder.style.display = 'none';
  document.getElementById('editor-pane')?.classList.add('active');

  vbsControlState.currentEditingSceneId = scene ? scene.id : null;
  renderScenes();

  const editorTitle = document.getElementById('editor-title');
  if (editorTitle) editorTitle.textContent = scene ? 'Edit Scene' : 'Add Scene';

  const setVal = (id: string, val: string) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = val;
  };
  setVal('scene-id', scene ? scene.id : '');
  setVal('scene-title', scene ? scene.title : '');
  setVal('scene-sort-order', scene && scene.sort_order !== undefined ? String(scene.sort_order) : '0');
  setVal('scene-video', scene ? scene.video_url ?? '' : '');
  setVal('google-doc-url', scene ? scene.google_doc_url ?? '' : '');

  setTimeout(() => {
    initializeEditor();
    if (scene && scene.script_content && vbsControlState.editor) {
      vbsControlState.editor.commands.setContent(scene.script_content);
    }
  }, 0);

  const sfxList = document.getElementById('sfx-list');
  const textList = document.getElementById('text-list');
  if (sfxList) sfxList.innerHTML = '';
  if (textList) textList.innerHTML = '';

  if (scene?.sound_effects?.length) {
    scene.sound_effects.forEach((sfx) => addSfxRow(sfx.label, sfx.url, Boolean(sfx.loop)));
  } else {
    addSfxRow();
  }

  if (scene?.display_texts?.length) {
    scene.display_texts.forEach((t) => addTextRow(t.label, t.text));
  } else {
    addTextRow();
  }

  vbsControlState.currentScriptLinks = scene?.script_links
    ? (JSON.parse(JSON.stringify(scene.script_links)) as VbsScriptLink[])
    : [];
  vbsControlState.currentSelection = null;

  updateLinkSfxSelect();

  if (scene?.script_content) {
    setTimeout(() => previewScript(), 100);
    renderActiveLinks();
  }

  setTimeout(() => attachScriptSelectionHandler(), 100);
}

export function closeSceneEditor(): void {
  detachScriptSelectionHandler();
  const placeholder = document.getElementById('editor-placeholder');
  if (placeholder) placeholder.style.display = 'flex';
  document.getElementById('editor-pane')?.classList.remove('active');
  vbsControlState.currentEditingSceneId = null;
  renderScenes();
}

export async function saveScene(): Promise<void> {
  const getVal = (id: string) =>
    (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ?? '';

  const id = getVal('scene-id');
  const title = getVal('scene-title');
  const sort_order = parseInt(getVal('scene-sort-order'), 10) || 0;
  const video_url = getVal('scene-video');
  const google_doc_url = getVal('google-doc-url');

  const sound_effects: VbsSfxItem[] = [];
  document.querySelectorAll('#sfx-list .sfx-item').forEach((item) => {
    const inputs = item.querySelectorAll<HTMLInputElement>('input[type="text"]');
    const loopCb = item.querySelector<HTMLInputElement>('.sfx-loop-cb');
    if (inputs[0]?.value.trim() && inputs[1]?.value.trim()) {
      sound_effects.push({
        label: inputs[0].value.trim(),
        url: inputs[1].value.trim(),
        loop: loopCb ? loopCb.checked : false,
      });
    }
  });

  const display_texts: VbsDisplayText[] = [];
  document.querySelectorAll('#text-list .sfx-item').forEach((item) => {
    const inputs = item.querySelectorAll<HTMLInputElement>('input[type="text"]');
    if (inputs[0]?.value.trim() && inputs[1]?.value.trim()) {
      display_texts.push({
        label: inputs[0].value.trim(),
        text: inputs[1].value.trim(),
      });
    }
  });

  if (!title) {
    alert('Title is required');
    return;
  }

  const payload = {
    title,
    video_url,
    sound_effects,
    display_texts,
    sort_order,
    script_content: vbsControlState.editor ? vbsControlState.editor.getHTML() : '',
    script_links: vbsControlState.currentScriptLinks,
    google_doc_url,
  };

  try {
    const res = await fetch(id ? `/api/vbs/scenes/${id}` : '/api/vbs/scenes', {
      method: id ? 'PUT' : 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Save failed');
    closeSceneEditor();
    await loadData();
  } catch (err) {
    console.error(err);
    alert('Failed to save scene. Make sure Supabase is connected.');
  }
}

export function editScene(id: string): void {
  const scene = vbsControlState.scenes.find((s) => s.id === id);
  if (scene) openSceneEditor(scene);
}

export async function deleteScene(id: string): Promise<void> {
  if (!confirm('Are you sure you want to delete this scene?')) return;

  try {
    const res = await fetch(`/api/vbs/scenes/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Delete failed');
    await loadData();
  } catch (err) {
    console.error(err);
    alert('Failed to delete scene.');
  }
}
