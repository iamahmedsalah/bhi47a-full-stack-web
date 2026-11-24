"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Loader2,
  Lock,
  Search,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";
import {
  controlKeys,
  getControlPartialCandidates,
  openControlPartialEntry,
} from "../api";
import type { ControlSheetDetails } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  detail: ControlSheetDetails;
  onOpened?: () => Promise<void> | void;
}

export function ControlPartialOpenDialog({
  open,
  onOpenChange,
  locale,
  detail,
  onOpened,
}: Props) {
  const isAr = locale.startsWith("ar");
  const queryClient = useQueryClient();
  const [includeExcused, setIncludeExcused] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openReason, setOpenReason] = useState("");
  const [studentReasons, setStudentReasons] = useState<Record<string, string>>(
    {},
  );

  const candidatesQuery = useQuery({
    queryKey: controlKeys.partialCandidates(detail.sheet.id, includeExcused),
    queryFn: () =>
      getControlPartialCandidates(detail.sheet.id, includeExcused),
    enabled: open,
  });

  const candidates = useMemo(
    () => candidatesQuery.data?.candidates ?? [],
    [candidatesQuery.data?.candidates],
  );

  const selectableCandidates = useMemo(
    () => candidates.filter((c) => !c.tuitionBlocked),
    [candidates],
  );

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      `${c.studentCode} ${c.name} ${c.nameAr ?? ""}`.toLowerCase().includes(q),
    );
  }, [candidates, search]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectableFilteredIds = useMemo(
    () => filteredCandidates.filter((c) => !c.tuitionBlocked).map((c) => c.studentId),
    [filteredCandidates],
  );

  const allFilteredSelected =
    selectableFilteredIds.length > 0 &&
    selectableFilteredIds.every((id) => selectedSet.has(id));

  const toggleAllFiltered = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of selectableFilteredIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return [...next];
    });
  };

  const toggleStudent = (studentId: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked
        ? [...new Set([...prev, studentId])]
        : prev.filter((id) => id !== studentId),
    );
  };

  const mutation = useMutation({
    mutationFn: () =>
      openControlPartialEntry(detail.sheet.id, {
        studentIds: selectedIds,
        includeExcused,
        reason: openReason.trim() || undefined,
        studentReasons: Object.fromEntries(
          Object.entries(studentReasons).filter(
            ([id, val]) => selectedSet.has(id) && val.trim().length > 0,
          ),
        ),
        expectedRevision:
          candidatesQuery.data?.revision ?? detail.sheet.revision,
      }),
    onSuccess: async () => {
      toast.success(
        isAr
          ? `تم فتح الرصد الجزئي لـ ${selectedIds.length} طالب بنجاح`
          : `Partial entry opened for ${selectedIds.length} students`,
      );
      await queryClient.invalidateQueries({ queryKey: controlKeys.all });
      await onOpened?.();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  const reasonBadge = (kind: "unentered" | "excused" | "incomplete") => {
    if (kind === "excused") {
      return {
        label: isAr ? "بعذر" : "Excused",
        cls: "border-amber-500/35 bg-amber-500/12 text-amber-300",
      };
    }
    if (kind === "incomplete") {
      return {
        label: isAr ? "غير مكتمل" : "Incomplete",
        cls: "border-blue-500/35 bg-blue-500/12 text-blue-300",
      };
    }
    return {
      label: isAr ? "غير مرصود (NULL)" : "Unentered (NULL)",
      cls: "border-primary/35 bg-primary/12 text-primary",
    };
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !mutation.isPending) onOpenChange(false);
      }}
    >
      <DialogContent
        flush
        dir={isAr ? "rtl" : "ltr"}
        className="max-w-2xl"
      >
        <DialogHeader>
          <div className="flex items-start gap-3 text-start">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-squircle border border-primary/30 bg-primary/15 text-primary">
              <UserCheck className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <DialogTitle className="text-base font-bold text-start">
                {isAr
                  ? "فتح الرصد للطلاب غير المرصود لهم درجات"
                  : "Open Selective Entry for Unentered Students"}
              </DialogTitle>
              <DialogDescription className="text-start text-xs leading-relaxed">
                {isAr
                  ? "حدد الطلاب المستحقين للرصد (الأعذار المقبولة أو من رُفع عنهم الحجب) فقط. تبقى جميع الدرجات المعتمدة مقفلة ومحمية داخل نفس الكشف."
                  : "Select only eligible unentered students (approved excuses or cleared holds). All previously approved grades stay locked."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    isAr
                      ? "ابحث بكود الطالب أو الاسم..."
                      : "Search by student code or name..."
                  }
                  className="ps-9 rounded-squircle h-9 text-xs"
                />
              </div>

              {detail.sheet.component !== "midterm" && (
                <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer shrink-0">
                  <Checkbox
                    checked={includeExcused}
                    onCheckedChange={(v) => {
                      setIncludeExcused(Boolean(v));
                      setSelectedIds([]);
                    }}
                  />
                  <span>
                    {isAr
                      ? "تضمين حالات «بعذر / غير مكتمل»"
                      : "Include Excused / Incomplete"}
                  </span>
                </label>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                <Checkbox
                  checked={allFilteredSelected}
                  disabled={selectableFilteredIds.length === 0}
                  onCheckedChange={(v) => toggleAllFiltered(Boolean(v))}
                />
                <span>
                  {isAr
                    ? `تحديد الكل المتاح (${selectableFilteredIds.length})`
                    : `Select all eligible (${selectableFilteredIds.length})`}
                </span>
              </label>

              <span className="inline-flex items-center gap-1.5 rounded-squircle border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                <Users className="size-3.5" aria-hidden="true" />
                {isAr
                  ? `تم اختيار ${selectedIds.length} من ${selectableCandidates.length}`
                  : `${selectedIds.length} / ${selectableCandidates.length} selected`}
              </span>
            </div>
          </div>

          {candidatesQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>
                {isAr
                  ? "جاري تحميل قائمة الطلاب غير المرصودين..."
                  : "Loading unentered students..."}
              </span>
            </div>
          ) : candidatesQuery.isError ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-3.5 text-xs text-rose-300 flex items-center gap-2"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{getApiErrorMessage(candidatesQuery.error)}</span>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-secondary/20 p-6 text-center text-xs text-muted-foreground">
              {candidates.length === 0
                ? isAr
                  ? "لا يوجد طلاب غير مرصود لهم درجات في هذا الكشف حاليًا."
                  : "There are no unentered students in this sheet."
                : isAr
                  ? "لا توجد نتائج مطابقة للبحث."
                  : "No students match your search."}
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pe-1">
              {filteredCandidates.map((student) => {
                const isSelected = selectedSet.has(student.studentId);
                const badge = reasonBadge(student.reasonKind);
                return (
                  <div
                    key={student.studentId}
                    className={cn(
                      "rounded-xl border p-3 transition-colors space-y-2",
                      student.tuitionBlocked
                        ? "border-rose-500/25 bg-rose-500/[0.06] opacity-75"
                        : isSelected
                          ? "border-primary/40 bg-primary/[0.08]"
                          : "border-border/60 bg-card/85 hover:border-border",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      <label
                        className={cn(
                          "flex items-center gap-2.5 min-w-0 flex-1",
                          student.tuitionBlocked
                            ? "cursor-not-allowed"
                            : "cursor-pointer",
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={student.tuitionBlocked}
                          onCheckedChange={(v) =>
                            toggleStudent(student.studentId, Boolean(v))
                          }
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <bdi
                              dir="ltr"
                              className="font-mono text-xs font-bold text-foreground"
                            >
                              {student.studentCode}
                            </bdi>
                            <span className="text-xs font-semibold text-foreground truncate">
                              {isAr
                                ? student.nameAr || student.name
                                : student.name}
                            </span>
                          </div>
                        </div>
                      </label>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={cn(
                            "rounded-squircle border px-2 py-0.5 text-[10px] font-bold",
                            badge.cls,
                          )}
                        >
                          {badge.label}
                        </span>
                        {student.tuitionBlocked && (
                          <span className="inline-flex items-center gap-1 rounded-squircle border border-rose-500/35 bg-rose-500/12 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                            <Lock className="size-3" aria-hidden="true" />
                            <span>{isAr ? "محجوب" : "Blocked"}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <Input
                        value={studentReasons[student.studentId] ?? ""}
                        onChange={(e) =>
                          setStudentReasons((prev) => ({
                            ...prev,
                            [student.studentId]: e.target.value,
                          }))
                        }
                        maxLength={300}
                        placeholder={
                          isAr
                            ? "ملاحظة العذر لهذا الطالب (اختياري)..."
                            : "Excuse note for this student (optional)..."
                        }
                        className="h-8 rounded-squircle text-xs"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-border/60 bg-secondary/20 p-3.5 space-y-2">
            <Label className="text-xs font-bold">
              {isAr
                ? "سبب فتح دورة الرصد الجزئي (اختياري — يُسجل في Audit Log):"
                : "Reason for opening partial entry (optional — logged to Audit Log):"}
            </Label>
            <Input
              value={openReason}
              onChange={(e) => setOpenReason(e.target.value)}
              maxLength={500}
              placeholder={
                isAr
                  ? "مثال: رصد درجات طلاب الأعذار الطبية المعتمدة بعد الامتحان..."
                  : "e.g., Entering marks for students with approved medical excuses..."
              }
              className="rounded-squircle h-9 text-xs"
            />
          </div>
        </DialogBody>

        <DialogFooter className="gap-2 rtl:sm:justify-start">
          <Button
            type="button"
            disabled={selectedIds.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="rounded-squircle gap-1.5"
          >
            {mutation.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            <span>
              {isAr
                ? `فتح الرصد لـ (${selectedIds.length}) طالب`
                : `Open Partial Entry (${selectedIds.length})`}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
            className="rounded-squircle"
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
