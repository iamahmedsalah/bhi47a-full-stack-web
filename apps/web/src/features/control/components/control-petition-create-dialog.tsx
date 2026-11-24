"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  FileEdit,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  CONTROL_MIDTERM_STATES,
  CONTROL_SCORELESS_STATES,
  GRADE_STATUS_VALUES,
  validateMark,
  type ControlComponentKey,
  type GradeStatus,
} from "@student-portal/shared";
import { getApiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { controlKeys, createControlPetition } from "../api";
import type {
  ControlSheetDetails,
  ResolvedGradingScheme,
  WorkbookRow,
} from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  detail: ControlSheetDetails;
  scheme?: ResolvedGradingScheme;
  rows: WorkbookRow[];
  initialSelectedStudentIds: string[];
  onSubmitted?: () => void;
}

interface DraftPetitionRow {
  studentId: string;
  proposedStatus: GradeStatus;
  proposedScore: string;
  proposedAttendanceMark: string;
  proposedQuizzesMark: string;
  studentReason: string;
}

const SCORELESS = CONTROL_SCORELESS_STATES as readonly string[];

const STATUS_LABELS: Record<GradeStatus, { ar: string; en: string }> = {
  present: { ar: "حاضر", en: "Present" },
  absent: { ar: "غائب", en: "Absent" },
  excused: { ar: "بعذر", en: "Excused" },
  banned: { ar: "محروم", en: "Banned" },
  withheld: { ar: "محجوبة", en: "Withheld" },
  incomplete: { ar: "غير مكتمل", en: "Incomplete" },
};

const COMPONENT_NAMES: Record<
  ControlComponentKey,
  { ar: string; en: string }
> = {
  midterm: { ar: "الميدتيرم", en: "Midterm" },
  coursework: { ar: "أعمال السنة", en: "Coursework" },
  final: { ar: "النهائي (الفاينل)", en: "Final" },
};

