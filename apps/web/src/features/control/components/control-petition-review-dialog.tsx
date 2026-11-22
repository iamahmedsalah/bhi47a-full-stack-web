"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCheck2,
  Loader2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { ControlComponentKey, GradeStatus } from "@student-portal/shared";
import { getApiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
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
import { Textarea } from "@/components/ui/textarea";
import {
  controlKeys,
  decideControlPetition,
  markControlPetitionSeen,
} from "../api";
import type { ControlPetition } from "../types";

interface Props {
  petition: ControlPetition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  canApprove: boolean;
  currentUserId?: string;
  isAdmin?: boolean;
}

const COMPONENT_LABELS: Record<
  ControlComponentKey,
  { ar: string; en: string }
> = {
  midterm: { ar: "الميدتيرم", en: "Midterm" },
  coursework: { ar: "أعمال السنة", en: "Coursework" },
  final: { ar: "النهائي (الفاينل)", en: "Final" },
};

const STATUS_LABELS: Record<GradeStatus, { ar: string; en: string }> = {
  present: { ar: "حاضر", en: "Present" },
  absent: { ar: "غائب", en: "Absent" },
  excused: { ar: "بعذر", en: "Excused" },
  banned: { ar: "محروم", en: "Banned" },
  withheld: { ar: "محجوبة", en: "Withheld" },
  incomplete: { ar: "غير مكتمل", en: "Incomplete" },
};

export function ControlPetitionReviewDialog({
  petition,
  open,
  onOpenChange,
  locale,
  canApprove,
  currentUserId,
  isAdmin = false,
}: Props) {
  const isAr = locale === "ar";
  const queryClient = useQueryClient();

  const [decisions, setDecisions] = useState<
    Record<string, "APPROVED" | "REJECTED">
  >(() =>
    petition
      ? Object.fromEntries(
          petition.items.map((it) => [
            it.studentId,
            it.decision === "REJECTED" ? "REJECTED" : "APPROVED",
          ]),
        )
      : {},
  );
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    petition
      ? Object.fromEntries(
          petition.items.map((it) => [it.studentId, it.decisionNote ?? ""]),
        )
      : {},
  );
  const [reviewNote, setReviewNote] = useState(petition?.reviewNote ?? "");

  const isPending = petition?.status === "PENDING";
  const isSelfRequester =
    !isAdmin &&
    Boolean(
      currentUserId &&
        petition &&
        petition.requestedBy.id === String(currentUserId),
    );
  const canDecide = Boolean(isPending && canApprove && !isSelfRequester);

  const summaryCounts = useMemo(() => {
    if (!petition) return { approved: 0, rejected: 0 };
    let approved = 0;
    let rejected = 0;
    for (const item of petition.items) {
      const d = isPending
        ? (decisions[item.studentId] ?? "APPROVED")
        : item.decision;
      if (d === "APPROVED") approved += 1;
      else if (d === "REJECTED") rejected += 1;
    }
    return { approved, rejected };
  }, [petition, isPending, decisions]);

  const decideMutation = useMutation({
    mutationFn: async () => {
      if (!petition) return;
      return decideControlPetition(petition.id, {
        items: petition.items.map((item) => ({
          studentId: item.studentId,
          decision: decisions[item.studentId] ?? "APPROVED",
          decisionNote: notes[item.studentId]?.trim() || undefined,
        })),
        reviewNote: reviewNote.trim() || undefined,
      });
    },
    onSuccess: (updated) => {
      toast.success(
        isAr
          ? `تم حفظ قرار الالتماس بنجاح (موافقة: ${updated?.counts.approved ?? 0} · رفض: ${updated?.counts.rejected ?? 0}) وتحديث الدرجات تلقائيًا`
          : `Petition decisions saved (Approved: ${updated?.counts.approved ?? 0}, Rejected: ${updated?.counts.rejected ?? 0})`,
      );
      queryClient.invalidateQueries({ queryKey: controlKeys.all });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  const markSeenMutation = useMutation({
    mutationFn: async () => {
      if (!petition) return;
      return markControlPetitionSeen(petition.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: controlKeys.all });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  if (!petition) return null;

  const levelText = petition.courseLevel
    ? isAr
      ? `المستوى ${
          petition.courseLevel === "1"
            ? "الأول"
            : petition.courseLevel === "2"
              ? "الثاني"
              : petition.courseLevel === "3"
                ? "الثالث"
                : "الرابع"
        }`
      : `Level ${petition.courseLevel}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="sm:max-w-3xl rounded-2xl border-border/80 bg-card/95 backdrop-blur-xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <FileCheck2 className="size-5 text-primary" />
            <span>
              {isAr
                ? `تفاصيل طلب التماس الدرجات — ${COMPONENT_LABELS[petition.component].ar}`
                : `Grade Petition Review — ${COMPONENT_LABELS[petition.component].en}`}
            </span>
            {levelText && (
              <Badge
                variant="outline"
                className="rounded-squircle border-primary/30 bg-primary/10 text-primary text-xs"
              >
                {levelText}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            <bdi dir="ltr" className="font-mono font-bold text-foreground">
              {petition.courseCode}
            </bdi>{" "}
            —{" "}
            {isAr
              ? petition.courseNameAr || petition.courseName
              : petition.courseNameEn || petition.courseName}{" "}
            · <bdi dir="ltr">{petition.academicYear}</bdi>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Request Context Card */}
          <div className="rounded-xl border border-border/70 bg-background/40 p-3 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-muted-foreground">
                  {isAr ? "مقدّم الطلب:" : "Requested by:"}
                </span>{" "}
                <strong className="text-foreground">
                  {isAr
                    ? petition.requestedBy.nameAr ||
                      petition.requestedBy.name ||
                      "—"
                    : petition.requestedBy.name ||
                      petition.requestedBy.nameAr ||
                      "—"}
                </strong>
              </div>
              <div className="text-muted-foreground">
                {new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Africa/Cairo",
                }).format(new Date(petition.requestedAt))}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">
                {isAr ? "سبب الالتماس:" : "Petition reason:"}
              </span>{" "}
              <span className="font-medium text-foreground">
                {petition.reason}
              </span>
            </div>
            {petition.reviewedBy && (
              <div className="border-t border-border/50 pt-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-muted-foreground">
                    {isAr ? "تمت المراجعة بواسطة:" : "Reviewed by:"}
                  </span>{" "}
                  <strong className="text-foreground">
                    {isAr
                      ? petition.reviewedBy.nameAr ||
                        petition.reviewedBy.name ||
                        "—"
                      : petition.reviewedBy.name ||
                        petition.reviewedBy.nameAr ||
                        "—"}
                  </strong>
                  {petition.reviewNote && (
                    <span className="ms-2 text-muted-foreground">
                      ({petition.reviewNote})
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {isPending && isSelfRequester && canApprove && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle className="size-4 shrink-0" />
              <span>
                {isAr
                  ? "لا يمكنك اعتماد طلب الالتماس الذي قمت بتقديمه بنفسك (مبدأ فصل المهام). يجب أن يعتمده العميد أو مفوّض آخر."
                  : "You cannot approve your own petition request (separation of duties)."}
              </span>
            </div>
          )}

          {/* Quick Bulk Decision Buttons */}
          {canDecide && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-2.5">
              <span className="text-xs font-bold text-foreground">
                {isAr
                  ? `قرار المراجعة (${summaryCounts.approved} موافقة · ${summaryCounts.rejected} رفض):`
                  : `Decisions (${summaryCounts.approved} Approve · ${summaryCounts.rejected} Reject):`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-squircle text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15"
                  onClick={() =>
                    setDecisions(
                      Object.fromEntries(
                        petition.items.map((it) => [it.studentId, "APPROVED"]),
                      ),
                    )
                  }
                >
                  <CheckCircle2 className="size-3.5 me-1" />
                  {isAr ? "موافقة على الكل" : "Approve All"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-squircle text-xs border-rose-500/40 text-rose-400 hover:bg-rose-500/15"
                  onClick={() =>
                    setDecisions(
                      Object.fromEntries(
                        petition.items.map((it) => [it.studentId, "REJECTED"]),
                      ),
                    )
                  }
                >
                  <XCircle className="size-3.5 me-1" />
                  {isAr ? "رفض الكل" : "Reject All"}
                </Button>
              </div>
            </div>
          )}

          {/* Per-Student Items */}
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 custom-scroll">
            {petition.items.map((item) => {
              const activeDecision = isPending
                ? (decisions[item.studentId] ?? "APPROVED")
                : item.decision;
              const delta =
                item.currentScore != null && item.proposedScore != null
                  ? Math.round((item.proposedScore - item.currentScore) * 100) /
                    100
                  : null;

              return (
                <div
                  key={item.studentId}
                  className={cn(
                    "rounded-xl border p-3 space-y-2 transition-all",
                    activeDecision === "APPROVED"
                      ? "border-emerald-500/35 bg-emerald-500/5"
                      : activeDecision === "REJECTED"
                        ? "border-rose-500/35 bg-rose-500/5"
                        : "border-border/70 bg-background/40",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="rounded-squircle font-mono text-xs"
                      >
                        <bdi dir="ltr">{item.studentCode}</bdi>
                      </Badge>
                      <span className="text-xs font-bold text-foreground">
                        {isAr
                          ? item.studentNameAr || item.studentName
                          : item.studentName}
                      </span>
                    </div>

                    {/* Grade Before -> After */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-squircle border border-border/70 bg-card px-2 py-0.5 font-mono">
                        {item.currentScore != null
                          ? item.currentScore
                          : item.currentStatus
                            ? isAr
                              ? STATUS_LABELS[item.currentStatus].ar
                              : STATUS_LABELS[item.currentStatus].en
                            : isAr
                              ? "بلا رصد"
                              : "Unentered"}
                      </span>
                      <ArrowRight className="size-3.5 text-primary rtl:rotate-180" />
                      <span className="rounded-squircle border border-primary/40 bg-primary/15 px-2.5 py-0.5 font-mono font-bold text-primary">
                        {item.proposedScore != null
                          ? item.proposedScore
                          : isAr
                            ? STATUS_LABELS[item.proposedStatus].ar
                            : STATUS_LABELS[item.proposedStatus].en}
                      </span>
                      {delta !== null && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-squircle font-mono text-[11px]",
                            delta > 0
                              ? "border-emerald-500/40 text-emerald-400"
                              : "border-amber-500/40 text-amber-400",
                          )}
                        >
                          <bdi dir="ltr">
                            {delta > 0 ? `+${delta}` : String(delta)}
                          </bdi>
                        </Badge>
                      )}
                    </div>

                    {/* Per-Student Decision Controls or Badge */}
                    {canDecide ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setDecisions((prev) => ({
                              ...prev,
                              [item.studentId]: "APPROVED",
                            }))
                          }
                          className={cn(
                            "inline-flex items-center gap-1 rounded-squircle border px-2.5 py-1 text-xs font-bold transition-all cursor-pointer",
                            activeDecision === "APPROVED"
                              ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-xs"
                              : "border-border/60 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <CheckCircle2 className="size-3.5" />
                          <span>{isAr ? "موافقة" : "Approve"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDecisions((prev) => ({
                              ...prev,
                              [item.studentId]: "REJECTED",
                            }))
                          }
                          className={cn(
                            "inline-flex items-center gap-1 rounded-squircle border px-2.5 py-1 text-xs font-bold transition-all cursor-pointer",
                            activeDecision === "REJECTED"
                              ? "border-rose-500 bg-rose-500/20 text-rose-300 shadow-xs"
                              : "border-border/60 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <XCircle className="size-3.5" />
                          <span>{isAr ? "رفض" : "Reject"}</span>
                        </button>
                      </div>
                    ) : (
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-squircle text-xs font-bold",
                          item.decision === "APPROVED"
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                            : item.decision === "REJECTED"
                              ? "border-rose-500/40 bg-rose-500/15 text-rose-400"
                              : "border-amber-500/40 bg-amber-500/15 text-amber-400",
                        )}
                      >
                        {item.decision === "APPROVED" ? (
                          <CheckCircle2 className="size-3 me-1" />
                        ) : item.decision === "REJECTED" ? (
                          <XCircle className="size-3 me-1" />
                        ) : (
                          <Clock className="size-3 me-1" />
                        )}
                        {item.decision === "APPROVED"
                          ? isAr
                            ? "تمت الموافقة وتحديث الدرجة"
                            : "Approved & Applied"
                          : item.decision === "REJECTED"
                            ? isAr
                              ? "مرفوض"
                              : "Rejected"
                            : isAr
                              ? "قيد الانتظار"
                              : "Pending"}
                      </Badge>
                    )}
                  </div>

                  {item.studentReason && (
                    <p className="text-[11px] text-muted-foreground">
                      {isAr ? "ملاحظة الطالب:" : "Student note:"}{" "}
                      <span className="text-foreground">
                        {item.studentReason}
                      </span>
                    </p>
                  )}

                  {canDecide ? (
                    <Input
                      value={notes[item.studentId] ?? ""}
                      onChange={(e) =>
                        setNotes((prev) => ({
                          ...prev,
                          [item.studentId]: e.target.value,
                        }))
                      }
                      placeholder={
                        isAr
                          ? "ملاحظة القرار لهذا الطالب (اختياري)..."
                          : "Decision note for this student (optional)..."
                      }
                      className="h-7 rounded-squircle text-xs"
                    />
                  ) : (
                    item.decisionNote && (
                      <p className="text-[11px] text-muted-foreground">
                        {isAr ? "ملاحظة المعتمد:" : "Approver note:"}{" "}
                        <span className="text-foreground">
                          {item.decisionNote}
                        </span>
                      </p>
                    )
                  )}
                </div>
              );
            })}
          </div>

          {canDecide && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isAr
                  ? "ملاحظة عامة على قرار الالتماس (اختياري)"
                  : "Overall review note (optional)"}
              </Label>
              <Textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                maxLength={500}
                placeholder={
                  isAr
                    ? "تظهر هذه الملاحظة لرئيس الكنترول ومقدّم الطلب وتُسجل في الأرشيف..."
                    : "Visible to the Control Head / requester..."
                }
                className="min-h-[60px] rounded-squircle text-xs resize-none"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-start rtl:sm:justify-start">
          {canDecide && (
            <Button
              type="button"
              className="rounded-squircle gap-1.5"
              disabled={decideMutation.isPending}
              onClick={() => decideMutation.mutate()}
            >
              {decideMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              <span>
                {isAr
                  ? "تأكيد القرارات وتطبيق الدرجات المعتمدة"
                  : "Confirm Decisions & Apply Approved Grades"}
              </span>
            </Button>
          )}
          {!isPending &&
            petition.requesterSeenAt === null &&
            (isAdmin ||
              (currentUserId &&
                petition.requestedBy.id === String(currentUserId))) && (
              <Button
                type="button"
                variant="default"
                className="rounded-squircle gap-1.5"
                disabled={markSeenMutation.isPending}
                onClick={() => markSeenMutation.mutate()}
              >
                {markSeenMutation.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                <span>
                  {isAr ? "تأكيد الاطلاع على نتيجة الالتماس" : "Mark Outcome as Seen"}
                </span>
              </Button>
            )}
          <Button
            type="button"
            variant="outline"
            className="rounded-squircle"
            onClick={() => onOpenChange(false)}
          >
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
