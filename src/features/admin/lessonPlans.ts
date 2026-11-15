import { renderClassListForLessonPlan } from './classes';
import { closeModal } from './modals';
import {
  adminState,
  escapeHtml,
  getAnchor,
  getEl,
  getInput,
  getLessonPlanIdentifier,
  getTextArea,
  isRecord,
  postAdminSave,
} from './state';
import type { LessonPlan, SaveLessonPlansOptions } from './types';

function toLessonPlan(raw: unknown): LessonPlan | null {
  if (!isRecord(raw) || typeof raw.title !== 'string') {
    return null;
  }
  const classes = Array.isArray(raw.classes)
    ? raw.classes.filter((c): c is string | number => typeof c === 'string' || typeof c === 'number')
    : undefined;
  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    planId: typeof raw.planId === 'string' ? raw.planId : undefined,
    title: raw.title,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    createdDate: typeof raw.createdDate === 'string' ? raw.createdDate : '',
    order: typeof raw.order === 'number' ? raw.order : undefined,
    classes,
  };
}

export async function loadLessonPlans(): Promise<void> {
  try {
    if (!window.BSTApi) {
      adminState.allLessonPlans = [];
      return;
    }
    console.log('Fetching lesson plans from API');
    const data = await window.BSTApi.getLessonPlans();
    console.log('Parsed JSON data:', data);
    if (isRecord(data) && Array.isArray(data.lessonPlans)) {
      adminState.allLessonPlans = data.lessonPlans
        .map(toLessonPlan)
        .filter((plan): plan is LessonPlan => plan !== null);
    } else {
      adminState.allLessonPlans = [];
    }
    console.log('Set allLessonPlans to:', adminState.allLessonPlans);
  } catch (error: unknown) {
    console.error('Failed to load lesson plans:', error);
    adminState.allLessonPlans = [];
  }
}

export function renderLessonPlansList(): void {
  const list = getEl('lessonplans-list');
  if (!list) return;
  console.log('Rendering lesson plans, count:', adminState.allLessonPlans.length);
  list.innerHTML = '';

  if (adminState.allLessonPlans.length === 0) {
    list.innerHTML =
      '<p style="grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 40px;">No lesson plans yet. Create one to get started!</p>';
    return;
  }

  adminState.allLessonPlans.forEach((plan, index) => {
    const classCount = plan.classes ? plan.classes.length : 0;
    const card = document.createElement('div');
    card.className = 'lessonplan-card';
    card.innerHTML = `
      <div class="lessonplan-card-header">
        <div class="lessonplan-card-title">${escapeHtml(plan.title)}</div>
        <div class="lessonplan-card-actions">
          <button class="btn-icon" onclick="editLessonPlan(${index})" title="Edit"><span class="material-symbols-outlined">edit</span></button>
          <button class="btn-icon" onclick="deleteLessonPlan(${index})" title="Delete"><span class="material-symbols-outlined">delete</span></button>
        </div>
      </div>
      <div class="lessonplan-card-description">${escapeHtml(plan.description || '')}</div>
      <div class="lessonplan-card-footer">
        <span class="lessonplan-card-classes">${classCount} class${classCount !== 1 ? 'es' : ''}</span>
        <div style="margin-top: 8px; font-size: 11px;">Created: ${new Date(plan.createdDate).toLocaleDateString()}</div>
      </div>
      <button class="btn-primary" onclick="openLessonPlan(${index})" style="margin-top: 12px; width: 100%;">Open</button>
    `;
    list.appendChild(card);
  });
}

export function createNewLessonPlan(): void {
  const modalTitle = getEl('lessonplan-modal-title');
  const titleInput = getInput('lessonplan-title');
  const descInput = getTextArea('lessonplan-description');
  const modal = getEl('lessonplan-modal');

  if (modalTitle) modalTitle.textContent = 'New Lesson Plan';
  if (titleInput) titleInput.value = '';
  if (descInput) descInput.value = '';
  adminState.currentLessonPlan = null;
  if (modal) modal.style.display = 'flex';
}

export function editLessonPlan(index: number): void {
  const plan = adminState.allLessonPlans[index];
  if (!plan) return;
  adminState.currentLessonPlan = index;

  const modalTitle = getEl('lessonplan-modal-title');
  const titleInput = getInput('lessonplan-title');
  const descInput = getTextArea('lessonplan-description');
  const modal = getEl('lessonplan-modal');

  if (modalTitle) modalTitle.textContent = 'Edit Lesson Plan';
  if (titleInput) titleInput.value = plan.title;
  if (descInput) descInput.value = plan.description || '';
  if (modal) modal.style.display = 'flex';
}

