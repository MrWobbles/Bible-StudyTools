// Admin Interface for Lesson Plans and Class Management
import {
  addClassToLessonPlan,
  createNewClass,
  loadClasses,
  openContentEditor,
  removeClassFromLessonPlan,
  saveClass,
  scheduleClassAutoSave,
} from './classes';
import {
  createNewLessonPlan,
  deleteLessonPlan,
  editLessonPlan,
  goBackToLessonPlans,
  loadLessonPlans,
  openLessonPlan,
  renderLessonPlansList,
  saveLessonPlan,
} from './lessonPlans';
import { addMedia, deleteMedia, editMedia, saveMedia } from './media';
import { updateMediaForm } from './mediaForm';
import {
  downloadMediaToLocal,
  downloadYouTubeVideo,
  handleMediaUpload,
  toggleMediaInputMode,
} from './mediaUpload';
import {
  addQuestionField,
  addSection,
  closeModal,
  deleteSection,
  editSection,
  saveSection,
} from './modals';
import {
  createNewNote,
  deleteNote,
  editNoteMetadata,
  loadNotes,
  openNoteEditor,
  saveNoteMetadata,
  switchToLessonPlansView,
  switchToNotesView,
} from './notes';
import { adminState, getEl } from './state';
import type { AdminWindow } from './types';

async function setupGlobalNav(): Promise<void> {
  const nav = document.createElement('div');
  nav.id = 'floating-global-nav';
  Object.assign(nav.style, {
    position: 'fixed',
    top: '16px',
    right: '24px',
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
    zIndex: '10000',
    fontFamily: 'inherit',
  });

  const themeSelect = document.createElement('select');
  themeSelect.setAttribute('data-theme-select', '');
  Object.assign(themeSelect.style, {
    background: 'transparent',
    border: 'none',
    color: 'var(--accent, inherit)',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    outline: 'none',
    padding: '0',
  });

  const themes: readonly ThemeOption[] = [
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'night', label: 'Night' },
    { id: 'vivid', label: 'Vivid' },
  ];

  themes.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.label;
    themeSelect.appendChild(opt);
  });

  themeSelect.value = document.documentElement.getAttribute('data-theme') || 'dark';
  themeSelect.addEventListener('change', () => {
    if (window.BSTTheme) {
      window.BSTTheme.applyTheme(themeSelect.value);
    }
  });

  const adminLink = document.createElement('a');
  adminLink.href = 'user-admin.html';
  Object.assign(adminLink.style, {
    color: 'var(--accent, inherit)',
    textDecoration: 'none',
    fontWeight: '500',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  });
  adminLink.innerHTML =
    'Admin <span id="pending-requests-badge" style="display: none; background: #e74c3c; color: white; border-radius: 50%; padding: 2px 6px; font-size: 11px; line-height: 1;">0</span>';

  adminLink.addEventListener('mouseenter', () => {
    adminLink.style.textDecoration = 'underline';
  });
  adminLink.addEventListener('mouseleave', () => {
    adminLink.style.textDecoration = 'none';
  });

  const signOutBtn = document.createElement('button');
  Object.assign(signOutBtn.style, {
    background: 'transparent',
    border: 'none',
    color: 'var(--accent, inherit)',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '14px',
    padding: '0',
    outline: 'none',
  });
  signOutBtn.textContent = 'Sign Out';
  signOutBtn.addEventListener('click', async () => {
    if (window.BSTApi) {
      await window.BSTApi.logout();
      window.location.replace('/auth.html');
    }
  });

  signOutBtn.addEventListener('mouseenter', () => {
    signOutBtn.style.textDecoration = 'underline';
  });
  signOutBtn.addEventListener('mouseleave', () => {
    signOutBtn.style.textDecoration = 'none';
  });

  nav.appendChild(themeSelect);
  nav.appendChild(adminLink);
  nav.appendChild(signOutBtn);
  document.body.appendChild(nav);

  try {
    if (window.BSTApi && typeof window.BSTApi.listSignupRequests === 'function') {
      const res = await window.BSTApi.listSignupRequests('pending');
      if (res && res.requests && res.requests.length > 0) {
        const badge = getEl('pending-requests-badge');
        if (badge) {
          badge.textContent = String(res.requests.length);
          badge.style.display = 'inline-block';
        }
      }
    }
  } catch (err: unknown) {
    console.warn('Could not fetch pending requests for badge:', err);
  }
}

function setupEventListeners(): void {
  getEl('new-lessonplan-btn')?.addEventListener('click', createNewLessonPlan);
  getEl('back-btn')?.addEventListener('click', goBackToLessonPlans);
  getEl('new-class-btn')?.addEventListener('click', createNewClass);
  getEl('add-media-btn')?.addEventListener('click', addMedia);
  getEl('add-section-btn')?.addEventListener('click', addSection);
  getEl('save-class-btn')?.addEventListener('click', saveClass);
  getEl('save-class-btn-bottom')?.addEventListener('click', saveClass);
  getEl('edit-content-btn')?.addEventListener('click', openContentEditor);

  getEl('switch-to-notes-btn')?.addEventListener('click', switchToNotesView);
  getEl('switch-to-lessonplans-btn')?.addEventListener('click', switchToLessonPlansView);
  getEl('new-note-btn')?.addEventListener('click', createNewNote);

  ['classTitle', 'classSubtitle', 'classInstructor', 'classChannel'].forEach((id) => {
    getEl(id)?.addEventListener('input', scheduleClassAutoSave);
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  console.log('Page loading...');
  void setupGlobalNav();
  await loadLessonPlans();
  console.log('Lesson plans loaded:', adminState.allLessonPlans);
  await loadClasses();
  console.log('Classes loaded:', adminState.allClasses);
  await loadNotes();
  console.log('Notes loaded:', adminState.allNotes);
  setupEventListeners();
  console.log('Event listeners set up');
  renderLessonPlansList();
  console.log('Rendered lesson plans list');
});

const adminWindow: AdminWindow = window;
adminWindow.editLessonPlan = editLessonPlan;
adminWindow.deleteLessonPlan = deleteLessonPlan;
adminWindow.openLessonPlan = openLessonPlan;
adminWindow.editNoteMetadata = editNoteMetadata;
adminWindow.deleteNote = deleteNote;
adminWindow.openNoteEditor = openNoteEditor;
adminWindow.removeClassFromLessonPlan = removeClassFromLessonPlan;
adminWindow.addClassToLessonPlan = addClassToLessonPlan;
adminWindow.editMedia = editMedia;
adminWindow.deleteMedia = deleteMedia;
adminWindow.editSection = editSection;
adminWindow.deleteSection = deleteSection;
adminWindow.closeModal = closeModal;
adminWindow.updateMediaForm = updateMediaForm;
adminWindow.saveMedia = saveMedia;
adminWindow.addQuestionField = addQuestionField;
adminWindow.saveSection = saveSection;
adminWindow.saveLessonPlan = saveLessonPlan;
adminWindow.saveNoteMetadata = saveNoteMetadata;
adminWindow.downloadYouTubeVideo = downloadYouTubeVideo;
adminWindow.toggleMediaInputMode = toggleMediaInputMode;
adminWindow.downloadMediaToLocal = downloadMediaToLocal;
adminWindow.handleMediaUpload = handleMediaUpload;
