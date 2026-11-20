import { z } from "zod";
import { ENROLLMENT_STATUS_VALUES } from "@student-portal/shared";

export const createStudentFormSchema = (message: (key: string) => string) =>
  z
    .object({
      fullName: z.string().trim().max(120).optional(),
      fullNameAr: z.string().trim().max(120).optional(),
      fullNameEn: z.string().trim().max(120).optional(),
      studentCode: z
        .string()
        .trim()
        .min(3, message("studentCodeRequired"))
        .regex(/^\d{4,12}$/, message("studentCodeFormat")),
      nationalId: z
        .string()
        .trim()
        .refine(
          (val) => !val || /^(2|3)\d{13}$|^\d{14}$/.test(val),
          message("nationalId"),
        )
        .optional(),
      phone: z
        .string()
        .trim()
        .refine(
          (val) => !val || /^(010|011|012|015)\d{8}$|^\+?\d{10,15}$/.test(val),
          message("phone"),
        )
        .optional(),
      academicEmail: z
        .string()
        .trim()
        .email(message("email"))
        .or(z.literal("")),
      department: z.string().trim().optional(),
      level: z.string().min(1, message("level")),
      group: z.string().optional(),
      section: z.string().optional(),
      academicYear: z.string().min(1, message("academicYear")),
      semester: z.string().min(1, message("semester")),
      seatNumber: z.string().optional(),
      examRoom: z.string().optional(),
      examFloor: z.string().optional(),
      examBuilding: z.string().optional(),
      enrollmentStatus: z.string().refine(
        (value) => ENROLLMENT_STATUS_VALUES.some((status) => status === value),
        message("enrollmentStatus"),
      ),
      mustChangePassword: z.boolean().optional(),
    })
    .refine(
      (data) => Boolean(data.fullNameAr?.trim() || data.fullNameEn?.trim()),
      {
        message: message("name"),
        path: ["fullNameAr"],
      },
    );

const fallback: Record<string, string> = {
  studentCodeRequired: "كود الطالب مطلوب",
  studentCodeFormat: "كود الطالب يجب أن يتكون من أرقام فقط بين 4 و 12 رقماً",
  nationalId: "الرقم القومي يجب أن يتكون من 14 رقماً",
  phone: "رقم الهاتف غير صالح (يجب أن يكون مصرياً أو بتنسيق دولي)",
  email: "البريد غير صحيح",
  level: "المستوى مطلوب",
  academicYear: "السنة الأكاديمية مطلوبة",
  semester: "الترم مطلوب",
  enrollmentStatus: "حالة القيد مطلوبة",
  name: "يجب إدخال اسم الطالب بالعربية أو بالإنجليزية على الأقل",
};
export const studentFormSchema = createStudentFormSchema(
  (key) => fallback[key] ?? key,
);

export type StudentFormValues = z.infer<typeof studentFormSchema>;