export function saveLessonPlan(): void {
  const title = getInput('lessonplan-title')?.value ?? '';
  const description = getTextArea('lessonplan-description')?.value ?? '';
  let changedPlanId = '';

  if (!title.trim()) {
    alert('Please enter a lesson plan title');
    return;
  }

  if (
    adminState.currentLessonPlan !== null &&
    adminState.allLessonPlans[adminState.currentLessonPlan]
  ) {
    const existing = adminState.allLessonPlans[adminState.currentLessonPlan];
    existing.title = title.trim();
    existing.description = description.trim();
    changedPlanId = getLessonPlanIdentifier(existing);
  } else {
    const plan: LessonPlan = {
      id: `lesson-plan-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      createdDate: new Date().toISOString().split('T')[0],
      order: adminState.allLessonPlans.length + 1,
      classes: [],
    };
    adminState.allLessonPlans.push(plan);
    changedPlanId = getLessonPlanIdentifier(plan);
  }

  void saveLessonPlansToFile({ changedPlanId });
  closeModal('lessonplan-modal');
  renderLessonPlansList();
}

export function deleteLessonPlan(index: number): void {
  const plan = adminState.allLessonPlans[index];
  if (!plan) return;
  if (confirm('Delete this lesson plan and all its classes?')) {
    const deletedPlanId = getLessonPlanIdentifier(plan);
    adminState.allLessonPlans.splice(index, 1);
    void saveLessonPlansToFile({ deletedPlanId });
    renderLessonPlansList();
  }
}

export function openLessonPlan(index: number): void {
  const plan = adminState.allLessonPlans[index];
  if (!plan) return;
  adminState.currentLessonPlan = index;

  const headerTitle = getEl('header-title');
  const headerSubtitle = getEl('header-subtitle');
  const backBtn = getEl('back-btn');
  if (headerTitle) headerTitle.textContent = plan.title;
  if (headerSubtitle) headerSubtitle.textContent = 'Edit classes in this lesson plan';
  if (backBtn) backBtn.style.display = 'block';

  const studentLink = getAnchor('view-student-link');
  const teacherLink = getAnchor('view-teacher-link');
  if (studentLink) studentLink.style.display = 'inline-flex';
  if (teacherLink) teacherLink.style.display = 'inline-flex';

  const lessonPlanView = getEl('lessonplan-view');
  const classEditorView = getEl('class-editor-view');
  const classListTitle = getEl('class-list-title');
  if (lessonPlanView) lessonPlanView.style.display = 'none';
  if (classEditorView) classEditorView.style.display = 'grid';
  if (classListTitle) classListTitle.textContent = `Classes in "${plan.title}"`;

  adminState.currentClass = null;
  if (studentLink) studentLink.href = 'student.html';
  if (teacherLink) teacherLink.href = 'teacher.html';
  renderClassListForLessonPlan();
}

export function goBackToLessonPlans(): void {
  adminState.currentLessonPlan = null;
  adminState.currentClass = null;

  const headerTitle = getEl('header-title');
  const headerSubtitle = getEl('header-subtitle');
  const backBtn = getEl('back-btn');
  if (headerTitle) headerTitle.textContent = 'Lesson Plans';
  if (headerSubtitle) headerSubtitle.textContent = 'Create and manage Bible study lesson plans';
  if (backBtn) backBtn.style.display = 'none';

  const studentLink = getAnchor('view-student-link');
  const teacherLink = getAnchor('view-teacher-link');
  if (studentLink) studentLink.style.display = 'none';
  if (teacherLink) teacherLink.style.display = 'none';

  const lessonPlanView = getEl('lessonplan-view');
  const classEditorView = getEl('class-editor-view');
  const editor = getEl('editor');
  const noSelection = getEl('no-selection');
  if (lessonPlanView) lessonPlanView.style.display = 'grid';
  if (classEditorView) classEditorView.style.display = 'none';
  if (editor) editor.style.display = 'none';
  if (noSelection) noSelection.style.display = 'block';

  if (studentLink) studentLink.href = 'student.html';
  if (teacherLink) teacherLink.href = 'teacher.html';

  renderLessonPlansList();
}

export async function saveLessonPlansToFile(_options: SaveLessonPlansOptions = {}): Promise<void> {
  console.log('saveLessonPlansToFile called with', adminState.allLessonPlans.length, 'lesson plans');
  await postAdminSave(
    '/api/save/lessonPlans',
    { lessonPlans: adminState.allLessonPlans },
    'Lesson plans'
  );
}
