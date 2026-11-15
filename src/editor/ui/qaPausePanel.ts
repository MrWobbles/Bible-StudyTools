import type { JSONContent } from '@tiptap/core';
import { closeModal, editorState } from '../state';

export function showQAQuestions(section: OutlineSection): void {
  const textContent = section.questions
    .map((q, i) => `${i + 1}. ${q.prompt}${q.answer ? '\n   Answer: ' + q.answer : ''}`)
    .join('\n\n');

  alert(`Questions for: ${section.summary}\n\n${textContent}`);
}

export function handleQAPauseClick(e: MouseEvent): void {
  if (!(e.target instanceof HTMLElement)) return;
  const marker = e.target.closest('.qa-pause-marker');
  if (!(marker instanceof HTMLElement)) return;

  const sectionId = marker.dataset.sectionId;
  if (sectionId && editorState.generatedOutline) {
    const section = editorState.generatedOutline.find((s) => s.id === sectionId);
    if (section && section.questions && section.questions.length > 0) {
      showQAQuestions(section);
    } else {
      alert('No questions found for this section.');
    }
  } else {
    alert(
      'This is a generic Q&A pause marker. Generate or apply an outline to link it to specific questions.',
    );
  }
}

export function insertQAPauseMarker(): void {
  const { editor } = editorState;
  if (!editor) return;
  const sectionSelect = document.getElementById('qa-section-select');
  if (!(sectionSelect instanceof HTMLSelectElement)) return;
  const selectedOption = sectionSelect.options[sectionSelect.selectedIndex];

  const sectionId = selectedOption?.value || null;
  const sectionTitle =
    selectedOption && selectedOption.text !== '-- Generic pause --'
      ? selectedOption.text
      : 'Discussion Questions';

  editor
    .chain()
    .focus()
    .insertQAPause({
      sectionId,
      sectionTitle,
    })
    .run();

  closeModal('qa-pause-modal');
}

export function populateQASectionDropdown(): void {
  const select = document.getElementById('qa-section-select');
  if (!(select instanceof HTMLSelectElement)) return;
  select.innerHTML = '<option value="">-- Generic pause --</option>';

  const { generatedOutline } = editorState;
  if (generatedOutline && Array.isArray(generatedOutline)) {
    generatedOutline.forEach((section) => {
      if (section.questions && section.questions.length > 0) {
        const option = document.createElement('option');
        option.value = section.id;
        option.textContent = section.summary;
        select.appendChild(option);
      }
    });
  }
}

export function injectQAPauseMarkers(outline: OutlineSection[] | null): void {
  const { editor } = editorState;
  if (!outline || !Array.isArray(outline) || !editor) return;

  const docJSON = editor.getJSON();
  const sectionsWithQA = outline.filter((section) => {
    const hasQABreak =
      section.points &&
      section.points.some((point) => typeof point === 'object' && point.type === 'qa-break');
    const hasQuestions = section.questions && section.questions.length > 0;
    return hasQABreak || hasQuestions;
  });

  if (sectionsWithQA.length === 0) return;

  const contentBlocks = docJSON.content || [];
  if (contentBlocks.length === 0) return;

  const newContent: JSONContent[] = [];
  const markerInterval = Math.floor(contentBlocks.length / (sectionsWithQA.length + 1));
  let currentSectionIdx = 0;
  let blocksSinceLastMarker = 0;

  for (let i = 0; i < contentBlocks.length; i++) {
    const node = contentBlocks[i];
    newContent.push(node);
    blocksSinceLastMarker++;

    let matchingSection: OutlineSection | undefined;
    if (node.type === 'heading' && node.content) {
      const headingText = node.content
        .map((n) => ('text' in n && typeof n.text === 'string' ? n.text : ''))
        .join('')
        .trim();
      matchingSection = sectionsWithQA.find((section) => {
        const summary = section.summary.trim().toLowerCase();
        const heading = headingText.toLowerCase();
        return summary.includes(heading) || heading.includes(summary) || summary === heading;
      });
    }

    const shouldInsertMarker =
      matchingSection ||
      (blocksSinceLastMarker >= markerInterval &&
        currentSectionIdx < sectionsWithQA.length &&
        i < contentBlocks.length - 1);

    if (shouldInsertMarker && currentSectionIdx < sectionsWithQA.length) {
      const section = matchingSection || sectionsWithQA[currentSectionIdx];
      newContent.push({
        type: 'qaPauseMarker',
        attrs: {
          sectionId: section.id,
          sectionTitle: section.summary,
        },
      });
      currentSectionIdx++;
      blocksSinceLastMarker = 0;
    }
  }

  while (currentSectionIdx < sectionsWithQA.length) {
    const section = sectionsWithQA[currentSectionIdx];
    newContent.push({
      type: 'qaPauseMarker',
      attrs: {
        sectionId: section.id,
        sectionTitle: section.summary,
      },
    });
    currentSectionIdx++;
  }

  editor.commands.setContent({ type: 'doc', content: newContent });
}
