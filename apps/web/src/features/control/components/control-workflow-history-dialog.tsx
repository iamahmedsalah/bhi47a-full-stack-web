"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileEdit,
  GitBranch,
  History,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
  Unlock,
  User,
  AlertTriangle,
} from "lucide-react";
import {
  formatStaffDisplayName,
  getStaffRoleLabel,
  type ControlComponentKey,
} from "@student-portal/shared";
import { getApiErrorMessage } from "@/lib/api";
import { CAIRO_TIME_ZONE } from "@/lib/cairo-time";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { controlKeys, getControlWorkflowHistory } from "../api";
import type { ControlWorkflowActor, ControlWorkflowStage } from "../types";

export interface WorkflowHistoryTarget {
  sheetId: string | null;
  slug?: string | null;
  courseId: string;
  courseCode: string;
  courseName: string;
  component: ControlComponentKey;
  workflowState?: string;
  locked: boolean;
}

interface ControlWorkflowHistoryDialogProps {
  target: WorkflowHistoryTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  canOpenSheet: boolean;
  onOpenSheet?: (target: WorkflowHistoryTarget) => void;
}

function formatCairoDateTime(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    timeZone: CAIRO_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatActorLine(actor: ControlWorkflowActor | null, locale: string) {
  if (!actor) return null;
  const displayName = formatStaffDisplayName(actor, locale);
  const roleLabel = getStaffRoleLabel(
    actor.staffType,
    actor.role,
    locale,
    actor.titlePrefix,
  );
  return { displayName: displayName || actor.name || "—", roleLabel };
}

export function ControlWorkflowHistoryDialog({
  target,
  open,
  onOpenChange,
  locale,
  canOpenSheet,
  onOpenSheet,
}: ControlWorkflowHistoryDialogProps) {
  const isAr = locale === "ar";
  const controlText = useTranslations("control");
  const releaseText = useTranslations("controlRelease");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: controlKeys.workflowHistory(target?.sheetId ?? ""),
    queryFn: () => getControlWorkflowHistory(target!.sheetId!),
    enabled: open && Boolean(target?.sheetId),
    staleTime: 15_000,
  });

  const stageTitle = (key: ControlWorkflowStage["key"]) => {
    switch (key) {
      case "DRAFT":
        return isAr ? "مسودة / قيد الرصد" : "Draft / Grade Entry";
      case "IN_REVIEW":
        return isAr ? "قيد المراجعة" : "In Review";
      case "PENDING_APPROVAL":
        return isAr ? "بانتظار الاعتماد" : "Awaiting Approval";
      case "APPROVED":
        return isAr ? "معتمد نهائياً" : "Approved";
    }
  };

  const actionLabel = (action: string) => {
    if (action === "OPENED") {
      return isAr ? "فتح كشف الرصد" : "Sheet Opened";
    }
    try {
      return controlText(`auditActions.${action}`);
    } catch {
      return action;
    }
  };

  const actionVariant = (action: string) => {
    switch (action) {
      case "APPROVE":
      case "PUBLISH":
        return "success" as const;
      case "SUBMIT":
      case "SUBMIT_APPROVAL":
        return "warning" as const;
      case "RETURN":
      case "LOCK":
      case "HIDE":
        return "danger" as const;
      case "OPENED":
      case "UNLOCK":
      case "REOPEN":
      case "GRACE":
        return "info" as const;
      default:
        return "neutral" as const;
    }
  };

  const defaultPendingStages: ControlWorkflowStage[] = [
    { key: "DRAFT", status: "pending", actor: null, at: null, note: null },
    { key: "IN_REVIEW", status: "pending", actor: null, at: null, note: null },
    {
      key: "PENDING_APPROVAL",
      status: "pending",
      actor: null,
      at: null,
      note: null,
    },
    { key: "APPROVED", status: "pending", actor: null, at: null, note: null },
  ];

  const stages = data?.stages ?? defaultPendingStages;
  const activeState = data?.workflowState ?? target?.workflowState;
  const isLocked = data?.locked ?? target?.locked ?? false;

  const currentBadgeVariant =
    !target?.sheetId
      ? ("neutral" as const)
      : activeState === "APPROVED"
        ? ("success" as const)
        : activeState === "RETURNED"
          ? ("danger" as const)
          : activeState === "IN_REVIEW" || activeState === "PENDING_APPROVAL"
            ? ("warning" as const)
            : ("info" as const);

  const currentBadgeLabel = !target?.sheetId
    ? isAr
      ? "لم يبدأ الرصد"
      : "Not Started"
    : activeState && activeState !== "DRAFT"
      ? controlText(`workflow.${activeState}`)
      : isAr
        ? "مسودة · قيد الرصد"
        : "Draft · Entering";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="max-h-[88vh] overflow-y-auto sm:max-w-2xl rounded-2xl border-border/80 bg-card/95 p-6 backdrop-blur-xl"
      >
        <DialogHeader className="text-start space-y-2 border-b border-border/60 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pe-6">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-squircle border border-primary/25 bg-primary/10 text-primary">
                <GitBranch className="h-4 w-4" />
              </span>
              <span>
                {isAr
                  ? "مراحل حالة الرصد والاعتماد"
                  : "Grading Workflow Stages & History"}
              </span>
            </DialogTitle>
            <div className="flex items-center gap-1.5">
              <StatusBadge
                label={currentBadgeLabel}
                variant={currentBadgeVariant}
              />
              {target?.sheetId && (
                <StatusBadge
                  label={
                    isLocked
                      ? isAr
                        ? "مغلق"
                        : "Locked"
                      : isAr
                        ? "مفتوح"
                        : "Open"
                  }
                  variant={isLocked ? "warning" : "success"}
                />
              )}
            </div>
          </div>
          {target && (
            <DialogDescription className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground text-start">
              <span className="inline-flex items-center rounded-squircle border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
                <bdi dir="ltr">{target.courseCode}</bdi>
              </span>
              <span className="font-semibold text-foreground">
                {target.courseName}
              </span>
              <span aria-hidden="true">·</span>
              <span>{releaseText(target.component)}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        {!target?.sheetId ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-dashed border-border/80 bg-secondary/20 p-5 text-center space-y-2">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-squircle border border-primary/20 bg-primary/10 text-primary">
                <FileEdit className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-foreground">
                {isAr
                  ? "لم يتم فتح كشف الرصد لهذا المقرر بعد"
                  : "Grade sheet has not been opened yet"}
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                {isAr
                  ? "بمجرد فتح الكشف وبدء رصد الدرجات، سيتم تتبع كل مرحلة (مسودة، مراجعة، اعتماد) مع اسم المسؤول وتوقيت كل خطوة هنا تلقائياً."
                  : "Once the sheet is opened and grading begins, every stage (Draft, Review, Approval) with its responsible actor and timestamp will be tracked here."}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {defaultPendingStages.map((stage, idx) => (
                <div
                  key={stage.key}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/20 p-3 text-start"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-squircle border border-border bg-card font-mono text-xs font-bold text-muted-foreground">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">
                      {stageTitle(stage.key)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {isAr ? "لم تبدأ بعد" : "Not started yet"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs">
              {isAr
                ? "جارٍ تحميل مراحل الرصد وسجل المسؤولين..."
                : "Loading workflow stages and actor history..."}
            </span>
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs space-y-2"
          >
            <p className="font-semibold text-rose-400">
              {getApiErrorMessage(error)}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-squircle"
              onClick={() => void refetch()}
            >
              {controlText("retry")}
            </Button>
          </div>
        ) : (
          <div className="space-y-5 py-1">
            {/* 4-Stage Milestone Overview */}
            <div className="space-y-2.5">
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>
                  {isAr ? "خريطة مراحل الاعتماد" : "Workflow Stage Progress"}
                </span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {stages.map((stage, idx) => {
                  const actorInfo = formatActorLine(stage.actor, locale);
                  const timestamp = formatCairoDateTime(stage.at, locale);
                  const isCompleted = stage.status === "completed";
                  const isActive = stage.status === "active";
                  const isReturned = stage.status === "returned";

                  return (
                    <div
                      key={stage.key}
                      className={cn(
                        "rounded-xl border p-3.5 text-start transition-colors space-y-2",
                        isCompleted
                          ? "border-emerald-500/30 bg-emerald-500/8"
                          : isReturned
                            ? "border-rose-500/35 bg-rose-500/8"
                            : isActive
                              ? "border-primary/40 bg-primary/10"
                              : "border-border/60 bg-secondary/20 opacity-80",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-squircle border text-xs font-bold",
                              isCompleted
                                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                                : isReturned
                                  ? "border-rose-500/40 bg-rose-500/15 text-rose-400"
                                  : isActive
                                    ? "border-primary/40 bg-primary/15 text-primary"
                                    : "border-border bg-card text-muted-foreground",
                            )}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : isReturned ? (
                              <RotateCcw className="h-3.5 w-3.5" />
                            ) : isActive ? (
                              <Clock className="h-3.5 w-3.5" />
                            ) : (
                              idx + 1
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">
                              {stageTitle(stage.key)}
                            </p>
                            <p className="text-[10px] font-semibold text-muted-foreground">
                              {isCompleted
                                ? isAr
                                  ? "مكتملة"
                                  : "Completed"
                                : isReturned
                                  ? isAr
                                    ? "معادة للتصحيح"
                                    : "Returned"
                                  : isActive
                                    ? isAr
                                      ? "المرحلة الحالية"
                                      : "Current Stage"
                                    : isAr
                                      ? "بانتظار الوصول"
                                      : "Pending"}
                            </p>
                          </div>
                        </div>
                      </div>

                      {actorInfo ? (
                        <div className="space-y-1 border-t border-border/50 pt-2 text-[11px]">
                          <div className="flex items-center gap-1.5 text-foreground font-semibold">
                            <User className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="truncate">
                              {actorInfo.displayName}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground">
                            <span className="rounded-squircle bg-secondary/70 px-1.5 py-0.5 font-medium">
                              {actorInfo.roleLabel}
                            </span>
                            {timestamp && (
                              <span className="font-mono">{timestamp}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
                          {isAr
                            ? "لم يُسجل إجراء في هذه المرحلة بعد"
                            : "No action recorded in this stage yet"}
                        </p>
                      )}

                      {stage.note && (
                        <div className="flex items-start gap-1.5 rounded-squircle border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span className="leading-snug">{stage.note}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Lock banner if locked */}
            {data?.locked && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-start">
                <Lock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-0.5">
                  <p className="font-bold text-amber-300">
                    {isAr
                      ? "الكشف مغلق حالياً ضد التعديل"
                      : "Sheet is currently locked"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {data.lockedBy
                      ? `${isAr ? "بواسطة:" : "By:"} ${formatActorLine(data.lockedBy, locale)?.displayName}`
                      : null}
                    {data.lockedAt
                      ? ` · ${formatCairoDateTime(data.lockedAt, locale)}`
                      : null}
                  </p>
                  {data.lockReason && (
                    <p className="text-[11px] text-amber-200/90">
                      {isAr ? "السبب: " : "Reason: "}
                      {data.lockReason}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Full Chronological Timeline */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <History className="h-4 w-4 text-primary" />
                  <span>
                    {isAr
                      ? "السجل الزمني لجميع المراحل والإجراءات"
                      : "Full Chronological Stage Timeline"}
                  </span>
                </h4>
                <span className="rounded-squircle bg-secondary/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                  {data?.events.length ?? 0}
                </span>
              </div>

              {!data?.events.length ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-secondary/15 p-4 text-center text-xs text-muted-foreground">
                  {isAr
                    ? "لا توجد انتقالات أو إجراءات مسجلة بعد — الكشف لا يزال في مرحلة المسودة."
                    : "No workflow transitions recorded yet — sheet is still in draft."}
                </div>
              ) : (
                <ol className="space-y-2">
                  {data.events.map((ev) => {
                    const actorInfo = formatActorLine(ev.actor, locale);
                    const ts = formatCairoDateTime(ev.at, locale);
                    return (
                      <li
                        key={ev.id}
                        className="rounded-xl border border-border/70 bg-secondary/20 p-3 text-xs text-start space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge
                              label={actionLabel(ev.action)}
                              variant={actionVariant(ev.action)}
                            />
                            {ev.fromState && ev.toState && (
                              <span className="inline-flex items-center gap-1.5 rounded-squircle border border-border/60 bg-card/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                <span>
                                  {controlText(`workflow.${ev.fromState}`)}
                                </span>
                                <ArrowRight
                                  className="h-3 w-3 shrink-0 text-primary rtl:rotate-180"
                                  aria-hidden="true"
                                />
                                <span className="font-semibold text-foreground">
                                  {controlText(`workflow.${ev.toState}`)}
                                </span>
                              </span>
                            )}
                          </div>
                          {ts && (
                            <span className="text-[11px] font-mono text-muted-foreground">
                              {ts}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            {ev.action === "LOCK" ? (
                              <Lock className="h-3.5 w-3.5 text-amber-400" />
                            ) : ev.action === "UNLOCK" ? (
                              <Unlock className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <User className="h-3.5 w-3.5 text-primary" />
                            )}
                            <span>{isAr ? "بواسطة:" : "By:"}</span>
                            <span className="font-semibold text-foreground">
                              {actorInfo?.displayName ?? "—"}
                            </span>
                            {actorInfo?.roleLabel && (
                              <span className="rounded-squircle bg-card border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {actorInfo.roleLabel}
                              </span>
                            )}
                          </span>
                        </div>

                        {ev.reason && (
                          <p className="rounded-squircle border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-300">
                            <span className="font-semibold">
                              {isAr ? "الملاحظة / السبب: " : "Note / Reason: "}
                            </span>
                            {ev.reason}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="mt-3 gap-2 border-t border-border/60 pt-3 sm:justify-start rtl:sm:justify-start">
          {target && canOpenSheet && onOpenSheet && (
            <Button
              type="button"
              size="sm"
              className="rounded-squircle gap-1.5 bg-primary text-xs font-semibold text-white hover:bg-primary-hover cursor-pointer"
              onClick={() => {
                onOpenChange(false);
                onOpenSheet(target);
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>
                {target.sheetId
                  ? isAr
                    ? "فتح شبكة رصد الدرجات"
                    : "Open Grade Sheet"
                  : isAr
                    ? "إنشاء وفتح الكشف"
                    : "Create & Open Sheet"}
              </span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-squircle text-xs cursor-pointer"
            onClick={() => onOpenChange(false)}
          >
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
