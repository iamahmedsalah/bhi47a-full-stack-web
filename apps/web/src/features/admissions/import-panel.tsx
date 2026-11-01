"use client";
import { getAdmissionErrorMessage } from "./admission-error";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdmissionImportRow } from "@student-portal/shared";
import {
  DataTableShell,
  type ColumnDef,
} from "@/components/ui/data-table-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TableCell } from "@/components/ui/table";
import { GlassCard } from "@/components/ui/glass-card";
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  Layers,
  FileCheck2,
} from "lucide-react";

import { downloadFileBlob } from "@/lib/export-utils";
import { cn } from "@/lib/cn";
import {
  admissionApply,
  admissionBatch,
  admissionDownload,
  admissionPreview,
} from "./workflow-api";
import {
  AdmissionDialog,
  AdmissionInput,
  AdmissionMenu,
  useAdmissionUI,
} from "./workflow-ui";

export function AdmissionImportPanel() {
  const { t, userId, date, dir } = useAdmissionUI(),
    params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname(),
    client = useQueryClient();
  const batchId = params.get("batch") ?? "";
  const [file, setFile] = useState<File | null>(null),
    [pending, setPending] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState<AdmissionImportRow | null>(null);
  const batch = useQuery({
    queryKey: ["admission-import", batchId, userId],
    queryFn: () => admissionBatch(batchId),
    enabled: /^[a-f0-9]{24}$/.test(batchId),
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  const rows = batch.data?.rows ?? [];
  const columns: ColumnDef<AdmissionImportRow>[] = [
    {
      key: "selection",
      header: (
        <Checkbox
          aria-label={t("selectAll")}
          checked={Boolean(
            rows.length &&
            rows.every((row) => selected.includes(String(row.row))),
          )}
          onCheckedChange={(value) =>
            setSelected(value ? rows.map((row) => String(row.row)) : [])
          }
          className="mx-auto"
        />
      ),
      className: "w-12 px-4 py-3 text-center",
      render: (row) => (
        <TableCell className="w-12 px-4 py-3 text-center">
          <Checkbox
            aria-label={t("select")}
            checked={selected.includes(String(row.row))}
            onCheckedChange={(value) =>
              setSelected(
                value
                  ? [...selected, String(row.row)]
                  : selected.filter((key) => key !== String(row.row)),
              )
            }
            className="mx-auto"
          />
        </TableCell>
      ),
    },
    {
      key: "row",
      header: t("row"),
      render: (row) => (
        <TableCell>
          <span className="font-mono text-xs">{row.row}</span>
        </TableCell>
      ),
    },
    {
      key: "id",
      header: t("requestId"),
      render: (row) => (
        <TableCell>
          <bdi className="font-mono text-xs">{row.requestId ?? "—"}</bdi>
        </TableCell>
      ),
    },
    {
      key: "action",
      header: t("actions"),
      render: (row) => (
        <TableCell>
          <span className="text-xs font-medium">
            {t(`importActions.${row.action ?? "UNKNOWN"}`)}
          </span>
        </TableCell>
      ),
    },
    {
      key: "state",
      header: t("statusLabel"),
      render: (row) => (
        <TableCell>
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
              row.state === "VALID" &&
                "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
              row.state === "INVALID" &&
                "bg-rose-500/10 text-rose-400 border border-rose-500/20",
              row.state === "APPLIED" &&
                "bg-sky-500/10 text-sky-400 border border-sky-500/20",
              row.state === "SKIPPED" &&
                "bg-amber-500/10 text-amber-400 border border-amber-500/20",
            )}
          >
            {t(`rowStates.${row.state}`)}
          </span>
        </TableCell>
      ),
    },
    {
      key: "error",
      header: t("validation"),
      render: (row) => (
        <TableCell className="max-w-xs truncate text-xs text-rose-400">
          {row.error ?? "—"}
        </TableCell>
      ),
    },
    {
      key: "actions",
      header: t("actions"),
      className: "text-center",
      render: (row) => (
        <TableCell className="text-center">
          <AdmissionMenu
            actions={[{ label: t("view"), onClick: () => setDetail(row) }]}
          />
        </TableCell>
      ),
    },
  ];
  const run = async (work: () => Promise<void>) => {
    setPending(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(getAdmissionErrorMessage(e, t));
    } finally {
      setPending(false);
    }
  };
  const downloadResults = async () => {
    const escape = (value: string) =>
      `"${(/^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
    const csv =
      "\uFEFF" +
      [
        ["Row", "RequestId", "Action", "Result", "Error"],
        ...rows.map((row) => [
          String(row.row),
          row.requestId ?? "",
          row.action ?? "",
          row.state,
          row.error ?? "",
        ]),
      ]
        .map((row) => row.map(escape).join(","))
        .join("\r\n");
    await downloadFileBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      "admission-import-results.csv",
      "text/csv;charset=utf-8",
    );
  };
  const validCount = rows.filter((r) => r.state === "VALID").length;
  const invalidCount = rows.filter((r) => r.state === "INVALID").length;
  const appliedCount = rows.filter((r) => r.state === "APPLIED").length;

  return (
    <div className="space-y-6">
      <GlassCard className="p-5 border border-border/60">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <span>{t("uploadWorkbook")}</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("importDescription")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              disabled={pending}
              className="gap-2 rounded-squircle h-10"
              onClick={() => run(() => admissionDownload("template"))}
            >
              <Download className="h-4 w-4" />
              <span>{t("template")}</span>
            </Button>
            <label className="relative cursor-pointer">
              <input
                type="file"
                accept=".xlsx"
                aria-label={t("uploadWorkbook")}
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <span className="inline-flex items-center gap-2 px-4 h-10 text-xs font-medium rounded-squircle border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors">
                <Upload className="h-4 w-4 text-primary" />
                <span className="max-w-[160px] truncate">
                  {file ? file.name : t("uploadWorkbook")}
                </span>
              </span>
            </label>
            <Button
              disabled={!file || pending}
              className="gap-2 rounded-squircle h-10"
              onClick={() =>
                run(async () => {
                  if (
                    !file ||
                    file.size > 5 * 1024 * 1024 ||
                    !/\.xlsx$/i.test(file.name)
                  )
                    throw new Error(t("fileLimit"));
                  const preview = await admissionPreview(file);
                  client.setQueryData(
                    ["admission-import", preview._id, userId],
                    preview,
                  );
                  const next = new URLSearchParams(params);
                  next.set("batch", preview._id);
                  router.replace(`${pathname}?${next}`);
                  setSelected([]);
                })
              }
            >
              <FileCheck2 className="h-4 w-4" />
              <span>{t("preview")}</span>
            </Button>
          </div>
        </div>
      </GlassCard>

      {error && (
        <p
          role="alert"
          className="text-sm text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-xl"
        >
          {error}
        </p>
      )}

      {batchId && (
        <div className="space-y-4">
          {batch.data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border/50 bg-card/60 p-3.5 text-center">
                <span className="text-xs text-muted-foreground block mb-1">
                  {t("batchTotal") ||
                    (dir === "rtl" ? "إجمالي الصفوف" : "Total Rows")}
                </span>
                <span className="text-xl font-bold font-mono text-foreground">
                  {rows.length}
                </span>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 text-center">
                <span className="text-xs text-emerald-400 block mb-1">
                  {t("batchValid") ||
                    (dir === "rtl" ? "صفوف صالحة" : "Valid Rows")}
                </span>
                <span className="text-xl font-bold font-mono text-emerald-400">
                  {validCount}
                </span>
              </div>
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5 text-center">
                <span className="text-xs text-rose-400 block mb-1">
                  {t("batchInvalid") ||
                    (dir === "rtl" ? "صفوف بها أخطاء" : "Error Rows")}
                </span>
                <span className="text-xl font-bold font-mono text-rose-400">
                  {invalidCount}
                </span>
              </div>
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3.5 text-center">
                <span className="text-xs text-sky-400 block mb-1">
                  {t("batchStatus") ||
                    (dir === "rtl" ? "حالة الدفعة" : "Batch Status")}
                </span>
                <span className="text-xs font-bold text-sky-400 block mt-1">
                  {t(`batchStates.${batch.data.status}`)}
                </span>
              </div>
            </div>
          )}

          <DataTableShell
            data={rows}
            columns={columns}
            keyExtractor={(row) => String(row.row)}
            isLoading={batch.isLoading}
            isError={batch.isError}
            error={batch.error}
            onRetry={() => batch.refetch()}
            emptyMessage={t("empty")}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap gap-2.5">
              <Button
                disabled={
                  pending ||
                  !batch.data ||
                  batch.data.status === "APPLIED" ||
                  !rows.some((row) => row.state === "VALID")
                }
                className="gap-2 rounded-squircle"
                onClick={() => setConfirm(true)}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{t("applyValid")}</span>
              </Button>
              <Button
                variant="outline"
                disabled={!rows.length}
                className="gap-2 rounded-squircle"
                onClick={() => run(downloadResults)}
              >
                <Download className="h-4 w-4" />
                <span>{t("downloadResults")}</span>
              </Button>
            </div>
            {selected.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {t("inspectSelected", { count: selected.length })}
              </span>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        dir={dir}
        open={confirm}
        onOpenChange={setConfirm}
        title={t("applyValid")}
        description={t("validRowsOnly")}
        confirmLabel={t("applyValid")}
        cancelLabel={t("close")}
        disabled={pending}
        destructive={false}
        onConfirm={() =>
          run(async () => {
            const result = await admissionApply(batchId);
            client.setQueryData(["admission-import", batchId, userId], result);
            await client.invalidateQueries({
              queryKey: ["admission-requests"],
            });
            setConfirm(false);
          })
        }
      />
      <AdmissionDialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={t("view")}
      >
        {detail && (
          <div className="space-y-3">
            <bdi>{detail.requestId}</bdi>
            <p>{t(`rowStates.${detail.state}`)}</p>
            <p>{detail.error}</p>
            {Object.entries(detail.input ?? {}).map(([key, value]) => (
              <p key={key}>
                <span className="font-semibold">
                  {t(`importFields.${key}`)}
                </span>
                :{" "}
                <bdi>
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
                </bdi>
              </p>
            ))}
          </div>
        )}
      </AdmissionDialog>
    </div>
  );
}
