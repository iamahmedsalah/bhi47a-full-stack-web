import { z } from "zod";
import {
  STUDENT_LOGIN_PASSWORD_MIN_LENGTH,
  STUDENT_PASSWORD_MAX_LENGTH,
  STUDENT_PASSWORD_MIN_LENGTH,
  STUDENT_PASSWORD_PATTERN,
} from "@student-portal/shared";

// ==========================================
// Authentication Schemas
// ==========================================

export const getStudentLoginSchema = (t: (key: string) => string) =>
  z.object({
    studentCode: z
      .string()
      .min(1, { message: t("validation.studentCodeRequired") }),
    password: z
      .string()
      .min(1, { message: t("validation.passwordRequired") })
      .min(STUDENT_LOGIN_PASSWORD_MIN_LENGTH, {
        message: t("validation.passwordMinLength"),
      })
      .max(STUDENT_PASSWORD_MAX_LENGTH, {
        message: t("validation.passwordMaxLength"),
      }),
  });

export type StudentLoginInput = z.infer<
  ReturnType<typeof getStudentLoginSchema>
>;

export const getAdminLoginSchema = (t: (key: string) => string) =>
  z.object({
    email: z.string().min(1, { message: t("validation.emailRequired") }),
    password: z.string().min(1, { message: t("validation.passwordRequired") }),
  });

export type AdminLoginInput = z.infer<ReturnType<typeof getAdminLoginSchema>>;

export const getChangePasswordSchema = (t: (key: string) => string) =>
  z
    .object({
      currentPassword: z
        .string()
        .min(1, { message: t("validation.currentPasswordRequired") }),
      newPassword: z
        .string()
        .min(1, { message: t("validation.newPasswordRequired") })
        .min(STUDENT_PASSWORD_MIN_LENGTH, {
          message: t("validation.newPasswordMinLength"),
        })
        .max(STUDENT_PASSWORD_MAX_LENGTH, {
          message: t("validation.passwordMaxLength"),
        })
        .regex(STUDENT_PASSWORD_PATTERN, {
          message: t("validation.newPasswordPattern"),
        }),
      confirmPassword: z
        .string()
        .min(1, { message: t("validation.confirmPasswordRequired") }),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t("validation.passwordsMustMatch"),
      path: ["confirmPassword"],
    });

export type ChangePasswordInput = z.infer<
  ReturnType<typeof getChangePasswordSchema>
>;

// ==========================================
// Student Administration Schemas
// ==========================================

export const getStudentCreateSchema = (t: (key: string) => string) =>
  z.object({
    studentCode: z
      .string()
      .min(1, { message: t("validation.studentCodeRequired") })
      .regex(/^\d+$/, { message: t("validation.studentCodeNumber") }),
    fullName: z.string().min(1, { message: t("validation.nameRequired") }),
    nationalId: z
      .string()
      .min(1, { message: t("validation.passwordRequired") })
      .length(14, { message: t("validation.nationalIdLength") }),
    phone: z.string().optional(),
    department: z.string().optional(),
    level: z.enum(["1", "2", "3", "4"], {
      message: t("validation.levelRequired"),
    }),
    group: z.string().optional(),
    section: z.string().optional(),
    academicYear: z.string().min(1, { message: t("validation.yearRequired") }),
    semester: z.enum(["first", "second", "summer"], {
      message: t("validation.semesterRequired"),
    }),
    seatNumber: z.string().optional(),
  });

export type StudentCreateInput = z.infer<
  ReturnType<typeof getStudentCreateSchema>
>;

export const getStudentUpdateSchema = (t: (key: string) => string) =>
  z.object({
    fullName: z
      .string()
      .min(1, { message: t("validation.nameRequired") })
      .optional(),
    phone: z.string().optional(),
    department: z.string().optional(),
    level: z.enum(["1", "2", "3", "4"]).optional(),
    group: z.string().optional(),
    section: z.string().optional(),
    academicYear: z.string().optional(),
    semester: z.enum(["first", "second", "summer"]).optional(),
    enrollmentStatus: z
      .enum(["active", "inactive", "graduated", "suspended"])
      .optional(),
    seatNumber: z.string().optional(),
    academicEmail: z
      .string()
      .email({ message: t("validation.emailInvalid") })
      .optional()
      .or(z.literal("")),
  });

