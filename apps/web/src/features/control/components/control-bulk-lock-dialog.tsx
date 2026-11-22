"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Loader2, Lock, ShieldCheck, Unlock } from "lucide-react";
import { toast } from "sonner";
import {
  CONTROL_COMPONENT_KEYS,
  type ControlComponentKey,
  type Semester,
} from "@student-portal/shared";
import { getApiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpNote } from "@/components/ui/help-note";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  bulkLockControlSheets,
  bulkUnlockControlSheets,
  controlKeys,
} from "../api";
import type { ControlCourseSummary } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  academicYear: string;
  semester: Semester;
  courses: ControlCourseSummary[];
  initialSelectedCourseIds: string[];
  initialComponent: ControlComponentKey;
  canLock: boolean;
  canUnlock: boolean;
}

const COMPONENT_LABELS: Record<
  ControlComponentKey,
  { ar: string; en: string }
> = {
  midterm: { ar: "الميدتيرم", en: "Midterm" },
  coursework: { ar: "أعمال السنة", en: "Coursework" },
  final: { ar: "النهائي (الفاينل)", en: "Final Exam" },
};

export function ControlBulkLockDialog({
  open,
  onOpenChange,
  locale,
  academicYear,
  semester,
  courses,
  initialSelectedCourseIds,
  initialComponent,
  canLock,
  canUnlock,
}: Props) {
  const isAr = locale === "ar";
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"lock" | "unlock">(
    canLock ? "lock" : "unlock",
  );
  const [selectedComponents, setSelectedComponents] = useState<
    ControlComponentKey[]
  >([initialComponent]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>(() =>
    initialSelectedCourseIds.length > 0
      ? initialSelectedCourseIds
      : courses.map((c) => c.courseId),
  );
  const [courseSearch, setCourseSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [reason, setReason] = useState("");

  const filteredCourses = useMemo(() => {
    const needle = courseSearch.trim().toLowerCase();
    return courses.filter((course) => {
      if (levelFilter !== "all" && course.level !== levelFilter) return false;
      if (needle) {
        const hay =
          `${course.code} ${course.name} ${course.nameAr ?? ""} ${course.nameEn ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [courses, courseSearch, levelFilter]);

  const toggleComponent = (comp: ControlComponentKey) => {
    setSelectedComponents((prev) =>
      prev.includes(comp) ? prev.filter((c) => c !== comp) : [...prev, comp],
    );
  };

  const allComponentsSelected =
    selectedComponents.length === CONTROL_COMPONENT_KEYS.length;

  const toggleCourse = (courseId: string) => {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId],
    );
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        academicYear,
        semester,
        courseIds: selectedCourseIds,
        components: selectedComponents,
        reason: reason.trim() || undefined,
      };
      return mode === "lock"
        ? bulkLockControlSheets(payload)
        : bulkUnlockControlSheets(payload);
    },
    onSuccess: (res) => {
      toast.success(
        mode === "lock"
          ? isAr
            ? `تم قفل ${res.affected} كشف كنترول بنجاح`
            : `Locked ${res.affected} Control sheets successfully`
          : isAr
            ? `تم فك قفل ${res.affected} كشف كنترول بنجاح`
            : `Unlocked ${res.affected} Control sheets successfully`,
      );
      queryClient.invalidateQueries({ queryKey: controlKeys.all });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="sm:max-w-2xl rounded-2xl border-border/80 bg-card/95 backdrop-blur-xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2">
            {mode === "lock" ? (
              <Lock className="size-5 text-amber-400" />
            ) : (
              <Unlock className="size-5 text-emerald-400" />
            )}
            <span>
              {isAr
                ? "إدارة قفل الكنترول الجماعي (مقررات ومكوّنات محددة)"
                : "Bulk Control Lock Management (Courses & Components)"}
            </span>
          </DialogTitle>
          <DialogDescription>
            {isAr
              ? "حدد العملية (قفل أو فك قفل)، ثم اختر المكوّنات المطلوبة (الميدتيرم / أعمال السنة / النهائي / أو الثلاثة معًا) والمقررات المستهدفة."
              : "Choose Lock or Unlock, select target components (Midterm, Coursework, Final, or all 3), and pick the target courses."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Operation Mode Toggle */}
          {canLock && canUnlock && (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-background/40 p-1.5">
              <button
                type="button"
                onClick={() => setMode("lock")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-squircle py-2 text-xs font-bold transition-all cursor-pointer",
                  mode === "lock"
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/40 shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Lock className="size-3.5" />
                <span>
                  {isAr ? "قفل الكنترول (منع التعديل)" : "Lock Control Sheets"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("unlock")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-squircle py-2 text-xs font-bold transition-all cursor-pointer",
                  mode === "unlock"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Unlock className="size-3.5" />
                <span>
                  {isAr
                    ? "فك قفل الكنترول (إتاحة التعديل)"
                    : "Unlock Control Sheets"}
                </span>
              </button>
            </div>
          )}

          {/* Component Selection */}
          <div className="space-y-2 rounded-xl border border-border/60 bg-background/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-bold">
                {isAr
                  ? "١. اختر المكوّن المطلوب قفله / فتحه:"
                  : "1. Choose components to lock / unlock:"}
              </Label>
              <button
                type="button"
                onClick={() =>
                  setSelectedComponents(
                    allComponentsSelected ? [] : [...CONTROL_COMPONENT_KEYS],
                  )
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                <CheckSquare className="size-3.5" />
                <span>
                  {allComponentsSelected
                    ? isAr
                      ? "إلغاء تحديد الكل"
                      : "Clear all"
                    : isAr
                      ? "تحديد الثلاثة معًا (الكل)"
                      : "Select all 3 components"}
                </span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {CONTROL_COMPONENT_KEYS.map((comp) => {
                const checked = selectedComponents.includes(comp);
                return (
                  <label
                    key={comp}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-squircle border p-2.5 text-xs font-semibold transition-all select-none",
                      checked
                        ? "border-primary bg-primary/10 text-foreground shadow-xs"
                        : "border-border/60 bg-card/50 text-muted-foreground hover:border-border",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleComponent(comp)}
                    />
                    <span>
                      {isAr
                        ? COMPONENT_LABELS[comp].ar
                        : COMPONENT_LABELS[comp].en}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Course Selection */}
          <div className="space-y-2.5 rounded-xl border border-border/60 bg-background/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-bold">
                {isAr
                  ? `٢. المقررات المحددة (${selectedCourseIds.length} من ${courses.length}):`
                  : `2. Selected Courses (${selectedCourseIds.length} of ${courses.length}):`}
              </Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const visibleIds = filteredCourses.map((c) => c.courseId);
                    const next = new Set([...selectedCourseIds, ...visibleIds]);
                    setSelectedCourseIds(Array.from(next));
                  }}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  {isAr ? "تحديد المعروض" : "Select visible"}
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={() => setSelectedCourseIds([])}
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {isAr ? "مسح التحديد" : "Clear all"}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder={
                  isAr
                    ? "ابحث بكود أو اسم المقرر..."
                    : "Search course code or name..."
                }
                className="h-8 flex-1 min-w-[180px] rounded-squircle text-xs"
              />
              <div className="flex items-center gap-1">
                {["all", "1", "2", "3", "4"].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setLevelFilter(lvl)}
                    className={cn(
                      "px-2.5 py-1 rounded-squircle text-[11px] font-semibold border transition-all cursor-pointer",
                      levelFilter === lvl
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {lvl === "all"
                      ? isAr
                        ? "كل المستويات"
                        : "All"
                      : isAr
                        ? `م${lvl}`
                        : `L${lvl}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scroll">
              {filteredCourses.map((course) => {
                const checked = selectedCourseIds.includes(course.courseId);
                const title = isAr
                  ? course.nameAr || course.name
                  : course.nameEn || course.name;
                return (
                  <label
                    key={course.courseId}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-squircle border px-2.5 py-1.5 text-xs transition-all select-none",
                      checked
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border/50 bg-card/40 text-muted-foreground hover:border-border",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleCourse(course.courseId)}
                      />
                      <Badge
                        variant="outline"
                        className="rounded-squircle font-mono text-[10px] px-1.5 py-0"
                      >
                        <bdi dir="ltr">{course.code}</bdi>
                      </Badge>
                      <span className="truncate font-medium">{title}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {course.components.map((comp) => (
                        <span
                          key={comp.key}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-squircle border",
                            comp.locked
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                          )}
                        >
                          {isAr
                            ? COMPONENT_LABELS[comp.key].ar
                            : COMPONENT_LABELS[comp.key].en}
                          :{" "}
                          {comp.locked
                            ? isAr
                              ? "مغلق"
                              : "Locked"
                            : isAr
                              ? "مفتوح"
                              : "Open"}
                        </span>
                      ))}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {isAr
                ? "السبب / الملاحظة في سجل التدقيق (اختياري)"
                : "Audit log reason / note (optional)"}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder={
                isAr
                  ? "مثال: إغلاق رصد الميدتيرم بعد انتهاء فترة الرصد الرسمية..."
                  : "e.g. Closing Midterm grade entry after official deadline..."
              }
              className="min-h-[68px] rounded-squircle text-xs resize-none"
            />
          </div>

          <HelpNote
            title={
              isAr ? "ملخص العملية قبل التنفيذ" : "Operation impact summary"
            }
            icon={<ShieldCheck className="size-4" />}
          >
            <p>
              {isAr
                ? `سيتم ${mode === "lock" ? "قفل" : "فك قفل"} (${selectedComponents.length}) مكوّن في (${selectedCourseIds.length}) مقرر دراسي. عند القفل، يتم أيضاً قفل أي كشف لم يُفتح بعد لمنع الرصد المتأخر.`
                : `Will ${mode} (${selectedComponents.length}) component(s) across (${selectedCourseIds.length}) course(s). Locking also initializes unopened sheets as locked.`}
            </p>
          </HelpNote>
        </div>

        <DialogFooter className="gap-2 sm:justify-start rtl:sm:justify-start">
          <Button
            type="button"
            variant={mode === "lock" ? "destructive" : "default"}
            className="rounded-squircle"
            disabled={
              mutation.isPending ||
              selectedCourseIds.length === 0 ||
              selectedComponents.length === 0
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && (
              <Loader2 className="size-4 animate-spin me-1.5" />
            )}
            <span>
              {mode === "lock"
                ? isAr
                  ? `تأكيد قفل الكنترول (${selectedCourseIds.length * selectedComponents.length})`
                  : `Confirm Bulk Lock (${selectedCourseIds.length * selectedComponents.length})`
                : isAr
                  ? `تأكيد فك القفل (${selectedCourseIds.length * selectedComponents.length})`
                  : `Confirm Bulk Unlock (${selectedCourseIds.length * selectedComponents.length})`}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-squircle"
            onClick={() => onOpenChange(false)}
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
