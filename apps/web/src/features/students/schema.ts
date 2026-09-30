import { z } from 'zod';
import { COURSE_LEVEL_VALUES, ENROLLMENT_STATUS_VALUES } from '@student-portal/shared';

export const studentFormSchema = z.object({
  fullName: z.string().trim().min(3, 'الاسم الكامل مطلوب (3 أحرف على الأقل)').max(120),
  studentCode: z
    .string()
    .trim()
    .min(3, 'كود الطالب مطلوب')
    .regex(/^\d{4,12}$/, 'كود الطالب يجب أن يتكون من أرقام فقط بين 4 و 12 رقماً'),
  nationalId: z
    .string()
    .trim()
    .regex(/^(2|3)\d{13}$|^\d{14}$/, 'الرقم القومي يجب أن يتكون من 14 رقماً'),
  academicEmail: z.string().trim().email('البريد غير صحيح').or(z.literal('')),
  department: z.string().trim().optional(),
  level: z.string().min(1, 'المستوى مطلوب'),
  group: z.string().optional(),
  section: z.string().optional(),
  academicYear: z.string().min(1, 'السنة الأكاديمية مطلوبة'),
  semester: z.string().min(1, 'الترم مطلوب'),
  seatNumber: z.string().optional(),
  examRoom: z.string().optional(),
  examFloor: z.string().optional(),
  examBuilding: z.string().optional(),
  enrollmentStatus: z.string().min(1, 'حالة القيد مطلوبة'),
  mustChangePassword: z.boolean().optional(),
});

export type StudentFormValues = z.infer<typeof studentFormSchema>;
