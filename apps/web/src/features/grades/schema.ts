import { z } from 'zod';
import { EXAM_TYPE_VALUES, GRADE_STATUS_VALUES, SEMESTER_VALUES } from '@student-portal/shared';

export const gradeFormSchema = z.object({
  studentCode: z.string().min(1, 'كود الطالب مطلوب'),
  courseCode: z.string().min(1, 'كود المقرر مطلوب'),
  examType: z.enum(EXAM_TYPE_VALUES as [string, ...string[]]),
  grade: z.coerce.number().min(0, 'الدرجة يجب ألا تكون أقل من 0'),
  maxGrade: z.coerce.number().min(1, 'الدرجة العظمى يجب أن تكون 1 على الأقل'),
  status: z.enum(GRADE_STATUS_VALUES as [string, ...string[]]).optional(),
  academicYear: z.string().min(1, 'السنة الأكاديمية مطلوبة'),
  semester: z.enum(SEMESTER_VALUES as [string, ...string[]]),
  isPublished: z.boolean().optional(),
});

export type GradeFormValues = z.infer<typeof gradeFormSchema>;
