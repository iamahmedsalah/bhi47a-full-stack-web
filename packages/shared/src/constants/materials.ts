export const COURSE_MATERIAL_TYPES = {
  LECTURE: 'lecture',
  SECTION: 'section',
} as const;

export const COURSE_BOOK_MAX_BYTES = 100 * 1024 * 1024;
export const COURSE_MATERIAL_MAX_BYTES = 25 * 1024 * 1024;
export const COURSE_MATERIAL_MAX_FILES = 10;
export const COURSE_MATERIAL_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'rar', 'jpg', 'jpeg', 'png', 'webp', 'csv'] as const;

/** Internal persistence contract. Never include this object in public responses. */
export interface MaterialFileReference {
  storageProvider: 'vps';
  storageKey: string;
  originalName: string;
  size: number;
  mimeType: string;
  sha256: string;
}

export interface CourseMaterialsResponse {
  courseId: string;
  courseCode: string;
  courseName: string;
  courseNameAr?: string;
  totalCount: number;
  allowedUploadTypes?: CourseMaterialType[];
  materials: CourseMaterialDto[];
}

export type CourseMaterialType =
  (typeof COURSE_MATERIAL_TYPES)[keyof typeof COURSE_MATERIAL_TYPES];

export const COURSE_MATERIAL_TYPE_VALUES: CourseMaterialType[] =
  Object.values(COURSE_MATERIAL_TYPES);

export interface CourseMaterialAttachment {
  name: string;
  size: number;
}

export interface CourseMaterialDto {
  _id: string;
  courseId: string;
  type: CourseMaterialType;
  title: string;
  titleAr?: string;
  fileUrl: string;
  fileName: string;
  /** Includes legacy files; false for recording-only entries. */
  hasFile?: boolean;
  /** False when metadata exists in DB but the physical file is missing on storage. */
  fileAvailable?: boolean;
  attachments?: CourseMaterialAttachment[];
  /** External recording; absent on existing uploaded materials. */
  videoUrl?: string;
  fileSize?: number;
  mimeType?: string;
  weekNumber?: number;
  description?: string;
  isPublished: boolean;
  uploadedBy: string;
  uploadedByName: string;
  uploadedByNameAr?: string;
  uploadedByTitlePrefix?: string;
  uploadedByRole: 'doctor' | 'assistant_lecturer' | 'teaching_assistant' | 'admin';
  canEdit?: boolean;
  canDelete?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MaterialPreviewKind =
  | 'pdf'
  | 'image'
  | 'pptx'
  | 'docx'
  | 'spreadsheet'
  | 'archive'
  | 'video'
  | 'unsupported';

export interface MaterialPreviewTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontSizePt?: number;
}

export interface MaterialPreviewParagraph {
  runs: MaterialPreviewTextRun[];
  align?: 'left' | 'center' | 'right' | 'justify';
  dir?: 'rtl' | 'ltr';
  bulletLevel?: number;
  isTitle?: boolean;
}

export type MaterialPreviewSlideElement =
  | {
      kind: 'text';
      x: number;
      y: number;
      w: number;
      h: number;
      paragraphs: MaterialPreviewParagraph[];
      fillColor?: string;
      isPlaceholderTitle?: boolean;
    }
  | {
      kind: 'image';
      x: number;
      y: number;
      w: number;
      h: number;
      dataUrl: string;
      alt?: string;
    }
  | {
      kind: 'table';
      x: number;
      y: number;
      w: number;
      h: number;
      rows: string[][];
    };

export interface MaterialPreviewSlide {
  index: number;
  title?: string;
  elements: MaterialPreviewSlideElement[];
  outline: MaterialPreviewParagraph[];
  notes?: string;
  backgroundColor?: string;
}

export type MaterialPreviewDocBlock =
  | {
      kind: 'heading';
      level: 1 | 2 | 3 | 4;
      paragraph: MaterialPreviewParagraph;
    }
  | {
      kind: 'paragraph';
      paragraph: MaterialPreviewParagraph;
    }
  | {
      kind: 'list-item';
      paragraph: MaterialPreviewParagraph;
    }
  | {
      kind: 'table';
      rows: string[][];
      dir?: 'rtl' | 'ltr';
    }
  | {
      kind: 'image';
      dataUrl: string;
      alt?: string;
    };

export interface MaterialPreviewSheet {
  name: string;
  rows: string[][];
  totalRows: number;
  totalColumns: number;
  truncated?: boolean;
}

export interface MaterialPreviewArchiveEntry {
  name: string;
  size: number;
  extension: string;
  mimeType: string;
  previewKind: MaterialPreviewKind;
}

export interface CourseMaterialPreviewResponse {
  materialId: string;
  title: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  entryName?: string;
  kind: MaterialPreviewKind;
  videoUrl?: string;
  /** Aspect ratio width/height for slide decks (e.g., 1.7778 for 16:9, 1.3333 for 4:3). */
  slideAspectRatio?: number;
  slides?: MaterialPreviewSlide[];
  totalSlides?: number;
  slidesTruncated?: boolean;
  blocks?: MaterialPreviewDocBlock[];
  blocksTruncated?: boolean;
  sheets?: MaterialPreviewSheet[];
  entries?: MaterialPreviewArchiveEntry[];
  unsupportedReason?: string;
}
