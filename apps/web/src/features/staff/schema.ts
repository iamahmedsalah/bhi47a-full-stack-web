import { z } from 'zod';
import { STAFF_TYPE_VALUES } from '@student-portal/shared';

export const staffFormSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    nameAr: z.string().trim().max(160).optional(),
    email: z.string().trim().email().max(254),
    username: z
      .string()
      .trim()
      .max(32)
      .refine((value) => !value || (value.length >= 3 && /^[a-zA-Z0-9._-]+$/.test(value))),
    phone: z.string().trim().max(30),
    password: z.string().max(100),
    role: z.enum(['admin', 'staff']),
    staffType: z.enum(STAFF_TYPE_VALUES),
    isCreate: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.isCreate && value.password.length < 12) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'passwordLength' });
    }
  });

export type StaffFormValues = z.infer<typeof staffFormSchema>;

export const resetStaffPasswordSchema = z
  .object({
    newPassword: z.string().min(12).max(100),
    confirmPassword: z.string().min(12).max(100),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'passwordMismatch',
  });

export type ResetStaffPasswordValues = z.infer<typeof resetStaffPasswordSchema>;
