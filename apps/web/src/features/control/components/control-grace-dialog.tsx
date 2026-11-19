"use client";
import { useRef, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
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
import type { ControlSheetDetails } from "../types";

export function ControlGraceDialog({
  detail,
  locale,
  onClose,
  onSaved,
}: {
  detail: ControlSheetDetails;
  locale: string;
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
        <HelpNote
          title={text("قواعد درجات الرأفة", "Grace mark rules")}
        >
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
                onChange={(e) => {
                  setAmount(e.target.value);
                  setPreview(null);
                  setError("");
                }}
              />
            </label>
            <Button
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
            disabled={busy}
            onClick={onClose}
          >
            {text("إغلاق", "Close")}
          </Button>
          {preview && !applied && (
            <Button
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
