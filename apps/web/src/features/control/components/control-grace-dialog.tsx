"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpToLine,
  Check,
  CheckCircle2,
  FileCheck2,
  Info,
  Loader2,
  Percent,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { HelpNote } from "@/components/ui/help-note";
import { getApiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  getControlSheet,
  getControlGraceStatus,
  previewControlGrace,
  applyControlGrace,
  type ControlGraceMode,
  type GracePreview,
  type GraceStatus,
} from "../api";
import type { ControlSheetDetails, WorkbookRow } from "../types";

type PassRateTransition = {
  threshold: number;
  total: number;
  passedBefore: number;
  passedAfter: number;
  ratioBefore: number;
  ratioAfter: number;
};

type GraceStage = 1 | 2 | 3;

function GraceStepIndicator({
  step,
  ar,
  busy,
  onJumpToConfigure,
}: {
  step: GraceStage;
  ar: boolean;
  busy: boolean;
  onJumpToConfigure: () => void;
}) {
  const steps: Array<{ id: GraceStage; label: string }> = [
    { id: 1, label: ar ? "إعداد الرأفة" : "Configure" },
    { id: 2, label: ar ? "معاينة التأثير" : "Preview impact" },
    { id: 3, label: ar ? "اكتمال التنفيذ" : "Completed" },
  ];

  return (
    <nav
      aria-label={ar ? "مراحل درجات الرأفة" : "Grace marks steps"}
      className="mt-4 flex items-center gap-1.5 sm:gap-2"
    >
      {steps.map((item, idx) => {
        const isDone = step > item.id;
        const isActive = step === item.id;
        const canClick = item.id === 1 && step === 2 && !busy;

        const pillContent = (
          <>
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                isDone
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : isActive
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                    : "border border-border/80 bg-muted/40 text-muted-foreground",
              )}
            >
              {isDone ? <Check className="size-3 stroke-[2.75]" /> : item.id}
            </span>
            <span
              className={cn(
                "truncate text-[11px] sm:text-xs font-semibold transition-colors",
                isActive
                  ? "text-foreground"
                  : isDone
                    ? "text-emerald-400/90"
                    : "text-muted-foreground",
              )}
            >
              {item.label}
            </span>
          </>
        );

        return (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-1.5 sm:gap-2",
              idx < steps.length - 1 ? "flex-1 min-w-0" : "shrink-0",
            )}
          >
            {canClick ? (
              <button
                type="button"
                onClick={onJumpToConfigure}
                className="flex items-center gap-1.5 rounded-squircle px-1.5 py-0.5 transition-colors hover:bg-muted/60 cursor-pointer min-w-0"
              >
                {pillContent}
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-1 py-0.5 min-w-0">
                {pillContent}
              </div>
            )}

            {idx < steps.length - 1 && (
              <div
                aria-hidden="true"
                className={cn(
                  "h-px flex-1 min-w-3 transition-colors",
                  step > item.id ? "bg-emerald-500/45" : "bg-border/70",
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

function PassRateImpactCard({
  transition,
  mode,
  isVerified,
  ar,
  percentFormatter,
}: {
  transition: PassRateTransition;
  mode: ControlGraceMode;
  isVerified: boolean;
  ar: boolean;
  percentFormatter: Intl.NumberFormat;
}) {
  const text = (arabic: string, english: string) => (ar ? arabic : english);
  const ratioDelta = transition.ratioAfter - transition.ratioBefore;
  const studentsDelta = transition.passedAfter - transition.passedBefore;
  const isDecrease = ratioDelta < 0;
  const isIncrease = ratioDelta > 0;

  const beforePct = Math.max(0, Math.min(100, transition.ratioBefore * 100));
  const afterPct = Math.max(0, Math.min(100, transition.ratioAfter * 100));
  const minPct = Math.min(beforePct, afterPct);
  const diffPct = Math.abs(afterPct - beforePct);

  return (
    <div
      role="region"
      aria-label={text(
        "تأثير درجات الرأفة على نسبة النجاح",
        "Grace marks pass rate impact",
      )}
      className={cn(
        "rounded-xl border p-4 space-y-3.5 transition-colors",
        isDecrease
          ? "border-amber-500/30 bg-secondary/20"
          : "border-border/60 bg-secondary/20",
      )}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
          <span className="flex size-5 items-center justify-center rounded-squircle border border-border/70 bg-card text-primary">
            <Percent className="size-3" />
          </span>
          {text("تغير نسبة نجاح الميدتيرم", "Midterm pass rate change")}
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-squircle border px-2 py-0.5 text-[11px] font-semibold",
              isVerified
                ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-400"
                : "border-border/70 bg-card text-primary",
            )}
          >
            {isVerified ? (
              <>
                <CheckCircle2 className="size-3" />
                {text("فحص رسمي معتمد", "Verified preview")}
              </>
            ) : (
              text("محاكاة فورية", "Live estimate")
            )}
          </span>

          <span className="rounded-squircle border border-border/70 bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {text(
              `حد النجاح > ${transition.threshold} درجة`,
              `Pass mark > ${transition.threshold}`,
            )}
          </span>
        </div>
      </div>

      {/* 3-Column Comparison: Before | Delta | After */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2.5">
        {/* Before */}
        <div className="rounded-xl border border-border/60 bg-card/85 px-3.5 py-2.5 text-center">
          <span className="block text-[11px] font-medium text-muted-foreground">
            {text("الحالية (قبل)", "Current (before)")}
          </span>
          <bdi className="mt-0.5 block text-xl font-extrabold tabular-nums tracking-tight text-foreground">
            {percentFormatter.format(transition.ratioBefore)}
          </bdi>
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <bdi className="font-mono font-semibold tabular-nums text-foreground/80">
              {transition.passedBefore} / {transition.total}
            </bdi>
            <span>{text("ناجح", "passed")}</span>
          </span>
        </div>

        {/* Center Delta Column */}
        <div className="flex sm:flex-col items-center justify-center gap-1.5 px-1">
          <ArrowRight
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 rtl:rotate-180",
              isDecrease
                ? "text-amber-400"
                : isIncrease
                  ? "text-primary"
                  : "text-muted-foreground",
            )}
          />
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-squircle border px-2.5 py-1 text-xs font-bold tabular-nums",
              isDecrease
                ? "border-amber-500/35 bg-amber-500/15 text-amber-300"
                : isIncrease
                  ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-400"
                  : "border-border/70 bg-card text-muted-foreground",
            )}
          >
            {isDecrease ? (
              <TrendingDown className="size-3.5 shrink-0" />
            ) : (
              <TrendingUp className="size-3.5 shrink-0" />
            )}
            <bdi>
              {ratioDelta >= 0 ? "+" : ""}
              {percentFormatter.format(ratioDelta)}
            </bdi>
          </span>
          <span
            className={cn(
              "text-[11px] font-semibold tabular-nums",
              isDecrease
                ? "text-amber-300/90"
                : isIncrease
                  ? "text-emerald-400/90"
                  : "text-muted-foreground",
            )}
          >
            (
            <bdi>
              {studentsDelta >= 0 ? "+" : ""}
              {studentsDelta}
            </bdi>{" "}
            {text("طالب", "students")})
          </span>
        </div>

        {/* After */}
        <div
          className={cn(
            "rounded-xl border px-3.5 py-2.5 text-center transition-colors",
            isDecrease
              ? "border-amber-500/35 bg-amber-500/[0.08]"
              : isIncrease
                ? "border-primary/35 bg-primary/[0.09]"
                : "border-border/70 bg-card/85",
          )}
        >
          <span
            className={cn(
              "block text-[11px] font-semibold",
              isDecrease
                ? "text-amber-300"
                : isIncrease
                  ? "text-primary"
                  : "text-muted-foreground",
            )}
          >
            {mode === "reset"
              ? text("بعد الإرجاع", "After reset")
              : text("بعد التطبيق", "After apply")}
          </span>
          <bdi
            className={cn(
              "mt-0.5 block text-xl font-extrabold tabular-nums tracking-tight",
              isDecrease
                ? "text-amber-300"
                : isIncrease
                  ? "text-primary"
                  : "text-foreground",
            )}
          >
            {percentFormatter.format(transition.ratioAfter)}
          </bdi>
          <span
            className={cn(
              "mt-0.5 inline-flex items-center gap-1 text-[11px]",
              isDecrease
                ? "text-amber-200/80"
                : isIncrease
                  ? "text-primary/85"
                  : "text-muted-foreground",
            )}
          >
            <bdi className="font-mono font-semibold tabular-nums">
              {transition.passedAfter} / {transition.total}
            </bdi>
            <span>{text("ناجح", "passed")}</span>
          </span>
        </div>
      </div>

      {/* Dual-Layer Visual Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-foreground/45" />
              {text("نسبة النجاح الحالية", "Current pass rate")}
            </span>
            {diffPct > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    isDecrease ? "bg-amber-400" : "bg-emerald-400",
                  )}
                />
                {isDecrease
                  ? text("الانخفاض بعد الإرجاع", "Reduction after reset")
                  : text("الزيادة المتوقعة", "Expected gain")}
              </span>
            )}
          </div>
          <bdi dir="ltr" className="font-mono tabular-nums opacity-75">
            0% — 100%
          </bdi>
        </div>

        <div
          aria-hidden="true"
          className="relative h-2.5 w-full overflow-hidden rounded-full border border-border/60 bg-card/90"
        >
          {/* Base bar */}
          <div
            className={cn(
              "absolute inset-y-0 start-0 transition-all duration-300",
              isDecrease ? "bg-primary/70" : "bg-foreground/35",
            )}
            style={{ width: `${minPct}%` }}
          />
          {/* Delta segment */}
          {diffPct > 0 && (
            <div
              className={cn(
                "absolute inset-y-0 transition-all duration-300",
                isDecrease
                  ? "bg-amber-400/55"
                  : "bg-gradient-to-r from-primary to-emerald-400",
              )}
              style={{
                insetInlineStart: `${minPct}%`,
                width: `${diffPct}%`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function ControlGraceDialog({
  detail,
  locale,
  rows = [],
  passThreshold,
  onClose,
  onSaved,
}: {
  detail: ControlSheetDetails;
  locale: string;
  rows?: WorkbookRow[];
  passThreshold?: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const ar = locale === "ar";
  const text = (arabic: string, english: string) => (ar ? arabic : english);

  const [status, setStatus] = useState<GraceStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const activeGrace = status?.activeGrace ?? detail.sheet.grace ?? null;

  const [mode, setMode] = useState<ControlGraceMode>(() =>
    detail.sheet.grace ? "adjust" : "initial",
  );
  const [amount, setAmount] = useState(() =>
    detail.sheet.grace ? String(detail.sheet.grace.amount) : "",
  );
  const [includeNewStudents, setIncludeNewStudents] = useState(true);
  const [preview, setPreview] = useState<GracePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [appliedMessage, setAppliedMessage] = useState("");
  const operation = useRef(crypto.randomUUID());
  const guard = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getControlGraceStatus(detail.sheet.id)
      .then((res) => {
        if (cancelled) return;
        setStatus(res);
        if (res.activeGrace) {
          const nextMode: ControlGraceMode =
            res.eligibleNewCount > 0 ? "new_only" : "adjust";
          setMode(nextMode);
          setAmount(String(res.activeGrace.amount));
        } else {
          setMode("initial");
          setAmount("");
        }
      })
      .catch(() => {
        // Fallback smoothly to detail.sheet.grace if status endpoint is unavailable
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail.sheet.id]);

  const resolvedThreshold =
    passThreshold ??
    detail.sheet.passThreshold ??
    detail.rules.passThreshold ??
    18;

  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale],
  );

  const quickPresets = useMemo(() => {
    const candidates = [1, 2, 3, 5];
    const step = detail.rules.step > 0 ? detail.rules.step : 1;
    return candidates.filter((val) => {
      if (val > detail.rules.max) return false;
      const ratio = val / step;
      return Math.abs(ratio - Math.round(ratio)) < 1e-6;
    });
  }, [detail.rules.max, detail.rules.step]);

  const resetPreviewAndOp = () => {
    setPreview(null);
    setError("");
    setAppliedMessage("");
    operation.current = crypto.randomUUID();
  };

  const selectMode = (nextMode: ControlGraceMode) => {
    setMode(nextMode);
    if (nextMode === "reset") {
      setAmount("0");
    } else if (activeGrace && nextMode === "new_only") {
      setAmount(String(activeGrace.amount));
    } else if (activeGrace && nextMode === "adjust" && amount === "0") {
      setAmount(String(activeGrace.amount));
    }
    resetPreviewAndOp();
  };

  // Compute live pass-rate transition (from -> to) accurately using originalGrade when available
  const livePassRateTransition = useMemo<PassRateTransition | null>(() => {
    if (preview?.passRate) {
      return {
        threshold: preview.passRate.threshold,
        total: preview.passRate.total,
        passedBefore: preview.passRate.passedBefore,
        passedAfter: preview.passRate.passedAfter,
        ratioBefore: preview.passRate.ratioBefore,
        ratioAfter: preview.passRate.ratioAfter,
      };
    }

    if (rows.length === 0) return null;

    const parsedAmount =
      mode === "reset"
        ? 0
        : amount !== "" && Number.isFinite(Number(amount)) && Number(amount) > 0
          ? Math.min(detail.rules.max, Number(amount))
          : null;

    let passedBefore = 0;
    let passedAfter = 0;

    for (const row of rows) {
      const mark = row.components.midterm;
      if (mark?.status !== "present" || mark.score == null) continue;
      const beforeScore = mark.score;
      const canReceiveGrace = !row.tuition?.isBlocked && !row.notRegistered;
      const isManuallyEdited = Boolean(
        mark.grace && mark.rev !== mark.grace.appliedRev,
      );

      let afterScore = beforeScore;
      if (canReceiveGrace && parsedAmount !== null) {
        if (mode === "initial") {
          afterScore = Math.min(detail.rules.max, beforeScore + parsedAmount);
        } else if (mode === "new_only") {
          if (!mark.grace) {
            afterScore = Math.min(detail.rules.max, beforeScore + parsedAmount);
          }
        } else if (mode === "adjust") {
          if (mark.grace && !isManuallyEdited) {
            afterScore = Math.min(
              detail.rules.max,
              mark.grace.originalGrade + parsedAmount,
            );
          } else if (!mark.grace && includeNewStudents) {
            afterScore = Math.min(detail.rules.max, beforeScore + parsedAmount);
          }
        } else if (mode === "reset") {
          if (mark.grace && !isManuallyEdited) {
            afterScore = mark.grace.originalGrade;
          }
        }
      }

      if (beforeScore > resolvedThreshold) passedBefore += 1;
      if (afterScore > resolvedThreshold) passedAfter += 1;
    }

    return {
      threshold: resolvedThreshold,
      total: rows.length,
      passedBefore,
      passedAfter,
      ratioBefore: rows.length > 0 ? passedBefore / rows.length : 0,
      ratioAfter: rows.length > 0 ? passedAfter / rows.length : 0,
    };
  }, [
    amount,
    detail.rules.max,
    includeNewStudents,
    mode,
    preview?.passRate,
    resolvedThreshold,
    rows,
  ]);

  const canPreview =
    !busy &&
    !statusLoading &&
    (mode === "reset"
      ? Boolean(activeGrace) && !status?.legacyGrace
      : Boolean(amount) &&
        Number.isFinite(Number(amount)) &&
        Number(amount) > 0 &&
        Number(amount) <= detail.rules.max &&
        !(mode === "adjust" && status?.legacyGrace));

  const currentStage: GraceStage = appliedMessage ? 3 : preview ? 2 : 1;

  const excludedTotal = preview
    ? preview.counts.atMaximum +
      preview.counts.absentOrBanned +
      preview.counts.held +
      preview.counts.unentered +
      preview.counts.other +
      (preview.modeStats?.alreadyGraced ?? 0) +
      (preview.modeStats?.manuallyModified ?? 0)
    : 0;

  const exclusionChips = useMemo(() => {
    if (!preview) return [];
    const items: Array<{ label: string; value: number; highlight?: "amber" | "sky" }> = [
      {
        label: ar ? "عند الحد الأقصى بالفعل" : "Already at maximum",
        value: preview.counts.atMaximum,
      },
      {
        label: ar ? "لم تُرصد" : "Unentered",
        value: preview.counts.unentered,
      },
      {
        label: ar ? "غائب أو محروم" : "Absent or banned",
        value: preview.counts.absentOrBanned,
      },
      {
        label: ar ? "محجوب ماليًا" : "Tuition hold",
        value: preview.counts.held,
      },
    ];

    if (preview.modeStats?.alreadyGraced) {
      items.push({
        label: ar ? "أخذوا الرأفة سابقًا (لن تتكرر)" : "Already graced (skipped)",
        value: preview.modeStats.alreadyGraced,
        highlight: "sky",
      });
    }

    if (preview.modeStats?.manuallyModified) {
      items.push({
        label: ar ? "عُدِّلت يدويًا بعد الرأفة (محمية)" : "Manually edited (protected)",
        value: preview.modeStats.manuallyModified,
        highlight: "amber",
      });
    }

    items.push({
      label: ar ? "حالات أخرى مستبعدة" : "Other excluded",
      value: preview.counts.other,
    });

    return items;
  }, [preview, ar]);

  const handlePreview = async () => {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      const latest = await getControlSheet(detail.sheet.id);
      const numericAmount = mode === "reset" ? 0 : Number(amount);
      setPreview(
        await previewControlGrace(
          detail.sheet.id,
          numericAmount,
          latest.sheet.revision,
          {
            mode,
            ...(mode === "adjust" ? { includeNewStudents } : {}),
          },
        ),
      );
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
      guard.current = false;
    }
  };

  const handleConfirm = async () => {
    if (!preview || guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      await applyControlGrace(detail.sheet.id, preview, operation.current, {
        mode,
        ...(mode === "adjust" ? { includeNewStudents } : {}),
      });
      setAppliedMessage(
        mode === "reset"
          ? text(
              "تم إلغاء الرأفة واستعادة الدرجات الأصلية بنجاح وحفظها في سجل التدقيق.",
              "Grace marks reset and original grades restored in the audit log.",
            )
          : mode === "new_only"
            ? text(
                "تمت إضافة الرأفة للطلاب الجدد فقط بنجاح وحفظها في سجل التدقيق.",
                "Grace marks applied to newly entered students only and logged.",
              )
            : mode === "adjust"
              ? text(
                  "تم تعديل مقدار الرأفة بنجاح وحفظه في سجل التدقيق.",
                  "Grace marks adjusted and recorded in the audit log.",
                )
              : text(
                  "تمت إضافة الرأفة وحفظها في سجل التدقيق.",
                  "Grace marks applied and recorded in the audit log.",
                ),
      );
      await onSaved();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
      guard.current = false;
    }
  };

  const modeSummaryLabel =
    mode === "reset"
      ? text("إرجاع للدرجات الأصلية (0)", "Reset to original (0)")
      : mode === "new_only"
        ? text(
            `للطلاب الجدد فقط (+${preview?.amount ?? amount})`,
            `New students only (+${preview?.amount ?? amount})`,
          )
        : mode === "adjust"
          ? text(
              `تعديل قيمة الرأفة إلى +${preview?.amount ?? amount}`,
              `Adjust grace to +${preview?.amount ?? amount}`,
            )
          : text(
              `إضافة +${preview?.amount ?? amount} درجات رأفة`,
              `Add +${preview?.amount ?? amount} grace marks`,
            );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        flush
        dir={ar ? "rtl" : "ltr"}
        className="max-w-2xl"
      >
        {/* Fixed Top Header + 3-Step Visual Stepper (via global DialogHeader) */}
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-squircle border transition-colors",
                currentStage === 3
                  ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-400"
                  : mode === "reset"
                    ? "border-rose-500/35 bg-rose-500/15 text-rose-400"
                    : "border-primary/30 bg-primary/15 text-primary",
              )}
            >
              {currentStage === 3 ? (
                <CheckCircle2 className="size-5" />
              ) : mode === "reset" ? (
                <RotateCcw className="size-5" />
              ) : (
                <Sparkles className="size-5" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-start">
                  {text("درجات الرأفة — الميدترم", "Midterm grace marks")}
                </DialogTitle>
                {activeGrace && currentStage < 3 && (
                  <span className="inline-flex items-center gap-1 rounded-squircle border border-primary/30 bg-primary/12 px-2 py-0.5 text-[11px] font-bold text-primary">
                    {text("الحالية", "Active")}{" "}
                    <bdi dir="ltr">+{activeGrace.amount}</bdi>
                  </span>
                )}
              </div>

              <DialogDescription className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground text-start">
                <bdi className="rounded-squircle border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground/85">
                  {detail.course.code}
                </bdi>
                <span aria-hidden="true">·</span>
                <span className="truncate">
                  {ar
                    ? detail.course.nameAr || detail.course.name
                    : detail.course.name}
                </span>
              </DialogDescription>
            </div>
          </div>

          <GraceStepIndicator
            step={currentStage}
            ar={ar}
            busy={busy}
            onJumpToConfigure={resetPreviewAndOp}
          />
        </DialogHeader>

        {/* Scrollable Middle Body (via global DialogBody) */}
        <DialogBody>
          {/* STAGE 1: Configure & Live Simulate */}
          {currentStage === 1 && (
            <>
              <HelpNote title={text("قواعد درجات الرأفة", "Grace mark rules")}>
                {text(
                  "تشمل الطالب الحاضر الذي رُصدت له درجة فقط (بما فيها الصفر)، ولا تتجاوز الدرجة العظمى، وتستبعد الغائب والمحروم والمحجوب والخانات الفارغة. يحفظ النظام الدرجة الأصلية لكل طالب بحيث لا تتكرر الرأفة على طالب سبق حصوله عليها، مع إمكانية تعديل القيمة أو إرجاعها إلى 0 للدرجات الحقيقية في أي وقت قبل الاعتماد أو القفل.",
                  "Includes only entered present marks (including zero), capped at the maximum. Absent, banned, tuition-held, and blank entries are excluded. Original marks are preserved per student so grace is never double-applied and can be applied to newly entered students, adjusted, or reset to 0.",
                )}
              </HelpNote>

              {/* Active Grace Mode Selector */}
              {activeGrace && (
                <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/[0.05] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-bold text-foreground">
                      {text(
                        `الرأفة الحالية المطبّقة على الكشف: +${activeGrace.amount} درجات`,
                        `Currently applied grace: +${activeGrace.amount} mark(s)`,
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {status && (
                        <span className="rounded-squircle border border-border/70 bg-background/80 px-2 py-0.5 text-[11px] font-semibold">
                          {text(
                            `شملت ${status.gracedCount} طالبًا`,
                            `${status.gracedCount} graced`,
                          )}
                        </span>
                      )}
                      {status && status.eligibleNewCount > 0 && (
                        <span className="rounded-squircle border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                          {text(
                            `+${status.eligibleNewCount} طالب جديد بلا رأفة`,
                            `${status.eligibleNewCount} newly entered eligible`,
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {status && status.manuallyModifiedCount > 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                      <ShieldCheck className="size-3.5 shrink-0 text-amber-300 mt-0.5" />
                      <span>
                        {text(
                          `تنبيه: يوجد ${status.manuallyModifiedCount} طالبًا عُدِّلت درجاتهم يدويًا بعد الرأفة؛ سيحفظ النظام تعديلهم اليدوي ولن يمسه عند التعديل أو الإلغاء.`,
                          `Note: ${status.manuallyModifiedCount} student(s) were manually edited after grace and are protected from overwrite.`,
                        )}
                      </span>
                    </div>
                  )}

                  {status?.legacyGrace && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                      <AlertTriangle className="size-3.5 shrink-0 text-amber-300 mt-0.5" />
                      <span>
                        {text(
                          "هذا الكشف يحتوي على رأفة مسجّلة قبل تحديث حفظ الدرجات الأصلية؛ يمكنك استخدام «للطلاب الجدد فقط» بأمان تام، بينما التعديل أو الإرجاع للصفر متاح للكشوف المسجلة بعد التحديث.",
                          "This sheet has legacy grace marks stored before original-mark tracking. 'New students only' works safely; adjust/reset applies to sheets graced with original-mark tracking.",
                        )}
                      </span>
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-3">
                    {/* New students only */}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => selectMode("new_only")}
                      className={cn(
                        "group relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-start transition-all cursor-pointer",
                        mode === "new_only"
                          ? "border-primary bg-primary/15 text-foreground ring-1 ring-primary/30"
                          : "border-border/70 bg-background/70 text-muted-foreground hover:border-primary/40 hover:bg-background",
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-1">
                        <span className="flex size-7 items-center justify-center rounded-squircle bg-primary/15 text-primary">
                          <UserPlus className="size-3.5" />
                        </span>
                        {status && status.eligibleNewCount > 0 && (
                          <span className="rounded-squircle bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                            <bdi dir="ltr">+{status.eligibleNewCount}</bdi>
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-foreground">
                        {text("للطلاب الجدد فقط", "New students only")}
                      </span>
                      <span className="text-[11px] leading-snug text-muted-foreground">
                        {text(
                          "تطبيق على من رُصد لاحقًا دون تكرار للقدامى",
                          "Apply only to newly entered marks",
                        )}
                      </span>
                    </button>

                    {/* Adjust amount */}
                    <button
                      type="button"
                      disabled={busy || Boolean(status?.legacyGrace)}
                      onClick={() => selectMode("adjust")}
                      className={cn(
                        "group relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-start transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed",
                        mode === "adjust"
                          ? "border-primary bg-primary/15 text-foreground ring-1 ring-primary/30"
                          : "border-border/70 bg-background/70 text-muted-foreground hover:border-primary/40 hover:bg-background",
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-1">
                        <span className="flex size-7 items-center justify-center rounded-squircle bg-primary/15 text-primary">
                          <SlidersHorizontal className="size-3.5" />
                        </span>
                        <span className="rounded-squircle border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80">
                          <bdi dir="ltr">+{activeGrace.amount} → ±</bdi>
                        </span>
                      </div>
                      <span className="text-xs font-bold text-foreground">
                        {text("تعديل قيمة الرأفة", "Adjust grace amount")}
                      </span>
                      <span className="text-[11px] leading-snug text-muted-foreground">
                        {text(
                          "تغيير القيمة بدقة من الدرجة الأصلية المحفوظة",
                          "Recompute cleanly from original grades",
                        )}
                      </span>
                    </button>

                    {/* Reset to original */}
                    <button
                      type="button"
                      disabled={busy || Boolean(status?.legacyGrace)}
                      onClick={() => selectMode("reset")}
                      className={cn(
                        "group relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-start transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed",
                        mode === "reset"
                          ? "border-rose-500 bg-rose-500/15 text-foreground ring-1 ring-rose-500/30"
                          : "border-border/70 bg-background/70 text-muted-foreground hover:border-rose-500/45 hover:bg-background",
                      )}
                    >
                      <span className="flex size-7 items-center justify-center rounded-squircle bg-rose-500/15 text-rose-400">
                        <RotateCcw className="size-3.5" />
                      </span>
                      <span className="text-xs font-bold text-rose-400">
                        {text("إرجاع للدرجات الأصلية (0)", "Reset to original (0)")}
                      </span>
                      <span className="text-[11px] leading-snug text-muted-foreground">
                        {text(
                          "إلغاء الرأفة واستعادة الدرجات الحقيقية",
                          "Undo grace and restore real marks",
                        )}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Amount Input & Quick Presets OR Reset Callout */}
              {mode !== "reset" ? (
                <div className="space-y-3 rounded-xl border border-border/75 bg-background/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="control-grace-amount"
                      className="text-sm font-semibold text-foreground"
                    >
                      {mode === "adjust"
                        ? text(
                            "قيمة الرأفة الجديدة (تحل محل القيمة السابقة)",
                            "New grace amount (replaces previous grace)",
                          )
                        : mode === "new_only"
                          ? text(
                              "مقدار الرأفة للطلاب الجدد فقط",
                              "Grace marks for newly entered students only",
                            )
                          : text("الزيادة المطلوبة", "Marks to add")}
                    </label>
                    <span className="rounded-squircle border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {text("الدرجة العظمى:", "Max:")}{" "}
                      <bdi className="font-mono font-bold text-foreground">
                        {detail.rules.max}
                      </bdi>
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <div className="relative flex-1">
                      <Input
                        id="control-grace-amount"
                        aria-label={text("درجات الرأفة", "Grace marks")}
                        dir="ltr"
                        type="number"
                        min={detail.rules.step}
                        max={detail.rules.max}
                        step={detail.rules.step}
                        value={amount}
                        disabled={busy}
                        placeholder={text("مثال: 3", "e.g. 3")}
                        className="h-11 rounded-squircle text-left font-mono text-base font-bold"
                        onChange={(e) => {
                          setAmount(e.target.value);
                          resetPreviewAndOp();
                        }}
                      />
                    </div>

                    {quickPresets.length > 0 && (
                      <div
                        role="group"
                        aria-label={text("قيم سريعة", "Quick values")}
                        className="flex flex-wrap items-center gap-1.5"
                      >
                        {quickPresets.map((preset) => {
                          const isSelected = Number(amount) === preset;
                          return (
                            <button
                              key={preset}
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setAmount(String(preset));
                                resetPreviewAndOp();
                              }}
                              className={cn(
                                "h-11 min-w-11 rounded-squircle border px-3 font-mono text-xs font-bold transition-all cursor-pointer disabled:opacity-50",
                                isSelected
                                  ? "border-primary bg-primary/18 text-primary shadow-xs"
                                  : "border-border/80 bg-background/70 text-muted-foreground hover:border-primary/45 hover:text-foreground",
                              )}
                            >
                              <bdi dir="ltr">+{preset}</bdi>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {mode === "adjust" && (
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-squircle border border-border/70 bg-background/60 px-3 py-2.5 text-xs transition-colors hover:border-primary/35">
                      <Checkbox
                        checked={includeNewStudents}
                        disabled={busy}
                        onCheckedChange={(checked) => {
                          setIncludeNewStudents(checked === true);
                          resetPreviewAndOp();
                        }}
                      />
                      <span className="leading-snug text-foreground/90">
                        {text(
                          "تطبيق القيمة الجديدة أيضًا على الطلاب الجدد الذين لم تُرصد لهم رأفة سابقًا",
                          "Also apply the new grace amount to newly entered un-graced students",
                        )}
                      </span>
                    </label>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-xs leading-relaxed text-rose-200">
                  <AlertTriangle className="size-4 shrink-0 text-rose-400 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-rose-100">
                      {text(
                        "استعادة الدرجات الأصلية قبل الرأفة",
                        "Restore original pre-grace marks",
                      )}
                    </p>
                    <p>
                      {text(
                        "سيتم إرجاع الرأفة إلى 0 واستعادة الدرجة الأصلية الحقيقية لكل طالب أُضيفت له الرأفة، ثم يُصبح الكشف بدون رأفة مطبّقة. الغائب والمحروم والمحجوب ومن عُدِّلت درجته يدويًا بعد الرأفة لن يتأثروا.",
                        "This resets grace marks to 0 and restores every graced student back to their original grade before grace. Absent, banned, held, and manually edited marks are untouched.",
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Live Pass-Rate Impact Card */}
              {livePassRateTransition && (
                <PassRateImpactCard
                  transition={livePassRateTransition}
                  mode={mode}
                  isVerified={false}
                  ar={ar}
                  percentFormatter={percentFormatter}
                />
              )}

              {/* Preview Guidance Note */}
              <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="size-3.5 shrink-0 text-primary mt-0.5" />
                <span>
                  {text(
                    "الخطوة التالية «معاينة الزيادة / التأثير» تفحص الكشف الرسمي الآن وتعرض أعداد المستفيدين والمستبعدين وجدول الدرجات (الأصلية ← قبل ← بعد) قبل أن يتغير أي رقم فعليًا.",
                    "Next step 'Preview' inspects the live sheet and displays exact affected/excluded counts and a student sample before modifying any grade.",
                  )}
                </span>
              </div>
            </>
          )}

          {/* STAGE 2: Official Verified Preview */}
          {currentStage === 2 && preview && (
            <>
              {/* Selected Operation Context Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/75 bg-muted/25 px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-squircle border px-2.5 py-1 font-bold",
                      mode === "reset"
                        ? "border-rose-500/35 bg-rose-500/15 text-rose-300"
                        : "border-primary/35 bg-primary/15 text-primary",
                    )}
                  >
                    {mode === "reset" ? (
                      <RotateCcw className="size-3.5" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    {modeSummaryLabel}
                  </span>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={resetPreviewAndOp}
                  className="h-8 rounded-squircle gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5 rtl:rotate-180" />
                  {text("تعديل القيمة / الوضع", "Edit amount / mode")}
                </Button>
              </div>

              {/* Verified Pass-Rate Impact Card */}
              {livePassRateTransition && (
                <PassRateImpactCard
                  transition={livePassRateTransition}
                  mode={mode}
                  isVerified={true}
                  ar={ar}
                  percentFormatter={percentFormatter}
                />
              )}

              {/* Tier 1: 3 Hero KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* KPI 1: Affected / Restored */}
                <div
                  className={cn(
                    "rounded-xl border p-3.5 space-y-1.5",
                    mode === "reset"
                      ? "border-rose-500/35 bg-rose-500/[0.08]"
                      : "border-primary/35 bg-primary/[0.09]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-foreground/85">
                      {mode === "reset"
                        ? text("ستُستعاد درجاتهم الأصلية", "Restored to original")
                        : text("ستتحدث درجاتهم", "Marks updated")}
                    </span>
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-squircle",
                        mode === "reset"
                          ? "bg-rose-500/15 text-rose-400"
                          : "bg-primary/15 text-primary",
                      )}
                    >
                      {mode === "reset" ? (
                        <RotateCcw className="size-3.5" />
                      ) : (
                        <Users className="size-3.5" />
                      )}
                    </span>
                  </div>
                  <bdi
                    className={cn(
                      "block font-mono text-2xl font-extrabold tabular-nums tracking-tight",
                      mode === "reset" ? "text-rose-300" : "text-primary",
                    )}
                  >
                    {preview.counts.changed}
                  </bdi>
                </div>

                {/* KPI 2: Capped at Maximum (exact label preserved for test) */}
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-amber-200/90">
                      {text("تُرفع للحد الأقصى فقط", "Capped at maximum")}
                    </span>
                    <span className="flex size-6 items-center justify-center rounded-squircle bg-amber-500/15 text-amber-400">
                      <ArrowUpToLine className="size-3.5" />
                    </span>
                  </div>
                  <bdi className="block font-mono text-2xl font-extrabold tabular-nums tracking-tight text-amber-300">
                    {preview.counts.capped}
                  </bdi>
                </div>

                {/* KPI 3: Excluded / Unchanged Total */}
                <div className="rounded-xl border border-border/80 bg-muted/25 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      {text("مستبعدون / بدون تغيير", "Excluded / unchanged")}
                    </span>
                    <span className="flex size-6 items-center justify-center rounded-squircle bg-muted text-muted-foreground">
                      <ShieldAlert className="size-3.5" />
                    </span>
                  </div>
                  <bdi className="block font-mono text-2xl font-extrabold tabular-nums tracking-tight text-foreground">
                    {excludedTotal}
                  </bdi>
                </div>
              </div>

              {/* Tier 2: Compact Exclusion & Protection Chips */}
              <div className="rounded-xl border border-border/65 bg-background/45 p-3 space-y-2">
                <div className="text-[11px] font-semibold text-muted-foreground">
                  {text(
                    "تفاصيل الحالات المستبعدة والمحمية",
                    "Exclusion & protection breakdown",
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {exclusionChips.map((item) => {
                    const hasCount = item.value > 0;
                    return (
                      <div
                        key={item.label}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-squircle border px-2.5 py-1 text-[11px] transition-colors",
                          hasCount
                            ? item.highlight === "amber"
                              ? "border-amber-500/35 bg-amber-500/12 text-amber-200"
                              : item.highlight === "sky"
                                ? "border-sky-500/35 bg-sky-500/12 text-sky-200"
                                : "border-border bg-muted/50 text-foreground"
                            : "border-border/50 bg-background/50 text-muted-foreground/75",
                        )}
                      >
                        <span>{item.label}</span>
                        <bdi
                          className={cn(
                            "font-mono font-bold tabular-nums",
                            hasCount ? "text-foreground" : "text-muted-foreground/70",
                          )}
                        >
                          {item.value}
                        </bdi>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sample Students Comparison Table */}
              {preview.sample.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border/80 bg-background/50">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/35 px-3.5 py-2 text-xs">
                    <span className="font-semibold text-foreground">
                      {text("عينة الطلاب المتأثرين", "Sample of affected students")}
                    </span>
                    <span className="rounded-squircle border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {text(
                        `أول ${preview.sample.length} من ${preview.counts.changed}`,
                        `First ${preview.sample.length} of ${preview.counts.changed}`,
                      )}
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto overflow-x-auto">
                    <table className="w-full text-xs text-start">
                      <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-xs text-[11px] text-muted-foreground">
                        <tr>
                          {[
                            text("كود الطالب", "Student code"),
                            text("الأصلية", "Original"),
                            text("الحالية (قبل)", "Current (before)"),
                            text("التغيير الفعلي", "Net change"),
                            text("بعد التطبيق", "After"),
                          ].map((label) => (
                            <th
                              key={label}
                              className="px-3 py-2 text-start font-semibold whitespace-nowrap"
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {preview.sample.map((row) => {
                          const baseOriginal = row.originalGrade ?? row.before;
                          const isCapped =
                            mode !== "reset" &&
                            row.after === preview.max &&
                            baseOriginal + preview.amount > preview.max;
                          const crossedPass =
                            row.before <= resolvedThreshold &&
                            row.after > resolvedThreshold;

                          return (
                            <tr
                              key={row.studentCode}
                              className="transition-colors hover:bg-muted/30"
                            >
                              <td className="px-3 py-2 font-mono font-semibold text-foreground/90">
                                <bdi>{row.studentCode}</bdi>
                              </td>
                              <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">
                                <bdi>{baseOriginal}</bdi>
                              </td>
                              <td className="px-3 py-2 font-mono tabular-nums text-foreground/85">
                                <bdi>{row.before}</bdi>
                              </td>
                              <td className="px-3 py-2">
                                <div className="inline-flex items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded-squircle border px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums",
                                      row.added < 0
                                        ? "border-rose-500/35 bg-rose-500/15 text-rose-300"
                                        : "border-primary/30 bg-primary/12 text-primary",
                                    )}
                                  >
                                    <bdi dir="ltr">
                                      {row.added > 0
                                        ? `+${row.added}`
                                        : String(row.added)}
                                    </bdi>
                                  </span>
                                  {isCapped && (
                                    <span className="rounded-squircle border border-amber-500/35 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                                      {text("سقف", "Cap")}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 font-mono font-bold tabular-nums">
                                <span className="inline-flex items-center gap-1.5">
                                  <bdi
                                    className={cn(
                                      crossedPass
                                        ? "text-emerald-400"
                                        : "text-foreground",
                                    )}
                                  >
                                    {row.after}
                                  </bdi>
                                  {crossedPass && (
                                    <span
                                      aria-hidden="true"
                                      title={text(
                                        "انتقل إلى النجاح",
                                        "Crossed pass threshold",
                                      )}
                                      className="size-1.5 rounded-full bg-emerald-400"
                                    />
                                  )}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <p className="border-t border-border/60 bg-muted/20 px-3.5 py-2 text-[11px] text-muted-foreground">
                    {text(
                      "معاينة أول 20 طالبًا مستفيدًا؛ التأكيد يُطبق على جميع الطلاب المؤهلين في الكشف.",
                      "First 20 affected students; confirmation applies to every eligible student in the sheet.",
                    )}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                  {text(
                    "لا توجد درجات ستتغير بناءً على الإعدادات المختارة حاليًا.",
                    "No student grades will change with the currently selected settings.",
                  )}
                </div>
              )}
            </>
          )}

          {/* STAGE 3: Executive Completion Receipt */}
          {currentStage === 3 && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-6 text-center space-y-5">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-emerald-500/35 bg-emerald-500/15 text-emerald-400 shadow-sm">
                <CheckCircle2 className="size-7" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-foreground">
                  {mode === "reset"
                    ? text(
                        "تمت استعادة الدرجات الأصلية بنجاح",
                        "Original grades restored",
                      )
                    : text(
                        "تم تطبيق درجات الرأفة بنجاح",
                        "Grace marks applied successfully",
                      )}
                </h3>
                <p
                  role="status"
                  className="mx-auto max-w-md text-sm text-muted-foreground"
                >
                  {appliedMessage}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-start pt-1">
                <div className="rounded-xl border border-border/70 bg-background/75 p-3 space-y-1">
                  <span className="text-[11px] text-muted-foreground">
                    {text("الطلاب المتأثرون", "Affected students")}
                  </span>
                  <bdi className="block font-mono text-lg font-extrabold tabular-nums text-foreground">
                    {preview?.counts.changed ?? 0}
                  </bdi>
                </div>

                {livePassRateTransition && (
                  <div className="rounded-xl border border-border/70 bg-background/75 p-3 space-y-1">
                    <span className="text-[11px] text-muted-foreground">
                      {text("نسبة النجاح", "Pass rate")}
                    </span>
                    <div className="flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums">
                      <bdi className="text-muted-foreground">
                        {percentFormatter.format(
                          livePassRateTransition.ratioBefore,
                        )}
                      </bdi>
                      <ArrowRight className="size-3.5 shrink-0 text-primary rtl:rotate-180" />
                      <bdi className="text-emerald-400">
                        {percentFormatter.format(
                          livePassRateTransition.ratioAfter,
                        )}
                      </bdi>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-border/70 bg-background/75 p-3 space-y-1">
                  <span className="text-[11px] text-muted-foreground">
                    {text("سجل التدقيق", "Audit log")}
                  </span>
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <FileCheck2 className="size-3.5 shrink-0" />
                    <span>{text("مُسجّل وموثّق", "Recorded & audited")}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Banner (any stage) */}
          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-xs sm:text-sm text-destructive-foreground"
            >
              <AlertTriangle className="size-4 shrink-0 text-destructive mt-0.5" />
              <span>{error}</span>
            </p>
          )}
        </DialogBody>

        {/* Fixed Sticky Footer (via global DialogFooter) */}
        <DialogFooter className="flex-row flex-wrap items-center gap-2 rtl:sm:justify-start">
          {currentStage === 1 && (
            <>
              <Button
                type="button"
                variant={mode === "reset" ? "destructive" : "default"}
                className="rounded-squircle gap-1.5"
                disabled={!canPreview}
                onClick={handlePreview}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {mode === "reset"
                  ? text(
                      "معاينة استعادة الدرجات الأصلية",
                      "Preview reset to original",
                    )
                  : text("معاينة الزيادة", "Preview grace marks")}
              </Button>
              <Button
                type="button"
                aria-label={text("إغلاق نافذة الرأفة", "Close grace marks")}
                variant="outline"
                className="rounded-squircle"
                disabled={busy}
                onClick={onClose}
              >
                {text("إغلاق", "Close")}
              </Button>
            </>
          )}

          {currentStage === 2 && preview && (
            <>
              <Button
                type="button"
                variant={mode === "reset" ? "destructive" : "default"}
                className="rounded-squircle gap-1.5"
                disabled={busy || preview.counts.changed === 0}
                onClick={handleConfirm}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {mode === "reset"
                  ? text(
                      "تأكيد إلغاء الرأفة والرجوع للدرجات الأصلية",
                      "Confirm reset to original grades",
                    )
                  : mode === "new_only"
                    ? text(
                        "تأكيد تطبيق الرأفة للطلاب الجدد فقط",
                        "Confirm grace for new students only",
                      )
                    : mode === "adjust"
                      ? text(
                          `تأكيد تعديل الرأفة إلى +${preview.amount}`,
                          `Confirm adjust grace to +${preview.amount}`,
                        )
                      : text("تأكيد إضافة الرأفة", "Confirm grace marks")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-squircle gap-1.5"
                disabled={busy}
                onClick={resetPreviewAndOp}
              >
                <ArrowLeft className="size-3.5 rtl:rotate-180" />
                {text("تعديل القيمة", "Back")}
              </Button>
              <Button
                type="button"
                aria-label={text("إغلاق نافذة الرأفة", "Close grace marks")}
                variant="ghost"
                className="rounded-squircle"
                disabled={busy}
                onClick={onClose}
              >
                {text("إغلاق", "Close")}
              </Button>
            </>
          )}

          {currentStage === 3 && (
            <Button
              type="button"
              aria-label={text("إغلاق نافذة الرأفة", "Close grace marks")}
              variant="default"
              className="rounded-squircle"
              disabled={busy}
              onClick={onClose}
            >
              {text("إغلاق والعودة للكشف", "Close & return to sheet")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
