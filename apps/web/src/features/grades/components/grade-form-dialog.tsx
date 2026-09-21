"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Resolver, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EXAM_TYPE_VALUES, GRADE_STATUS_VALUES } from "@student-portal/shared";
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
      academicYear: defaultValues?.academicYear ?? "2024-2025",
      semester: defaultValues?.semester ?? "first",
      isPublished: defaultValues?.isPublished ?? true,
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
        academicYear: defaultValues?.academicYear ?? "2024-2025",
        semester: defaultValues?.semester ?? "first",
        isPublished: defaultValues?.isPublished ?? true,
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

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
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
                <SelectContent>
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
                <SelectContent>
                  {EXAM_TYPE_VALUES.map((examType) => (
                    <SelectItem key={examType} value={examType}>
                      {t(`examTypeValues.${examType}`)}
                    </SelectItem>
                  ))}
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
                <SelectContent>
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