import { saveClassToFile } from './classes';
import { adminState, getEl, getInput, getTextArea } from './state';
import type { AdminClassConfig, AdminOutlineSection } from './types';

export function closeModal(modalId: string): void {
  const modal = getEl(modalId);
  if (modal) {
    modal.style.display = 'none';
  }
}

export function renderOutlineList(cls: AdminClassConfig): void {
  const outlineList = getEl('outline-list');
  if (!outlineList) return;
  outlineList.innerHTML = '';

  const outline = Array.isArray(cls.outline) ? cls.outline : [];
  outline.forEach((section, index) => {
    const questions = Array.isArray(section?.questions) ? section.questions : [];
    const summary = section?.summary || '(No summary)';
    const id = section?.id || '';

    const item = document.createElement('div');
    item.className = 'section-item';
    item.innerHTML = `
      <div class="section-item-info">
        <div class="section-item-title">${summary}</div>
        <div class="section-item-id">${id}</div>
        <div class="section-item-type" style="font-size: 12px; color: var(--muted); margin-top: 2px;">
          ${questions.length} questions
        </div>
      </div>
      <div class="item-actions">
        <button class="btn-icon" onclick="editSection(${index})">Edit</button>
        <button class="btn-icon" onclick="deleteSection(${index})">Delete</button>
      </div>
    `;
    outlineList.appendChild(item);
  });
}

export function addQuestionField(key = '', prompt = '', answer = '', index = -1): void {
  const questionsList = getEl('questions-list');
  if (!questionsList) return;

  const field = document.createElement('div');
  field.className = 'question-field';
  field.innerHTML = `
    <div class="question-field-group">
      <input type="text" placeholder="Question key" class="question-key" />
      <input type="text" placeholder="Question prompt" class="question-prompt" style="flex: 2;" />
      <button class="btn-icon" onclick="this.parentElement.parentElement.remove()">Remove</button>
    </div>
    <div class="question-answer">
      <label style="display:block; font-size:12px; color: var(--muted); margin-bottom:4px;">Notes / Answer (optional)</label>
      <textarea class="question-answer-input" rows="3" placeholder="Your notes or suggested answer"></textarea>
    </div>
  `;

  const keyInput = field.querySelector('.question-key');
  const promptInput = field.querySelector('.question-prompt');
  const answerInput = field.querySelector('.question-answer-input');
  if (keyInput instanceof HTMLInputElement) keyInput.value = key || '';
  if (promptInput instanceof HTMLInputElement) promptInput.value = prompt || '';
  if (answerInput instanceof HTMLTextAreaElement) answerInput.value = answer || '';

  if (index >= 0) {
    const existing = document.querySelectorAll('.question-field')[index];
    if (existing) {
      existing.replaceWith(field);
    } else {
      questionsList.appendChild(field);
    }
  } else {
    questionsList.appendChild(field);
  }
}

export function renderSectionQuestions(questions: OutlineQuestion[]): void {
  const container = getEl('section-questions-container');
  if (!container) return;
  container.innerHTML = '<label style="display: block; margin-bottom: 10px;">Questions</label>';

  const questionsDiv = document.createElement('div');
  questionsDiv.id = 'questions-list';
  container.appendChild(questionsDiv);

  questions.forEach((q, index) => {
    addQuestionField(q.key, q.prompt, q.answer, index);
  });
}

export function editSection(index: number): void {
  if (adminState.currentClass === null) return;
  const cls = adminState.allClasses[adminState.currentClass];
  const section = cls?.outline?.[index];
  if (!section) return;

  adminState.currentSectionIndex = index;

  const points = Array.isArray(section.points)
    ? section.points.map((p) => (typeof p === 'string' ? p : p.text))
    : [];
  const questions = Array.isArray(section.questions) ? section.questions : [];

  const modalTitle = getEl('section-modal-title');
  const idInput = getInput('section-id');
  const summaryInput = getInput('section-summary');
  const defaultOpenInput = getInput('section-defaultOpen');
  const pointsInput = getTextArea('section-points');
  const modal = getEl('section-modal');

  if (modalTitle) modalTitle.textContent = 'Edit Section';
  if (idInput) idInput.value = section.id || '';
  if (summaryInput) summaryInput.value = section.summary || '';
  if (defaultOpenInput) defaultOpenInput.checked = Boolean(section.defaultOpen);
  if (pointsInput) pointsInput.value = points.join('\n');

  renderSectionQuestions(questions);

  if (modal) modal.style.display = 'flex';
}

export function addSection(): void {
  adminState.currentSectionIndex = null;

  const modalTitle = getEl('section-modal-title');
  const idInput = getInput('section-id');
  const summaryInput = getInput('section-summary');
  const defaultOpenInput = getInput('section-defaultOpen');
  const pointsInput = getTextArea('section-points');
  const modal = getEl('section-modal');

  if (modalTitle) modalTitle.textContent = 'Add Section';
  if (idInput) idInput.value = '';
  if (summaryInput) summaryInput.value = '';
  if (defaultOpenInput) defaultOpenInput.checked = false;
  if (pointsInput) pointsInput.value = '';

  renderSectionQuestions([]);

  if (modal) modal.style.display = 'flex';
}

export function saveSection(): void {
  if (adminState.currentClass === null) return;
  const cls = adminState.allClasses[adminState.currentClass];
  if (!cls) return;

  const id = getInput('section-id')?.value ?? '';
  const summary = getInput('section-summary')?.value ?? '';
  const defaultOpen = getInput('section-defaultOpen')?.checked ?? false;
  const pointsText = getTextArea('section-points')?.value ?? '';

  if (!id || !summary) {
    alert('Please fill in ID and Summary');
    return;
  }

  const points = pointsText
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p);

  const questions: OutlineQuestion[] = [];
  document.querySelectorAll('.question-field').forEach((field) => {
    const keyEl = field.querySelector('.question-key');
    const promptEl = field.querySelector('.question-prompt');
    const answerEl = field.querySelector('.question-answer-input');
    const key = keyEl instanceof HTMLInputElement ? keyEl.value : '';
    const prompt = promptEl instanceof HTMLInputElement ? promptEl.value : '';
    const answer = answerEl instanceof HTMLTextAreaElement ? answerEl.value : '';
    if (key && prompt) {
      questions.push({ key, prompt, answer });
    }
  });

  const section: AdminOutlineSection = {
    id,
    summary,
    defaultOpen,
    points,
    questions,
  };

  if (!Array.isArray(cls.outline)) {
    cls.outline = [];
  }

  if (adminState.currentSectionIndex !== null) {
    cls.outline[adminState.currentSectionIndex] = section;
  } else {
    cls.outline.push(section);
  }

  renderOutlineList(cls);
  closeModal('section-modal');
  void saveClassToFile();
}

export function deleteSection(index: number): void {
  if (adminState.currentClass === null) return;
  const cls = adminState.allClasses[adminState.currentClass];
  if (!cls || !Array.isArray(cls.outline)) return;

  if (confirm('Delete this section?')) {
    cls.outline.splice(index, 1);
    renderOutlineList(cls);
    void saveClassToFile();
  }
}
