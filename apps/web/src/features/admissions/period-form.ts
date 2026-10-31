import { z } from "zod";
import {
  isAdmissionAcademicYear,
  type AdmissionPeriodItem,
} from "@student-portal/shared";
import { cairoDateTimeToIso, toCairoDateTimeLocal } from "@/lib/cairo-time";

export function periodTimes(
  values: { opensAt: string; closesAt: string },
  initial?: AdmissionPeriodItem,
) {
  return {
    opensAt:
      initial && values.opensAt === toCairoDateTimeLocal(initial.opensAt)
        ? initial.opensAt
        : cairoDateTimeToIso(values.opensAt),
    closesAt:
      initial && values.closesAt === toCairoDateTimeLocal(initial.closesAt)
        ? initial.closesAt
        : cairoDateTimeToIso(values.closesAt),
  };
}

export function admissionPeriodFormSchema(
  message: (
    key: "code" | "academicYear" | "name" | "nameAr" | "date" | "window",
  ) => string,
  initial?: AdmissionPeriodItem,
) {
  return z
    .object({
      code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9][A-Z0-9_-]{2,63}$/, message("code")),
      academicYear: z
        .string()
        .trim()
        .refine(isAdmissionAcademicYear, message("academicYear")),
      name: z.string().trim().min(2, message("name")).max(160, message("name")),
      nameAr: z
        .string()
        .trim()
        .max(160, message("nameAr"))
        .refine((value) => !value || value.length >= 2, message("nameAr")),
      opensAt: z.string(),
      closesAt: z.string(),
      isEnabled: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const times = periodTimes(values, initial);
      if (!times.opensAt)
        ctx.addIssue({
          code: "custom",
          path: ["opensAt"],
          message: message("date"),
        });
      if (!times.closesAt)
        ctx.addIssue({
          code: "custom",
          path: ["closesAt"],
          message: message("date"),
        });
      if (
        times.opensAt &&
        times.closesAt &&
        Date.parse(times.closesAt) <= Date.parse(times.opensAt)
      )
        ctx.addIssue({
          code: "custom",
          path: ["closesAt"],
          message: message("window"),
        });
    });
}
export type AdmissionPeriodFormValues = z.infer<
  ReturnType<typeof admissionPeriodFormSchema>
>;
