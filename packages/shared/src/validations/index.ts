import { z } from 'zod';

export const studentCodeSchema = z
  .string()
  .min(1, 'Student code is required')
  .regex(/^\d{6}$/, 'Student code must be exactly 6 digits');

export const studentPasswordSchema = z
  .string()
  .min(1, 'Password is required')
  .min(6, 'Password must be at least 6 characters');

export const baseStudentLoginSchema = z.object({
  studentCode: studentCodeSchema,
  password: studentPasswordSchema,
});

export const baseAdminLoginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export const baseChangePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(1, 'New password is required')
    .min(8, 'New password must be at least 8 characters'),
  confirmPassword: z
    .string()
    .min(1, 'Confirm password is required'),
});
