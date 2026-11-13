"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
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
}: {
  file: File;
  sheetId: string;
  rows: WorkbookRow[];
  locale: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations("control");
  const [batches, setBatches] = useState<Batch[]>([]);
  const plans = useRef<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [uploading, setUploading] = useState(false);
  const guard = useRef(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
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
        const first = await previewControlFile(sheetId, file, 0);
        const next: Batch[] = [{ preview: first }];
        if (alive) setBatches([...next]);
        for (let batch = 1; batch < (first.totalBatches ?? 1); batch++) {
          if (!alive) return;
          next.push({
            preview: await previewControlFile(sheetId, file, batch),
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
  const changes = current?.preview.changes ?? [];
  const filtered = changes.filter((change) => {
    const row = byId.get(change.studentId);
    return `${row?.studentCode ?? ""} ${row?.name ?? ""} ${row?.nameAr ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const valid = batches.reduce((sum, batch) => sum + batch.preview.valid, 0);
  const skipped = batches.reduce((sum, batch) => sum + (batch.preview.skipped ?? 0), 0);
  const saved = batches.reduce((sum, batch) => sum + (batch.saved ?? 0), 0);
  const invalid = batches.reduce(
    (sum, batch) =>
      sum + batch.preview.errors.length + (batch.failures?.length ?? 0),
    0,
  );
  const complete =
    !loading && valid > 0 &&
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
        className="flex max-w-4xl flex-col rounded-2xl max-h-[90dvh] overflow-hidden"
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
        <div className="min-h-0 space-y-4 overflow-y-auto">
          <div
            role="status"
            aria-live="polite"
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm"
          >
            <div className="rounded-xl border p-3">
              <p>{t("batchCount", { count: batches.length })}</p>
              <p>
                {t("totalFileRows", {
                  count: batches[0]?.preview.totalRows ?? 0,
                })}
              </p>
            </div>
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
              {t("validRows", { count: valid })}
            </div>
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
              {t("invalidRows", { count: invalid })}
            </div>
            <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-3">
              {t("savedCount", { count: saved })}
            </div>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {loading ? t("previewProgress", { current: batches.length, total: batches[0]?.preview.totalBatches ?? 1 }) : t("previewReady", { valid, invalid, skipped })}
          </p>
          <p className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm" role="note">
            {t("fileInputHelp")}
          </p>
          {ready && valid === 0 && invalid === 0 && <p role="status" className="rounded-xl border p-3 text-sm">{t("noImportChanges")}</p>}
          <p className="text-sm">{t("savedProgress", { saved, valid })}</p>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={t("batchProgress")}
            aria-valuemin={0}
            aria-valuemax={Math.max(1, valid)}
            aria-valuenow={saved}
          ><div className="h-full bg-primary transition-all" style={{ width: `${valid ? Math.min(100, saved / valid * 100) : 0}%` }} /></div>
          <p
            role="note"
            className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
          >
            <AlertTriangle className="size-4 shrink-0" />
            {t("batchWarning")}
          </p>
          {loading && (
            <p className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              {t("loading")}
            </p>
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
              <div className="max-h-72 overflow-auto rounded-xl border [&_th]:text-muted-foreground">
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
              {!!errors.length && (
                <div
                  className="max-h-40 overflow-auto rounded-xl border border-destructive/30 p-3"
                  role="alert"
                >
                  {errors.map((message, i) => (
                    <p key={i} className="text-sm text-destructive">
                      {getApiErrorMessage({ response: { data: { message } } })}
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
