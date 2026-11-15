import type { Editor, JSONContent } from '@tiptap/core';
import { editorState } from '../state';
import type { HeadingEntry } from '../types';
import {
  handleQAPauseClick,
  injectQAPauseMarkers,
  insertQAPauseMarker,
  populateQASectionDropdown,
  showQAQuestions,
} from './qaPausePanel';

export {
  handleQAPauseClick,
  injectQAPauseMarkers,
  insertQAPauseMarker,
  populateQASectionDropdown,
  showQAQuestions,
};

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

    if (sectionId) {
      const pauseMarker = editorElement.querySelector(
        `.qa-pause-marker[data-section-id="${sectionId}"]`,
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
          ? node.content
              .map((n) => ('text' in n && typeof n.text === 'string' ? n.text : ''))
              .join('')
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