export function ControlPetitionCreateDialog({
  open,
  onOpenChange,
  locale,
  detail,
  scheme,
  rows,
  initialSelectedStudentIds,
  onSubmitted,
}: Props) {
  const isAr = locale === "ar";
  const queryClient = useQueryClient();
  const component = detail.sheet.component;
  const rules = detail.rules;
  const attendanceMax = scheme?.courseworkAttendanceMax ?? 5;
  const quizzesMax = scheme?.courseworkQuizzesMax ?? 15;

  const partialAllowedSet = useMemo(
    () =>
      detail.sheet.workflowState === "PARTIAL_OPEN"
        ? new Set(detail.sheet.partialCycle?.allowedStudentIds ?? [])
        : null,
    [detail.sheet.workflowState, detail.sheet.partialCycle?.allowedStudentIds],
  );

  const eligibleRows = useMemo(
    () =>
      rows.filter((r) => {
        if (r.notRegistered || r.tuition?.isBlocked) return false;
        if (partialAllowedSet?.has(r.studentId)) return false;
        const entry = r.components[component];
        if (!entry || !entry.status) return false;
        // Only approved (non-draft) grades may be petitioned
        return entry.isApproved !== false;
      }),
    [rows, component, partialAllowedSet],
  );
  const rowById = useMemo(
    () => new Map(eligibleRows.map((r) => [r.studentId, r])),
    [eligibleRows],
  );

  const buildInitialItem = (studentId: string): DraftPetitionRow => {
    const row = rowById.get(studentId);
    const current = row?.components[component];
    const currentStatus = (current?.status as GradeStatus | null) ?? "present";
    return {
      studentId,
      proposedStatus: currentStatus,
      proposedScore: current?.score != null ? String(current.score) : "",
      proposedAttendanceMark:
        current?.attendanceMark != null ? String(current.attendanceMark) : "",
      proposedQuizzesMark:
        current?.quizzesMark != null ? String(current.quizzesMark) : "",
      studentReason: "",
    };
  };

  const [items, setItems] = useState<DraftPetitionRow[]>(() =>
    initialSelectedStudentIds
      .filter((id) => rowById.has(id))
      .map((id) => buildInitialItem(id)),
  );
  const [reason, setReason] = useState("");
  const [studentPickerSearch, setStudentPickerSearch] = useState("");

  const allowedStatuses = useMemo(
    () =>
      (component === "midterm"
        ? CONTROL_MIDTERM_STATES
        : GRADE_STATUS_VALUES) as readonly GradeStatus[],
    [component],
  );

  const availableToAdd = useMemo(() => {
    const picked = new Set(items.map((i) => i.studentId));
    const needle = studentPickerSearch.trim().toLowerCase();
    return eligibleRows
      .filter((r) => {
        if (picked.has(r.studentId)) return false;
        if (!needle) return true;
        return `${r.studentCode} ${r.name} ${r.nameAr ?? ""}`
          .toLowerCase()
          .includes(needle);
      })
      .slice(0, 15);
  }, [eligibleRows, items, studentPickerSearch]);

  const updateItem = (
    studentId: string,
    patch: Partial<DraftPetitionRow>,
  ) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.studentId !== studentId) return it;
        const next = { ...it, ...patch };
        if (
          component === "coursework" &&
          (patch.proposedAttendanceMark !== undefined ||
            patch.proposedQuizzesMark !== undefined)
        ) {
          const att = Number(next.proposedAttendanceMark);
          const qz = Number(next.proposedQuizzesMark);
          if (
            next.proposedAttendanceMark.trim() !== "" &&
            next.proposedQuizzesMark.trim() !== "" &&
            Number.isFinite(att) &&
            Number.isFinite(qz)
          ) {
            next.proposedScore = String(Math.round((att + qz) * 100) / 100);
          }
        }
        return next;
      }),
    );
  };

  const validationByStudent = useMemo(() => {
    const errors = new Map<string, string>();
    for (const item of items) {
      const row = rowById.get(item.studentId);
      const current = row?.components[component];
      const isScoreless = SCORELESS.includes(item.proposedStatus);
      let numScore: number | null = null;

      if (!isScoreless) {
        if (item.proposedScore.trim() === "") {
          errors.set(
            item.studentId,
            isAr ? "أدخل الدرجة الجديدة" : "Enter the new mark",
          );
          continue;
        }
        const parsed = Number(item.proposedScore);
        if (!Number.isFinite(parsed)) {
          errors.set(item.studentId, isAr ? "درجة غير صالحة" : "Invalid mark");
          continue;
        }
        const err = validateMark(parsed, {
          max: rules.max,
          step: rules.step,
        });
        if (err) {
          errors.set(
            item.studentId,
            isAr
              ? `الدرجة يجب أن تكون بين 0 و ${rules.max} بخطوة ${rules.step}`
              : `Mark must be 0–${rules.max} (step ${rules.step})`,
          );
          continue;
        }
        numScore = parsed;

        if (component === "coursework") {
          const att = Number(item.proposedAttendanceMark);
          const qz = Number(item.proposedQuizzesMark);
          if (
            item.proposedAttendanceMark.trim() === "" ||
            item.proposedQuizzesMark.trim() === "" ||
            !Number.isFinite(att) ||
            !Number.isFinite(qz) ||
            att < 0 ||
            qz < 0 ||
            att > attendanceMax ||
            qz > quizzesMax ||
            Math.round((att + qz) * 100) / 100 !== numScore
          ) {
            errors.set(
              item.studentId,
              isAr
                ? `تأكد من توزيع الحضور (/${attendanceMax}) والاختبارات (/${quizzesMax})`
                : `Verify attendance (/${attendanceMax}) + quizzes (/${quizzesMax})`,
            );
            continue;
          }
        }
      }

      const curScore = current?.score ?? null;
      const curStatus = current?.status ?? null;
      if (curStatus === item.proposedStatus && curScore === numScore) {
        errors.set(
          item.studentId,
          isAr
            ? "الدرجة الجديدة مطابقة للدرجة الحالية"
            : "Proposed mark is identical to current mark",
        );
      }
    }
    return errors;
  }, [
    items,
    rowById,
    component,
    isAr,
    rules,
    attendanceMax,
    quizzesMax,
  ]);

  const canSubmit =
    items.length > 0 &&
    reason.trim().length >= 3 &&
    validationByStudent.size === 0;

  const mutation = useMutation({
    mutationFn: async () =>
      createControlPetition({
        sheetId: detail.sheet.id,
        reason: reason.trim(),
        items: items.map((it) => {
          const scoreless = SCORELESS.includes(it.proposedStatus);
          return {
            studentId: it.studentId,
            proposedStatus: it.proposedStatus,
            proposedScore: scoreless ? null : Number(it.proposedScore),
            ...(component === "coursework" && !scoreless
              ? {
                  proposedAttendanceMark: Number(it.proposedAttendanceMark),
                  proposedQuizzesMark: Number(it.proposedQuizzesMark),
                }
              : {}),
            studentReason: it.studentReason.trim() || undefined,
          };
        }),
      }),
    onSuccess: () => {
      toast.success(
        isAr
          ? "تم إرسال طلب التماس تعديل الدرجات للاعتماد بنجاح"
          : "Grade petition request submitted for approval",
      );
      queryClient.invalidateQueries({ queryKey: controlKeys.all });
      onSubmitted?.();
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
        className="sm:max-w-3xl rounded-2xl border-border/80 bg-card/95 backdrop-blur-xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="size-5 text-primary" />
            <span>
              {isAr
                ? `طلب التماس تعديل درجات — ${COMPONENT_NAMES[component].ar}`
                : `Grade Adjustment Petition — ${COMPONENT_NAMES[component].en}`}
            </span>
          </DialogTitle>
          <DialogDescription>
            <bdi dir="ltr" className="font-mono font-bold text-foreground">
              {detail.course.code}
            </bdi>{" "}
            —{" "}
            {isAr
              ? detail.course.nameAr || detail.course.name
              : detail.course.nameEn || detail.course.name}{" "}
            ·{" "}
            {isAr
              ? `الدرجة العظمى: ${rules.max}`
              : `Max mark: ${rules.max}`}
            <br />
            {isAr
              ? "يُرسل هذا الطلب إلى العميد / المسؤول المخوّل بصلاحية اعتماد الالتماسات للبت في كل طالب على حدة، وتُحدَّث الدرجات المعتمدة تلقائيًا فور الموافقة."
              : "This petition is sent to the Dean / authorized approver for per-student review. Approved grades are updated automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Student Search & Add Picker */}
          <div className="space-y-2 rounded-xl border border-border/60 bg-background/30 p-3">
            <Label className="text-xs font-bold">
              {isAr
                ? "إضافة طالب إلى طلب الالتماس:"
                : "Add student to petition:"}
            </Label>
            <Input
              value={studentPickerSearch}
              onChange={(e) => setStudentPickerSearch(e.target.value)}
              placeholder={
                isAr
                  ? "ابحث بكود الطالب أو اسمه لإضافته للطلب..."
                  : "Search by student code or name to add..."
              }
              className="h-8 rounded-squircle text-xs"
            />
            {(studentPickerSearch.trim().length > 0 || items.length === 0) &&
              availableToAdd.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 max-h-28 overflow-y-auto">
                  {availableToAdd.map((row) => (
                    <button
                      key={row.studentId}
                      type="button"
                      onClick={() => {
                        setItems((prev) => [
                          ...prev,
                          buildInitialItem(row.studentId),
                        ]);
                        setStudentPickerSearch("");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-squircle border border-border/70 bg-card/80 px-2.5 py-1 text-xs hover:border-primary/50 hover:bg-primary/10 transition-all cursor-pointer"
                    >
                      <Plus className="size-3 text-primary" />
                      <bdi dir="ltr" className="font-mono font-bold">
                        {row.studentCode}
                      </bdi>
                      <span>{isAr ? row.nameAr || row.name : row.name}</span>
                    </button>
                  ))}
                </div>
              )}
          </div>

          {/* Selected Students Table */}
          <div className="space-y-2">
            <Label className="text-xs font-bold">
              {isAr
                ? `الطلاب المطلوب تعديل درجاتهم (${items.length}):`
                : `Students in Petition (${items.length}):`}
            </Label>
            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                {isAr
                  ? "حدد الطلاب من الجدول أو ابحث عنهم بالأعلى لإضافتهم إلى طلب الالتماس."
                  : "Select students from the grid or search above to add them to this petition."}
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 custom-scroll">
                {items.map((item) => {
                  const row = rowById.get(item.studentId);
                  if (!row) return null;
                  const current = row.components[component];
                  const curStatus =
                    (current?.status as GradeStatus | null) ?? null;
                  const err = validationByStudent.get(item.studentId);
                  const scoreless = SCORELESS.includes(item.proposedStatus);

                  return (
                    <div
                      key={item.studentId}
                      className="rounded-xl border border-border/70 bg-background/40 p-3 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="rounded-squircle font-mono text-xs"
                          >
                            <bdi dir="ltr">{row.studentCode}</bdi>
                          </Badge>
                          <span className="text-xs font-bold text-foreground">
                            {isAr ? row.nameAr || row.name : row.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {isAr ? "الدرجة الحالية:" : "Current:"}{" "}
                            <strong className="text-foreground font-mono">
                              {current?.score != null
                                ? current.score
                                : curStatus
                                  ? isAr
                                    ? STATUS_LABELS[curStatus].ar
                                    : STATUS_LABELS[curStatus].en
                                  : isAr
                                    ? "لم تُرصد"
                                    : "Not entered"}
                            </strong>
                          </span>
                          <ArrowRight className="size-3.5 text-primary rtl:rotate-180" />
                          <button
                            type="button"
                            onClick={() =>
                              setItems((prev) =>
                                prev.filter(
                                  (i) => i.studentId !== item.studentId,
                                ),
                              )
                            }
                            aria-label={isAr ? "إزالة الطالب" : "Remove student"}
                            className="inline-flex size-7 items-center justify-center rounded-squircle text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            {isAr ? "الحالة الجديدة" : "New Status"}
                          </Label>
                          <Select
                            value={item.proposedStatus}
                            onValueChange={(v) =>
                              updateItem(item.studentId, {
                                proposedStatus: v as GradeStatus,
                                ...(SCORELESS.includes(v)
                                  ? {
                                      proposedScore: "",
                                      proposedAttendanceMark: "",
                                      proposedQuizzesMark: "",
                                    }
                                  : {}),
                              })
                            }
                          >
                            <SelectTrigger className="h-8 rounded-squircle text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent dir={isAr ? "rtl" : "ltr"}>
                              {allowedStatuses.map((st) => (
                                <SelectItem key={st} value={st}>
                                  {isAr
                                    ? STATUS_LABELS[st].ar
                                    : STATUS_LABELS[st].en}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {component === "coursework" && !scoreless ? (
                          <>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                {isAr
                                  ? `الحضور (/${attendanceMax})`
                                  : `Attendance (/${attendanceMax})`}
                              </Label>
                              <Input
                                dir="ltr"
                                type="number"
                                min={0}
                                max={attendanceMax}
                                step={rules.step}
                                value={item.proposedAttendanceMark}
                                onChange={(e) =>
                                  updateItem(item.studentId, {
                                    proposedAttendanceMark: e.target.value,
                                  })
                                }
                                className="h-8 rounded-squircle text-left font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                {isAr
                                  ? `الاختبارات (/${quizzesMax}) · المجموع: ${item.proposedScore || 0}`
                                  : `Quizzes (/${quizzesMax}) · Sum: ${item.proposedScore || 0}`}
                              </Label>
                              <Input
                                dir="ltr"
                                type="number"
                                min={0}
                                max={quizzesMax}
                                step={rules.step}
                                value={item.proposedQuizzesMark}
                                onChange={(e) =>
                                  updateItem(item.studentId, {
                                    proposedQuizzesMark: e.target.value,
                                  })
                                }
                                className="h-8 rounded-squircle text-left font-mono text-xs"
                              />
                            </div>
                          </>
                        ) : (
                          !scoreless && (
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                {isAr
                                  ? `الدرجة الجديدة (من ${rules.max})`
                                  : `New Mark (out of ${rules.max})`}
                              </Label>
                              <Input
                                dir="ltr"
                                type="number"
                                min={0}
                                max={rules.max}
                                step={rules.step}
                                value={item.proposedScore}
                                onChange={(e) =>
                                  updateItem(item.studentId, {
                                    proposedScore: e.target.value,
                                  })
                                }
                                placeholder={`0 - ${rules.max}`}
                                className="h-8 rounded-squircle text-left font-mono text-xs"
                              />
                            </div>
                          )
                        )}

                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            {isAr
                              ? "ملاحظة خاصة بالطالب (اختياري)"
                              : "Student note (optional)"}
                          </Label>
                          <Input
                            value={item.studentReason}
                            onChange={(e) =>
                              updateItem(item.studentId, {
                                studentReason: e.target.value,
                              })
                            }
                            placeholder={
                              isAr
                                ? "مثال: خطأ جمع في السؤال الثاني..."
                                : "e.g. Addition error on Q2..."
                            }
                            className="h-8 rounded-squircle text-xs"
                          />
                        </div>
                      </div>

                      {err && (
                        <p className="text-[11px] font-medium text-rose-400">
                          {err}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mandatory Petition Reason */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">
              {isAr
                ? "سبب طلب الالتماس / رقم المحضر (إجباري — ٣ أحرف على الأقل)"
                : "Petition Reason / Reference (Mandatory — min 3 chars)"}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder={
                isAr
                  ? "مثال: نتيجة فحص التماسات الميدتيرم المعتمدة من لجنة التظلمات بتاريخ..."
                  : "e.g. Approved midterm appeal committee findings dated..."
              }
              className="min-h-[72px] rounded-squircle text-xs resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-start rtl:sm:justify-start">
          <Button
            type="button"
            className="rounded-squircle gap-1.5"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            <span>
              {isAr
                ? `إرسال طلب الالتماس للاعتماد (${items.length})`
                : `Submit Petition for Approval (${items.length})`}
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
