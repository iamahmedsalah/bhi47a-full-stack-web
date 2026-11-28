"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Resolver, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { GRADE_STATUS_VALUES, SEMESTER_VALUES } from "@student-portal/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AcademicYearSelect } from "@/components/ui/academic-year-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { gradeFormSchema, type GradeFormValues } from "../schema";

interface Course {
  _id: string;
  code: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
}

interface GradeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  courses: Course[];
  onSubmit: (values: GradeFormValues) => Promise<void>;
  isSubmitting: boolean;
  defaultValues?: Partial<GradeFormValues>;
}

export function GradeFormDialog({
  open,
  onOpenChange,
  isEditing,
  courses,
  onSubmit,
  isSubmitting,
  defaultValues,
}: GradeFormDialogProps) {
  const t = useTranslations("grades.form");
  const tTerm = useTranslations("controlDashboard");
  const locale = useLocale();

  const form = useForm<GradeFormValues>({
    resolver: zodResolver(gradeFormSchema) as Resolver<GradeFormValues>,
    defaultValues: {
      studentCode: defaultValues?.studentCode ?? "",
      courseCode: defaultValues?.courseCode ?? "",
      examType: defaultValues?.examType ?? "midterm",
      grade: defaultValues?.grade ?? 0,
      maxGrade: defaultValues?.maxGrade ?? 100,
      status: defaultValues?.status ?? "present",
      academicYear: defaultValues?.academicYear ?? "",
      semester: defaultValues?.semester ?? "first",
      isPublished: defaultValues?.isPublished ?? false,
    },
  });

  // 1. Synchronize form state when editing target changes or modal re-opens
  useEffect(() => {
    if (open) {
      form.reset({
        studentCode: defaultValues?.studentCode ?? "",
        courseCode: defaultValues?.courseCode ?? "",
        examType: defaultValues?.examType ?? "midterm",
        grade: defaultValues?.grade ?? 0,
        maxGrade: defaultValues?.maxGrade ?? 100,
        status: defaultValues?.status ?? "present",
        academicYear: defaultValues?.academicYear ?? "",
        semester: defaultValues?.semester ?? "first",
        isPublished: defaultValues?.isPublished ?? false,
      });
    }
  }, [open, defaultValues, form]);

  // 2. Extract values via useWatch to satisfy React Compiler
  const watchedCourseCode = useWatch({
    control: form.control,
    name: "courseCode",
  });
  const watchedExamType = useWatch({
    control: form.control,
    name: "examType",
  });
  const watchedStatus = useWatch({
    control: form.control,
    name: "status",
  });
  const academicYear = useWatch({ control: form.control, name: "academicYear" });
  const semester = useWatch({ control: form.control, name: "semester" });

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={locale === "ar" ? "rtl" : "ltr"} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("editTitle") : t("addTitle")}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? t("editDescription") : t("addDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Student Code */}
            <div>
              <label className="text-xs font-semibold mb-1 block">
                {t("studentCode")} *
              </label>
              <Input
                {...form.register("studentCode")}
                dir="ltr"
                placeholder="2024001"
                disabled={isEditing}
              />
              {form.formState.errors.studentCode && (
                <p className="text-xs text-danger mt-1">
                  {t("studentCodeRequired")}
                </p>
              )}
            </div>

            {/* Course Code */}
            <div>
              <label className="text-xs font-semibold mb-1 block">
                {t("course")} *
              </label>
              <Select
                value={watchedCourseCode}
                onValueChange={(val) =>
                  form.setValue("courseCode", val, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger disabled={isEditing}>
                  <SelectValue placeholder={t("selectCourse")} />
                </SelectTrigger>
                <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
                  {courses.map((c) => (
                    <SelectItem key={c._id} value={c.code}>
                      {c.code} -{" "}
                      {locale === "ar"
                        ? c.nameAr || c.name
                        : c.nameEn || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.courseCode && (
                <p className="text-xs text-danger mt-1">
                  {form.formState.errors.courseCode.message}
                </p>
              )}
            </div>

            {/* Exam Type */}
            <div>
              <label className="text-xs font-semibold mb-1 block">
                {t("examType")} *
              </label>
              <Select
                value={watchedExamType}
                onValueChange={(val) =>
                  form.setValue("examType", val, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("examType")} />
                </SelectTrigger>
                <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
                  {(["midterm", "final", "coursework"] as const).map(
                    (examType) => (
                      <SelectItem key={examType} value={examType}>
                        {t(`examTypeValues.${examType}`)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <AcademicYearSelect
                value={academicYear}
                onChange={(year) => form.setValue("academicYear", year, { shouldValidate: true })}
                disabled={isEditing || isSubmitting}
                invalid={Boolean(form.formState.errors.academicYear)}
                defaultToCurrent
              />
              {form.formState.errors.academicYear && (
                <p role="alert" className="mt-1 text-xs text-danger">{form.formState.errors.academicYear.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="grade-semester" className="block text-sm font-medium">{tTerm("semester")}</label>
              <Select
                value={semester}
                disabled={isEditing || isSubmitting}
                onValueChange={(value) => form.setValue("semester", value, { shouldValidate: true })}
              >
                <SelectTrigger id="grade-semester" aria-label={tTerm("semester")}><SelectValue /></SelectTrigger>
                <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
                  {SEMESTER_VALUES.map((value) => <SelectItem key={value} value={value}>{tTerm(`semesters.${value}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div>
              <label className="text-xs font-semibold mb-1 block">
                {t("status")}
              </label>
              <Select
                value={watchedStatus}
                onValueChange={(val) =>
                  form.setValue("status", val, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("status")} />
                </SelectTrigger>
                <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
                  {GRADE_STATUS_VALUES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {t(`statusValues.${st}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Grade */}
            <div>
              <label className="text-xs font-semibold mb-1 block">
                {t("grade")} *
              </label>
              <Input
                type="number"
                step="any"
                {...form.register("grade", { valueAsNumber: true })}
              />
              {form.formState.errors.grade && (
                <p className="text-xs text-danger mt-1">
                  {form.formState.errors.grade.message}
                </p>
              )}
            </div>

            {/* Max Grade */}
            <div>
              <label className="text-xs font-semibold mb-1 block">
                {t("maxGrade")} *
              </label>
              <Input
                type="number"
                step="any"
                {...form.register("maxGrade", { valueAsNumber: true })}
              />
              {form.formState.errors.maxGrade && (
                <p className="text-xs text-danger mt-1">
                  {form.formState.errors.maxGrade.message}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t("saving")
                : isEditing
                  ? t("editSubmit")
                  : t("addSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
