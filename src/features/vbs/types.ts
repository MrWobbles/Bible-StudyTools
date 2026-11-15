import type { Editor } from '@tiptap/core';

export interface VbsMediaData {
  videos: string[];
  audio: string[];
}

export interface VbsSfxItem {
  label: string;
  url: string;
  loop?: boolean;
}

export interface VbsDisplayText {
  label: string;
  text: string;
}

export interface VbsScriptLink {
  text_selection: string;
  sfx_label: string;
}

export interface VbsScene {
  id: string;
  title: string;
  sort_order?: number;
  video_url?: string;
  google_doc_url?: string;
  sound_effects?: VbsSfxItem[];
  display_texts?: VbsDisplayText[];
  script_content?: string;
  script_links?: VbsScriptLink[];
}

export interface VbsControlState {
  rawMedia: VbsMediaData;
  scenes: VbsScene[];
  editor: Editor | null;
  currentEditingSceneId: string | null;
  currentScriptLinks: VbsScriptLink[];
  currentSelection: { text: string } | null;
}
