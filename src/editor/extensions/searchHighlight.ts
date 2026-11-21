import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface SearchMatchRange {
  from: number;
  to: number;
}

export interface SearchHighlightMeta {
  matches: SearchMatchRange[];
  activeIndex: number;
}

export const searchHighlightPluginKey = new PluginKey<DecorationSet>('searchHighlight');

function buildDecorations(
  doc: Parameters<typeof DecorationSet.create>[0],
  meta: SearchHighlightMeta,
): DecorationSet {
  if (!meta.matches.length) {
    return DecorationSet.empty;
  }

  const decorations: Decoration[] = [];
  meta.matches.forEach((match, index) => {
    if (match.from >= match.to || match.to > doc.content.size) return;
    const isActive = index === meta.activeIndex;
    decorations.push(
      Decoration.inline(match.from, match.to, {
        class: isActive ? 'search-match search-match-active' : 'search-match',
      }),
    );
  });

  return DecorationSet.create(doc, decorations);
}

export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: searchHighlightPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, oldSet) {
            const meta = tr.getMeta(searchHighlightPluginKey) as SearchHighlightMeta | undefined;
            if (meta) {
              return buildDecorations(tr.doc, meta);
            }
            if (tr.docChanged) {
              return oldSet.map(tr.mapping, tr.doc);
            }
            return oldSet;
          },
        },
        props: {
          decorations(state) {
            return searchHighlightPluginKey.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
