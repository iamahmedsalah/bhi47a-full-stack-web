import { z } from 'zod';
import { COURSE_LEVEL_VALUES, ENROLLMENT_STATUS_VALUES } from '@student-portal/shared';

export const studentFormSchema = z.object({
  fullName: z.string().min(3, 'الاسم الكامل مطلوب'),
  studentCode: z.string().min(3, 'كود الطالب مطلوب'),
  nationalId: z.string().min(10, 'الرقم القومي مطلوب (10 أرقام على الأقل)'),
  academicEmail: z.string().email('البريد غير صحيح').or(z.literal('')),
  department: z.string().optional(),
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
