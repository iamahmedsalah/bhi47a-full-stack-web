"use client";

import React, { useState } from "react";
import { Award, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  attendanceApi,
  type AttendanceRecordDto,
} from "../api/attendance-api";

interface AttendanceBonusDialogProps {
  record: AttendanceRecordDto | null;
  isArabic: boolean;
  onClose: () => void;
  onSaved: (updated: AttendanceRecordDto) => void;
}

const BONUS_PRESETS = [0.5, 1, 2, 3, 5] as const;

export function AttendanceBonusDialog({
  record,
  isArabic,
  onClose,
  onSaved,
}: AttendanceBonusDialogProps) {
  if (!record) return null;

  return (
    <AttendanceBonusDialogInner
      key={record._id}
      record={record}
      isArabic={isArabic}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function AttendanceBonusDialogInner({
  record,
  isArabic,
  onClose,
  onSaved,
}: {
  record: AttendanceRecordDto;
  isArabic: boolean;
  onClose: () => void;
  onSaved: (updated: AttendanceRecordDto) => void;
}) {
  const [pointsInput, setPointsInput] = useState<string>(() =>
    typeof record.bonusPoints === "number" && record.bonusPoints > 0
      ? String(record.bonusPoints)
      : "1",
  );
  const [reason, setReason] = useState<string>(record.bonusReason || "");
  const [saving, setSaving] = useState(false);

  const parsedPoints =
    pointsInput.trim() !== "" && Number.isFinite(Number(pointsInput))
      ? Number(pointsInput)
      : NaN;
  const isValid =
    Number.isFinite(parsedPoints) && parsedPoints >= 0 && parsedPoints <= 20;

  const handleSave = async (targetPoints?: number) => {
    const finalPoints =
      typeof targetPoints === "number" ? targetPoints : parsedPoints;
    if (!Number.isFinite(finalPoints) || finalPoints < 0 || finalPoints > 20) {
      return;
    }

    setSaving(true);
    try {
      const updated = await attendanceApi.updateRecordBonus(record._id, {
        bonusPoints: finalPoints,
        reason: finalPoints > 0 ? reason.trim() || undefined : undefined,
      });
      toast.success(
        finalPoints > 0
          ? isArabic
            ? `تمت إضافة +${finalPoints} درجات بونص للطالب ${record.studentName}`
            : `Awarded +${finalPoints} bonus marks to ${record.studentName}`
          : isArabic
            ? `تمت إزالة درجات البونص للطالب ${record.studentName}`
            : `Removed bonus marks for ${record.studentName}`,
      );
      onSaved(updated);
      onClose();
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          isArabic ? "فشل حفظ درجات البونص" : "Failed to save bonus marks",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(record)}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        flush
        dir={isArabic ? "rtl" : "ltr"}
        className="max-w-md"
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-squircle border border-amber-500/35 bg-amber-500/15 text-amber-300">
              <Award className="size-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-start">
                {isArabic
                  ? "درجات بونص الحضور (Bonus)"
                  : "Attendance Bonus Marks"}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground text-start">
                <span className="font-semibold text-foreground/90">
                  <bdi>{record.studentName}</bdi>
                </span>
                <span aria-hidden="true">·</span>
                <bdi
                  dir="ltr"
                  className="rounded-squircle border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground/85"
                >
                  {record.studentCode}
                </bdi>
                <span aria-hidden="true">·</span>
                <bdi dir="ltr" className="font-mono">
                  {record.courseCode}
                </bdi>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor="attendance-bonus-points"
                className="text-xs font-bold text-foreground"
              >
                {isArabic
                  ? "قيمة البونص (درجات مكافأة التفاعل)"
                  : "Bonus marks (participation reward)"}
              </Label>
              <span className="rounded-squircle border border-border/70 bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                0 – 20
              </span>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              {BONUS_PRESETS.map((val) => {
                const selected = Number(pointsInput) === val;
                return (
                  <button
                    key={val}
                    type="button"
                    disabled={saving}
                    onClick={() => setPointsInput(String(val))}
                    className={cn(
                      "min-h-10 min-w-11 rounded-squircle border px-3 font-mono text-xs font-bold transition-colors cursor-pointer",
                      selected
                        ? "border-amber-500/45 bg-amber-500/15 text-amber-300"
                        : "border-border/75 bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <bdi dir="ltr">+{val}</bdi>
                  </button>
                );
              })}

              {(record.bonusPoints ?? 0) > 0 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setPointsInput("0")}
                  className={cn(
                    "min-h-10 rounded-squircle border px-2.5 text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer",
                    Number(pointsInput) === 0
                      ? "border-rose-500/45 bg-rose-500/15 text-rose-300"
                      : "border-border/75 bg-card text-muted-foreground hover:text-rose-300",
                  )}
                >
                  <RotateCcw className="size-3" />
                  <span>{isArabic ? "0 (إزالة)" : "0 (Remove)"}</span>
                </button>
              )}
            </div>

            <Input
              id="attendance-bonus-points"
              dir="ltr"
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={pointsInput}
              disabled={saving}
              className="h-10 rounded-squircle text-left font-mono text-sm font-bold"
              onChange={(e) => setPointsInput(e.target.value)}
            />
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-2">
            <Label
              htmlFor="attendance-bonus-reason"
              className="text-xs font-bold text-foreground"
            >
              {isArabic
                ? "سبب منح البونص (اختياري — يظهر في السجل والتقرير)"
                : "Bonus reason (optional — shown in log & Excel)"}
            </Label>
            <Input
              id="attendance-bonus-reason"
              value={reason}
              maxLength={300}
              disabled={saving || Number(pointsInput) === 0}
              placeholder={
                isArabic
                  ? "مثال: مشاركة متميزة أو حل التمرين العملي في المحاضرة / السكشن"
                  : "e.g. Active participation or solving lab exercise"
              }
              className="h-10 rounded-squircle text-xs"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </DialogBody>

        <DialogFooter className="rtl:sm:justify-start">
          <Button
            type="button"
            disabled={saving || !isValid}
            onClick={() => void handleSave()}
            className="rounded-squircle gap-1.5 font-bold"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            <span>
              {Number(pointsInput) === 0
                ? isArabic
                  ? "تأكيد إزالة البونص"
                  : "Confirm Remove Bonus"
                : isArabic
                  ? `حفظ البونص (+${isValid ? parsedPoints : 0})`
                  : `Save Bonus (+${isValid ? parsedPoints : 0})`}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
            className="rounded-squircle"
          >
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