export type StudentUpdateInput = z.infer<
  ReturnType<typeof getStudentUpdateSchema>
>;

// ==========================================
// Course Schemas
// ==========================================

export const getCourseCreateSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(1, { message: t("validation.nameRequired") }),
    code: z.string().min(1, { message: t("validation.codeRequired") }),
    level: z.enum(["1", "2", "3", "4"], {
      message: t("validation.levelRequired"),
    }),
    semester: z.enum(["first", "second", "summer"], {
      message: t("validation.semesterRequired"),
    }),
    department: z.string().optional(),
    creditHours: z.number().min(1).optional(),
    isActive: z.boolean().optional(),
  });

export type CourseCreateInput = z.infer<
  ReturnType<typeof getCourseCreateSchema>
>;

export const getCourseUpdateSchema = (t: (key: string) => string) =>
  z.object({
    name: z
      .string()
      .min(1, { message: t("validation.nameRequired") })
      .optional(),
    code: z
      .string()
      .min(1, { message: t("validation.codeRequired") })
      .optional(),
    level: z.enum(["1", "2", "3", "4"]).optional(),
    semester: z.enum(["first", "second", "summer"]).optional(),
    department: z.string().optional(),
    creditHours: z.number().min(1).optional(),
    isActive: z.boolean().optional(),
  });

export type CourseUpdateInput = z.infer<
  ReturnType<typeof getCourseUpdateSchema>
>;

// ==========================================
// Grade Schemas
// ==========================================

export const getGradeSaveSchema = (t: (key: string) => string) =>
  z.object({
    studentCode: z
      .string()
      .min(1, { message: t("validation.studentCodeRequired") }),
    courseCode: z.string().min(1, { message: t("validation.codeRequired") }),
    examType: z.enum(["quiz", "midterm", "final"], {
      message: t("validation.typeRequired"),
    }),
    grade: z
      .number({ message: t("validation.gradeRequired") })
      .min(0, { message: t("validation.gradeMin") }),
    maxGrade: z
      .number({ message: t("validation.maxGradeRequired") })
      .min(1, { message: t("validation.maxGradeMin") }),
    status: z.enum(["present", "absent", "banned"]).optional(),
    academicYear: z.string().min(1, { message: t("validation.yearRequired") }),
    semester: z.enum(["first", "second", "summer"], {
      message: t("validation.semesterRequired"),
    }),
    isPublished: z.boolean().optional(),
  });

export type GradeSaveInput = z.infer<ReturnType<typeof getGradeSaveSchema>>;

// ==========================================
// Exam Schedule Schemas
// ==========================================

export const getExamScheduleCreateSchema = (t: (key: string) => string) =>
  z.object({
    title: z.string().min(1, { message: t("validation.titleRequired") }),
    examType: z.enum(["quiz", "midterm", "final"], {
      message: t("validation.typeRequired"),
    }),
    academicYear: z.string().min(1, { message: t("validation.yearRequired") }),
    semester: z.enum(["first", "second", "summer"], {
      message: t("validation.semesterRequired"),
    }),
    fileUrl: z.string().min(1, { message: t("validation.fileUrlRequired") }),
    isPublished: z.boolean().optional(),
  });

export type ExamScheduleCreateInput = z.infer<
  ReturnType<typeof getExamScheduleCreateSchema>
>;

export const getExamScheduleUpdateSchema = (t: (key: string) => string) =>
  z.object({
    title: z
      .string()
      .min(1, { message: t("validation.titleRequired") })
      .optional(),
    examType: z.enum(["quiz", "midterm", "final"]).optional(),
    academicYear: z
      .string()
      .min(1, { message: t("validation.yearRequired") })
      .optional(),
    semester: z.enum(["first", "second", "summer"]).optional(),
    fileUrl: z
      .string()
      .min(1, { message: t("validation.fileUrlRequired") })
      .optional(),
    isPublished: z.boolean().optional(),
  });

