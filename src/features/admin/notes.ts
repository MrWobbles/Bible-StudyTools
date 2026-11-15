import { renderLessonPlansList } from './lessonPlans';
import { closeModal } from './modals';
import {
  adminState,
  escapeHtml,
  generateNoteGUID,
  getEl,
  getInput,
  getNoteIdentifier,
  getTextArea,
  isRecord,
  postAdminSave,
} from './state';
import type { NoteItem, SaveNotesOptions } from './types';

function toNoteItem(raw: unknown): NoteItem | null {
  if (!isRecord(raw) || typeof raw.title !== 'string') {
    return null;
  }
  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    noteId: typeof raw.noteId === 'string' ? raw.noteId : undefined,
    title: raw.title,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    createdDate: typeof raw.createdDate === 'string' ? raw.createdDate : '',
    lastModified: typeof raw.lastModified === 'string' ? raw.lastModified : undefined,
    content: raw.content,
  };
}

export async function loadNotes(): Promise<void> {
  try {
    if (!window.BSTApi) {
      adminState.allNotes = [];
      return;
    }
    console.log('Fetching notes from API');
    const data = await window.BSTApi.getNotes();
    console.log('Parsed notes JSON data:', data);
    if (isRecord(data) && Array.isArray(data.notes)) {
      adminState.allNotes = data.notes
        .map(toNoteItem)
        .filter((note): note is NoteItem => note !== null);
    } else {
      adminState.allNotes = [];
    }
    console.log('Set allNotes to:', adminState.allNotes);
  } catch (error: unknown) {
    console.error('Failed to load notes:', error);
    adminState.allNotes = [];
  }
}

export function renderNotesList(): void {
  const list = getEl('notes-list');
  if (!list) return;
  console.log('Rendering notes, count:', adminState.allNotes.length);
  list.innerHTML = '';

  if (adminState.allNotes.length === 0) {
    list.innerHTML =
      '<p style="grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 40px;">No notes yet. Create one to get started!</p>';
    return;
  }

  adminState.allNotes.forEach((note, index) => {
    const card = document.createElement('div');
    card.className = 'lessonplan-card';
    card.innerHTML = `
      <div class="lessonplan-card-header">
        <div class="lessonplan-card-title">${escapeHtml(note.title)}</div>
        <div class="lessonplan-card-actions">
          <button class="btn-icon" onclick="editNoteMetadata(${index})" title="Edit"><span class="material-symbols-outlined">edit</span></button>
          <button class="btn-icon" onclick="deleteNote(${index})" title="Delete"><span class="material-symbols-outlined">delete</span></button>
        </div>
      </div>
      <div class="lessonplan-card-description">${escapeHtml(note.description || '')}</div>
      <div class="lessonplan-card-footer">
        <div style="font-size: 11px;">Created: ${new Date(note.createdDate).toLocaleDateString()}</div>
        ${note.lastModified ? `<div style="font-size: 11px;">Modified: ${new Date(note.lastModified).toLocaleDateString()}</div>` : ''}
      </div>
      <button class="btn-primary" onclick="openNoteEditor(${index})" style="margin-top: 12px; width: 100%;"><span class="material-symbols-outlined">edit_note</span>Edit Note</button>
    `;
    list.appendChild(card);
  });
}

export function switchToNotesView(): void {
  const lessonPlanView = getEl('lessonplan-view');
  const notesView = getEl('notes-view');
  const headerTitle = getEl('header-title');
  const headerSubtitle = getEl('header-subtitle');
  if (lessonPlanView) lessonPlanView.style.display = 'none';
  if (notesView) notesView.style.display = 'grid';
  if (headerTitle) headerTitle.textContent = 'Notes';
  if (headerSubtitle) headerSubtitle.textContent = 'Create and manage personal notes';
  renderNotesList();
}

export function switchToLessonPlansView(): void {
  const notesView = getEl('notes-view');
  const lessonPlanView = getEl('lessonplan-view');
  const headerTitle = getEl('header-title');
  const headerSubtitle = getEl('header-subtitle');
  if (notesView) notesView.style.display = 'none';
  if (lessonPlanView) lessonPlanView.style.display = 'grid';
  if (headerTitle) headerTitle.textContent = 'Lesson Plans';
  if (headerSubtitle) headerSubtitle.textContent = 'Create and manage Bible study lesson plans';
  renderLessonPlansList();
}

export function createNewNote(): void {
  const modalTitle = getEl('note-modal-title');
  const titleInput = getInput('note-title');
  const descInput = getTextArea('note-description');
  const modal = getEl('note-modal');

  if (modalTitle) modalTitle.textContent = 'New Note';
  if (titleInput) titleInput.value = '';
  if (descInput) descInput.value = '';
  adminState.currentNote = null;
  if (modal) modal.style.display = 'flex';
}

export function editNoteMetadata(index: number): void {
  const note = adminState.allNotes[index];
  if (!note) return;
  adminState.currentNote = index;

  const modalTitle = getEl('note-modal-title');
  const titleInput = getInput('note-title');
  const descInput = getTextArea('note-description');
  const modal = getEl('note-modal');

  if (modalTitle) modalTitle.textContent = 'Edit Note';
  if (titleInput) titleInput.value = note.title;
  if (descInput) descInput.value = note.description || '';
  if (modal) modal.style.display = 'flex';
}

export function saveNoteMetadata(): void {
  const title = getInput('note-title')?.value ?? '';
  const description = getTextArea('note-description')?.value ?? '';

  if (!title.trim()) {
    alert('Please enter a note title');
    return;
  }

  let changedNoteId: string | null = null;

  if (adminState.currentNote !== null && adminState.allNotes[adminState.currentNote]) {
    const existing = adminState.allNotes[adminState.currentNote];
    existing.title = title.trim();
    existing.description = description.trim();
    existing.lastModified = new Date().toISOString();
    changedNoteId = getNoteIdentifier(existing);
  } else {
    const newId = generateNoteGUID();
    const note: NoteItem = {
      id: newId,
      title: title.trim(),
      description: description.trim(),
      createdDate: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      content: null,
    };
    adminState.allNotes.push(note);
    changedNoteId = newId;
  }

  void saveNotesToFile({ changedNoteId });
  closeModal('note-modal');
  renderNotesList();
}

export function deleteNote(index: number): void {
  const note = adminState.allNotes[index];
  if (!note) return;
  if (confirm('Delete this note? This action cannot be undone.')) {
    const deletedNoteId = getNoteIdentifier(note);
    adminState.allNotes.splice(index, 1);
    void saveNotesToFile({ deletedNoteId });
    renderNotesList();
  }
}

export function openNoteEditor(index: number): void {
  const note = adminState.allNotes[index];
  if (!note) return;
  const noteId = getNoteIdentifier(note);
  window.location.href = `editor.html?note=${encodeURIComponent(noteId)}`;
}

export async function saveNotesToFile(_options: SaveNotesOptions = {}): Promise<void> {
  console.log('saveNotesToFile called with', adminState.allNotes.length, 'notes');
  await postAdminSave('/api/save/notes', { notes: adminState.allNotes }, 'Notes');
}
