"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Download,
  Upload,
  History,
  SlidersHorizontal,
  Lock,
  Unlock,
  MoreVertical,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  CONTROL_COMPONENT_KEYS,
  CONTROL_RESTRICTED_STATES,
  CONTROL_SCORELESS_STATES,
  GRADE_STATUS_VALUES,
  computeCoursework,
  parseMarkInput,
  validateMark,
  type ControlComponentKey,
  type GradeStatus,
} from "@student-portal/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Root as DropdownMenu,
  Content as DropdownMenuContent,
  Item as DropdownMenuItem,
  Trigger as DropdownMenuTrigger,
  Portal as DropdownMenuPortal,
} from "@radix-ui/react-dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getApiErrorMessage, getApiErrorDetails } from "@/lib/api";
import { useTableState } from "@/hooks/use-table-state";
import { cn } from "@/lib/cn";
import {
  applyControlChanges,
  commitControlImport,
  controlKeys,
  exportControlSheet,
  exportControlImportErrors,
  getControlWorkbook,
  openControlSheet,
  previewControlFile,
  previewControlRows,
  reviewControlSheet,
} from "../api";
import type {
  ControlImportPreview,
  ControlRosterRow,
  ControlSheetDetails,
  GradeChangeInput,
  WorkbookRow,
} from "../types";

type Draft = GradeChangeInput & {
  raw: string;
  attendance: string;
  quizzes: string;
  error?: string;
};
// Keep unsaved work across SPA back/forward navigation in this tab. Never share
// drafts between authenticated principals, or persist grade drafts to disk.
const draftArchive = new Map<string, Record<string, Draft>>();
interface Props {
  principalId?: string;
  sheetDetails: ControlSheetDetails;
  locale: string;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenScheme: () => void;
  onOpenSheetAudit: () => void;
  onOpenRowAudit: (row: ControlRosterRow) => void;
  onLockToggleRequest: () => void;
  onPendingChange?: (pending: boolean) => void;
}

