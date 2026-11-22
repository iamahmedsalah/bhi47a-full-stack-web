"use client";
import { useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, Percent, Sparkles, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpNote } from "@/components/ui/help-note";
import { getApiErrorMessage } from "@/lib/api";
import {
  getControlSheet,
  previewControlGrace,
  applyControlGrace,
  type GracePreview,
} from "../api";
import type { ControlSheetDetails, WorkbookRow } from "../types";

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
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<GracePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  const operation = useRef(crypto.randomUUID());
  const guard = useRef(false);
  const text = (arabic: string, english: string) => (ar ? arabic : english);

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

  // Compute live pass-rate transition (from -> to) as the user types or from backend preview
  const livePassRateTransition = useMemo(() => {
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

    const parsedAmount =
      amount !== "" && Number.isFinite(Number(amount)) && Number(amount) > 0
        ? Math.min(detail.rules.max, Number(amount))
        : 0;

    if (rows.length === 0) return null;

    let passedBefore = 0;
    let passedAfter = 0;

    for (const row of rows) {
      const mark = row.components.midterm;
      if (mark?.status !== "present" || mark.score == null) continue;
      const beforeScore = mark.score;
      const canReceiveGrace = !row.tuition?.isBlocked && !row.notRegistered;
      const afterScore =
        canReceiveGrace && parsedAmount > 0
          ? Math.min(detail.rules.max, beforeScore + parsedAmount)
          : beforeScore;

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
  }, [amount, detail.rules.max, preview?.passRate, resolvedThreshold, rows]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        dir={ar ? "rtl" : "ltr"}
        className="max-w-xl rounded-2xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-start">
            <Sparkles className="size-5 text-primary" />
            {text("درجات الرأفة — الميدترم", "Midterm grace marks")}
          </DialogTitle>
          <DialogDescription className="text-start">
            <bdi>{detail.course.code}</bdi> ·{" "}
            {ar
              ? detail.course.nameAr || detail.course.name
              : detail.course.name}
          </DialogDescription>
        </DialogHeader>
        <HelpNote title={text("قواعد درجات الرأفة", "Grace mark rules")}>
          {text(
            "تُضاف مرة واحدة لهذا الكشف. تشمل الحاضر الذي رُصدت له درجة، حتى الصفر. لا تتجاوز الدرجة العظمى، ولا تشمل الغائب أو المحروم أو المحجوب أو الخانات الفارغة. لا تنشر النتائج تلقائيًا.",
            "Applied once per sheet. Includes entered present marks, including zero. Capped at the maximum. Absent, banned, financially blocked and unentered students are excluded. This does not publish results.",
          )}
        </HelpNote>
        {!applied && (
          <>
            <label className="space-y-2 text-sm">
              <span>{text("الزيادة المطلوبة", "Marks to add")}</span>
              <Input
                aria-label={text("درجات الرأفة", "Grace marks")}
                dir="ltr"
                type="number"
                min={detail.rules.step}
                max={detail.rules.max}
                step={detail.rules.step}
                value={amount}
                disabled={busy}
                className="rounded-squircle"
                onChange={(e) => {
                  setAmount(e.target.value);
                  setPreview(null);
                  setError("");
                }}
              />
            </label>

            {/* Compact Pass Rate Before -> After Impact Card */}
            {livePassRateTransition && (
              <div
                role="region"
                aria-label={text(
                  "تأثير درجات الرأفة على نسبة النجاح",
                  "Grace marks pass rate impact",
                )}
                className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
                    <Percent className="size-3.5 text-primary" />
                    {text(
                      "تغير نسبة نجاح الميدتيرم",
                      "Midterm pass rate change",
                    )}
                  </span>
                  <span className="rounded-squircle border border-border/70 bg-background/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {text(
                      `حد النجاح > ${livePassRateTransition.threshold} درجة`,
                      `Pass mark > ${livePassRateTransition.threshold}`,
                    )}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-squircle border border-border/80 bg-background/70 px-3 py-1.5 text-center">
                      <span className="block text-[10px] text-muted-foreground">
                        {text("قبل الرأفة", "Before")}
                      </span>
                      <bdi className="text-sm font-bold tabular-nums text-foreground">
                        {percentFormatter.format(
                          livePassRateTransition.ratioBefore,
                        )}
                      </bdi>
                      <span className="block text-[10px] text-muted-foreground">
                        <bdi>
                          {livePassRateTransition.passedBefore} /{" "}
                          {livePassRateTransition.total}
                        </bdi>
                      </span>
                    </div>

                    <ArrowRight className="size-4 shrink-0 text-primary rtl:rotate-180" />

                    <div className="rounded-squircle border border-primary/35 bg-primary/15 px-3 py-1.5 text-center">
                      <span className="block text-[10px] text-primary">
                        {text("بعد الرأفة", "After")}
                      </span>
                      <bdi className="text-sm font-bold tabular-nums text-primary">
                        {percentFormatter.format(
                          livePassRateTransition.ratioAfter,
                        )}
                      </bdi>
                      <span className="block text-[10px] text-primary/85">
                        <bdi>
                          {livePassRateTransition.passedAfter} /{" "}
                          {livePassRateTransition.total}
                        </bdi>
                      </span>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 rounded-squircle border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
                    <TrendingUp className="size-3.5" />
                    <bdi>
                      +
                      {percentFormatter.format(
                        Math.max(
                          0,
                          livePassRateTransition.ratioAfter -
                            livePassRateTransition.ratioBefore,
                        ),
                      )}
                    </bdi>
                    <span className="text-[11px] font-medium opacity-90">
                      (
                      <bdi>
                        +
                        {Math.max(
                          0,
                          livePassRateTransition.passedAfter -
                            livePassRateTransition.passedBefore,
                        )}
                      </bdi>{" "}
                      {text("طالب", "students")})
                    </span>
                  </span>
                </div>
              </div>
            )}

            <Button
              className="rounded-squircle"
              disabled={
                busy ||
                !amount ||
                !Number.isFinite(Number(amount)) ||
                Number(amount) <= 0 ||
                Number(amount) > detail.rules.max
              }
              onClick={async () => {
                if (guard.current) return;
                guard.current = true;
                setBusy(true);
                setError("");
                try {
                  const latest = await getControlSheet(detail.sheet.id);
                  setPreview(
                    await previewControlGrace(
                      detail.sheet.id,
                      Number(amount),
                      latest.sheet.revision,
                    ),
                  );
                } catch (cause) {
                  setError(getApiErrorMessage(cause));
                } finally {
                  setBusy(false);
                  guard.current = false;
                }
              }}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {text("معاينة الزيادة", "Preview grace marks")}
            </Button>
          </>
        )}
        {preview && (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                [
                  text("ستزيد درجاتهم", "Marks changed"),
                  preview.counts.changed,
                ],
                [
                  text("تُرفع للحد الأقصى فقط", "Capped at maximum"),
                  preview.counts.capped,
                ],
                [
                  text("عند الحد الأقصى بالفعل", "Already at maximum"),
                  preview.counts.atMaximum,
                ],
                [
                  text("غائب أو محروم", "Absent or banned"),
                  preview.counts.absentOrBanned,
                ],
                [text("محجوب ماليًا", "Tuition hold"), preview.counts.held],
                [text("لم تُرصد", "Unentered"), preview.counts.unentered],
                [
                  text("حالات أخرى مستبعدة", "Other excluded"),
                  preview.counts.other,
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border bg-muted/20 p-3 flex justify-between gap-2"
                >
                  <span>{label}</span>
                  <bdi className="font-mono font-bold">{value}</bdi>
                </div>
              ))}
            </div>
            {preview.sample.length > 0 && (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-xs text-start">
                  <thead className="bg-muted">
                    <tr>
                      {[
                        text("كود الطالب", "Student code"),
                        text("قبل", "Before"),
                        text("الزيادة الفعلية", "Actual addition"),
                        text("بعد", "After"),
                      ].map((label) => (
                        <th key={label} className="p-2 text-start">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((row) => (
                      <tr key={row.studentCode} className="border-t">
                        <td className="p-2">
                          <bdi>{row.studentCode}</bdi>
                        </td>
                        <td className="p-2">{row.before}</td>
                        <td className="p-2 text-primary">+{row.added}</td>
                        <td className="p-2 font-bold">{row.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="p-2 text-xs text-muted-foreground">
                  {text(
                    "معاينة أول 20 طالبًا مستفيدًا؛ التطبيق يشمل جميع المستفيدين في الكشف.",
                    "First 20 affected students; confirmation applies to every eligible student in the sheet.",
                  )}
                </p>
              </div>
            )}
          </>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm"
          >
            {error}
          </p>
        )}
        {applied && (
          <p
            role="status"
            className="rounded-xl border border-primary/30 p-3 text-sm"
          >
            {text(
              "تمت إضافة الرأفة وحفظها في سجل التدقيق.",
              "Grace marks applied and recorded in the audit log.",
            )}
          </p>
        )}
        <DialogFooter className="rtl:sm:justify-start">
          <Button
            aria-label={text("إغلاق نافذة الرأفة", "Close grace marks")}
            variant="outline"
            className="rounded-squircle"
            disabled={busy}
            onClick={onClose}
          >
            {text("إغلاق", "Close")}
          </Button>
          {preview && !applied && (
            <Button
              className="rounded-squircle"
              disabled={busy || preview.counts.changed === 0}
              onClick={async () => {
                if (guard.current) return;
                guard.current = true;
                setBusy(true);
                setError("");
                try {
                  await applyControlGrace(
                    detail.sheet.id,
                    preview,
                    operation.current,
                  );
                  setApplied(true);
                  await onSaved();
                } catch (cause) {
                  setError(getApiErrorMessage(cause));
                } finally {
                  setBusy(false);
                  guard.current = false;
                }
              }}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {text(
                "تأكيد إضافة الرأفة مرة واحدة",
                "Confirm once-only grace marks",
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
