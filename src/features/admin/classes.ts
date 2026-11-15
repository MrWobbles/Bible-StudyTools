import { saveLessonPlansToFile } from './lessonPlans';
import { renderMediaList } from './media';
import { renderOutlineList } from './modals';
import {
  ADMIN_AUTOSAVE_DELAY_MS,
  adminState,
  escapeHtml,
  generateGUID,
  getAnchor,
  getEl,
  getInput,
  getLessonPlanIdentifier,
  isRecord,
  postAdminSave,
} from './state';
import type { AdminClassConfig, SaveClassOptions } from './types';

let adminAutoSaveTimer: ReturnType<typeof setTimeout> | undefined;

export async function loadClasses(): Promise<void> {
  try {
    if (!window.BSTApi) {
      adminState.allClasses = [];
      return;
    }
    const data = await window.BSTApi.getClasses();
    if (Array.isArray(data)) {
      adminState.allClasses = data as AdminClassConfig[];
    } else if (isRecord(data) && Array.isArray(data.classes)) {
      adminState.allClasses = data.classes as AdminClassConfig[];
    } else {
      adminState.allClasses = [];
    }
  } catch (error: unknown) {
    console.error('Failed to load classes:', error);
    adminState.allClasses = [];
  }
}

export function renderClassListForLessonPlan(): void {
  const classList = getEl('classes-list');
  if (!classList || adminState.currentLessonPlan === null) return;
  classList.innerHTML = '';

  const plan = adminState.allLessonPlans[adminState.currentLessonPlan];
  if (!plan) return;
  const planClassIds = plan.classes || [];

  planClassIds.forEach((classId) => {
    const cls = adminState.allClasses.find((c) => c.id === classId || c.classNumber === classId);
    if (cls) {
      const index = adminState.allClasses.indexOf(cls);
      const item = document.createElement('div');
      item.className = 'class-item' + (adminState.currentClass === index ? ' active' : '');
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
              <span class="class-item-title">${escapeHtml(cls.title || '')}</span>
          </div>
          <button class="btn-icon" onclick="removeClassFromLessonPlan(${index})" title="Remove"><span class="material-symbols-outlined">delete</span></button>
        </div>
      `;
      item.addEventListener('click', (e: MouseEvent) => {
        const target = e.target;
        if (!(target instanceof Element) || !target.closest('button')) {
          selectClass(index);
        }
      });
      classList.appendChild(item);
    }
  });

  const addOption = document.createElement('div');
  addOption.className = 'class-item';
  addOption.style.cursor = 'pointer';
  addOption.style.textAlign = 'center';
  addOption.style.color = 'var(--accent)';
  addOption.innerHTML = '+ Add Existing Class';
  addOption.addEventListener('click', showAvailableClassesModal);
  classList.appendChild(addOption);
}

export function showAvailableClassesModal(): void {
  if (adminState.currentLessonPlan === null) return;
  const plan = adminState.allLessonPlans[adminState.currentLessonPlan];
  if (!plan) return;
  const planClassIds = plan.classes || [];

  const availableClasses = adminState.allClasses.filter((cls) => {
    const classId = cls.id ?? cls.classNumber;
    return classId !== undefined && !planClassIds.includes(classId);
  });

  if (availableClasses.length === 0) {
    alert('All available classes are already in this lesson plan.');
    return;
  }

  let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
  availableClasses.forEach((cls) => {
    const index = adminState.allClasses.indexOf(cls);
    html += `
      <button class="btn-secondary" style="text-align: left; padding: 10px;" onclick="addClassToLessonPlan(${index}); closeModal('class-add-modal');">
        <strong>${escapeHtml(cls.title || '')}</strong><br/>
        <span style="font-size: 12px; color: var(--muted);">${escapeHtml(cls.subtitle || '')}</span>
      </button>
    `;
  });
  html += '</div>';

  const content = getEl('class-add-modal-content');
  const modal = getEl('class-add-modal');
  if (content) content.innerHTML = html;
  if (modal) modal.style.display = 'flex';
}

export function addClassToLessonPlan(classIndex: number): void {
  if (adminState.currentLessonPlan === null) return;
  const cls = adminState.allClasses[classIndex];
  const plan = adminState.allLessonPlans[adminState.currentLessonPlan];
  if (!cls || !plan) return;

  const classId = cls.id ?? cls.classNumber;
  if (classId === undefined) return;

  if (!plan.classes) {
    plan.classes = [];
  }
  if (!plan.classes.includes(classId)) {
    plan.classes.push(classId);
    renderClassListForLessonPlan();
    void saveLessonPlansToFile({ changedPlanId: getLessonPlanIdentifier(plan) });
  }
}

export function removeClassFromLessonPlan(classIndex: number): void {
  if (adminState.currentLessonPlan === null) return;
  const cls = adminState.allClasses[classIndex];
  const plan = adminState.allLessonPlans[adminState.currentLessonPlan];
  if (!cls || !plan) return;

  const classId = cls.id ?? cls.classNumber;
  plan.classes = (plan.classes || []).filter((id) => id !== classId);
  renderClassListForLessonPlan();
  void saveLessonPlansToFile({ changedPlanId: getLessonPlanIdentifier(plan) });
}

export function createNewClass(): void {
  const newClassId = generateGUID();

  const newClass: AdminClassConfig = {
    id: newClassId,
    classNumber: adminState.allClasses.length + 1,
    title: 'New Class',
    subtitle: '',
    instructor: '',
    channelName: `class-${adminState.allClasses.length + 1}-control`,
    media: [],
    outline: [],
    content: {
      html: '<p>Start writing your class content here...</p>',
      json: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Start writing your class content here...' }],
          },
        ],
      },
      text: 'Start writing your class content here...',
    },
  };

  adminState.allClasses.push(newClass);
  console.log('Created new class:', newClass);

  if (
    adminState.currentLessonPlan !== null &&
    adminState.allLessonPlans[adminState.currentLessonPlan]
  ) {
    const plan = adminState.allLessonPlans[adminState.currentLessonPlan];
    if (!plan.classes) {
      plan.classes = [];
    }
    if (!plan.classes.includes(newClassId)) {
      plan.classes.push(newClassId);
    }
    renderClassListForLessonPlan();
  }

  selectClass(adminState.allClasses.length - 1);

  console.log('Auto-saving new class...');
  void saveClassToFile({ changedClassId: newClassId });

  if (adminState.currentLessonPlan !== null) {
    console.log('Auto-saving lesson plan...');
    void saveLessonPlansToFile();
  }
}

export function openContentEditor(): void {
  if (adminState.currentClass === null || !adminState.allClasses[adminState.currentClass]) {
    alert('Please select a class first');
    return;
  }

  const cls = adminState.allClasses[adminState.currentClass];
  const classId = cls.id ?? cls.classNumber ?? '';
  window.open(`editor.html?class=${classId}`, '_blank');
}

export function selectClass(index: number): void {
  const cls = adminState.allClasses[index];
  if (!cls) return;
  adminState.currentClass = index;

  if (!Array.isArray(cls.media)) cls.media = [];
  if (!Array.isArray(cls.outline)) cls.outline = [];

  const editor = getEl('editor');
  const noSelection = getEl('no-selection');
  const editTitle = getEl('edit-title');
  const saveClassBtn = getEl('save-class-btn');
  const editContentBtn = getEl('edit-content-btn');

  if (editor) editor.style.display = 'block';
  if (noSelection) noSelection.style.display = 'none';
  if (editTitle) editTitle.textContent = `Editing: ${cls.title || ''}`;
  if (saveClassBtn) saveClassBtn.style.display = 'block';
  if (editContentBtn) editContentBtn.style.display = 'block';

  const classTitleEl = getInput('classTitle');
  const classSubtitleEl = getInput('classSubtitle');
  const classInstructorEl = getInput('classInstructor');
  const classChannelEl = getInput('classChannel');
  if (classTitleEl) classTitleEl.value = cls.title || '';
  if (classSubtitleEl) classSubtitleEl.value = cls.subtitle || '';
  if (classInstructorEl) classInstructorEl.value = cls.instructor || '';
  if (classChannelEl) classChannelEl.value = cls.channelName || '';

  renderMediaList(cls);
  renderOutlineList(cls);

  const classId = cls.id ?? cls.classNumber ?? '';
  const studentLink = getAnchor('view-student-link');
  const teacherLink = getAnchor('view-teacher-link');
  if (studentLink) studentLink.href = `student.html?class=${classId}`;
  if (teacherLink) teacherLink.href = `teacher.html?class=${classId}`;

  renderClassListForLessonPlan();
}

function readClassFormIntoMemory(cls: AdminClassConfig): void {
  const titleEl = getInput('classTitle');
  const subtitleEl = getInput('classSubtitle');
  const instructorEl = getInput('classInstructor');
  const channelEl = getInput('classChannel');

  if (titleEl) cls.title = titleEl.value;
  if (subtitleEl) cls.subtitle = subtitleEl.value;
  if (instructorEl) cls.instructor = instructorEl.value;
  if (channelEl) cls.channelName = channelEl.value;
}

export function saveClass(): void {
  if (adminState.currentClass === null) return;
  const cls = adminState.allClasses[adminState.currentClass];
  if (!cls) return;

  readClassFormIntoMemory(cls);
  void saveClassToFile();
}

export async function saveClassToFile(_options: SaveClassOptions = {}): Promise<void> {
  console.log('saveClassToFile called with', adminState.allClasses.length, 'classes');
  await postAdminSave('/api/save/classes', { classes: adminState.allClasses }, 'Classes');
}

export function scheduleClassAutoSave(): void {
  clearTimeout(adminAutoSaveTimer);
  adminAutoSaveTimer = setTimeout(() => {
    if (adminState.currentClass === null) return;
    const cls = adminState.allClasses[adminState.currentClass];
    if (!cls) return;
    readClassFormIntoMemory(cls);
    void saveClassToFile();
  }, ADMIN_AUTOSAVE_DELAY_MS);
}