/** All component columns stay visible; the selected component owns editing/review. */
export function ControlWorkbookGrid({
  principalId,
  sheetDetails: detail,
  locale,
  search,
  onSearchChange,
  onOpenScheme,
  onOpenSheetAudit,
  onOpenRowAudit,
  onLockToggleRequest,
  onPendingChange,
}: Props) {
  const t = useTranslations("control");
  const rtl = locale === "ar";
  const router = useRouter();
  const query = useQueryClient();
  const { sheet, capabilities: caps } = detail;
  const key = sheet.component;
  const workbook = useQuery({
    queryKey: [...controlKeys.sheet(sheet.id), "workbook"],
    queryFn: () => getControlWorkbook(sheet.id),
  });
  const archiveKey = principalId ? `${principalId}:${sheet.id}` : "";
  const [restoredDraft] = useState(() =>
    archiveKey ? draftArchive.get(archiveKey) : undefined,
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    restoredDraft ?? {},
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflictRevs, setConflictRevs] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(Boolean(restoredDraft));
  const [needsSchemeRefresh, setNeedsSchemeRefresh] = useState(false);
  const view = useTableState({
    defaultFilters: {
      gridSort: "code",
      gridDirection: "asc",
      gridFilter: "all",
      gridMissing: "false",
    },
    defaultLimit: 100,
  });
  const onlyMissing = view.filters.gridMissing === "true";
  const setOnlyMissing = (value: boolean) =>
    view.setFilter("gridMissing", String(value));
  const sort = view.filters.gridSort as "code" | "name" | "mark";
  const setSort = (value: typeof sort) => view.setFilter("gridSort", value);
  const descending = view.filters.gridDirection === "desc";
  const setDescending = (value: boolean) =>
    view.setFilter("gridDirection", value ? "desc" : "asc");
  const page = view.page;
  const setPage = view.setPage;
  const filter = view.filters.gridFilter;
  const setFilter = (value: string) => view.setFilter("gridFilter", value);
  const selectionScope = JSON.stringify([
    search,
    page,
    filter,
    onlyMissing,
    sort,
    descending,
  ]);
  const [previousSelectionScope, setPreviousSelectionScope] =
    useState(selectionScope);
  if (previousSelectionScope !== selectionScope) {
    setPreviousSelectionScope(selectionScope);
    setSelected([]);
  }
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<
    "SUBMIT" | "APPROVE" | "RETURN" | "REOPEN" | "CLEAR" | null
  >(null);
  const [preview, setPreview] = useState<ControlImportPreview | null>(null);
  const [undo, setUndo] = useState<GradeChangeInput[]>([]);
  const inFlight = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const draftRef = useRef(drafts);
  useEffect(() => {
    draftRef.current = drafts;
    if (archiveKey) {
      if (Object.keys(drafts).length) draftArchive.set(archiveKey, drafts);
      else draftArchive.delete(archiveKey);
    }
  }, [drafts, archiveKey]);
  const rows = workbook.data?.rows ?? [];
  const byId = useMemo(
    () => new Map(rows.map((r) => [r.studentId, r])),
    [rows],
  );
  const filtered = rows
    .filter((row) => {
      if (
        !`${row.studentCode} ${row.name} ${row.nameAr ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
        return false;
      if (onlyMissing && row.components[key]?.status) return false;
      if (filter === "invalid" && !drafts[row.studentId]?.error) return false;
      if (filter === "dirty" && !drafts[row.studentId]) return false;
      if (filter === "errors" && !errors[row.studentId]) return false;
      if (filter === "absent" && row.components[key]?.status !== "absent")
        return false;
      return true;
    })
    .sort((a, b) => {
      const value =
        sort === "mark"
          ? (a.components[key]?.score ?? -1) - (b.components[key]?.score ?? -1)
          : sort === "name"
            ? (rtl ? a.nameAr || a.name : a.name).localeCompare(
                rtl ? b.nameAr || b.name : b.name,
              )
            : a.studentCode.localeCompare(b.studentCode);
      return descending ? -value : value;
    });
  const pageCount = Math.max(1, Math.ceil(filtered.length / 100));
  const currentPage = Math.max(
    1,
    Math.min(Number.isInteger(page) ? page : 1, pageCount),
  );
  const visible = filtered.slice((currentPage - 1) * 100, currentPage * 100);
  const pending = Object.keys(drafts).length > 0;
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);
  const refresh = useCallback(async () => {
    await query.invalidateQueries({ queryKey: controlKeys.all });
  }, [query]);

  const save = useCallback(async () => {
    if (inFlight.current) return false;
    const allDrafts = Object.values(draftRef.current);
    const validDrafts = allDrafts.filter((draft) => !draft.error);
    const snapshot = validDrafts.slice(0, 500);
    if (!snapshot.length) return allDrafts.length === 0;
    inFlight.current = true;
    setSaving(true);
    try {
      const result = await applyControlChanges(sheet.id, {
        expectedSchemeVersion: workbook.data?.scheme.version ?? 0,
        changes: snapshot.map(
          ({ raw: _raw, attendance: _a, quizzes: _q, error: _e, ...change }) =>
            change,
        ),
        reason: reason.trim() || undefined,
      });
      const success = new Set(
        result.results.filter((r) => r.result === "ok").map((r) => r.opId),
      );
      setDrafts((current) => {
        const next = { ...current };
        for (const item of result.results) {
          const d = next[item.studentId];
          if (item.result !== "ok" || !d) continue;
          if (d.opId === item.opId) delete next[item.studentId];
          else
            next[item.studentId] = {
              ...d,
              expectedRev: item.entry?.rev ?? d.expectedRev,
            };
        }
        return next;
      });
      const issues: Record<string, string> = {};
      for (const r of result.results)
        if (r.result !== "ok")
          issues[r.studentId] =
            r.result === "conflict"
              ? t("conflict", { score: r.current?.score ?? "—" })
              : r.message || t("saveFailed");
      setConflictRevs((current) => {
        const next = { ...current };
        for (const item of result.results) {
          if (item.result === "conflict")
            next[item.studentId] = item.current?.rev ?? 0;
          else if (item.result === "ok") delete next[item.studentId];
        }
        return next;
      });
      setErrors(issues);
      setFailed(Object.keys(issues).length > 0);
      if (success.size) {
        setUndo(
          snapshot
            .filter((d) => success.has(d.opId))
            .map((d) => {
              const prior = byId.get(d.studentId)?.components[key];
              return {
                studentId: d.studentId,
                score: prior?.score ?? null,
                status: prior?.status as GradeStatus | undefined,
                expectedRev: 0,
                opId: crypto.randomUUID(),
                attendanceMark: prior?.attendanceMark ?? undefined,
                quizzesMark: prior?.quizzesMark ?? undefined,
              };
            }),
        );
        await refresh();
      }
      return (
        Object.keys(issues).length === 0 && allDrafts.length === snapshot.length
      );
    } catch (error) {
      if (getApiErrorDetails(error).code === "SCHEME_CHANGED")
        setNeedsSchemeRefresh(true);
      setFailed(true);
      toast.error(getApiErrorMessage(error));
      return false;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [sheet.id, key, byId, reason, refresh, t, workbook.data?.scheme.version]);

  useEffect(() => {
    if (!pending || failed || saving || !caps.canEdit) return;
    const timer = setTimeout(() => {
      void save();
    }, 800);
    return () => clearTimeout(timer);
  }, [drafts, pending, failed, saving, caps.canEdit, save]);
  useEffect(() => {
    if (!pending) return;
    const before = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", before);
    // Links cannot silently unmount an editor holding unsaved/failed edits.
    const click = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("a[href]")) {
        event.preventDefault();
        toast.error(t("saveBeforeLeaving"));
      }
    };
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", click, true);
    };
  }, [pending, t]);

  function edit(
    row: WorkbookRow,
    field: "raw" | "attendance" | "quizzes" | "status",
    value: string,
  ) {
    if (!caps.canEdit || row.notRegistered || row.components[key]?.isPublished)
      return;
    const prior = row.components[key];
    setFailed(false);
    setErrors((current) => ({ ...current, [row.studentId]: "" }));
    setDrafts((current) => {
      const initial: Draft = {
        studentId: row.studentId,
        expectedRev: prior?.rev ?? 0,
        opId: crypto.randomUUID(),
        raw: prior?.score == null ? "" : String(prior.score),
        attendance:
          prior?.attendanceMark == null ? "" : String(prior.attendanceMark),
        quizzes: prior?.quizzesMark == null ? "" : String(prior.quizzesMark),
        status: prior?.status as GradeStatus | undefined,
      };
      const next: Draft = {
        ...(current[row.studentId] ?? initial),
        [field]: value,
        reason: reason.trim() || undefined,
      };
      next.opId = crypto.randomUUID();
      let parsed = parseMarkInput(next.raw);
      if (key === "coursework") {
        const a = parseMarkInput(next.attendance),
          q = parseMarkInput(next.quizzes);
        const score =
          a.ok && q.ok && a.value !== null && q.value !== null
            ? computeCoursework(a.value, q.value)
            : null;
        next.attendanceMark = a.ok ? (a.value ?? undefined) : undefined;
        next.quizzesMark = q.ok ? (q.value ?? undefined) : undefined;
        parsed = { ok: true, value: score };
        next.error =
          score === null ||
          (score !== null && Boolean(validateMark(score, detail.rules))) ||
          (next.attendanceMark ?? 0) >
            (workbook.data?.scheme.courseworkAttendanceMax ?? 5) ||
          (next.quizzesMark ?? 0) >
            (workbook.data?.scheme.courseworkQuizzesMax ?? 15)
            ? t("invalidCoursework")
            : undefined;
      } else
        next.error =
          !parsed.ok ||
          (parsed.value !== null && validateMark(parsed.value, detail.rules))
            ? t("invalidMark")
            : undefined;
      if (field !== "status") next.status = "present";
      if (
        (CONTROL_SCORELESS_STATES as readonly string[]).includes(
          next.status ?? "",
        )
      ) {
        next.score = null;
        next.error = undefined;
      } else next.score = parsed.ok ? parsed.value : null;
      if (
        (CONTROL_RESTRICTED_STATES as readonly string[]).includes(
          next.status ?? "",
        ) &&
        reason.trim().length < 3
      )
        next.error = t("reasonRequired");
      if (!next.status && next.score === null) next.error = t("useClear");
      return { ...current, [row.studentId]: next };
    });
  }

  async function switchComponent(component: ControlComponentKey) {
    if (component === key || busy || !(await save())) return;
    setBusy(true);
    try {
      const next = await openControlSheet({
        academicYear: sheet.academicYear,
        semester: sheet.semester,
        courseId: detail.course.id,
        component,
      });
      router.push(`/${locale}/admin/control/${next.sheet.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function transition() {
    if (!action || !(await save())) return;
    setBusy(true);
    try {
      if (action === "CLEAR") {
        const result = await applyControlChanges(sheet.id, {
          expectedSchemeVersion: workbook.data?.scheme.version ?? 0,
          changes: selected.map((id) => ({
            studentId: id,
            expectedRev: byId.get(id)?.components[key]?.rev ?? 0,
            score: null,
            opId: crypto.randomUUID(),
          })),
          reason,
        });
        if (result.summary.ok !== selected.length)
          throw new Error(t("partialFailure"));
        setSelected([]);
      } else {
        await reviewControlSheet(sheet.id, {
          action,
          expectedRevision: workbook.data?.revision ?? sheet.revision,
          reason,
        });
      }
      setAction(null);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function previewRows(raw: string, first: number) {
    if (!caps.canImport || !(await save())) return;
    const lines = raw.trim().split(/\r?\n/);
    const mapped = lines.map((line, i) => {
      const cells = line.split("\t");
      const row =
        cells.length > 1
          ? visible.find((r) => r.studentCode === cells[0].trim())
          : visible[first + i];
      return {
        studentId: row?.studentId,
        studentCode: row?.studentCode,
        score: cells.length > 1 ? cells[1] : cells[0],
        expectedRev: row?.components[key]?.rev ?? 0,
      };
    });
    try {
      setPreview(await previewControlRows(sheet.id, mapped));
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }
  const cell = (
    row: WorkbookRow,
    field: "raw" | "attendance" | "quizzes",
    component: ControlComponentKey,
    index: number,
  ) => {
    const entry = row.components[component],
      draft = drafts[row.studentId];
    const value =
      component === key && draft
        ? draft[field]
        : field === "attendance"
          ? (entry?.attendanceMark ?? "")
          : field === "quizzes"
            ? (entry?.quizzesMark ?? "")
            : (entry?.score ?? "");
    return (
      <Input
        aria-label={`${row.studentCode} ${field === "raw" ? t(component) : t(field)}`}
        data-cell={`${component}-${index}-${field}`}
        aria-invalid={
          component === key && Boolean(draft?.error || errors[row.studentId])
        }
        aria-describedby={
          component === key && (draft?.error || errors[row.studentId])
            ? `control-error-${row.studentId}`
            : undefined
        }
        dir="ltr"
        inputMode="decimal"
        className={cn(
          "min-w-20 w-24 text-left font-mono rounded-squircle h-9 border-transparent bg-transparent focus:border-primary",
          component === key && "bg-primary/5",
          draft?.error && component === key && "border-rose-500",
        )}
        value={value}
        readOnly={
          component !== key ||
          !caps.canEdit ||
          row.notRegistered ||
          Boolean(entry?.isPublished)
        }
        onChange={(e) => edit(row, field, e.target.value)}
        onPaste={(e) => {
          if (
            key !== "coursework" &&
            /[\t\n]/.test(e.clipboardData.getData("text"))
          ) {
            e.preventDefault();
            void previewRows(e.clipboardData.getData("text"), index);
          }
        }}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" ||
            e.key === "ArrowDown" ||
            e.key === "ArrowUp"
          ) {
            e.preventDefault();
            document
              .querySelector<HTMLInputElement>(
                `[data-cell="${component}-${index + (e.key === "ArrowUp" ? -1 : 1)}-${field}"]`,
              )
              ?.focus();
          }
          if (e.key === "Escape")
            setDrafts((current) => {
              const next = { ...current };
              delete next[row.studentId];
              return next;
            });
        }}
      />
    );
  };

  if (workbook.isLoading)
    return (
      <div
        className="h-64 animate-pulse rounded-xl bg-muted"
        aria-label={t("loading")}
      />
    );
  if (workbook.isError)
    return (
      <div role="alert">
        {getApiErrorMessage(workbook.error)}{" "}
        <Button onClick={() => void workbook.refetch()}>{t("retry")}</Button>
      </div>
    );

  return (
    <div className="space-y-3" dir={rtl ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        {CONTROL_COMPONENT_KEYS.map((component) => (
          <Button
            key={component}
            variant={key === component ? "default" : "outline"}
            disabled={
              busy ||
              saving ||
              !workbook.data?.scheme.components.find((c) => c.key === component)
                ?.enabled
            }
            onClick={() => void switchComponent(component)}
          >
            {t(component)}
          </Button>
        ))}
        <span className="ms-auto text-xs" role="status" aria-live="polite">
          {t(`workflow.${sheet.workflowState}`)} ·{" "}
          {saving
            ? t("saving")
            : failed
              ? t("saveFailed")
              : pending
                ? t("unsaved")
                : t("saved")}
        </span>
        {(failed || pending) && (
          <Button
            variant="outline"
            disabled={saving || needsSchemeRefresh}
            onClick={() => {
              setFailed(false);
              void save();
            }}
          >
            {t("retrySave")}
          </Button>
        )}
      </div>
      {restoredDraft && pending && (
        <p
          role="alert"
          className="rounded-xl border border-amber-500/30 p-3 text-sm"
        >
          {t("restoredDraft")}
        </p>
      )}
      {needsSchemeRefresh && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/30 p-3 text-sm"
        >
          <p>{t("schemeChanged")}</p>
          <Button
            variant="outline"
            onClick={() =>
              void refresh().then(() => setNeedsSchemeRefresh(false))
            }
          >
            {t("refreshScheme")}
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {t("courseworkNote", {
          attendance: workbook.data?.scheme.courseworkAttendanceMax ?? 5,
          quizzes: workbook.data?.scheme.courseworkQuizzesMax ?? 15,
        })}
      </p>
      <p className="text-xs text-muted-foreground">{t("visibilityNote")}</p>
      <p className="text-xs text-muted-foreground">{t("calculationNote")}</p>
      {key === "final" && (
        <p className="text-xs text-amber-500">{t("finalDraftNote")}</p>
      )}
      {sheet.reviewReason && (
        <p className="rounded-xl border p-3 text-sm">
          {t("reviewNote")}: {sheet.reviewReason}
        </p>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          aria-label={t("search")}
          placeholder={t("search")}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-64"
        />
        <Button variant="outline" onClick={() => setOnlyMissing(!onlyMissing)}>
          {onlyMissing ? t("all") : t("missing")}
        </Button>
        {caps.canManageSchemes && (
          <Button variant="outline" disabled={pending} onClick={onOpenScheme}>
            <SlidersHorizontal className="size-4 me-2" />
            {t("scheme")}
          </Button>
        )}
        {caps.canViewAudit && (
          <Button variant="outline" onClick={onOpenSheetAudit}>
            <History className="size-4 me-2" />
            {t("audit")}
          </Button>
        )}
        {caps.canExport && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              void exportControlSheet(sheet.id).catch((e) =>
                toast.error(getApiErrorMessage(e)),
              )
            }
          >
            <Download className="size-4 me-2" />
            {t("export")}
          </Button>
        )}
        {caps.canExport && (
          <>
            {(["missing", "exceptions"] as const).map((mode) => (
              <Button
                key={mode}
                variant="outline"
                disabled={pending}
                onClick={() =>
                  void exportControlSheet(sheet.id, mode).catch((error) =>
                    toast.error(getApiErrorMessage(error)),
                  )
                }
              >
                {t(mode === "missing" ? "missingExport" : "exceptionsExport")}
              </Button>
            ))}
          </>
        )}
        {caps.canImport && caps.canEdit && (
          <>
            <Button
              variant="outline"
              disabled={pending || busy}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="size-4 me-2" />
              {t("import")}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy(true);
                try {
                  setPreview(await previewControlFile(sheet.id, file));
                } catch (err) {
                  toast.error(getApiErrorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </>
        )}
        {(caps.canLock || caps.canUnlock) && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={onLockToggleRequest}
          >
            {sheet.locked ? (
              <Unlock className="size-4 me-2" />
            ) : (
              <Lock className="size-4 me-2" />
            )}
            {t(sheet.locked ? "unlock" : "lock")}
          </Button>
        )}
        {caps.canSubmit &&
          ["DRAFT", "RETURNED"].includes(sheet.workflowState) && (
            <Button
              disabled={pending || sheet.locked}
              onClick={() => setAction("SUBMIT")}
            >
              {t("SUBMIT")}
            </Button>
          )}
        {caps.canReview && sheet.workflowState === "IN_REVIEW" && (
          <>
            <Button onClick={() => setAction("APPROVE")}>{t("APPROVE")}</Button>
            <Button variant="outline" onClick={() => setAction("RETURN")}>
              {t("RETURN")}
            </Button>
          </>
        )}
        {caps.canReview && sheet.workflowState === "APPROVED" && (
          <Button variant="outline" onClick={() => setAction("REOPEN")}>
            {t("REOPEN")}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="w-44">
          <Select
            value={sort}
            onValueChange={(value) => setSort(value as typeof sort)}
          >
            <SelectTrigger className="w-44" aria-label={t("sort")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir={rtl ? "rtl" : "ltr"}>
              <SelectItem value="code">{t("code")}</SelectItem>
              <SelectItem value="name">{t("name")}</SelectItem>
              <SelectItem value="mark">{t("mark")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => setDescending(!descending)}>
          {t(descending ? "descending" : "ascending")}
        </Button>
        <div className="w-44">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44" aria-label={t("filter")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir={rtl ? "rtl" : "ltr"}>
              {["all", "invalid", "dirty", "errors", "absent"].map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`filters.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {caps.canEdit && (
        <Input
          aria-label={t("reason")}
          placeholder={t("reason")}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border p-2">
          <span>{t("selected", { count: selected.length })}</span>
          <Button
            variant="outline"
            onClick={() =>
              void navigator.clipboard
                .writeText(
                  visible
                    .filter((row) => selected.includes(row.studentId))
                    .map(
                      (row) =>
                        `${row.studentCode}\t${row.components[key]?.score ?? ""}`,
                    )
                    .join("\n"),
                )
                .catch((error) => toast.error(getApiErrorMessage(error)))
            }
          >
            {t("copy")}
          </Button>
          <Button
            variant="outline"
            disabled={!caps.canEdit || pending || selected.length < 2}
            onClick={() => {
              const source = visible.find((row) =>
                selected.includes(row.studentId),
              )?.components[key];
              if (!source?.status) return;
              setDrafts(
                Object.fromEntries(
                  visible
                    .filter((row) => selected.includes(row.studentId))
                    .map((row) => [
                      row.studentId,
                      {
                        studentId: row.studentId,
                        expectedRev: row.components[key]?.rev ?? 0,
                        score: source.score,
                        status: source.status as GradeStatus,
                        attendanceMark: source.attendanceMark ?? undefined,
                        quizzesMark: source.quizzesMark ?? undefined,
                        raw: source.score == null ? "" : String(source.score),
                        attendance: String(source.attendanceMark ?? ""),
                        quizzes: String(source.quizzesMark ?? ""),
                        opId: crypto.randomUUID(),
                        reason: reason.trim() || undefined,
                      },
                    ]),
                ),
              );
              setFailed(false);
            }}
          >
            {t("fillDown")}
          </Button>

          <Button
            variant="outline"
            disabled={!caps.canEdit || pending}
            onClick={() => setAction("CLEAR")}
          >
            {t("CLEAR")}
          </Button>
        </div>
      )}
      {undo.length > 0 && (
        <Button
          variant="outline"
          disabled={pending || !caps.canEdit}
          onClick={() => {
            setDrafts(
              Object.fromEntries(
                undo.map((change) => {
                  const current = byId.get(change.studentId)?.components[key];
                  const d: Draft = {
                    ...change,
                    expectedRev: current?.rev ?? 0,
                    opId: crypto.randomUUID(),
                    raw: change.score == null ? "" : String(change.score),
                    attendance: String(change.attendanceMark ?? ""),
                    quizzes: String(change.quizzesMark ?? ""),
                  };
                  return [change.studentId, d];
                }),
              ),
            );
            setUndo([]);
            setFailed(false);
          }}
        >
          {t("undo")}
        </Button>
      )}
      <div className="max-h-[65vh] overflow-auto rounded-xl border bg-card">
        <table
          className="w-full text-sm border-collapse"
          aria-label={t("workbook")}
        >
          <thead className="sticky top-0 z-20 bg-muted">
            <tr>
              <th className="p-2 w-8">
                <Checkbox
                  aria-label={t("selectAll")}
                  checked={
                    visible.length > 0 &&
                    visible.every((r) => selected.includes(r.studentId))
                      ? true
                      : visible.some((r) => selected.includes(r.studentId))
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(value) =>
                    setSelected(
                      value === true ? visible.map((r) => r.studentId) : [],
                    )
                  }
                />
              </th>
              <th className="sticky start-0 z-10 bg-muted p-3 text-start">
                {t("code")}
              </th>
              <th className="p-3 text-start min-w-48">{t("name")}</th>
              <th className="p-3">
                {t("attendance")} /
                {workbook.data?.scheme.courseworkAttendanceMax}
              </th>
              <th className="p-3">
                {t("quizzes")} /{workbook.data?.scheme.courseworkQuizzesMax}
              </th>
              <th className="p-3">{t("coursework")} /20</th>
              <th className="p-3">
                {t("midterm")} /
                {
                  workbook.data?.scheme.components.find(
                    (c) => c.key === "midterm",
                  )?.max
                }
              </th>
              <th className="p-3">
                {t("final")} /
                {
                  workbook.data?.scheme.components.find(
                    (c) => c.key === "final",
                  )?.max
                }
              </th>
              <th className="p-3">{t("total")}</th>
              <th className="p-3 min-w-40">{t("status")}</th>
              <th className="p-3">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={row.studentId} className="border-t hover:bg-muted/30">
                <td className="p-2 text-center">
                  <Checkbox
                    aria-label={`${t("select")} ${row.studentCode}`}
                    checked={selected.includes(row.studentId)}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...new Set([...current, row.studentId])]
                          : current.filter((id) => id !== row.studentId),
                      )
                    }
                  />
                </td>
                <td className="sticky start-0 z-10 bg-card p-3 font-mono">
                  <bdi dir="ltr">{row.studentCode}</bdi>
                </td>
                <td className="p-3">
                  {rtl ? row.nameAr || row.name : row.name}
                  {row.notRegistered && (
                    <span className="block text-amber-500 text-xs">
                      {t("unregistered")}
                    </span>
                  )}{" "}
                  {(drafts[row.studentId]?.error || errors[row.studentId]) && (
                    <span
                      id={`control-error-${row.studentId}`}
                      role="alert"
                      className="block text-rose-500 text-xs max-w-64"
                    >
                      {drafts[row.studentId]?.error || errors[row.studentId]}{" "}
                      {conflictRevs[row.studentId] !== undefined && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDrafts((current) =>
                              current[row.studentId]
                                ? {
                                    ...current,
                                    [row.studentId]: {
                                      ...current[row.studentId],
                                      expectedRev: conflictRevs[row.studentId],
                                      opId: crypto.randomUUID(),
                                    },
                                  }
                                : current,
                            );
                            setErrors((current) => ({
                              ...current,
                              [row.studentId]: "",
                            }));
                            setFailed(false);
                          }}
                        >
                          {t("keepMine")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDrafts((current) => {
                            const next = { ...current };
                            delete next[row.studentId];
                            return next;
                          });
                          setErrors((current) => ({
                            ...current,
                            [row.studentId]: "",
                          }));
                          void refresh();
                        }}
                      >
                        {t("discard")}
                      </Button>
                    </span>
                  )}
                </td>
                <td className="p-1 border-s">
                  {cell(row, "attendance", "coursework", index)}
                </td>
                <td className="p-1">
                  {cell(row, "quizzes", "coursework", index)}
                </td>
                <td className="p-3 text-center font-mono">
                  {key === "coursework" && drafts[row.studentId]
                    ? (drafts[row.studentId].score ?? "—")
                    : (row.components.coursework?.score ?? "—")}
                </td>
                <td className="p-1 border-s">
                  {cell(row, "raw", "midterm", index)}
                </td>
                <td className="p-1 border-s">
                  {cell(row, "raw", "final", index)}
                </td>
                <td className="p-3 font-mono text-center">
                  {row.result.total ?? t("pending")}
                </td>
                <td className="p-2">
                  <Select
                    value={
                      drafts[row.studentId]?.status ||
                      row.components[key]?.status ||
                      "not_entered"
                    }
                    disabled={
                      !caps.canEdit ||
                      row.notRegistered ||
                      Boolean(row.components[key]?.isPublished)
                    }
                    onValueChange={(value) => edit(row, "status", value)}
                  >
                    <SelectTrigger
                      aria-label={`${row.studentCode} ${t("status")}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir={rtl ? "rtl" : "ltr"}>
                      <SelectItem value="not_entered" disabled>
                        {t("notEntered")}
                      </SelectItem>
                      {GRADE_STATUS_VALUES.map((state) => (
                        <SelectItem
                          key={state}
                          value={state}
                          disabled={
                            !caps.canManageStates &&
                            (
                              CONTROL_RESTRICTED_STATES as readonly string[]
                            ).includes(state)
                          }
                        >
                          {t(`states.${state}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-2">
                  <DropdownMenu dir={rtl ? "rtl" : "ltr"}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t("actions")} ${row.studentCode}`}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuContent asChild>
                        <div
                          className="z-50 rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg"
                          dir={rtl ? "rtl" : "ltr"}
                        >
                          {caps.canViewAudit && (
                            <DropdownMenuItem
                              onSelect={() => onOpenRowAudit(row)}
                            >
                              {t("audit")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            disabled={!caps.canEdit || pending}
                            onSelect={() => {
                              setSelected([row.studentId]);
                              setAction("CLEAR");
                            }}
                          >
                            {t("CLEAR")}
                          </DropdownMenuItem>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenuPortal>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="p-10 text-center text-muted-foreground">
            {rows.length ? t("noMatches") : t("empty")}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {t("pageCount", {
            page: currentPage,
            pages: pageCount,
            count: filtered.length,
          })}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={currentPage <= 1}
            onClick={() => {
              setPage(currentPage - 1);
              setSelected([]);
            }}
          >
            {t("previous")}
          </Button>
          <Button
            variant="outline"
            disabled={currentPage >= pageCount}
            onClick={() => {
              setPage(currentPage + 1);
              setSelected([]);
            }}
          >
            {t("next")}
          </Button>
        </div>
      </div>
      <Dialog
        open={Boolean(action)}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <DialogContent dir={rtl ? "rtl" : "ltr"} className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-start">
              {action ? t(action) : ""}
            </DialogTitle>
            <DialogDescription className="text-start">
              {t("reviewExplanation")}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label={t("reason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder={t("reason")}
          />
          <DialogFooter className="rtl:sm:justify-start">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              disabled={busy || saving || reason.trim().length < 3}
              onClick={() => void transition()}
            >
              {busy && <Loader2 className="size-4 animate-spin me-2" />}
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open && !busy) setPreview(null);
        }}
      >
        <DialogContent
          dir={rtl ? "rtl" : "ltr"}
          className="rounded-2xl max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle className="text-start">{t("preview")}</DialogTitle>
            <DialogDescription className="text-start">
              {t("previewCount", { count: preview?.valid ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto space-y-2">
            {preview?.errors.map((error, i) => (
              <p key={i} className="text-rose-500 text-sm">
                {error}
              </p>
            ))}
            {preview?.changes.map((change) => (
              <p key={change.opId} className="text-sm font-mono">
                <bdi>{byId.get(change.studentId)?.studentCode}</bdi>:{" "}
                {byId.get(change.studentId)?.components[key]?.score ?? "—"} →{" "}
                {change.score ?? t("states." + change.status)}
              </p>
            ))}
          </div>
          <DialogFooter className="rtl:sm:justify-start">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              {t("cancel")}
            </Button>
            {Boolean(preview?.errors.length) && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  preview &&
                  void exportControlImportErrors(
                    sheet.id,
                    preview.previewId,
                  ).catch((error) => toast.error(getApiErrorMessage(error)))
                }
              >
                {t("errorsExport")}
              </Button>
            )}
            <Button
              disabled={!preview?.valid || busy}
              onClick={async () => {
                if (!preview) return;
                setBusy(true);
                try {
                  const result = await commitControlImport(
                    sheet.id,
                    preview.previewId,
                  );
                  if (result.summary.ok !== preview.valid) {
                    toast.error(t("partialFailure"));
                    setPreview((current) =>
                      current
                        ? {
                            ...current,
                            valid: 0,
                            changes: [],
                            errors: [
                              ...current.errors,
                              ...result.results
                                .filter((row) => row.result !== "ok")
                                .map(
                                  (row) =>
                                    `${byId.get(row.studentId)?.studentCode ?? row.studentId}: ${row.message ?? row.code ?? row.result}`,
                                ),
                            ],
                          }
                        : current,
                    );
                  } else {
                    toast.success(t("imported"));
                    setPreview(null);
                  }
                  await refresh();
                } catch (error) {
                  toast.error(getApiErrorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("confirmImport")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
