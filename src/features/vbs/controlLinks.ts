import { findSfxUrl, sendCommand, showStatus, vbsControlState } from './controlState';

function bindLinkElements(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('[data-sfx-label]').forEach((link) => {
    const label = link.getAttribute('data-sfx-label');
    if (!label) return;
    const sfxUrl = findSfxUrl(label);
    if (!sfxUrl) return;

    link.style.cursor = 'pointer';
    link.onmouseover = () => {
      link.style.backgroundColor = '#2563eb';
    };
    link.onmouseout = () => {
      link.style.backgroundColor = '#3b82f6';
    };
    link.onclick = (e) => {
      e.stopPropagation();
      void sendCommand('play_sfx', { url: sfxUrl });
    };
    link.title = `Click to play: ${label}`;
  });
}

function bindTriggerButtons(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('.sfx-trigger-btn').forEach((btn) => {
    const label = btn.getAttribute('data-sfx-label');
    if (!label) return;
    const sfxUrl = findSfxUrl(label);
    if (sfxUrl) {
      btn.style.cursor = 'pointer';
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

export function previewScript(): void {
  const preview = document.getElementById('script-preview');
  if (!preview) return;

  const { editor, currentScriptLinks } = vbsControlState;
  if (!editor) {
    preview.innerHTML = '<p style="color: #9ca3af;">No script content yet.</p>';
    return;
  }

  const scriptHtml = editor.getHTML();
  if (!scriptHtml || scriptHtml === '<p></p>') {
    preview.innerHTML = '<p style="color: #9ca3af;">No script content yet.</p>';
    return;
  }

  const sortedLinks = [...currentScriptLinks].sort(
    (a, b) => b.text_selection.length - a.text_selection.length,
  );

  let displayHtml = scriptHtml;
  sortedLinks.forEach((link) => {
    const sfxUrl = findSfxUrl(link.sfx_label);
    if (!sfxUrl) return;
    const escapedText = link.text_selection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkSpan = `<span data-sfx-label="${link.sfx_label}" style="background: #3b82f6; padding: 0.2rem 0.4rem; border-radius: 0.25rem; cursor: pointer; transition: background 0.2s; white-space: normal; color: white;">${link.text_selection}</span>`;
    displayHtml = displayHtml.replace(new RegExp(escapedText, 'g'), linkSpan);
  });

  preview.innerHTML = displayHtml;
  bindLinkElements(preview);
  bindTriggerButtons(preview);
}

export function updateLinkSfxSelect(): void {
  const select = document.getElementById('link-sfx-select') as HTMLSelectElement | null;
  if (!select) return;
  select.innerHTML = '<option value="">-- Select SFX --</option>';

  document.querySelectorAll('#sfx-list .sfx-item').forEach((item) => {
    const labelInput = item.querySelector<HTMLInputElement>('input[type="text"]:first-of-type');
    if (labelInput && labelInput.value.trim()) {
      const option = document.createElement('option');
      option.value = labelInput.value;
      option.textContent = labelInput.value;
      select.appendChild(option);
    }
  });
}

export function showFullscriptView(): void {
  const preview = document.getElementById('script-preview');
  if (!preview || !preview.innerHTML || preview.innerHTML.includes('No script content')) {
    alert('No script content yet. First create text-to-SFX links in the Link Text to SFX tab.');
    return;
  }

  const overlay = document.getElementById('fullscreen-script-overlay');
  const content = document.getElementById('fullscreen-script-content');
  if (!overlay || !content) return;

  content.innerHTML = preview.innerHTML;
  bindLinkElements(content);
  overlay.classList.add('active');
}

export function closeFullscriptView(): void {
  document.getElementById('fullscreen-script-overlay')?.classList.remove('active');
}

export function renderActiveLinks(): void {
  const list = document.getElementById('active-links-list');
  if (!list) return;

  const links = vbsControlState.currentScriptLinks;
  if (!links || links.length === 0) {
    list.innerHTML = '<p style="color: #9ca3af;">No links created yet.</p>';
    return;
  }

  list.innerHTML = links
    .map(
      (link, idx) => `
        <div style="background: #0f172a; padding: 0.5rem; border-radius: 0.25rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span style="color: #3b82f6;">"${link.text_selection}"</span> → <span style="color: #10b981;">${link.sfx_label}</span>
          </div>
          <button type="button" class="btn-danger btn-sm" onclick="removeLink(${idx})">Remove</button>
        </div>
      `,
    )
    .join('');
}

export function clearLinkSelection(): void {
  vbsControlState.currentSelection = null;
  const display = document.getElementById('selected-text-display');
  if (display) display.textContent = '';
  const select = document.getElementById('link-sfx-select') as HTMLSelectElement | null;
  if (select) select.value = '';
}

export function createLink(): void {
  const selection = vbsControlState.currentSelection;
  const select = document.getElementById('link-sfx-select') as HTMLSelectElement | null;
  const sfxLabel = select?.value ?? '';

  if (!selection || !selection.text.trim()) {
    alert('Please select text first');
    return;
  }

  if (!sfxLabel) {
    alert('Please select an SFX');
    return;
  }

  const exists = vbsControlState.currentScriptLinks.some(
    (link) => link.text_selection === selection.text,
  );
  if (exists) {
    alert('This text is already linked. Remove the old link first.');
    return;
  }

  vbsControlState.currentScriptLinks.push({
    text_selection: selection.text,
    sfx_label: sfxLabel,
  });

  showStatus(`Linked "${selection.text}" to "${sfxLabel}"`);
  renderActiveLinks();
  clearLinkSelection();
  previewScript();
}

export function removeLink(index: number): void {
  vbsControlState.currentScriptLinks.splice(index, 1);
  renderActiveLinks();
  previewScript();
}

export function selectTextForLink(): void {
  const selection = window.getSelection();
  const selectedText = selection?.toString() ?? '';
  if (selectedText.length > 0) {
    vbsControlState.currentSelection = { text: selectedText };
    const display = document.getElementById('selected-text-display');
    if (display) display.textContent = `"${selectedText}"`;
  }
}

export function attachScriptSelectionHandler(): void {
  const preview = document.getElementById('script-preview') as
    | (HTMLElement & { _hasSelectionListener?: boolean })
    | null;
  if (preview && !preview._hasSelectionListener) {
    preview.addEventListener('mouseup', selectTextForLink);
    preview._hasSelectionListener = true;
  }
}

export function detachScriptSelectionHandler(): void {
  const preview = document.getElementById('script-preview') as
    | (HTMLElement & { _hasSelectionListener?: boolean })
    | null;
  if (preview) {
    preview.removeEventListener('mouseup', selectTextForLink);
    preview._hasSelectionListener = false;
  }
}
