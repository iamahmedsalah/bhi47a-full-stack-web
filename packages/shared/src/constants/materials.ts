export const COURSE_MATERIAL_TYPES = {
  LECTURE: 'lecture',
  SECTION: 'section',
} as const;

export type CourseMaterialType =
  (typeof COURSE_MATERIAL_TYPES)[keyof typeof COURSE_MATERIAL_TYPES];

export const COURSE_MATERIAL_TYPE_VALUES: CourseMaterialType[] =
  Object.values(COURSE_MATERIAL_TYPES);

export interface CourseMaterialDto {
  _id: string;
  courseId: string;
  type: CourseMaterialType;
  title: string;
  titleAr?: string;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  weekNumber?: number;
  description?: string;
  isPublished: boolean;
  uploadedBy: string;
  uploadedByName: string;
  uploadedByRole: 'doctor' | 'teaching_assistant' | 'admin';
  createdAt: string;
  updatedAt: string;
}
