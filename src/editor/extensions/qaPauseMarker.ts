import { Node, mergeAttributes } from '@tiptap/core';
import type { QAPauseAttributes } from '../types';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    qaPauseMarker: {
      insertQAPause: (attributes: QAPauseAttributes) => ReturnType;
    };
  }
}

export const QAPauseMarker = Node.create({
  name: 'qaPauseMarker',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      sectionId: {
        default: null,
      },
      sectionTitle: {
        default: 'Discussion Questions',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.qa-pause-marker',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: 'qa-pause-marker',
        'data-section-id': node.attrs.sectionId,
        'data-section-title': node.attrs.sectionTitle,
      }),
      [
        'div',
        { class: 'qa-pause-icon' },
        [
          'span',
          { class: 'material-symbols-outlined' },
          'forum',
        ],
      ],
      [
        'div',
        { class: 'qa-pause-content' },
        [
          'div',
          { class: 'qa-pause-title' },
          'Pause for Q&A',
        ],
        [
          'div',
          { class: 'qa-pause-subtitle' },
          node.attrs.sectionTitle,
        ],
      ],
    ];
  },

  addCommands() {
    return {
      insertQAPause:
        (attributes: QAPauseAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },
});
