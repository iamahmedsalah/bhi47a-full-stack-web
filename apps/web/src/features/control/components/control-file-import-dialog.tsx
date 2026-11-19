"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ControlTransferProgress } from "./control-transfer-progress";
import { useTranslations } from "next-intl";
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  XCircle,
  UploadCloud,
} from "lucide-react";
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
import { normalizeSearchText } from "@/lib/search-text";
import { DataTable } from "@/components/ui/data-table";
import { getApiErrorMessage } from "@/lib/api";
import {
  previewControlFile,
  commitControlImport,
  exportControlImportErrors,
} from "../api";
import type { ControlImportPreview, WorkbookRow } from "../types";

type Batch = {
  preview: ControlImportPreview;
  receipt?: string;
  saved?: number;
  failures?: string[];
};
// Operation IDs change on re-preview; identity, values and expected revisions must not.
const signature = (preview: ControlImportPreview) =>
  JSON.stringify({
    errors: preview.errors,
    changes: preview.changes.map((change) =>
      Object.fromEntries(
        Object.entries(change).filter(([key]) => key !== "opId"),
      ),
    ),
  });

export function ControlFileImportDialog({
  file,
  sheetId,
  rows,
  locale,
  onClose,
  onSaved,
  onChooseAnother,
}: {
  file: File;
  sheetId: string;
  rows: WorkbookRow[];
  locale: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onChooseAnother?: () => void;
}) {
  const t = useTranslations("control");
  const [batches, setBatches] = useState<Batch[]>([]);
  const plans = useRef<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferPercent, setTransferPercent] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [uploading, setUploading] = useState(false);
  const guard = useRef(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [byId] = useState(
    () => new Map(rows.map((row) => [row.studentId, row])),
  );
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        if (!file.name.toLowerCase().endsWith(".xlsx"))
          throw new Error(t("fileTypeError"));
        if (!file.size || file.size > 2 * 1024 * 1024)
          throw new Error(t("fileSizeError"));
        const reportProgress = (percent: number | null) => {
          if (alive) setTransferPercent(percent);
        };
        const first = await previewControlFile(
          sheetId,
          file,
          0,
          reportProgress,
        );
        const next: Batch[] = [{ preview: first }];
        if (alive) setBatches([...next]);
        for (let batch = 1; batch < (first.totalBatches ?? 1); batch++) {
          if (!alive) return;
          setTransferPercent(null);
          next.push({
            preview: await previewControlFile(
              sheetId,
              file,
              batch,
              reportProgress,
            ),
          });
          if (alive) setBatches([...next]);
        }
        plans.current = next;
        if (alive) setReady(true);
      } catch (cause) {
        if (alive)
          setError(
            cause instanceof Error &&
              [t("fileTypeError"), t("fileSizeError")].includes(cause.message)
              ? cause.message
              : getApiErrorMessage(cause),
          );
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [file, sheetId, t, attempt]);

  async function upload() {
    if (guard.current || loading || !plans.current.length) return;
    guard.current = true;
    setUploading(true);
    setError("");
    try {
      for (const [batchIndex, plan] of plans.current.entries()) {
        if (plan.saved !== undefined || !plan.preview.valid) continue;
        setIndex(batchIndex);
        setPage(1);
        if (!plan.receipt) {
          if (batchIndex > 0) {
            const fresh = await previewControlFile(sheetId, file, batchIndex);
            if (signature(fresh) !== signature(plan.preview))
              throw new Error(t("batchChanged"));
            plan.preview = fresh;
          }
          plan.receipt = plan.preview.previewId;
        }
        const result = await commitControlImport(sheetId, plan.receipt);
        plan.saved = result.summary.ok;
        plan.failures = result.results
          .filter((row) => row.result !== "ok")
          .map(
            (row) =>
              `${byId.get(row.studentId)?.studentCode ?? row.studentId}: ${row.message ?? row.code ?? row.result}`,
          );
        setBatches([...plans.current]);
        if (result.summary.ok !== plan.preview.valid)
          throw new Error(t("partialFailure"));
      }
    } catch (cause) {
      setError(
        cause instanceof Error &&
          [t("batchChanged"), t("partialFailure")].includes(cause.message)
          ? cause.message
          : getApiErrorMessage(cause),
      );
    } finally {
      guard.current = false;
      setUploading(false);
      try {
        await onSaved();
      } catch (cause) {
        setError((current) => current || getApiErrorMessage(cause));
      }
    }
  }
  const current = batches[index];
  const reviewRows = useMemo(
    () =>
      current?.preview.reviewRows?.filter(
        (row) =>
          (!issuesOnly || row.status === "invalid") &&
          normalizeSearchText(
            `${row.studentCode} ${row.name} ${row.nameAr} ${row.sourceRow} ${row.issues.join(" ")}`,
          ).includes(normalizeSearchText(search)),
      ),
    [current, issuesOnly, search],
  );
  const changes = current?.preview.changes ?? [];
  const filtered = changes.filter((change) => {
    const row = byId.get(change.studentId);
    return `${row?.studentCode ?? ""} ${row?.name ?? ""} ${row?.nameAr ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });
  const pages = Math.max(
    1,
    Math.ceil((reviewRows?.length ?? filtered.length) / 50),
  );
  const valid = batches.reduce((sum, batch) => sum + batch.preview.valid, 0);
  const skipped = batches.reduce(
    (sum, batch) => sum + (batch.preview.skipped ?? 0),
    0,
  );
  const saved = batches.reduce((sum, batch) => sum + (batch.saved ?? 0), 0);
  const invalid = batches.reduce(
    (sum, batch) =>
      sum + batch.preview.errors.length + (batch.failures?.length ?? 0),
    0,
  );
  const complete =
    !loading &&
    valid > 0 &&
    batches.length > 0 &&
    batches.every((batch) => batch.saved !== undefined || !batch.preview.valid);
  const errors = [
    ...(current?.preview.errors ?? []),
    ...(current?.failures ?? []),
  ];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !uploading) onClose();
      }}
    >
      <DialogContent
        dir={locale === "ar" ? "rtl" : "ltr"}
        className="flex w-[calc(100vw-2rem)] max-w-5xl flex-col rounded-2xl max-h-[90dvh] overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-start">
            <FileSpreadsheet className="size-5 text-primary" />
            {t("filePreviewTitle")}
          </DialogTitle>
          <DialogDescription className="text-start">
            <bdi>{file.name}</bdi> · {t("batchHelp")}
          </DialogDescription>
        </DialogHeader>
        {onChooseAnother && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="size-5 shrink-0 text-primary" />
              <bdi className="truncate text-sm">{file.name}</bdi>
            </div>
            <Button
              variant="outline"
              disabled={uploading || loading}
              onClick={onChooseAnother}
            >
              <UploadCloud className="size-4" />
              {locale === "ar" ? "اختيار ملف آخر" : "Choose another file"}
            </Button>
          </div>
        )}
        <div className="min-h-0 space-y-4 overflow-y-auto">
          <div
            role="status"
            aria-live="polite"
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm"
          >
            <div className="rounded-2xl border bg-card p-3">
              <FileSpreadsheet className="size-5 text-primary mb-2" />
              <p>{t("batchCount", { count: batches.length })}</p>
              <p>
                {t("totalFileRows", {
                  count: batches[0]?.preview.totalRows ?? 0,
                })}
              </p>
            </div>
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
              <CheckCircle2 className="size-5 text-sky-400 mb-2" />
              {t("validRows", { count: valid })}
            </div>
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
              <XCircle className="size-5 text-rose-400 mb-2" />
              {t("invalidRows", { count: invalid })}
            </div>
            <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-3">
              <CheckCircle2 className="size-5 text-teal-400 mb-2" />
              {t("savedCount", { count: saved })}
            </div>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {loading
              ? t("previewProgress", {
                  current: batches.length,
                  total: batches[0]?.preview.totalBatches ?? 1,
                })
              : t("previewReady", { valid, invalid, skipped })}
          </p>
          <HelpNote
            title={
              locale === "ar" ? "كيفية تعديل الملف" : "How to edit the workbook"
            }
            className="border-sky-500/30 bg-sky-500/10"
          >
            {t("fileInputHelp")}
          </HelpNote>
          {ready && valid === 0 && invalid === 0 && (
            <p role="status" className="rounded-xl border p-3 text-sm">
              {t("noImportChanges")}
            </p>
          )}
          <p className="flex justify-between gap-3 text-sm">
            <span>{t("savedProgress", { saved, valid })}</span>
            <bdi dir="ltr" className="font-mono">
              {valid ? Math.floor(Math.min(100, (saved / valid) * 100)) : 0}%
            </bdi>
          </p>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={t("batchProgress")}
            aria-valuemin={0}
            aria-valuemax={Math.max(1, valid)}
            aria-valuenow={saved}
          >
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${valid ? Math.min(100, (saved / valid) * 100) : 0}%`,
              }}
            />
          </div>
          <HelpNote
            title={
              locale === "ar" ? "الدفعات وإعادة المحاولة" : "Batches and retry"
            }
            icon={<AlertTriangle className="size-4 shrink-0" />}
            className="border-amber-500/30 bg-amber-500/10"
          >
            {t("batchWarning")}
          </HelpNote>
          {loading && (
            <ControlTransferProgress
              percent={transferPercent}
              label={
                transferPercent === 100
                  ? locale === "ar"
                    ? "تم نقل الملف؛ جارٍ فحص صفوف الدفعة"
                    : "File transferred; validating batch rows"
                  : locale === "ar"
                    ? "نقل الملف للفحص"
                    : "Uploading file for validation"
              }
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {error && !ready && !loading && (
            <Button
              variant="outline"
              onClick={() => {
                setBatches([]);
                setError("");
                setLoading(true);
                setAttempt((value) => value + 1);
              }}
            >
              {t("retry")}
            </Button>
          )}
          {batches.length > 0 && (
            <>
              {current?.preview.rules && (
                <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{t(current.preview.rules.component)}</span>
                  <span>
                    {locale === "ar" ? "الدرجة العظمى" : "Maximum"}:{" "}
                    <bdi>{current.preview.rules.max}</bdi>
                  </span>
                  <span>
                    {locale === "ar" ? "خطوة الإدخال" : "Increment"}:{" "}
                    <bdi>{current.preview.rules.step}</bdi>
                  </span>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  disabled={uploading || index === 0}
                  onClick={() => {
                    setIndex(index - 1);
                    setPage(1);
                  }}
                >
                  {t("previous")}
                </Button>
                <span>
                  {t("batchPosition", {
                    current: index + 1,
                    total: batches.length,
                  })}
                </span>
                <Button
                  variant="outline"
                  disabled={uploading || index >= batches.length - 1}
                  onClick={() => {
                    setIndex(index + 1);
                    setPage(1);
                  }}
                >
                  {t("next")}
                </Button>
                {current.saved !== undefined &&
                  (current.failures?.length ? (
                    <AlertTriangle
                      className="size-4 text-amber-500"
                      aria-label={t("partialFailure")}
                    />
                  ) : (
                    <CheckCircle2 className="size-4 text-teal-500" />
                  ))}
              </div>
              <Input
                aria-label={t("search")}
                placeholder={t("search")}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
              {reviewRows && (
                <div className="flex gap-2">
                  <Button
                    variant={!issuesOnly ? "default" : "outline"}
                    onClick={() => {
                      setIssuesOnly(false);
                      setPage(1);
                    }}
                    aria-pressed={!issuesOnly}
                  >
                    {locale === "ar" ? "معاينة كل الصفوف" : "Preview all rows"}
                  </Button>
                  <Button
                    variant={issuesOnly ? "default" : "outline"}
                    onClick={() => {
                      setIssuesOnly(true);
                      setPage(1);
                    }}
                    aria-pressed={issuesOnly}
                  >
                    {locale === "ar" ? "الصفوف غير الصالحة" : "Invalid rows"}
                  </Button>
                </div>
              )}
              <div className="max-h-[45dvh] overflow-auto rounded-2xl border [&_table]:min-w-[860px] [&_table]:table-fixed [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_th]:bg-muted [&_th]:text-foreground [&_th]:px-2 [&_th]:py-2.5 [&_th]:text-xs [&_th]:whitespace-nowrap [&_td]:px-2 [&_td]:py-2 [&_td]:text-[11px] [&_td]:leading-5 [&_td]:align-top">
                {reviewRows ? (
                  <DataTable
                    rowClassName={(row) =>
                      row.status === "invalid"
                        ? "bg-rose-500/10 hover:bg-rose-500/15"
                        : row.status === "valid"
                          ? "bg-teal-500/5"
                          : "opacity-75"
                    }
                    rows={reviewRows
                      .slice((page - 1) * 50, page * 50)
                      .map((row) => ({ ...row, _id: String(row.sourceRow) }))}
                    columns={[
                      {
                        key: "row",
                        header: "#",
                        className: "w-8",
                        cell: (row) => row.sourceRow,
                      },
                      {
                        key: "code",
                        className: "w-24",
                        header: t("studentCode"),
                        cell: (row) => <bdi>{row.studentCode}</bdi>,
                      },
                      {
                        key: "name",
                        className: "w-44 break-words",
                        header: t("studentName"),
                        cell: (row) =>
                          locale === "ar" ? row.nameAr || row.name : row.name,
                      },
                      {
                        key: "before",
                        className: "w-20",
                        header: t("beforeValue"),
                        cell: (row) => row.before ?? "—",
                      },
                      {
                        key: "after",
                        className: "w-20",
                        header: t("afterValue"),
                        cell: (row) => row.after ?? "—",
                      },
                      {
                        key: "status",
                        className: "w-24 whitespace-nowrap",
                        header: t("status"),
                        cell: (row) => (
                          <span
                            className={
                              "inline-flex items-center gap-1 whitespace-nowrap rounded-squircle border px-1.5 py-0.5 text-[10px] " +
                              (row.status === "invalid"
                                ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                                : row.status === "valid"
                                  ? "border-teal-500/40 text-teal-400"
                                  : "border-border text-muted-foreground")
                            }
                          >
                            {row.status === "invalid" ? (
                              <XCircle className="size-3.5" />
                            ) : (
                              <CheckCircle2 className="size-3.5" />
                            )}
                            {locale === "ar"
                              ? {
                                  valid: "صالح",
                                  invalid: "غير صالح",
                                  unchanged: "دون تغيير",
                                }[row.status]
                              : row.status}
                          </span>
                        ),
                      },
                      {
                        key: "examStatus",
                        header: locale === "ar" ? "حالة الطالب" : "Exam status",
                        className: "w-20 whitespace-nowrap",
                        cell: (row) =>
                          row.examStatus &&
                          [
                            "present",
                            "absent",
                            "banned",
                            "excused",
                            "withheld",
                            "incomplete",
                          ].includes(row.examStatus)
                            ? t(`states.${row.examStatus}`)
                            : row.examStatus || "—",
                      },
                      {
                        key: "issues",
                        className: "break-words",
                        header:
                          locale === "ar"
                            ? "ملاحظات التحقق"
                            : "Validation details",
                        cell: (row) =>
                          row.issues.map((message) => (
                            <p
                              key={message}
                              className="text-destructive text-[11px] leading-5"
                            >
                              {getApiErrorMessage({
                                response: { data: { message } },
                              })}
                            </p>
                          )),
                      },
                    ]}
                  />
                ) : (
                  <DataTable
                    rows={filtered
                      .slice((page - 1) * 50, page * 50)
                      .map((change) => ({ ...change, _id: change.studentId }))}
                    columns={[
                      {
                        key: "student",
                        header: t("studentCode"),
                        cell: (change) => (
                          <bdi>{byId.get(change.studentId)?.studentCode}</bdi>
                        ),
                      },
                      {
                        key: "name",
                        header: t("studentName"),
                        cell: (change) => {
                          const row = byId.get(change.studentId);
                          return locale === "ar"
                            ? row?.nameAr || row?.name
                            : row?.name;
                        },
                      },
                      {
                        key: "before",
                        header: t("beforeValue"),
                        cell: (change) =>
                          byId.get(change.studentId)?.score ?? "—",
                      },
                      {
                        key: "after",
                        header: t("afterValue"),
                        cell: (change) =>
                          change.score ??
                          (change.status ? t(`states.${change.status}`) : "—"),
                      },
                      {
                        key: "status",
                        header: t("status"),
                        cell: (change) =>
                          change.status ? t(`states.${change.status}`) : "—",
                      },
                      ...(changes.some(
                        (change) =>
                          change.attendanceMark !== undefined ||
                          change.quizzesMark !== undefined,
                      )
                        ? [
                            {
                              key: "attendance",
                              header: t("attendance"),
                              cell: (change: (typeof changes)[number]) =>
                                change.attendanceMark ?? "—",
                            },
                            {
                              key: "quizzes",
                              header: t("quizzes"),
                              cell: (change: (typeof changes)[number]) =>
                                change.quizzesMark ?? "—",
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t("previous")}
                </Button>
                <span>
                  {page} / {pages}
                </span>
                <Button
                  variant="outline"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  {t("next")}
                </Button>
              </div>
              {!!errors.length &&
                (!reviewRows || !!current?.failures?.length) && (
                  <div
                    className="max-h-40 overflow-auto rounded-xl border border-destructive/30 p-3"
                    role="alert"
                  >
                    {errors.map((message, i) => (
                      <p key={i} className="text-sm text-destructive">
                        {getApiErrorMessage({
                          response: { data: { message } },
                        })}
                      </p>
                    ))}
                  </div>
                )}
            </>
          )}
        </div>
        {complete && invalid > 0 && (
          <p
            role="alert"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
          >
            {t("batchFinishedWithErrors", { saved, invalid })}
          </p>
        )}
        <DialogFooter className="shrink-0 rtl:sm:justify-start">
          <Button variant="outline" disabled={uploading} onClick={onClose}>
            {complete ? t("close") : t("cancel")}
          </Button>
          {!!errors.length && (
            <Button
              variant="outline"
              disabled={uploading}
              onClick={() =>
                void exportControlImportErrors(
                  sheetId,
                  current.preview.previewId,
                ).catch((cause) => setError(getApiErrorMessage(cause)))
              }
            >
              {t("errorsExport")}
            </Button>
          )}
          <Button
            disabled={loading || uploading || !ready || complete || !valid}
            onClick={() => void upload()}
          >
            {uploading && <Loader2 className="me-2 size-4 animate-spin" />}
            {error ? t("retry") : t("confirmImport")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
