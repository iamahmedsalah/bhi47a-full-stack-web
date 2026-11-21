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
  uploadedByRole: 'doctor' | 'assistant_lecturer' | 'teaching_assistant' | 'admin';
  createdAt: string;
  updatedAt: string;
}
