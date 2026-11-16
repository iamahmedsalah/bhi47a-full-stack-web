"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  GitCompareArrows,
  History,
  ShieldCheck,
  ArrowRightLeft,
  MoreVertical,
  RotateCcw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Root as DropdownMenu,
  Trigger as DropdownMenuTrigger,
  Content as DropdownMenuContent,
  Item as DropdownMenuItem,
  Portal as DropdownMenuPortal,
} from "@radix-ui/react-dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { HelpNote } from "@/components/ui/help-note";
import { getApiErrorMessage } from "@/lib/api";
import {
  carryIcGrades,
  undoIcCarry,
  getControlAttempts,
  type AttemptComparison,
  type AttemptView,
} from "../api";

export function ControlAttemptDialog({
  sheetId,
  locale,
  approval,
  canCarry,
  onClose,
  onApproved,
  onCarried,
}: {
  sheetId: string;
  locale: string;
  approval: boolean;
  canCarry: boolean;
  onClose: () => void;
  onApproved: (review: {
    attemptReviewDigest: string;
    keepPreviousStudentIds: string[];
  }) => Promise<void>;
  onCarried: () => Promise<void>;
}) {
  const t = useTranslations("controlAttempts"),
    ar = locale === "ar";
  const [undo, setUndo] = useState<{
    studentId: string;
    fingerprint: string;
  } | null>(null);
  const [page, setPage] = useState(1),
    [keep, setKeep] = useState<Record<string, boolean>>({}),
    [busy, setBusy] = useState(false);
  const [observedDigest, setObservedDigest] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ["control", "attempts", sheetId, page],
    queryFn: () => getControlAttempts(sheetId, page),
    staleTime: 0,
    retry: false,
  });
  // Any changed source invalidates choices made on another page.
  const digest = observedDigest ?? preview.data?.digest;
  if (preview.data && observedDigest === null)
    setObservedDigest(preview.data.digest);
  const changed = Boolean(preview.data && digest !== preview.data.digest);
  const details = useCallback(
    (attempt: AttemptView) => (
      <div className="space-y-1 text-xs">
        <bdi>
          {attempt.academicYear} · {t(`semesters.${attempt.semester}`)}
        </bdi>
        <div className="font-mono" dir="ltr">
          {attempt.result.percentage === null
            ? (attempt.result.letterGrade ?? "—")
            : `${attempt.result.percentage.toFixed(2)}%`}
        </div>
        <div>
          {attempt.marks.map((mark) => (
            <div key={mark.component}>
              {t(mark.component)}:{" "}
              <bdi>
                {mark.status === "present"
                  ? `${mark.grade} / ${mark.maxGrade}`
                  : t(`states.${mark.status}`)}
              </bdi>
            </div>
          ))}
        </div>
      </div>
    ),
    [t],
  );
  const columns = useMemo<
    DataTableColumn<AttemptComparison & { _id: string }>[]
  >(
    () => [
      {
        key: "student",
        header: t("student"),
        cell: (row) => (
          <div>
            <bdi>{row.studentCode}</bdi>
            <div>{ar ? row.nameAr || row.name : row.name}</div>
          </div>
        ),
      },
      {
        key: "previous",
        header: t("previous"),
        cell: (row) => details(row.previous),
      },
      {
        key: "current",
        header: t("current"),
        cell: (row) => details(row.current),
      },
      {
        key: "decision",
        header: t("decision"),
        cell: (row) => (
          <div className="space-y-2">
            <span
              className={
                row.canAcceptNew ? "text-emerald-500" : "text-amber-500"
              }
            >
              {t(row.canAcceptNew ? "higher" : "retain")}
            </span>
            {approval && row.canAcceptNew && (
              <label className="flex items-center gap-2">
                <Checkbox
                  aria-label={`${row.studentCode} ${t("keepPrevious")}`}
                  checked={keep[row.studentId] ?? false}
                  disabled={busy || changed}
                  onCheckedChange={(value) => {
                    setObservedDigest(preview.data!.digest);
                    setKeep((old) => ({
                      ...old,
                      [row.studentId]: value === true,
                    }));
                  }}
                />
                {t("keepPrevious")}
              </label>
            )}
          </div>
        ),
      },
      // The query result owns mark details; no live editing occurs inside this preview.
    ],
    [t, ar, approval, keep, busy, changed, preview.data, details],
  );
  const pages = Math.max(
    1,
    Math.ceil(
      Math.max(
        preview.data?.total ?? 0,
        preview.data?.icTotal ?? 0,
        preview.data?.carriedTotal ?? 0,
      ) / 50,
    ),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        dir={ar ? "rtl" : "ltr"}
        className="max-w-[min(95vw,1100px)] max-h-[90vh] overflow-y-auto rounded-2xl"
      >
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="size-5 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || preview.isFetching}
          onClick={async () => {
            const result = await preview.refetch();
            if (result.data) {
              setKeep({});
              setObservedDigest(result.data.digest);
              setPage(1);
            }
          }}
        >
          {t("refresh")}
        </Button>
        <HelpNote
          title={t("rulesTitle")}
          icon={<ShieldCheck className="size-4" />}
        >
          {t("rules")}
        </HelpNote>
        <HelpNote title={t("icTitle")} icon={<History className="size-4" />}>
          {t("icHelp")}
        </HelpNote>
        {preview.isLoading ? (
          <p role="status">{t("loading")}</p>
        ) : preview.isError ? (
          <div role="alert">
            {getApiErrorMessage(preview.error)}
            <Button onClick={() => void preview.refetch()}>{t("retry")}</Button>
          </div>
        ) : (
          preview.data && (
            <>
              {changed && (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-500 p-3"
                >
                  {t("changed")}
                  <Button
                    onClick={() => {
                      setKeep({});
                      setObservedDigest(preview.data!.digest);
                      setPage(1);
                      void preview.refetch();
                    }}
                  >
                    {t("refresh")}
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <ArrowRightLeft className="size-4" />
                {t("comparisonCount", { count: preview.data.total })}
              </div>
              {preview.data.comparisons.length ? (
                <DataTable
                  rows={preview.data.comparisons.map((row) => ({
                    ...row,
                    _id: row.studentId,
                  }))}
                  columns={columns}
                  rowClassName={(row) =>
                    row.canAcceptNew ? "bg-emerald-500/5" : "bg-amber-500/5"
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("noComparisons")}
                </p>
              )}
              {preview.data.icTotal > 0 && (
                <section className="space-y-3 rounded-xl border p-3">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <History className="size-4" />
                    {t("icTitle")}
                  </h3>
                  <p className="text-xs text-muted-foreground">{t("icHelp")}</p>
                  <DataTable
                    rows={preview.data.icSources.map((row) => ({
                      ...row,
                      _id: row.studentId,
                    }))}
                    columns={[
                      {
                        key: "student",
                        header: t("student"),
                        cell: (row) => (
                          <span>
                            <bdi>{row.studentCode}</bdi>{" "}
                            {ar ? row.nameAr || row.name : row.name}
                          </span>
                        ),
                      },
                      {
                        key: "source",
                        header: t("previous"),
                        cell: (row) => details(row.source),
                      },
                      {
                        key: "carry",
                        header: t("decision"),
                        cell: (row) => (
                          <DropdownMenu dir={ar ? "rtl" : "ltr"}>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`${row.studentCode} ${t("actions")}`}
                              >
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuContent
                                style={{ direction: ar ? "rtl" : "ltr" }}
                                align="start"
                                className="z-[80] min-w-56 rounded-xl border bg-card p-1 shadow-xl"
                              >
                                <DropdownMenuItem
                                  className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none focus:bg-accent data-[disabled]:opacity-40"
                                  disabled={
                                    !canCarry ||
                                    busy ||
                                    changed ||
                                    row.alreadyCarried
                                  }
                                  onSelect={async () => {
                                    setBusy(true);
                                    try {
                                      await carryIcGrades(
                                        sheetId,
                                        row.source.marks.find(
                                          (mark) => mark.component === "final",
                                        )!.id,
                                        row.source.fingerprint,
                                      );
                                      toast.success(t("carried"));
                                      await onCarried();
                                      const result = await preview.refetch();
                                      setKeep({});
                                      if (result.data)
                                        setObservedDigest(result.data.digest);
                                    } catch (error) {
                                      toast.error(getApiErrorMessage(error));
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                >
                                  {t(
                                    row.alreadyCarried
                                      ? "alreadyCarried"
                                      : "carry",
                                  )}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenuPortal>
                          </DropdownMenu>
                        ),
                      },
                    ]}
                  />
                </section>
              )}
              {preview.data.carriedTotal > 0 && (
                <section className="space-y-3 rounded-xl border p-3">
                  <h3 className="font-semibold">{t("carriedTitle")}</h3>
                  <DataTable
                    rows={preview.data.carried.map((row) => ({
                      ...row,
                      _id: row.studentId,
                    }))}
                    columns={[
                      {
                        key: "student",
                        header: t("student"),
                        cell: (row) => <bdi>{row.studentCode}</bdi>,
                      },
                      {
                        key: "source",
                        header: t("previous"),
                        cell: (row) => (
                          <bdi>
                            {row.academicYear} /{" "}
                            {t(`semesters.${row.semester}`)}
                          </bdi>
                        ),
                      },
                      {
                        key: "actions",
                        header: t("actions"),
                        cell: (row) => (
                          <DropdownMenu dir={ar ? "rtl" : "ltr"}>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`${row.studentCode} ${t("actions")}`}
                              >
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuContent
                                style={{ direction: ar ? "rtl" : "ltr" }}
                                align="start"
                                className="z-[80] min-w-56 rounded-xl border bg-card p-1 shadow-xl"
                              >
                                <DropdownMenuItem
                                  className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none focus:bg-accent data-[disabled]:opacity-40"
                                  disabled={!canCarry || busy}
                                  onSelect={() =>
                                    setUndo({
                                      studentId: row.studentId,
                                      fingerprint: row.fingerprint,
                                    })
                                  }
                                >
                                  <RotateCcw className="size-4" />
                                  {t("undo")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenuPortal>
                          </DropdownMenu>
                        ),
                      },
                    ]}
                  />
                </section>
              )}
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1 || busy}
                  onClick={() => {
                    setObservedDigest(preview.data!.digest);
                    setPage((value) => value - 1);
                  }}
                >
                  {t("previousPage")}
                </Button>
                <bdi>
                  {page} / {pages}
                </bdi>
                <Button
                  variant="outline"
                  disabled={page >= pages || busy}
                  onClick={() => {
                    setObservedDigest(preview.data!.digest);
                    setPage((value) => value + 1);
                  }}
                >
                  {t("nextPage")}
                </Button>
              </div>
            </>
          )
        )}
        <ConfirmDialog
          dir={ar ? "rtl" : "ltr"}
          open={Boolean(undo)}
          onOpenChange={(open) => {
            if (!open && !busy) setUndo(null);
          }}
          title={t("undo")}
          description={t("undoHelp")}
          confirmLabel={t("undo")}
          cancelLabel={t("close")}
          disabled={busy}
          onConfirm={() => {
            if (!undo) return;
            setBusy(true);
            void (async () => {
              try {
                await undoIcCarry(sheetId, undo.studentId, undo.fingerprint);
                await onCarried();
                const result = await preview.refetch();
                setKeep({});
                if (result.data) setObservedDigest(result.data.digest);
                setUndo(null);
                toast.success(t("undone"));
              } catch (error) {
                toast.error(getApiErrorMessage(error));
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
        <DialogFooter className="rtl:sm:justify-start">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("close")}
          </Button>
          {approval && (
            <Button
              disabled={!preview.data || changed || busy || preview.isFetching}
              onClick={async () => {
                setBusy(true);
                try {
                  await onApproved({
                    attemptReviewDigest: preview.data!.digest,
                    keepPreviousStudentIds: Object.entries(keep)
                      .filter(([, value]) => value)
                      .map(([id]) => id),
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("approve")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
