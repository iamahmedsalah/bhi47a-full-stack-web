import { z } from "zod";
import {
  STUDENT_LOGIN_PASSWORD_MIN_LENGTH,
  STUDENT_PASSWORD_MAX_LENGTH,
  STUDENT_PASSWORD_MIN_LENGTH,
  STUDENT_PASSWORD_PATTERN,
} from "../constants/password";

export const studentCodeSchema = z
  .string()
  .trim()
  .min(1, "Student code is required")
  .regex(/^\d{4,12}$/, "Student code must be between 4 and 12 digits");

export const studentPasswordSchema = z
  .string()
  .min(1, "Password is required")
  .min(
    STUDENT_LOGIN_PASSWORD_MIN_LENGTH,
    `Password must be at least ${STUDENT_LOGIN_PASSWORD_MIN_LENGTH} characters`,
  )
  .max(STUDENT_PASSWORD_MAX_LENGTH);

export const permanentStudentPasswordSchema = z
  .string()
  .min(1, "Password is required")
  .min(
    STUDENT_PASSWORD_MIN_LENGTH,
    `Password must be at least ${STUDENT_PASSWORD_MIN_LENGTH} characters`,
  )
  .max(STUDENT_PASSWORD_MAX_LENGTH)
  .regex(
    STUDENT_PASSWORD_PATTERN,
    "Password must contain at least one letter and one number, without spaces",
  );

export const baseStudentLoginSchema = z.object({
  studentCode: studentCodeSchema,
  password: studentPasswordSchema,
});

export const baseAdminLoginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const baseChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: permanentStudentPasswordSchema,
  confirmPassword: z.string().min(1, "Confirm password is required"),
});
