import { closeModal, editorState, setEditorContent } from '../state';
import { getErrorMessage, getHtmlText, isRecord } from '../types';
import type { EditorVersionSummary, VersionDocTarget } from '../types';
import { openModal } from '../ui/modals';
import { saveDocument } from './documents';
import { markEditorDirty } from './drafts';

function getVersionDocTarget(): VersionDocTarget | null {
  if (editorState.isNoteMode && editorState.currentNoteId) {
    return { docType: 'notes', recordId: editorState.currentNoteId };
  }
  if (editorState.currentClassId) {
    return { docType: 'classes', recordId: editorState.currentClassId };
  }
  return null;
}

export async function openVersionHistory(): Promise<void> {
  const target = getVersionDocTarget();
  const status = document.getElementById('version-history-status');
  const list = document.getElementById('version-history-list');
  const preview = document.getElementById('version-history-preview');
  const restoreBtn = document.getElementById('btn-version-restore');
  editorState.selectedVersionHtml = null;
  if (restoreBtn instanceof HTMLButtonElement) restoreBtn.disabled = true;
  if (list) list.textContent = '';
  if (preview) preview.textContent = '';
  openModal('version-history-modal');

  if (!target) {
    if (status) {
      status.textContent = 'Version history is only available for saved classes and notes.';
    }
    return;
  }

  if (status) status.textContent = 'Loading...';
  try {
    if (!window.BSTApi) {
      throw new Error('API client unavailable');
    }
    const response: unknown = await window.BSTApi.listEditorVersions(
      target.docType,
      target.recordId
    );
    const versions =
      isRecord(response) && Array.isArray(response.versions)
        ? (response.versions as EditorVersionSummary[])
        : [];
    if (status) {
      status.textContent = versions.length
        ? 'Select a version to preview it. Restoring saves it as a new version.'
        : 'No versions yet. A version is recorded each time you save.';
    }
    versions.forEach((version) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-secondary';
      button.style.cssText = 'width: 100%; text-align: left; margin-bottom: 4px;';
      const when = version.createdAt
        ? new Date(version.createdAt).toLocaleString()
        : 'Unknown time';
      button.textContent = `${when} (${version.kind === 'snapshot' ? 'full copy' : 'change'}, ${version.bytes ?? 0} B)`;
      button.addEventListener('click', () => {
        void previewVersion(target, version.seq, status);
      });
      item.appendChild(button);
      list?.appendChild(item);
    });
  } catch (error: unknown) {
    if (status) {
      status.textContent = `Could not load version history: ${getErrorMessage(error)}`;
    }
  }
}

async function previewVersion(
  target: VersionDocTarget,
  seq: string | number,
  status: HTMLElement | null
): Promise<void> {
  const preview = document.getElementById('version-history-preview');
  const restoreBtn = document.getElementById('btn-version-restore');
  editorState.selectedVersionHtml = null;
  if (restoreBtn instanceof HTMLButtonElement) restoreBtn.disabled = true;
  if (preview) preview.textContent = 'Loading...';
  try {
    if (!window.BSTApi) {
      throw new Error('API client unavailable');
    }
    const version: unknown = await window.BSTApi.getEditorVersion(
      target.docType,
      target.recordId,
      seq
    );
    const html = isRecord(version) && typeof version.html === 'string' ? version.html : '';
    editorState.selectedVersionHtml = html;
    if (preview) preview.textContent = getHtmlText(html);
    if (restoreBtn instanceof HTMLButtonElement) restoreBtn.disabled = false;
  } catch (error: unknown) {
    if (preview) preview.textContent = '';
    if (status) {
      status.textContent = `Could not load that version: ${getErrorMessage(error)}`;
    }
  }
}

export async function restoreSelectedVersion(): Promise<void> {
  if (editorState.selectedVersionHtml === null) return;
  const html = editorState.selectedVersionHtml;
  closeModal('version-history-modal');
  if (editorState.isCodeView) {
    if (editorState.codeMirrorInstance) {
      editorState.codeMirrorInstance.setValue(html);
    } else {
      const codeView = document.getElementById('editor-code-view');
      if (codeView instanceof HTMLTextAreaElement) codeView.value = html;
    }
  }
  setEditorContent(html);
  markEditorDirty();
  await saveDocument();
}
