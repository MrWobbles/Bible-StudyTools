import type { Editor, JSONContent } from '@tiptap/core';
import { closeModal, editorState } from '../state';
import type { HeadingEntry } from '../types';

export function toOutlineEditorAdapter(ed: Editor): OutlineEditorAdapter {
  return {
    getJSON: () => ed.getJSON() as TipTapJsonNode,
    getHTML: () => ed.getHTML(),
    getText: () => ed.getText(),
  };
}

export function extractText(node: TipTapJsonNode | null | undefined): string {
  if (!node) return '';
  if (node.text) return node.text;
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractText).join(' ');
  }
  return '';
}

function shortenText(text: string, maxLength = 50): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '…';
}

export function scrollToSection(sectionId: string | null, summary: string | null): void {
  const { editor } = editorState;
  if (!editor) return;

  try {
    const editorElement = document.querySelector('.tiptap');
    if (!editorElement) {
      editor.commands.focus();
      return;
    }

    // First priority: Look for QA pause marker with matching section ID
    if (sectionId) {
      const pauseMarker = editorElement.querySelector(
        `.qa-pause-marker[data-section-id="${sectionId}"]`
      );
      if (pauseMarker instanceof HTMLElement) {
        pauseMarker.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pauseMarker.style.background = 'rgba(240, 180, 41, 0.2)';
        setTimeout(() => {
          pauseMarker.style.background = '';
        }, 1500);
        return;
      }
    }

    // Second priority: Look for heading with matching text
    if (summary) {
      const summaryText = String(summary).trim();
      const headings = editorElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (const heading of headings) {
        if (!(heading instanceof HTMLElement)) continue;
        const headingText = (heading.textContent || '').trim();
        if (
          headingText === summaryText ||
          headingText.toLowerCase() === summaryText.toLowerCase()
        ) {
          heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
          heading.focus();
          return;
        }
      }
    }

    editor.commands.focus();
  } catch (e: unknown) {
    console.error('Error scrolling to section:', e);
    editor.commands.focus();
  }
}

export function scrollToHeading(summary: string | number): void {
  const { editor } = editorState;
  if (!editor || (!summary && summary !== 0)) return;

  const summaryText = String(summary).trim();

  try {
    const editorElement = document.querySelector('.tiptap');
    if (editorElement) {
      const headings = editorElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (const heading of headings) {
        if (!(heading instanceof HTMLElement)) continue;
        const headingText = (heading.textContent || '').trim();
        if (
          headingText === summaryText ||
          headingText.toLowerCase() === summaryText.toLowerCase()
        ) {
          heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
          heading.focus();
          return;
        }
      }
    }

    editor.commands.focus();
  } catch (e: unknown) {
    console.error('Error scrolling to heading:', e);
    editor.commands.focus();
  }
}

export function updateOutlineNavigator(): void {
  const { editor } = editorState;
  if (!editor) return;
  const outlineTree = document.getElementById('outline-tree');
  if (!outlineTree) return;
  const json = editor.getJSON();

  const headings: HeadingEntry[] = [];

  function extractHeadings(node: JSONContent): void {
    if (node.type === 'heading') {
      const rawLevel = node.attrs?.level;
      headings.push({
        level: typeof rawLevel === 'number' ? rawLevel : 1,
        text: node.content
          ? node.content.map((n) => ('text' in n && typeof n.text === 'string' ? n.text : '')).join('')
          : '',
      });
    }

    if (node.content) {
      node.content.forEach((child) => extractHeadings(child));
    }
  }

  if (json.content) {
    json.content.forEach((node) => extractHeadings(node));
  }

  let outlineHTML = '<ul class="outline-list">';
  headings.forEach((heading, index) => {
    outlineHTML += `
            <li class="outline-item outline-level-${heading.level}">
                <a href="#" data-heading-index="${index}">${heading.text || 'Untitled'}</a>
            </li>
        `;
  });
  outlineHTML += '</ul>';

  outlineTree.innerHTML = outlineHTML || '<p class="outline-empty">No headings yet</p>';

  outlineTree.querySelectorAll('[data-heading-index]').forEach((link) => {
    if (!(link instanceof HTMLElement)) return;
    link.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      const headingIndex = parseInt(link.dataset.headingIndex || '0', 10);
      scrollToHeading(headingIndex);
    });
  });
}

