import { Editor, Node } from '@tiptap/core';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import StarterKit from '@tiptap/starter-kit';
import { showStatus, vbsControlState } from './controlState';

const SfxNode = Node.create({
  name: 'sfxTrigger',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      sfxLabel: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-sfx-label]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      {
        ...HTMLAttributes,
        'data-sfx-label': node.attrs.sfxLabel as string,
        class: 'sfx-trigger-btn script-link',
        style:
          'background: #f59e0b; color: #000; padding: 2px 6px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.8em; margin: 0 4px; display: inline-block;',
      },
      `🔊 ${String(node.attrs.sfxLabel ?? '')}`,
    ];
  },
});

export function updateEditorToolbarStates(): void {
  const { editor } = vbsControlState;
  if (!editor) return;

  document.querySelectorAll<HTMLButtonElement>('.editor-toolbar button[data-cmd]').forEach((btn) => {
    const cmd = btn.dataset.cmd;
    let isActive = false;

    if (cmd === 'bold') isActive = editor.isActive('bold');
    else if (cmd === 'italic') isActive = editor.isActive('italic');
    else if (cmd === 'underline') isActive = editor.isActive('underline');

    btn.classList.toggle('is-active', isActive);
  });
}

export function initializeEditor(): void {
  if (vbsControlState.editor) {
    vbsControlState.editor.destroy();
  }

  const element = document.querySelector('#script-editor-container');
  if (!element) return;

  vbsControlState.editor = new Editor({
    element,
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      SfxNode,
    ],
    content: '<p></p>',
    autofocus: false,
    editable: true,
    onUpdate: () => updateEditorToolbarStates(),
    onSelectionUpdate: () => updateEditorToolbarStates(),
  });

  updateEditorToolbarStates();
}

export function updateEditorSfxDropdown(): void {
  const select = document.getElementById('editor-sfx-select') as HTMLSelectElement | null;
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Insert SFX --</option>';

  document.querySelectorAll('#sfx-list .sfx-item').forEach((item) => {
    const labelInput = item.querySelector<HTMLInputElement>('input[type="text"]:first-of-type');
    if (labelInput && labelInput.value.trim()) {
      const val = labelInput.value.trim();
      const option = document.createElement('option');
      option.value = val;
      option.textContent = val;
      select.appendChild(option);
    }
  });

  if (Array.from(select.options).some((o) => o.value === currentVal)) {
    select.value = currentVal;
  }
}

export function insertSfxFromDropdown(): void {
  const select = document.getElementById('editor-sfx-select') as HTMLSelectElement | null;
  if (!select) return;
  const label = select.value;

  if (!label) {
    alert('Please select an SFX from the dropdown to insert.');
    return;
  }

  if (vbsControlState.editor) {
    vbsControlState.editor
      .chain()
      .focus()
      .insertContent({
        type: 'sfxTrigger',
        attrs: { sfxLabel: label },
      })
      .insertContent(' ')
      .run();
  }

  select.value = '';
}

export function highlightText(color: string): void {
  const { editor } = vbsControlState;
  if (!editor) return;

  const colorMap: Record<string, string> = {
    '#fbbf24': 'yellow',
    '#86efac': 'green',
    '#7dd3fc': 'blue',
    '#f472b6': 'pink',
  };
  editor
    .chain()
    .focus()
    .toggleHighlight({ color: colorMap[color] ?? color })
    .run();
  setTimeout(() => updateEditorToolbarStates(), 0);
}

export function switchScriptTab(tab: string, triggerEl?: HTMLElement): void {
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((el) => el.classList.remove('active'));

  document.getElementById(`tab-${tab}`)?.classList.add('active');
  const activeBtn =
    triggerEl ??
    (window.event?.target as HTMLElement | null) ??
    document.querySelector<HTMLElement>(`.tab-btn[onclick*="'${tab}'"]`);
  activeBtn?.classList.add('active');
}

export async function fetchGoogleDoc(): Promise<void> {
  const input = document.getElementById('google-doc-url') as HTMLInputElement | null;
  const url = input?.value.trim() ?? '';

  if (!url) {
    alert('Please enter a Google Doc URL');
    return;
  }

  try {
    showStatus('Fetching Google Doc...');
    const match = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error('Invalid Google Doc URL format');
    }

    const docId = match[1];
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const response = await fetch(exportUrl);
    if (!response.ok) throw new Error('Failed to fetch document');

    const text = await response.text();
    if (vbsControlState.editor) {
      vbsControlState.editor.commands.setContent(`<p>${text.split('\n').join('</p><p>')}</p>`);
    }

    switchScriptTab('content');
    showStatus('Document loaded! Add formatting as needed.');
  } catch (err) {
    console.error(err);
    showStatus('Error fetching Google Doc. Make sure the link is public/shared.', true);
  }
}
