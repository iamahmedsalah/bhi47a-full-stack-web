import { z } from 'zod';

export const studentFormSchema = z
  .object({
    fullName: z.string().trim().max(120).optional(),
    fullNameAr: z.string().trim().max(120).optional(),
    fullNameEn: z.string().trim().max(120).optional(),
    studentCode: z
      .string()
      .trim()
      .min(3, 'كود الطالب مطلوب')
      .regex(/^\d{4,12}$/, 'كود الطالب يجب أن يتكون من أرقام فقط بين 4 و 12 رقماً'),
    nationalId: z
      .string()
      .trim()
      .refine(
        (val) => !val || /^(2|3)\d{13}$|^\d{14}$/.test(val),
        'الرقم القومي يجب أن يتكون من 14 رقماً',
      )
      .optional(),
    phone: z
      .string()
      .trim()
      .refine(
        (val) => !val || /^(010|011|012|015)\d{8}$|^\+?\d{10,15}$/.test(val),
        'رقم الهاتف غير صالح (يجب أن يكون مصرياً أو بتنسيق دولي)',
      )
      .optional(),
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
  })
  .refine(
    (data) =>
      Boolean(
        data.fullName?.trim() ||
          data.fullNameAr?.trim() ||
          data.fullNameEn?.trim(),
      ),
    {
      message: 'يجب إدخال اسم الطالب بالعربية أو بالإنجليزية على الأقل',
      path: ['fullNameAr'],
    },
  );

export type StudentFormValues = z.infer<typeof studentFormSchema>;
