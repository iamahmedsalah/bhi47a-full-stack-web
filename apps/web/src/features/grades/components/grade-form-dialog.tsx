"use client";

import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
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
    resolver: zodResolver(gradeFormSchema),
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
            <div>
              <label className="text-xs font-semibold mb-1 block">
                {t("course")} *
              </label>
              <Select
                value={form.watch("courseCode")}
                onValueChange={(val) => form.setValue("courseCode", val)}
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
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">
                {t("examType")} *
              </label>
              <Select
                value={form.watch("examType")}
                onValueChange={(val) => form.setValue("examType", val)}
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
            <div>
              <label className="text-xs font-semibold mb-1 block">
                {t("status")}
              </label>
              <Select
                value={form.watch("status")}
                onValueChange={(val) => form.setValue("status", val)}
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
            <div>
              <label className="text-xs font-semibold mb-1 block">
                {t("grade")} *
              </label>
              <Input type="number" {...form.register("grade")} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">
                {t("maxGrade")} *
              </label>
              <Input type="number" {...form.register("maxGrade")} />
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
