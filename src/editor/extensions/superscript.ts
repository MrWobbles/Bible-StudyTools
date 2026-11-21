import { Mark } from '@tiptap/core';

export const Superscript = Mark.create({
  name: 'superscript',

  parseHTML() {
    return [{ tag: 'sup' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', HTMLAttributes, 0];
  },
});
