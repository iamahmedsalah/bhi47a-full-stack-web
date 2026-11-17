"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getApiErrorMessage } from "@/lib/api";
import {
  latestHistoricalPublication,
  previewHistoricalPublication,
  processHistoricalPublication,
  publishHistoricalPublication,
  type HistoricalPublicationJob,
  type HistoricalPublicationPreview,
  type HistoricalPublicationScope,
} from "../api";

function previousAcademicYear() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const start = year - (month < 9 ? 2 : 1);
  return `${start}-${start + 1}`;
}

export function HistoricalPublicationModal({
  open,
  onOpenChange,
  isAr,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAr: boolean;
}) {
  const tr = (ar: string, en: string) => (isAr ? ar : en);
  const dir = isAr ? "rtl" : "ltr";
  const client = useQueryClient();
  const [scope, setScope] = useState<HistoricalPublicationScope>(() => ({
    academicYear: previousAcademicYear(),
    semester: "first",
    level: "1",
  }));
  const [preview, setPreview] = useState<HistoricalPublicationPreview | null>(
    null,
  );
  const [currentJob, setCurrentJob] = useState<HistoricalPublicationJob | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const validScope = /^\d{4}-\d{4}$/.test(scope.academicYear);
  const latest = useQuery({
    queryKey: ["historical-publication", scope],
    queryFn: () => latestHistoricalPublication(scope),
    enabled: open && validScope && !busy,
    retry: false,
  });
  const job = currentJob ?? latest.data?.job;
  const pending = job?.status === "pending";
  const changeScope = (patch: Partial<HistoricalPublicationScope>) => {
    setScope((old) => ({ ...old, ...patch }));
    setPreview(null);
    setCurrentJob(null);
    setError("");
  };
  const refresh = async () => {
    await Promise.all(
      [
        "grades",
        "admin-grades",
        "students",
        "student-detail",
        "student-results",
        "advising",
        "historical-publication",
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    );
  };
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(getApiErrorMessage(e));
      void refresh();
    } finally {
      setBusy(false);
    }
  };
  const reconcile = async (initial: HistoricalPublicationJob) => {
    let next = initial;
    setCurrentJob(next);
    while (next.status === "pending") {
      next = await processHistoricalPublication(next.id);
      setCurrentJob(next);
    }
    setPreview(null);
    toast.success(
      tr(
        "تم نشر الدرجات التاريخية وتحديث المعدل والساعات دون تغيير المستوى",
        "Historical grades published; GPA and credits updated without changing levels",
      ),
    );
    await refresh();
  };
  const close = (value: boolean) => {
    if (busy) return;
    if (!value) {
      setPreview(null);
      setCurrentJob(null);
      setError("");
    }
    onOpenChange(value);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        dir={dir}
        className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
      >
        <DialogHeader className="text-start sm:text-start rtl:sm:text-right">
          <DialogTitle>
            {tr(
              "نشر الدرجات التاريخية حسب المستوى",
              "Publish historical grades by level",
            )}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "اختر السنة والترم ومستوى الطلاب الحالي، ثم عاين وانشر المكونات الثلاثة معًا لتحديث المعدل التراكمي.",
              "Choose the year, semester and students’ current level, then preview and publish all three components to update cumulative GPA.",
            )}
          </DialogDescription>
        </DialogHeader>
        <ol className="grid gap-2 rounded-xl border p-3 text-sm leading-6">
          <li>
            {tr(
              "1. ارفع درجات أعمال السنة والميدترم والنهائي وراجع تقرير الاستيراد.",
              "1. Upload coursework, midterm and final grades and review the import report.",
            )}
          </li>
          <li>
            {tr(
              "2. عاين نطاق النشر أدناه؛ أي مكوّن ناقص أو كشف كنترول يمنع النشر.",
              "2. Preview the scope below; missing components or existing Control sheets block publication.",
            )}
          </li>
          <li>
            {tr(
              "3. أكّد النشر وانتظر اكتمال حساب المعدل. ظهور النتائج يخضع لإعدادات الإتاحة والجدولة وحجب الطالب.",
              "3. Confirm publication and wait for GPA calculation. Student visibility still follows visibility settings, schedules and holds.",
            )}
          </li>
        </ol>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-2 text-sm">
            <span>
              {tr("السنة الدراسية السابقة", "Previous academic year")}
            </span>
            <Input
              dir="ltr"
              className="text-left"
              value={scope.academicYear}
              disabled={busy}
              onChange={(e) => changeScope({ academicYear: e.target.value })}
              placeholder="2025-2026"
            />
          </label>
          <div className="space-y-2 text-sm">
            <label htmlFor="historical-semester">
              {tr("الفصل الدراسي", "Semester")}
            </label>
            <Select
              value={scope.semester}
              disabled={busy}
              onValueChange={(value) =>
                changeScope({
                  semester: value as HistoricalPublicationScope["semester"],
                })
              }
            >
              <SelectTrigger id="historical-semester">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={dir}>
                <SelectItem value="first">{tr("الأول", "First")}</SelectItem>
                <SelectItem value="second">{tr("الثاني", "Second")}</SelectItem>
                <SelectItem value="summer">{tr("الصيفي", "Summer")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 text-sm">
            <label htmlFor="historical-level">
              {tr("مستوى الطالب الحالي", "Current student level")}
            </label>
            <Select
              value={scope.level}
              disabled={busy}
              onValueChange={(level) => changeScope({ level })}
            >
              <SelectTrigger id="historical-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={dir}>
                {["1", "2", "3", "4"].map((level) => (
                  <SelectItem key={level} value={level}>
                    {tr(`المستوى ${level}`, `Level ${level}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {tr(
            "الاختيار يشمل مقررات هؤلاء الطلاب في السنة والترم المحددين، حتى لو كانت مقررات من مستويات أقدم. لا يرقّي النشر الطلاب تلقائيًا.",
            "Includes these students’ courses in the selected year and semester, including courses from earlier levels. Publication does not automatically promote students.",
          )}
        </p>
        {(error || latest.error) && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive"
          >
            {error || getApiErrorMessage(latest.error)}
          </p>
        )}
        {job && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border p-3 text-sm space-y-2"
          >
            <p>
              {job.status === "complete"
                ? tr(
                    "اكتمل آخر نشر وحساب للمعدل لهذا النطاق",
                    "The latest publication and GPA calculation for this scope is complete",
                  )
                : tr(
                    "الدرجات منشورة، وحساب المعدل يحتاج استكمالًا",
                    "Grades are published; GPA calculation needs to be completed",
                  )}
            </p>
            <p>
              {tr("تم حساب المعدل", "GPA calculated")}:{" "}
              <bdi>
                {job.processedStudents} / {job.totalStudents}
              </bdi>{" "}
              {tr("طالب", "students")}
            </p>
            {pending && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run(() => reconcile(job))}
              >
                {tr("استكمال حساب المعدل", "Resume GPA calculation")}
              </Button>
            )}
          </div>
        )}
        {preview && (
          <div
            className="rounded-xl border p-3 space-y-2 text-sm"
            aria-live="polite"
          >
            <p>
              {tr("الطلاب", "Students")}: {preview.totalStudents} ·{" "}
              {tr("محاولات المقررات", "Course attempts")}:{" "}
              {preview.courseAttempts}
            </p>
            <p>
              {tr("درجات غير منشورة", "Unpublished marks")}:{" "}
              {preview.unpublishedMarks} ·{" "}
              {tr("منشورة سابقًا", "Already published")}:{" "}
              {preview.alreadyPublishedMarks}
            </p>
            {!preview.totalMarks && (
              <p>
                {tr(
                  "لا توجد درجات تاريخية مستوردة لهذا النطاق.",
                  "No imported historical grades in this scope.",
                )}
              </p>
            )}
            {preview.issueCount > 0 && (
              <div role="alert" className="text-destructive">
                <p>
                  {tr("حالات تمنع النشر", "Publication-blocking issues")}:{" "}
                  {preview.issueCount}
                </p>
                <ul className="list-disc ps-5">
                  {preview.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            {!preview.unpublishedMarks && preview.totalMarks > 0 && (
              <p>
                {tr(
                  "كل درجات هذا النطاق منشورة بالفعل.",
                  "All marks in this scope are already published.",
                )}
              </p>
            )}
          </div>
        )}
        <DialogFooter className="sm:justify-start rtl:sm:justify-start gap-2">
          <Button
            variant="outline"
            disabled={busy || !validScope || pending || latest.isFetching}
            onClick={() =>
              void run(async () => {
                setPreview(await previewHistoricalPublication(scope));
              })
            }
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {tr("معاينة النشر", "Preview publication")}
          </Button>
          <Button
            disabled={busy || !preview?.canPublish || pending}
            onClick={() => setConfirm(true)}
          >
            <Send className="h-4 w-4" />
            {tr("نشر وتحديث المعدل", "Publish and update GPA")}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => close(false)}>
            {tr("إغلاق", "Close")}
          </Button>
        </DialogFooter>
        <ConfirmDialog
          dir={dir}
          open={confirm}
          onOpenChange={setConfirm}
          destructive={false}
          title={tr(
            "تأكيد نشر الدرجات التاريخية",
            "Confirm historical publication",
          )}
          description={tr(
            `سيتم نشر المكونات الثلاثة للمستوى ${scope.level} في ${scope.academicYear} وحساب المعدل والساعات. قد تظهر النتائج للطلاب فورًا إذا كانت إعدادات الإتاحة تسمح.`,
            `Publish all three components for level ${scope.level} in ${scope.academicYear} and calculate GPA and credits. Students may see the results immediately if visibility settings allow it.`,
          )}
          confirmLabel={tr("تأكيد النشر", "Confirm publication")}
          cancelLabel={tr("رجوع", "Back")}
          disabled={busy || !preview?.canPublish}
          onConfirm={() => {
            setConfirm(false);
            if (preview)
              void run(async () =>
                reconcile(
                  await publishHistoricalPublication(scope, preview.digest),
                ),
              );
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
