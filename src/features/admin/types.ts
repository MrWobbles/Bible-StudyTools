export interface LessonPlan {
  id?: string;
  planId?: string;
  title: string;
  description?: string;
  createdDate: string;
  order?: number;
  classes?: Array<string | number>;
}

export interface NoteItem {
  id?: string;
  noteId?: string;
  title: string;
  description?: string;
  createdDate: string;
  lastModified?: string;
  content?: unknown;
}

export interface AdminMediaSource {
  url?: string;
  path?: string;
  videoId?: string;
  description?: string;
  type?: string;
  format?: string;
}

export interface AdminMediaItem {
  id?: string;
  type: string;
  title?: string;
  url?: string;
  primary?: boolean;
  sources?: AdminMediaSource[];
  duration?: number;
  pausePoints?: Array<PausePoint | number>;
  sectionTitle?: string;
}

export interface AdminOutlineSection extends Omit<OutlineSection, 'verses' | 'media'> {
  verses?: string[];
  media?: AdminMediaItem[];
}

export interface AdminClassConfig {
  id?: string;
  classNumber?: string | number;
  title?: string;
  subtitle?: string;
  instructor?: string;
  channelName?: string;
  navigation?: NavigationItem[];
  media?: AdminMediaItem[];
  outline?: AdminOutlineSection[];
  content?: {
    html: string;
    json: TipTapJsonNode;
    text: string;
  };
  [key: string]: unknown;
}

export interface SaveResultPayload {
  success?: boolean;
  localPath?: string;
  error?: string;
}

export interface SaveLessonPlansOptions {
  changedPlanId?: string;
  deletedPlanId?: string;
}

export interface SaveNotesOptions {
  changedNoteId?: string | null;
  deletedNoteId?: string;
}

export interface SaveClassOptions {
  changedClassId?: string;
}

export type MediaInputType = 'video' | 'pdf' | 'images' | 'audio' | 'document';

export interface AdminWindow extends Window {
  editLessonPlan?: (index: number) => void;
  deleteLessonPlan?: (index: number) => void;
  openLessonPlan?: (index: number) => void;
  editNoteMetadata?: (index: number) => void;
  deleteNote?: (index: number) => void;
  openNoteEditor?: (index: number) => void;
  removeClassFromLessonPlan?: (classIndex: number) => void;
  addClassToLessonPlan?: (classIndex: number) => void;
  editMedia?: (index: number) => void;
  deleteMedia?: (index: number) => void;
  editSection?: (index: number) => void;
  deleteSection?: (index: number) => void;
  closeModal?: (modalId: string) => void;
  updateMediaForm?: () => void;
  saveMedia?: () => void;
  addQuestionField?: (key?: string, prompt?: string, answer?: string, index?: number) => void;
  saveSection?: () => void;
  saveLessonPlan?: () => void;
  saveNoteMetadata?: () => void;
  downloadYouTubeVideo?: () => Promise<void>;
  toggleMediaInputMode?: (mediaType: MediaInputType) => void;
  downloadMediaToLocal?: (mediaType: MediaInputType) => Promise<void>;
  handleMediaUpload?: (
    mediaType: MediaInputType,
    files: FileList | File | null | undefined
  ) => Promise<void>;
}
