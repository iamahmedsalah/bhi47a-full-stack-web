"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";
import { CAIRO_TIME_ZONE } from "@/lib/cairo-time";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { controlKeys, listControlAudit } from "../api";
import type { ControlAuditRow } from "../types";

interface ControlAuditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheetId: string;
  studentId?: string | null;
  studentLabel?: string | null;
  locale: string;
}

function formatCairoTimestamp(value: string, locale: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    timeZone: CAIRO_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatSnapshot(
  snap: ControlAuditRow["oldValue"],
  isAr: boolean,
  workflowLabel?: (state: string) => string,
): string {
  if (!snap) return isAr ? "لم يُرصد (—)" : "Not entered (—)";
  if (snap.workflowState)
    return workflowLabel?.(snap.workflowState) ?? snap.workflowState;
  if (snap.attendanceMark != null && snap.quizzesMark != null)
    return `${snap.attendanceMark} + ${snap.quizzesMark} = ${snap.score}`;
  if (snap.status && snap.status !== "present") {
    const labelsAr: Record<string, string> = {
      absent: "غائب",
      banned: "محروم",
      excused: "غائب بعذر",
      withheld: `محجوب (${snap.score ?? "—"})`,
      incomplete: "غير مكتمل",
    };
    const labelsEn: Record<string, string> = {
      absent: "Absent",
      banned: "Banned",
      excused: "Excused",
      withheld: `Withheld (${snap.score ?? "—"})`,
      incomplete: "Incomplete",
    };
    return (
      (isAr ? labelsAr[snap.status] : labelsEn[snap.status]) ?? snap.status
    );
  }
  return snap.score !== null && snap.score !== undefined
    ? String(snap.score)
    : "—";
}

export function ControlAuditDrawer({
  open,
  onOpenChange,
  sheetId,
  studentId,
  studentLabel,
  locale,
}: ControlAuditDrawerProps) {
  const isAr = locale === "ar";

  const { data, isLoading } = useQuery({
    queryKey: controlKeys.audit(sheetId, {
      page: 1,
      limit: 50,
      studentId: studentId || undefined,
    }),
    queryFn: () =>
      listControlAudit(sheetId, {
        page: 1,
        limit: 50,
        studentId: studentId || undefined,
      }),
    enabled: open && Boolean(sheetId),
  });

  const t = useTranslations("control");
  const actionLabel = (action: ControlAuditRow["action"]) =>
    t(`auditActions.${action}`);

  const actionVariant = (action: ControlAuditRow["action"]) => {
    switch (action) {
      case "CREATE":
        return "success" as const;
      case "UPDATE":
        return "info" as const;
      case "CLEAR":
      case "UNLOCK":
        return "warning" as const;
      case "LOCK":
        return "danger" as const;
      default:
        return "neutral" as const;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isAr ? "left" : "right"}
        dir={isAr ? "rtl" : "ltr"}
        className="w-full sm:max-w-md overflow-y-auto bg-card/95 border-border/80 backdrop-blur-xl"
      >
        <SheetHeader className="text-start">
          <SheetTitle className="flex items-center gap-2 text-lg font-bold">
            <History className="h-5 w-5 text-primary" />
            <span>
              {isAr ? "سجل تدقيق التعديلات" : "Grade Change Audit Log"}
            </span>
          </SheetTitle>
          <SheetDescription className="text-start">
            {studentLabel
              ? isAr
                ? `السجل الكامل للطالب: ${studentLabel}`
                : `Full change history for: ${studentLabel}`
              : isAr
                ? "جميع عمليات الرصد والتعديل والقفل على هذا الكشف"
                : "All grade entries, edits, and lock events for this sheet"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !data?.items?.length ? (
            <div className="rounded-xl border border-border/60 bg-surface/30 p-6 text-center text-xs text-muted-foreground">
              {isAr
                ? "لا توجد عمليات مسجلة بعد."
                : "No audit events recorded yet."}
            </div>
          ) : (
            data.items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border/70 bg-surface/40 p-3.5 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge
                    label={actionLabel(item.action)}
                    variant={actionVariant(item.action)}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {formatCairoTimestamp(item.at, locale)}
                  </span>
                </div>

                {item.studentName && (
                  <div className="font-semibold text-foreground">
                    {item.studentName}{" "}
                    {item.studentCode && (
                      <bdi className="font-mono text-muted-foreground">
                        ({item.studentCode})
                      </bdi>
                    )}
                  </div>
                )}

                {(item.action === "CREATE" ||
                  item.action === "UPDATE" ||
                  item.action === "CLEAR") && (
                  <div className="flex items-center gap-2 rounded-squircle border border-border/60 bg-background/60 px-2.5 py-1.5 font-mono text-xs">
                    <span className="text-muted-foreground">
                      {formatSnapshot(item.oldValue, isAr, (state) =>
                        t(`workflow.${state}`),
                      )}
                    </span>
                    <span className="text-primary font-bold">→</span>
                    <span className="font-semibold text-foreground">
                      {formatSnapshot(item.newValue, isAr, (state) =>
                        t(`workflow.${state}`),
                      )}
                    </span>
                  </div>
                )}

                {item.reason && (
                  <div className="text-xs text-amber-300/90">
                    <span className="font-semibold">
                      {isAr ? "السبب: " : "Reason: "}
                    </span>
                    {item.reason}
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                  <span>
                    {isAr ? "بواسطة: " : "By: "}
                    <span className="font-medium text-foreground">
                      {item.actorName ?? "—"}
                    </span>
                  </span>
                  <span className="font-mono">{item.source}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