export function updateOutlineNavigatorFromGenerated(outline: OutlineSection[]): void {
  if (!outline || outline.length === 0) return;

  const outlineTree = document.getElementById('outline-tree');
  if (!outlineTree) return;
  let outlineHTML = '<ul class="outline-list">';

  outline.forEach((section) => {
    const shortTitle = shortenText(section.summary, 50);
    outlineHTML += `
            <li class="outline-item outline-level-1">
                <a href="#" data-section-id="${section.id || ''}" data-section-summary="${section.summary}" title="${section.summary}">
                    ${shortTitle}
                </a>
            </li>
        `;
  });

  outlineHTML += '</ul>';
  outlineTree.innerHTML = outlineHTML;

  outlineTree.querySelectorAll('a[data-section-summary]').forEach((link) => {
    link.addEventListener('click', (e: Event) => {
      e.preventDefault();
      const sectionId = link.getAttribute('data-section-id');
      const summary = link.getAttribute('data-section-summary');
      scrollToSection(sectionId, summary);
    });
  });
}

export function handleQAPauseClick(e: MouseEvent): void {
  if (!(e.target instanceof HTMLElement)) return;
  const marker = e.target.closest('.qa-pause-marker');
  if (marker instanceof HTMLElement) {
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
        'This is a generic Q&A pause marker. Generate or apply an outline to link it to specific questions.'
      );
    }
  }
}

export function showQAQuestions(section: OutlineSection): void {
  let questionsHTML = `<div class="qa-questions-display">
        <h3>${section.summary}</h3>
        <ol class="question-list">`;

  section.questions.forEach((q) => {
    questionsHTML += `<li>
            <div class="question-prompt">${q.prompt}</div>
            ${q.answer ? `<div class="question-answer"><strong>Suggested answer:</strong> ${q.answer}</div>` : ''}
        </li>`;
  });

  questionsHTML += '</ol></div>';

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = questionsHTML;
  const textContent = section.questions
    .map((q, i) => `${i + 1}. ${q.prompt}${q.answer ? '\n   Answer: ' + q.answer : ''}`)
    .join('\n\n');

  alert(`Questions for: ${section.summary}\n\n${textContent}`);
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
  if (!outline || !Array.isArray(outline) || !editor) {
    console.log('Cannot inject markers: missing outline or editor');
    return;
  }

  const docJSON = editor.getJSON();

  const sectionsWithQA = outline.filter((section) => {
    const hasQABreak =
      section.points &&
      section.points.some((point) => typeof point === 'object' && point.type === 'qa-break');
    const hasQuestions = section.questions && section.questions.length > 0;
    return hasQABreak || hasQuestions;
  });

  if (sectionsWithQA.length === 0) {
    console.log('No Q&A breaks or questions found in outline');
    return;
  }

  console.log(
    `Found ${sectionsWithQA.length} sections with Q&A:`,
    sectionsWithQA.map((s) => s.summary)
  );

  const contentBlocks = docJSON.content || [];
  const totalBlocks = contentBlocks.length;

  if (totalBlocks === 0) {
    console.log('No content blocks in document');
    return;
  }

  const newContent: JSONContent[] = [];
  const markerInterval = Math.floor(totalBlocks / (sectionsWithQA.length + 1));
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

      if (matchingSection) {
        console.log(`Matched heading "${headingText}" to section "${matchingSection.summary}"`);
      }
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

      console.log(`Inserted marker for section: ${section.summary}`);
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
    console.log(`Inserted marker at end for section: ${section.summary}`);
    currentSectionIdx++;
  }

  editor.commands.setContent({ type: 'doc', content: newContent });
  console.log(`[OK] Successfully injected ${sectionsWithQA.length} Q&A pause markers`);
}