export type ExamScheduleUpdateInput = z.infer<
  ReturnType<typeof getExamScheduleUpdateSchema>
>;

// ==========================================
// Complaint Schemas
// ==========================================

export const getComplaintSchema = (t: (key: string) => string) =>
  z.object({
    title: z
      .string()
      .min(1, { message: t("validation.titleRequired") })
      .min(3, { message: t("validation.titleMin") }),
    type: z.string().min(1, { message: t("validation.typeRequired") }),
    priority: z.string().min(1, { message: t("validation.priorityRequired") }),
    content: z
      .string()
      .min(1, { message: t("validation.contentRequired") })
      .min(10, { message: t("validation.contentMin") }),
  });

export type ComplaintInput = z.infer<ReturnType<typeof getComplaintSchema>>;

// ==========================================
// Push Notification (FCM) Schemas
// ==========================================

export const getNotificationSendSchema = (t: (key: string) => string) =>
  z.object({
    title: z.string().min(1, { message: t("validation.titleRequired") }),
    body: z.string().min(1, { message: t("validation.bodyRequired") }),
    targetType: z.enum(["all", "level", "student"], {
      message: t("validation.targetTypeRequired"),
    }),
    targetLevel: z.string().optional(),
    targetStudentCode: z.string().optional(),
  });

export type NotificationSendInput = z.infer<
  ReturnType<typeof getNotificationSendSchema>
>;

// ==========================================
// GPA Registration Rule Schemas
// ==========================================

export const getGpaRuleSchema = (t: (key: string) => string) =>
  z
    .object({
      minGpa: z
        .number({ message: t("validation.minGpaRequired") })
        .min(0, { message: t("validation.gpaMin") })
        .max(4, { message: t("validation.gpaMax") }),
      maxGpa: z
        .number({ message: t("validation.maxGpaRequired") })
        .min(0, { message: t("validation.gpaMin") })
        .max(4, { message: t("validation.gpaMax") }),
      maxCreditHours: z
        .number({ message: t("validation.maxCreditHoursRequired") })
        .min(1, { message: t("validation.creditHoursMin") }),
      requiresAdvisor: z.boolean().default(false),
      isActive: z.boolean().default(true),
    })
    .refine((data) => data.minGpa <= data.maxGpa, {
      message: t("validation.minGpaLessThanMaxGpa"),
      path: ["maxGpa"],
    });

export type GpaRuleInput = z.infer<ReturnType<typeof getGpaRuleSchema>>;

// ==========================================
// Complaint Schemas
// ==========================================

export const getPublicComplaintSchema = (t: (key: string) => string) =>
  z.object({
    requesterName: z.string().min(3, {
      message:
        t("validation.nameMinLength") || "Name must be at least 3 characters",
    }),
    studentCode: z.string().min(4, {
      message:
        t("validation.studentCodeMinLength") ||
        "Student code must be at least 4 digits",
    }),
    contactPhone: z.string().min(10, {
      message:
        t("validation.phoneMinLength") ||
        "Phone number must be at least 10 digits",
    }),
    nationalId: z.string().regex(/^\d{14}$/, {
      message:
        t("validation.nationalIdLength") ||
        "National ID must be exactly 14 digits",
    }),
    contactEmail: z
      .string()
      .email({
        message: t("validation.emailInvalid") || "Invalid email address",
      })
      .optional()
      .or(z.literal("")),
    type: z.enum([
      "complaint",
      "technical_issue",
      "academic",
      "financial",
      "facility",
      "other",
    ]),
    department: z.enum([
      "student_affairs",
      "technical_support",
      "finance",
      "control",
      "academic_advising",
    ]),
    title: z.string().min(3, {
      message:
        t("validation.titleMinLength") ||
        "Subject must be at least 3 characters",
    }),
    description: z.string().min(10, {
      message:
        t("validation.descriptionMinLength") ||
        "Details must be at least 10 characters",
    }),
  });

export type PublicComplaintInput = z.infer<
  ReturnType<typeof getPublicComplaintSchema>
>;
