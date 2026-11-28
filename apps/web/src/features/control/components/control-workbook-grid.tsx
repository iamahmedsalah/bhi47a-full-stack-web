"use client";

import { ControlAttemptDialog } from "./control-attempt-dialog";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useDeferredValue,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowDownWideNarrow,
  ArrowRight,
  ArrowUpNarrowWide,
  ArrowUpToLine,
  Bell,
  Calculator,
  CircleAlert,
  Download,
  FileCheck2,
  FileEdit,
  GitCompareArrows,
  Upload,
  History,
  SlidersHorizontal,
  Lock,
  Unlock,
  MoreVertical,
  Loader2,
  Search,
  Save,
  Trash2,
  Send,
  CheckCircle2,
  RotateCcw,
  Percent,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  CONTROL_COMPONENT_KEYS,
  CONTROL_MIDTERM_STATES,
  CONTROL_RESTRICTED_STATES,
  CONTROL_SCORELESS_STATES,
  GRADE_STATUS_VALUES,
  computeCoursework,
  computeCourseResult,
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
  DialogBody,
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
  downloadControlTemplate,
  exportControlImportErrors,
  controlWorkbookOptions,
  getControlSheet,
  listControlPetitions,
  openControlSheet,
  previewControlRows,
  reviewControlSheet,
  getControlAttempts,
  updateControlPassThreshold,
  submitControlPartialEntry,
  returnControlPartialEntry,
  approveControlPartialEntry,
} from "../api";
import { ControlHelpNotes } from "./control-help-notes";
import { HelpNote } from "@/components/ui/help-note";
import { normalizeSearchText } from "@/lib/search-text";
import { ControlDownloadDialogs } from "./control-download-dialogs";
import { ControlGraceDialog } from "./control-grace-dialog";
import { ControlImportLauncher } from "./control-import-launcher";
import { ControlPartialOpenDialog } from "./control-partial-open-dialog";
import { ControlPetitionCreateDialog } from "./control-petition-create-dialog";
import { ControlPetitionReviewDialog } from "./control-petition-review-dialog";
import type {
  ControlImportPreview,
  ControlPetition,
  ControlRosterRow,
  ControlSheetDetails,
  GradeChangeInput,
  WorkbookRow,
} from "../types";

import { useControlCheckpoint } from "../hooks/use-control-checkpoint";
import { ControlWorkbookLoading } from "./control-workbook-loading";
import type { ControlCheckpoint } from "../types";

type Draft = GradeChangeInput & {
  raw: string;
  attendance: string;
  quizzes: string;
  error?: string;
};
// Keep unsaved work across SPA back/forward navigation in this tab. Never share
// drafts between authenticated principals, or persist grade drafts to disk.
const EMPTY_ROWS: WorkbookRow[] = [];
const NOT_ENTERED = "not_entered";
const draftArchive = new Map<string, Record<string, Draft>>();
interface Props {
  canPublish?: boolean;
  principalId?: string;
  requestSheetId?: string;
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
  canPublish = false,
  principalId,
  requestSheetId,
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
  const [graceOpen, setGraceOpen] = useState(false);
  const [partialOpenDialog, setPartialOpenDialog] = useState(false);
  const [partialAction, setPartialAction] = useState<
    "PARTIAL_SUBMIT" | "PARTIAL_RETURN" | "PARTIAL_APPROVE" | null
  >(null);
  const [partialReason, setPartialReason] = useState("");
  const [petitionCreateOpen, setPetitionCreateOpen] = useState(false);
  const [activePetitionReview, setActivePetitionReview] =
    useState<ControlPetition | null>(null);
  const [passThresholdOpen, setPassThresholdOpen] = useState(false);
  const [thresholdInput, setThresholdInput] = useState<string>("");
  const [thresholdBusy, setThresholdBusy] = useState(false);
  const [customThresholds, setCustomThresholds] = useState<
    Partial<Record<ControlComponentKey, number>>
  >({});
  const workbookId = requestSheetId ?? sheet.id;
  const workbook = useQuery(controlWorkbookOptions(workbookId, principalId));
  const sheetPetitionsQuery = useQuery({
    queryKey: controlKeys.petitions({ sheetId: sheet.id, limit: 10 }),
    queryFn: () => listControlPetitions({ sheetId: sheet.id, limit: 10 }),
    enabled: Boolean(
      caps.canCreatePetitions || caps.canApprovePetitions || caps.canReview,
    ),
  });
  const sheetPetitions = sheetPetitionsQuery.data?.items ?? [];
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
  const [attemptDialog, setAttemptDialog] = useState<{
    approval: boolean;
    partial?: boolean;
  } | null>(null);
  const [failed, setFailed] = useState(Boolean(restoredDraft));
  const [needsSchemeRefresh, setNeedsSchemeRefresh] = useState(false);
  const view = useTableState({
    shallow: true,
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
  const tableViewport = useRef<HTMLDivElement>(null);
  const previousPage = useRef(view.page);
  useEffect(() => {
    if (previousPage.current === view.page) return;
    previousPage.current = view.page;
    tableViewport.current?.scrollTo({ top: 0, behavior: "instant" });
    tableViewport.current?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  }, [view.page]);
  const filter = view.filters.gridFilter;
  const setFilter = (value: string) => view.setFilter("gridFilter", value);
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<
    | "SUBMIT"
    | "SUBMIT_APPROVAL"
    | "APPROVE"
    | "RETURN"
    | "REOPEN"
    | "CLEAR"
    | null
  >(null);
  const [importOpen, setImportOpen] = useState(false);
  const [downloadKind, setDownloadKind] = useState<
    "templates" | "reports" | null
  >(null);
  const [preview, setPreview] = useState<ControlImportPreview | null>(null);
  const [undo, setUndo] = useState<GradeChangeInput[]>([]);
  const inFlight = useRef(false);
  const draftRef = useRef(drafts);
  useEffect(() => {
    draftRef.current = drafts;
    if (archiveKey) {
      if (Object.keys(drafts).length) draftArchive.set(archiveKey, drafts);
      else draftArchive.delete(archiveKey);
    }
  }, [drafts, archiveKey]);
  const rows = workbook.data?.rows ?? EMPTY_ROWS;
  const activePassThreshold = useMemo(() => {
    const localOverride = customThresholds[key];
    if (typeof localOverride === "number" && Number.isFinite(localOverride)) {
      return localOverride;
    }
    if (
      key === detail.sheet.component &&
      typeof detail.sheet.passThreshold === "number" &&
      Number.isFinite(detail.sheet.passThreshold)
    ) {
      return detail.sheet.passThreshold;
    }
    if (
      key === detail.rules.key &&
      typeof detail.rules.passThreshold === "number" &&
      Number.isFinite(detail.rules.passThreshold)
    ) {
      return detail.rules.passThreshold;
    }
    return key === "midterm" ? 18 : 30;
  }, [
    customThresholds,
    detail.rules.key,
    detail.rules.passThreshold,
    detail.sheet.component,
    detail.sheet.passThreshold,
    key,
  ]);
  const canManagePassThreshold = Boolean(
    caps.canManagePassThreshold ??
      (caps.canManageSchemes ||
        caps.canGrace ||
        caps.canApprove ||
        caps.canApproveFinal),
  );
  const deferredDrafts = useDeferredValue(drafts);
  const getEffectiveComponentMark = useCallback(
    (row: WorkbookRow, draftMap: Record<string, Draft> = deferredDrafts) => {
      const saved = row.components[key];
      const draft = draftMap[row.studentId];
      if (!draft) {
        return {
          status: saved?.status ?? null,
          score: saved?.score ?? null,
        };
      }
      const effectiveStatus = draft.status ?? saved?.status ?? null;
      if (effectiveStatus !== "present") {
        return {
          status: effectiveStatus,
          score: null,
        };
      }
      if (!draft.error) {
        return {
          status: effectiveStatus,
          score: draft.score ?? null,
        };
      }
      return {
        status: effectiveStatus,
        score: saved?.status === "present" ? (saved.score ?? null) : null,
      };
    },
    [deferredDrafts, key],
  );
  const { passRate, scoreMetrics } = useMemo(() => {
    const maxMark = detail.rules.max;
    const midpoint = Math.round((maxMark / 2) * 100) / 100;
    const midRadius = Math.max(1, Math.round(maxMark / 15));
    const midMin = Math.max(0, Math.round((midpoint - midRadius) * 100) / 100);
    const midMax = Math.min(
      maxMark,
      Math.round((midpoint + midRadius) * 100) / 100,
    );
    const threshold = activePassThreshold;
    let passed = 0;
    let presentCount = 0;
    let bannedCount = 0;
    let absentCount = 0;
    let unenteredCount = 0;
    let scoreSum = 0;
    let scoredCount = 0;
    for (const row of rows) {
      const mark = getEffectiveComponentMark(row, deferredDrafts);
      if (mark.status === "present") {
        presentCount += 1;
        if (mark.score != null) {
          scoreSum += mark.score;
          scoredCount += 1;
          if (mark.score > threshold) passed += 1;
        }
      } else if (mark.status === "banned") {
        bannedCount += 1;
      } else if (mark.status === "absent") {
        absentCount += 1;
      } else if (!mark.status) {
        unenteredCount += 1;
      }
    }
    const eligibleTotal = presentCount + bannedCount;
    return {
      passRate:
        key === "coursework"
          ? null
          : {
              component: key,
              threshold,
              passed,
              total: eligibleTotal,
              presentCount,
              bannedCount,
              absentCount,
              unenteredCount,
              rosterTotal: rows.length,
              ratio: eligibleTotal > 0 ? passed / eligibleTotal : 0,
            },
      scoreMetrics: {
        maxMark,
        midpoint,
        midMin,
        midMax,
        scoredCount,
        mean:
          scoredCount > 0 ? Math.round((scoreSum / scoredCount) * 100) / 100 : null,
      },
    };
  }, [
    detail.rules.max,
    rows,
    key,
    activePassThreshold,
    deferredDrafts,
    getEffectiveComponentMark,
  ]);
  const [searchText, setSearchText] = useState(search);
  const [previousSearch, setPreviousSearch] = useState(search);
  if (previousSearch !== search) {
    setPreviousSearch(search);
    if (searchText.trim() !== search) setSearchText(search);
  }
  useEffect(() => {
    if (searchText.trim() === search) return;
    const timer = setTimeout(() => onSearchChange(searchText), 250);
    return () => clearTimeout(timer);
  }, [searchText, search, onSearchChange]);
  const deferredSearch = useDeferredValue(normalizeSearchText(searchText));
  const searchIndex = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.studentId,
          normalizeSearchText(
            `${row.studentCode} ${row.name} ${row.nameAr ?? ""}`,
          ),
        ]),
      ),
    [rows],
  );
  const selectionScope = JSON.stringify([
    deferredSearch,
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
  const byId = useMemo(
    () => new Map(rows.map((r) => [r.studentId, r])),
    [rows],
  );
  const readiness = useMemo(() => {
    const registeredRows = rows.filter((r) => !r.notRegistered);
    const total = registeredRows.length;
    const entered = registeredRows.filter((r) =>
      Boolean(r.components[key]?.status),
    ).length;
    const deferred =
      key === "coursework"
        ? 0
        : registeredRows.filter(
            (r) => r.tuition?.isBlocked && !r.components[key]?.status,
          ).length;
    const missing = Math.max(0, total - entered - deferred);
    return {
      total,
      entered,
      missing,
      deferred,
      ready: total > 0 && missing === 0,
    };
  }, [rows, key]);
  const nameCollator = useMemo(
    () =>
      new Intl.Collator(rtl ? "ar" : "en", {
        sensitivity: "base",
        numeric: true,
      }),
    [rtl],
  );
  const codeCollator = useMemo(
    () => new Intl.Collator("en", { numeric: true }),
    [],
  );
  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const value =
          sort === "mark"
            ? (a.components[key]?.score ?? -1) -
              (b.components[key]?.score ?? -1)
            : sort === "name"
              ? nameCollator.compare(
                  rtl ? a.nameAr || a.name : a.name,
                  rtl ? b.nameAr || b.name : b.name,
                )
              : codeCollator.compare(a.studentCode, b.studentCode);
        return descending ? -value : value;
      }),
    [rows, sort, key, rtl, descending, nameCollator, codeCollator],
  );
  const isPartialOpen =
    sheet.workflowState === "PARTIAL_OPEN" && Boolean(sheet.partialCycle);
  const partialCycle = sheet.partialCycle ?? null;
  const partialAllowedSet = useMemo(
    () => new Set(partialCycle?.allowedStudentIds ?? []),
    [partialCycle],
  );
  const canEditRow = useCallback(
    (row: WorkbookRow) => {
      if (!caps.canEdit || row.tuition?.isBlocked || row.notRegistered) {
        return false;
      }
      if (isPartialOpen) {
        if (!partialAllowedSet.has(row.studentId)) return false;
        const current = row.components[key];
        if (
          current?.isApproved &&
          !["excused", "incomplete"].includes(current.status ?? "")
        ) {
          return false;
        }
        return true;
      }
      return (
        !row.components[key]?.isPublished &&
        !row.components[key]?.carriedFrom
      );
    },
    [caps.canEdit, isPartialOpen, key, partialAllowedSet],
  );
  const isPartialFilter = filter === "partial";
  const searchableRows = useMemo(() => {
    if (!deferredSearch && !onlyMissing && !isPartialFilter) return sortedRows;
    return sortedRows.filter((row) => {
      if (
        deferredSearch &&
        !searchIndex.get(row.studentId)?.includes(deferredSearch)
      ) {
        return false;
      }
      if (onlyMissing && row.components[key]?.status) return false;
      if (isPartialFilter && !partialAllowedSet.has(row.studentId))
        return false;
      return true;
    });
  }, [
    sortedRows,
    deferredSearch,
    onlyMissing,
    isPartialFilter,
    key,
    searchIndex,
    partialAllowedSet,
  ]);
  const filtered = useMemo(() => {
    if (filter === "all" || filter === "partial") return searchableRows;
    if (filter === "invalid" || filter === "dirty" || filter === "errors") {
      return searchableRows.filter((row) =>
        filter === "invalid"
          ? Boolean(drafts[row.studentId]?.error)
          : filter === "dirty"
            ? Boolean(drafts[row.studentId])
            : Boolean(errors[row.studentId]),
      );
    }
    return searchableRows.filter((row) => {
      const mark = getEffectiveComponentMark(row, deferredDrafts);
      if (filter === "absent") return mark.status === "absent";
      if (filter === "banned") return mark.status === "banned";
      if (mark.status !== "present" || mark.score == null) return false;
      if (filter === "aroundMid") {
        return (
          mark.score >= scoreMetrics.midMin && mark.score <= scoreMetrics.midMax
        );
      }
      if (filter === "aboveMid") return mark.score >= scoreMetrics.midpoint;
      if (filter === "belowMid") return mark.score < scoreMetrics.midpoint;
      if (filter === "passed") return mark.score > activePassThreshold;
      if (filter === "failed") return mark.score <= activePassThreshold;
      if (filter === "fullMark") return mark.score >= scoreMetrics.maxMark;
      if (filter === "zero") return mark.score === 0;
      return true;
    });
  }, [
    searchableRows,
    filter,
    drafts,
    errors,
    deferredDrafts,
    getEffectiveComponentMark,
    scoreMetrics.midMin,
    scoreMetrics.midMax,
    scoreMetrics.midpoint,
    scoreMetrics.maxMark,
    activePassThreshold,
  ]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 100));
  const currentPage = Math.max(
    1,
    Math.min(Number.isInteger(page) ? page : 1, pageCount),
  );
  const visible = useMemo(
    () => filtered.slice((currentPage - 1) * 100, currentPage * 100),
    [filtered, currentPage],
  );
  const {
    remember,
    restore,
    setRestore,
    isLoading: checkpointLoading,
    saveError,
    retry,
  } = useControlCheckpoint(sheet.id, principalId);
  const [hiddenCheckpoint, setHiddenCheckpoint] =
    useState<ControlCheckpoint | null>(null);
  const appliedView = useRef<ControlCheckpoint | null>(null);
  const restoringFocus = useRef(false);
  const setViewFilters = view.setFilters;
  useEffect(() => {
    if (!restore?.studentId || !workbook.data || workbook.isError) return;
    const frame = requestAnimationFrame(() => {
      const viewMatches =
        sort === restore.sort &&
        descending === restore.descending &&
        filter === restore.filter &&
        onlyMissing === restore.onlyMissing &&
        search === restore.search;
      if (!viewMatches && appliedView.current !== restore) {
        appliedView.current = restore;
        setViewFilters(
          {
            gridSort: restore.sort,
            gridDirection: restore.descending ? "desc" : "asc",
            gridFilter: restore.filter,
            gridMissing: String(restore.onlyMissing),
          },
          restore.search,
        );
      }
      if (
        !viewMatches ||
        deferredSearch !== normalizeSearchText(restore.search) ||
        searchText.trim() !== restore.search
      )
        return;
      const index = filtered.findIndex(
        (row) => row.studentId === restore.studentId,
      );
      if (index < 0) {
        setHiddenCheckpoint(
          rows.some((row) => row.studentId === restore.studentId)
            ? restore
            : null,
        );
        setRestore(null);
        return;
      }
      const targetPage = Math.floor(index / 100) + 1;
      if (currentPage !== targetPage) {
        setPage(targetPage);
        return;
      }
      const row = tableViewport.current?.querySelector<HTMLTableRowElement>(
        `[data-checkpoint-row="${restore.studentId}"]`,
      );
      if (!row) return;
      const input = row.querySelector<HTMLInputElement>(
        `input[data-cell="${key}-${index % 100}-${restore.field}"]`,
      );
      // Scroll within the table so restoration doesn't jump the entire screen.
      const viewport = tableViewport.current;
      if (viewport) {
        const bounds = viewport.getBoundingClientRect();
        const top = row.getBoundingClientRect().top - bounds.top;
        viewport.scrollTop += top - viewport.clientHeight / 3;
        const cellBounds = input?.getBoundingClientRect();
        if (cellBounds && cellBounds.left < bounds.left) {
          viewport.scrollLeft += cellBounds.left - bounds.left;
        } else if (cellBounds && cellBounds.right > bounds.right) {
          viewport.scrollLeft += cellBounds.right - bounds.right;
        }
      }
      restoringFocus.current = true;
      if (input && !input.disabled && !input.readOnly)
        input.focus({ preventScroll: true });
      restoringFocus.current = false;
      setRestore(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    restore,
    workbook.data,
    workbook.isError,
    setViewFilters,
    sort,
    descending,
    filter,
    onlyMissing,
    search,
    deferredSearch,
    searchText,
    filtered,
    rows,
    currentPage,
    setPage,
    key,
    setRestore,
  ]);

  function startFromFirstPage() {
    setHiddenCheckpoint(null);
    setSearchText("");
    setSelected([]);
    view.resetAll();
    tableViewport.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    tableViewport.current?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
    remember(
      {
        studentId: null,
        field: "raw",
        sort: "code",
        descending: false,
        filter: "all",
        onlyMissing: false,
        search: "",
      },
      true,
    );
  }
  const pending = Object.keys(drafts).length > 0;
  const saveState = saving
    ? "saving"
    : failed
      ? "saveFailed"
      : pending
        ? "unsaved"
        : "saved";
  const SaveStateIcon = {
    saving: Loader2,
    saveFailed: CircleAlert,
    unsaved: Save,
    saved: CheckCircle2,
  }[saveState];
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);
  const refresh = useCallback(async () => {
    await query.invalidateQueries({ queryKey: controlKeys.all });
  }, [query]);

  const formatControlIssue = useCallback(
    (r: {
      result: string;
      code?: string;
      message?: string;
      current?: { score: number | null } | null;
    }): string => {
      if (r.result === "conflict") {
        return t("conflict", { score: r.current?.score ?? "—" });
      }
      const code = (r.code || "").toLowerCase();
      const msg = (r.message || "").toLowerCase();
      if (code === "tuition_blocked") return t("tuitionEntryLocked");
      if (code === "ic_carried_locked") return t("icCarriedLocked");
      if (code === "midterm_status") return t("midtermStatusOnly");
      if (code === "score_required" || msg.includes("a mark is required")) {
        return t("scoreRequired");
      }
      if (code === "score_not_allowed" || msg.includes("carries no mark")) {
        return t("scoreNotAllowed");
      }
      if (
        code === "states_permission" ||
        msg.includes("requires control.states.manage")
      ) {
        return t("statesPermissionDenied");
      }
      if (code === "reason_required" || msg.includes("reason is required")) {
        return t("reasonRequiredValidation");
      }
      if (code === "unpublish_required" || msg.includes("unpublish")) {
        return t("unpublishRequired");
      }
      if (
        code === "not_in_roster" ||
        msg.includes("no approved registration")
      ) {
        return t("unregistered");
      }
      if (code === "coursework_breakdown" || msg.includes("coursework mark")) {
        return t("invalidCoursework");
      }
      return r.message || t("saveFailed");
    },
    [t],
  );

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
          ({
            studentId,
            attendanceMark,
            quizzesMark,
            score,
            status,
            expectedRev,
            opId,
            reason,
          }) => ({
            studentId,
            attendanceMark,
            quizzesMark,
            score,
            status,
            expectedRev,
            opId,
            reason,
          }),
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
        if (r.result !== "ok") issues[r.studentId] = formatControlIssue(r);
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
        query.setQueryData<import("../types").ControlWorkbook>(
          controlWorkbookOptions(workbookId, principalId).queryKey,
          (current) => {
            if (!current) return current;
            const accepted = new Map(
              result.results
                .filter((item) => item.result === "ok" && item.entry)
                .map((item) => [item.studentId, item.entry!]),
            );
            const sent = new Map(
              snapshot.map((item) => [item.studentId, item]),
            );
            return {
              ...current,
              rows: current.rows.map((row) => {
                const entry = accepted.get(row.studentId);
                if (!entry) return row;
                const draft = sent.get(row.studentId);
                const scoreless =
                  entry.status === null ||
                  (CONTROL_SCORELESS_STATES as readonly string[]).includes(
                    entry.status,
                  );
                const components = {
                  ...row.components,
                  [key]: {
                    ...row.components[key],
                    ...entry,
                    ...(entry.status === null ? { isApproved: false } : {}),
                    attendanceMark:
                      key === "coursework"
                        ? scoreless
                          ? null
                          : (draft?.attendanceMark ?? null)
                        : (row.components[key]?.attendanceMark ?? null),
                    quizzesMark:
                      key === "coursework"
                        ? scoreless
                          ? null
                          : (draft?.quizzesMark ?? null)
                        : (row.components[key]?.quizzesMark ?? null),
                  },
                };
                return {
                  ...row,
                  components,
                  result: computeCourseResult(
                    current.scheme.components.map((component) => ({
                      ...component,
                      enabled: true,
                    })),
                    components,
                  ),
                };
              }),
            };
          },
        );
        void query.invalidateQueries({
          predicate: (cached) =>
            cached.queryKey[0] === "control" &&
            cached.queryKey[1] === "sheet" &&
            cached.queryKey.length === 3,
        });
        void query.invalidateQueries({
          queryKey: ["control", "courses"],
          refetchType: "none",
        });
        void query.invalidateQueries({
          queryKey: ["control", "dashboard"],
          refetchType: "none",
        });
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
  }, [
    sheet.id,
    workbookId,
    principalId,
    workbook.data?.scheme.version,
    reason,
    formatControlIssue,
    query,
    byId,
    key,
  ]);

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
    if (!canEditRow(row)) return;
    const prior = row.components[key];
    const clearRequested = field === "status" && value === NOT_ENTERED;
    const saveInProgress = inFlight.current;
    setFailed(false);
    setErrors((current) => ({ ...current, [row.studentId]: "" }));
    setDrafts((current) => {
      const previous = current[row.studentId];
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
        ...(previous ?? initial),
        [field]: value,
        reason: reason.trim() || undefined,
      };
      next.opId = crypto.randomUUID();
      const blankMark =
        key === "coursework"
          ? field !== "status" && !next.attendance.trim() && !next.quizzes.trim()
          : field === "raw" && !value.trim();
      const effectiveStatus = previous ? previous.status : prior?.status;
      const clearing =
        clearRequested ||
        (blankMark &&
          !(CONTROL_SCORELESS_STATES as readonly string[]).includes(
            effectiveStatus ?? "",
          ));
      if (clearing) {
        if (
          !caps.canManageStates &&
          (CONTROL_RESTRICTED_STATES as readonly string[]).includes(
            prior?.status ?? "",
          )
        ) return current;
        if (!prior?.status && !saveInProgress) {
          if (!previous) return current;
          const remaining = { ...current };
          delete remaining[row.studentId];
          return remaining;
        }
        return {
          ...current,
          [row.studentId]: {
            ...next,
            status: undefined,
            score: null,
            raw: "",
            attendance: "",
            quizzes: "",
            attendanceMark: undefined,
            quizzesMark: undefined,
            error: undefined,
          },
        };
      }
      if (blankMark) return current;
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
      query.setQueryData(controlKeys.sheet(next.sheet.id), next);
      if (next.sheet.slug)
        query.setQueryData(controlKeys.sheet(next.sheet.slug), next);
      router.push(
        `/${locale}/admin/control/${next.sheet.slug || next.sheet.id}`,
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function transition(
    attemptReview?: {
      attemptReviewDigest: string;
      keepPreviousStudentIds: string[];
    },
    override?: "APPROVE",
  ) {
    const transitionAction = override ?? action;
    if (!transitionAction || !(await save())) return false;
    setBusy(true);
    try {
      if (transitionAction === "CLEAR") {
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
        // Autosave patches rows locally. Read the small sheet record just before
        // a workflow transition so its revision is authoritative.
        if (
          transitionAction === "APPROVE" &&
          key === "final" &&
          !attemptReview
        ) {
          const comparison = await getControlAttempts(sheet.id);
          if (comparison.total > 0) {
            setAttemptDialog({ approval: true });
            setAction(null);
            return false;
          }
        }
        const latest = await getControlSheet(sheet.id);
        await reviewControlSheet(sheet.id, {
          action: transitionAction,
          ...attemptReview,
          expectedRevision: latest.sheet.revision,
          allowMissing: readiness.total > readiness.entered,
        });
      }
      setAction(null);
      await refresh();
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function transitionPartial(
    attemptReview?: {
      attemptReviewDigest: string;
      keepPreviousStudentIds: string[];
    },
    override?: "PARTIAL_APPROVE",
  ) {
    const activeOp = override ?? partialAction;
    if (!activeOp || !partialCycle || !(await save())) return false;
    if (activeOp === "PARTIAL_RETURN" && partialReason.trim().length < 3) {
      toast.error(
        rtl
          ? "يرجى كتابة سبب إعادة الدرجات للمراجعة (٣ أحرف على الأقل)"
          : "Enter a return reason (at least 3 characters)",
      );
      return false;
    }
    setBusy(true);
    try {
      if (
        activeOp === "PARTIAL_APPROVE" &&
        key === "final" &&
        !attemptReview
      ) {
        const comparison = await getControlAttempts(sheet.id);
        if (comparison.total > 0) {
          setAttemptDialog({ approval: true, partial: true });
          setPartialAction(null);
          return false;
        }
      }

      if (activeOp === "PARTIAL_SUBMIT") {
        await submitControlPartialEntry(sheet.id, {
          expectedPartialRevision: partialCycle.revision,
          reason: partialReason.trim() || undefined,
        });
        toast.success(
          rtl
            ? "تم إرسال الدرجات الجديدة للاعتماد بنجاح"
            : "New partial marks submitted for approval",
        );
      } else if (activeOp === "PARTIAL_RETURN") {
        await returnControlPartialEntry(sheet.id, {
          expectedPartialRevision: partialCycle.revision,
          reason: partialReason.trim(),
        });
        toast.success(
          rtl
            ? "تمت إعادة الرصد الجزئي للمراجعة للطلاب المحددين فقط"
            : "Partial entry returned for selected students only",
        );
      } else {
        await approveControlPartialEntry(sheet.id, {
          expectedPartialRevision: partialCycle.revision,
          reason: partialReason.trim() || undefined,
          ...(attemptReview ?? {}),
        });
        toast.success(
          rtl
            ? "تم اعتماد الدرجات الجديدة وإغلاق دورة الرصد الجزئي بنجاح"
            : "New marks approved and partial entry cycle closed",
        );
      }
      setPartialAction(null);
      setPartialReason("");
      await refresh();
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      return false;
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
    const effectiveStatus =
      component === key && draft ? draft.status : entry?.status;
    const scoreless = (CONTROL_SCORELESS_STATES as readonly string[]).includes(
      effectiveStatus ?? "",
    );
    const value = scoreless
      ? effectiveStatus === "absent" || effectiveStatus === "banned"
        ? 0
        : ""
      : component === key && draft
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
        onFocus={(event) => {
          if (restoringFocus.current || event.currentTarget.readOnly) return;
          setHiddenCheckpoint(null);
          remember({
            studentId: row.studentId,
            field,
            sort,
            descending,
            filter: filter === "absent" ? "absent" : "all",
            onlyMissing,
            search: search.trim().slice(0, 100),
          });
        }}
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
        disabled={Boolean(row.tuition?.isBlocked)}
        readOnly={
          component !== key ||
          busy ||
          !canEditRow(row)
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
            const cells = Array.from(
              tableViewport.current?.querySelectorAll<HTMLInputElement>(
                `[data-cell^="${component}-"][data-cell$="-${field}"]`,
              ) ?? [],
            );
            const direction = e.key === "ArrowUp" ? -1 : 1;
            for (
              let next = cells.indexOf(e.currentTarget) + direction;
              next >= 0 && next < cells.length;
              next += direction
            ) {
              if (!cells[next].disabled && !cells[next].readOnly) {
                cells[next].focus();
                break;
              }
            }
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

  if (workbook.isLoading) return <ControlWorkbookLoading />;
  if (workbook.isError)
    return (
      <div role="alert">
        {getApiErrorMessage(workbook.error)}{" "}
        <Button onClick={() => void workbook.refetch()}>{t("retry")}</Button>
      </div>
    );

  return (
    <div className="space-y-3" dir={rtl ? "rtl" : "ltr"}>
      {graceOpen && (
        <ControlGraceDialog
          detail={detail}
          locale={locale}
          rows={rows}
          passThreshold={activePassThreshold}
          onClose={() => setGraceOpen(false)}
          onSaved={async () => {
            setUndo([]);
            await refresh();
          }}
        />
      )}
      {passThresholdOpen && passRate && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !thresholdBusy) setPassThresholdOpen(false);
          }}
        >
          <DialogContent
            flush
            dir={rtl ? "rtl" : "ltr"}
            className="max-w-md"
          >
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-squircle border border-primary/30 bg-primary/15 text-primary">
                  <Percent className="size-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <DialogTitle className="text-base font-bold tracking-tight text-start">
                    {rtl
                      ? `تعديل درجة حساب نسبة النجاح — ${t(passRate.component)}`
                      : `Edit Pass Threshold — ${t(passRate.component)}`}
                  </DialogTitle>
                  <DialogDescription className="text-start text-xs">
                    {rtl
                      ? `حدد الدرجة التي يُحسب بعدها الطالب ناجحًا في ${t(passRate.component)} (الدرجة العظمى: ${detail.rules.max}).`
                      : `Set the mark above which a student is counted as passing in ${t(passRate.component)} (Max mark: ${detail.rules.max}).`}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {(() => {
              const parsedNext =
                thresholdInput.trim() !== "" &&
                Number.isFinite(Number(thresholdInput))
                  ? Number(thresholdInput)
                  : passRate.threshold;
              const isValidNext =
                Number.isFinite(parsedNext) &&
                parsedNext >= 0 &&
                parsedNext <= detail.rules.max;
              const nextPassed = isValidNext
                ? rows.reduce((count, row) => {
                    const mark = getEffectiveComponentMark(row);
                    return (
                      count +
                      Number(
                        mark.status === "present" &&
                          mark.score != null &&
                          mark.score > parsedNext,
                      )
                    );
                  }, 0)
                : passRate.passed;
              const nextRatio = passRate.total ? nextPassed / passRate.total : 0;
              const ratioChanged = nextRatio !== passRate.ratio;
              const pctFmt = new Intl.NumberFormat(locale, {
                style: "percent",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });

              return (
                <>
                  <DialogBody>
                    <div className="space-y-2.5 rounded-xl border border-border/60 bg-secondary/20 p-4">
                      <label className="block space-y-2 text-xs font-semibold text-foreground">
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            {rtl
                              ? `درجة النجاح (${0} - ${detail.rules.max})`
                              : `Pass Mark Threshold (0 - ${detail.rules.max})`}
                          </span>
                          <span className="rounded-squircle border border-border/70 bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {rtl ? "العظمى:" : "Max:"}{" "}
                            <bdi className="font-mono font-bold text-foreground">
                              {detail.rules.max}
                            </bdi>
                          </span>
                        </div>
                        <Input
                          dir="ltr"
                          type="number"
                          min={0}
                          max={detail.rules.max}
                          step={detail.rules.step || 0.5}
                          value={thresholdInput}
                          disabled={thresholdBusy}
                          className="h-10 rounded-squircle text-left font-mono font-bold"
                          onChange={(e) => setThresholdInput(e.target.value)}
                        />
                      </label>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
                      <span className="block text-xs font-bold text-foreground">
                        {rtl
                          ? "معاينة تغير نسبة النجاح"
                          : "Pass Rate Change Preview"}
                      </span>
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="rounded-xl border border-border/60 bg-card/85 px-3 py-2.5 text-center flex-1">
                          <span className="block text-[11px] text-muted-foreground">
                            {rtl
                              ? `الحالية (> ${passRate.threshold})`
                              : `Current (> ${passRate.threshold})`}
                          </span>
                          <bdi className="mt-0.5 block text-lg font-extrabold tabular-nums text-foreground">
                            {pctFmt.format(passRate.ratio)}
                          </bdi>
                          <span className="block text-[11px] text-muted-foreground">
                            <bdi className="font-mono">
                              {passRate.passed} / {passRate.total}
                            </bdi>
                          </span>
                        </div>

                        <ArrowRight className="size-4 shrink-0 text-primary rtl:rotate-180" />

                        <div
                          className={cn(
                            "rounded-xl border px-3 py-2.5 text-center flex-1 transition-colors",
                            ratioChanged
                              ? "border-primary/35 bg-primary/[0.09]"
                              : "border-border/60 bg-card/85",
                          )}
                        >
                          <span
                            className={cn(
                              "block text-[11px] font-semibold",
                              ratioChanged
                                ? "text-primary"
                                : "text-muted-foreground",
                            )}
                          >
                            {rtl
                              ? `الجديدة (> ${isValidNext ? parsedNext : passRate.threshold})`
                              : `New (> ${isValidNext ? parsedNext : passRate.threshold})`}
                          </span>
                          <bdi
                            className={cn(
                              "mt-0.5 block text-lg font-extrabold tabular-nums",
                              ratioChanged
                                ? "text-primary"
                                : "text-foreground",
                            )}
                          >
                            {pctFmt.format(nextRatio)}
                          </bdi>
                          <span
                            className={cn(
                              "block text-[11px]",
                              ratioChanged
                                ? "text-primary/85"
                                : "text-muted-foreground",
                            )}
                          >
                            <bdi className="font-mono">
                              {nextPassed} / {passRate.total}
                            </bdi>
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {rtl
                          ? `تُحسب نسبة النجاح ديناميكيًا على الحاضرين والمحرومين فقط (${passRate.presentCount} حاضر + ${passRate.bannedCount} محروم = ${passRate.total} طالب)، ويُستبعد الغائبون وغير المرصودين.`
                          : `Pass rate divides dynamically by Present + Banned students only (${passRate.presentCount} present + ${passRate.bannedCount} banned = ${passRate.total}), excluding absent and unentered.`}
                      </p>
                    </div>
                  </DialogBody>

                  <DialogFooter className="gap-2 rtl:sm:justify-start">
                    <Button
                      type="button"
                      disabled={thresholdBusy || !isValidNext}
                      className="rounded-squircle gap-1.5"
                      onClick={async () => {
                        setThresholdBusy(true);
                        try {
                          await updateControlPassThreshold(
                            sheet.id,
                            parsedNext,
                          );
                          setCustomThresholds((prev) => ({
                            ...prev,
                            [key]: parsedNext,
                          }));
                          await refresh();
                          toast.success(
                            rtl
                              ? "تم تحديث درجة ونسبة النجاح بنجاح"
                              : "Pass threshold updated successfully",
                          );
                          setPassThresholdOpen(false);
                        } catch (err) {
                          toast.error(getApiErrorMessage(err));
                        } finally {
                          setThresholdBusy(false);
                        }
                      }}
                    >
                      {thresholdBusy && (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                      {rtl ? "حفظ وتحديث النسبة" : "Save Threshold"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={thresholdBusy}
                      onClick={() => setPassThresholdOpen(false)}
                      className="rounded-squircle"
                    >
                      {rtl ? "إلغاء" : "Cancel"}
                    </Button>
                  </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      )}
      {attemptDialog && (
        <ControlAttemptDialog
          sheetId={sheet.id}
          locale={locale}
          approval={attemptDialog.approval}
          canCarry={caps.canEdit && caps.canReview}
          onClose={() => setAttemptDialog(null)}
          onCarried={refresh}
          onApproved={async (review) => {
            if (attemptDialog.partial) {
              if (await transitionPartial(review, "PARTIAL_APPROVE"))
                setAttemptDialog(null);
            } else if (await transition(review, "APPROVE")) {
              setAttemptDialog(null);
            }
          }}
        />
      )}
      {partialOpenDialog && caps.canOpenPartial && (
        <ControlPartialOpenDialog
          open={partialOpenDialog}
          onOpenChange={setPartialOpenDialog}
          locale={locale}
          detail={detail}
          onOpened={refresh}
        />
      )}
      {downloadKind && (
        <ControlDownloadDialogs
          detail={detail}
          locale={locale}
          kind={downloadKind}
          onClose={() => setDownloadKind(null)}
        />
      )}
      {importOpen && (
        <ControlImportLauncher
          sheetId={sheet.id}
          rows={rows}
          locale={locale}
          onClose={() => setImportOpen(false)}
          onDownload={
            caps.canExport
              ? () => downloadControlTemplate(sheet.id, key, detail.course.code)
              : undefined
          }
          onSaved={refresh}
          onAudit={caps.canViewAudit ? onOpenSheetAudit : undefined}
        />
      )}
      {petitionCreateOpen && caps.canCreatePetitions && (
        <ControlPetitionCreateDialog
          open={petitionCreateOpen}
          onOpenChange={setPetitionCreateOpen}
          locale={locale}
          detail={detail}
          scheme={workbook.data?.scheme}
          rows={rows}
          initialSelectedStudentIds={selected}
          onSubmitted={() => {
            setSelected([]);
            void sheetPetitionsQuery.refetch();
          }}
        />
      )}
      {activePetitionReview && (
        <ControlPetitionReviewDialog
          key={activePetitionReview.id}
          petition={activePetitionReview}
          open={Boolean(activePetitionReview)}
          onOpenChange={(open) => {
            if (!open) {
              setActivePetitionReview(null);
              void refresh();
              void sheetPetitionsQuery.refetch();
            }
          }}
          locale={locale}
          canApprove={Boolean(caps.canApprovePetitions)}
          currentUserId={principalId}
        />
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        {CONTROL_COMPONENT_KEYS.map((component) => (
          <Button
            key={component}
            aria-label={t(component)}
            aria-describedby={`${sheet.id}-${component}-state`}
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
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                (component === key
                  ? sheet.workflowState
                  : workbook.data?.componentStates?.[component]) === "APPROVED"
                  ? "bg-emerald-400"
                  : ["IN_REVIEW", "PENDING_APPROVAL"].includes(
                        component === key
                          ? sheet.workflowState
                          : (workbook.data?.componentStates?.[component] ??
                              "DRAFT"),
                      )
                    ? "bg-sky-400"
                    : "bg-rose-400"
              }`}
              aria-hidden="true"
            />
            <span
              id={`${sheet.id}-${component}-state`}
              className="text-[10px] font-normal"
            >
              {t(
                `workflow.${component === key ? sheet.workflowState : (workbook.data?.componentStates?.[component] ?? "DRAFT")}`,
              )}
            </span>
          </Button>
        ))}
        <span
          className="ms-auto inline-flex items-center gap-1.5 text-xs"
          role="status"
          aria-live="polite"
        >
          <SaveStateIcon
            className={cn(
              "size-4 shrink-0",
              saveState === "saving" && "text-primary motion-safe:animate-spin",
              saveState === "saveFailed" && "text-danger",
              saveState === "unsaved" && "text-warning",
              saveState === "saved" && "text-emerald-500",
            )}
            aria-hidden="true"
          />
          {t(`workflow.${sheet.workflowState}`)} ·{" "}
          {t(saveState)}
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
      {["IN_REVIEW", "PENDING_APPROVAL"].includes(sheet.workflowState) && (
        <HelpNote
          title={t("reviewStageTitle")}
          icon={<Send className="size-4 shrink-0" />}
        >
          {t("reviewExplanation")}
        </HelpNote>
      )}
      {sheet.workflowState === "APPROVED" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
          <span>
            {rtl
              ? "الاعتماد اكتمل؛ نشر هذا المكوّن للطلاب يتم من صفحة الدرجات."
              : "Review is complete; publish this component from Grades."}
          </span>
          {canPublish && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || saving || pending || failed}
              onClick={() => {
                const params = new URLSearchParams({
                  releaseCourse: detail.course.id,
                  releaseComponent: key,
                  releaseYear: sheet.academicYear,
                  releaseSemester: sheet.semester,
                });
                router.push(`/${locale}/admin/grades?${params}`);
              }}
            >
              {rtl ? `نشر ${t(key)}` : `Publish ${t(key)}`}
            </Button>
          )}
        </div>
      )}
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
      <ControlHelpNotes />
      {key === "final" && (
        <HelpNote
          title={rtl ? "ملاحظات النتيجة الرسمية" : "Official result guidance"}
          className="text-amber-500"
        >
          {t("finalDraftNote")}
        </HelpNote>
      )}
      {sheet.reviewReason && (
        <p className="rounded-xl border p-3 text-sm">
          {t("reviewNote")}: {sheet.reviewReason}
        </p>
      )}
      {/* Primary Governance & Workflow Actions Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-border/80 bg-card/75 backdrop-blur-sm shadow-sm">
        {/* Status chip & Sheet lock control */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">
              {t("status")}:
            </span>
            <div
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-squircle text-xs font-bold border",
                sheet.workflowState === "APPROVED"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : sheet.workflowState === "PARTIAL_OPEN"
                    ? "bg-amber-500/12 text-amber-300 border-amber-500/35"
                    : ["IN_REVIEW", "PENDING_APPROVAL"].includes(
                          sheet.workflowState,
                        )
                      ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                      : sheet.workflowState === "RETURNED"
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        : "bg-surface text-muted-foreground border-border/70",
              )}
            >
              <span className="size-2 rounded-full animate-pulse bg-current" />
              <span>
                {t(`workflow.${sheet.workflowState}`)}
                {isPartialOpen && partialCycle && (
                  <>
                    {" · "}
                    {partialCycle.phase === "PENDING_APPROVAL"
                      ? rtl
                        ? "بانتظار اعتماد العميد"
                        : "Awaiting Approval"
                      : partialCycle.phase === "RETURNED"
                        ? rtl
                          ? "معاد للمراجعة"
                          : "Returned"
                        : rtl
                          ? "قيد الرصد"
                          : "Editing"}
                  </>
                )}
              </span>
            </div>
          </div>

          {(caps.canLock || caps.canUnlock) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={onLockToggleRequest}
              className={cn(
                "rounded-squircle text-xs font-semibold border transition-all h-8",
                sheet.locked
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                  : "border-border/80 hover:bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {sheet.locked ? (
                <Unlock className="size-3.5 me-1.5 text-amber-400" />
              ) : (
                <Lock className="size-3.5 me-1.5" />
              )}
              <span>{t(sheet.locked ? "unlock" : "lock")}</span>
            </Button>
          )}
        </div>

        {/* Workflow submission & review actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {caps.canSubmit &&
            ["DRAFT", "RETURNED"].includes(sheet.workflowState) && (
              <Button
                type="button"
                size="sm"
                className="rounded-squircle text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm gap-1.5 h-8 px-4"
                disabled={pending || sheet.locked}
                onClick={() => setAction("SUBMIT")}
              >
                <Send className="size-3.5" />
                <span>{t("SUBMIT")}</span>
              </Button>
            )}

          {caps.canReview && sheet.workflowState === "IN_REVIEW" && (
            <Button
              type="button"
              size="sm"
              disabled={pending || sheet.locked}
              onClick={() => setAction("SUBMIT_APPROVAL")}
            >
              <Send className="size-3.5 me-1.5" />
              {t("SUBMIT_APPROVAL")}
            </Button>
          )}
          {(caps.canReview || caps.canApprove) &&
            ["IN_REVIEW", "PENDING_APPROVAL"].includes(sheet.workflowState) && (
              <>
                {caps.canApprove &&
                  sheet.workflowState === "PENDING_APPROVAL" && (
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-squircle text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm gap-1.5 h-8 px-4"
                      disabled={pending || sheet.locked}
                      onClick={() => setAction("APPROVE")}
                    >
                      <CheckCircle2 className="size-3.5" />
                      <span>{t("APPROVE")}</span>
                    </Button>
                  )}
                {caps.canReview && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-squircle text-xs font-semibold border-rose-500/30 text-rose-400 hover:bg-rose-500/10 gap-1.5 h-8 px-3"
                    disabled={pending || sheet.locked}
                    onClick={() => setAction("RETURN")}
                  >
                    <RotateCcw className="size-3.5" />
                    <span>{t("RETURN")}</span>
                  </Button>
                )}
              </>
            )}

          {caps.canOpenPartial &&
            sheet.workflowState === "APPROVED" &&
            !sheet.locked && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-squircle text-xs font-semibold border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 gap-1.5 h-8 px-3"
                disabled={pending || busy}
                onClick={() => setPartialOpenDialog(true)}
              >
                <UserCheck className="size-3.5" />
                <span>
                  {rtl
                    ? "فتح الرصد للطلاب غير المرصود لهم درجات"
                    : "Open Selective Entry"}
                </span>
              </Button>
            )}

          {caps.canReopen &&
            sheet.workflowState === "APPROVED" &&
            !sheet.locked && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-squircle text-xs font-semibold gap-1.5 h-8 px-3"
                disabled={pending}
                onClick={() => setAction("REOPEN")}
              >
                <RotateCcw className="size-3.5" />
                <span>{t("REOPEN")}</span>
              </Button>
            )}

          {isPartialOpen && (
            <>
              {caps.canSubmitPartial && (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-squircle text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm gap-1.5 h-8 px-3.5"
                  disabled={pending || busy || sheet.locked}
                  onClick={() => setPartialAction("PARTIAL_SUBMIT")}
                >
                  <Send className="size-3.5" />
                  <span>
                    {rtl
                      ? "إرسال الدرجات الجديدة للاعتماد"
                      : "Submit Partial Marks"}
                  </span>
                </Button>
              )}
              {caps.canApprovePartial && (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-squircle text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm gap-1.5 h-8 px-3.5"
                  disabled={pending || busy || sheet.locked}
                  onClick={() => setPartialAction("PARTIAL_APPROVE")}
                >
                  <CheckCircle2 className="size-3.5" />
                  <span>
                    {rtl
                      ? "اعتماد ونشر الدرجات الجديدة"
                      : "Approve New Marks"}
                  </span>
                </Button>
              )}
              {caps.canReturnPartial && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-squircle text-xs font-semibold border-rose-500/30 text-rose-400 hover:bg-rose-500/10 gap-1.5 h-8 px-3"
                  disabled={pending || busy || sheet.locked}
                  onClick={() => setPartialAction("PARTIAL_RETURN")}
                >
                  <RotateCcw className="size-3.5" />
                  <span>
                    {rtl ? "إعادة للمراجعة" : "Return Partial"}
                  </span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {isPartialOpen && partialCycle && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/[0.07] p-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between text-xs">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-bold text-amber-200">
              <UserCheck className="size-4 shrink-0 text-amber-300" />
              <span>
                {rtl
                  ? `دورة الرصد الجزئي مفتوحة لـ ${partialCycle.allowedStudentIds.length} طالب — الدرجات المعتمدة الأصلية مقفلة ومحمية`
                  : `Partial entry active for ${partialCycle.allowedStudentIds.length} selected students — approved marks remain locked`}
              </span>
            </div>
            {(partialCycle.returnReason || partialCycle.openReason) && (
              <p className="text-muted-foreground">
                {partialCycle.returnReason
                  ? rtl
                    ? `ملاحظة الإعادة للمراجعة: ${partialCycle.returnReason}`
                    : `Return note: ${partialCycle.returnReason}`
                  : rtl
                    ? `سبب الفتح: ${partialCycle.openReason}`
                    : `Reason: ${partialCycle.openReason}`}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setFilter(filter === "partial" ? "all" : "partial")
            }
            className="rounded-squircle h-8 shrink-0 border-amber-500/35 text-xs font-semibold cursor-pointer"
          >
            {filter === "partial"
              ? rtl
                ? "عرض كل الطلاب"
                : "Show All Students"
              : rtl
                ? "طلاب الرصد الجزئي فقط"
                : "Filter Partial Students"}
          </Button>
        </div>
      )}

      {/* Grid Search, Organized Filters & Sort Bar */}
      <div
        data-testid="control-workbook-toolbar"
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative w-full sm:w-60">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 start-3 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={t("search")}
            placeholder={t("search")}
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setSelected([]);
            }}
            className="h-9 w-full rounded-squircle ps-8 text-xs"
          />
        </div>
        <div className="w-full sm:w-56">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger
              className={cn(
                "h-9 w-full rounded-squircle text-xs",
                filter !== "all" &&
                  "border-primary/45 bg-primary/10 text-primary font-medium",
              )}
              aria-label={t("filter")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir={rtl ? "rtl" : "ltr"}>
              <SelectItem value="all" group={t("filters.groupGeneral")}>
                {t("filters.all")}
              </SelectItem>
              {isPartialOpen && (
                <SelectItem value="partial" group={t("filters.groupGeneral")}>
                  {t("filters.partial")}
                </SelectItem>
              )}
              <SelectItem
                value="aroundMid"
                group={t("filters.groupByScore", {
                  max: scoreMetrics.maxMark,
                  mid: scoreMetrics.midpoint,
                })}
              >
                {t("filters.aroundMid", {
                  min: scoreMetrics.midMin,
                  max: scoreMetrics.midMax,
                })}
              </SelectItem>
              <SelectItem
                value="aboveMid"
                group={t("filters.groupByScore", {
                  max: scoreMetrics.maxMark,
                  mid: scoreMetrics.midpoint,
                })}
              >
                {t("filters.aboveMid", { mid: scoreMetrics.midpoint })}
              </SelectItem>
              <SelectItem
                value="belowMid"
                group={t("filters.groupByScore", {
                  max: scoreMetrics.maxMark,
                  mid: scoreMetrics.midpoint,
                })}
              >
                {t("filters.belowMid", { mid: scoreMetrics.midpoint })}
              </SelectItem>
              {key !== "coursework" && (
                <SelectItem
                  value="passed"
                  group={t("filters.groupByScore", {
                    max: scoreMetrics.maxMark,
                    mid: scoreMetrics.midpoint,
                  })}
                >
                  {t("filters.passed", { threshold: activePassThreshold })}
                </SelectItem>
              )}
              {key !== "coursework" && (
                <SelectItem
                  value="failed"
                  group={t("filters.groupByScore", {
                    max: scoreMetrics.maxMark,
                    mid: scoreMetrics.midpoint,
                  })}
                >
                  {t("filters.failed", { threshold: activePassThreshold })}
                </SelectItem>
              )}
              <SelectItem
                value="fullMark"
                group={t("filters.groupByScore", {
                  max: scoreMetrics.maxMark,
                  mid: scoreMetrics.midpoint,
                })}
              >
                {t("filters.fullMark", { max: scoreMetrics.maxMark })}
              </SelectItem>
              <SelectItem
                value="zero"
                group={t("filters.groupByScore", {
                  max: scoreMetrics.maxMark,
                  mid: scoreMetrics.midpoint,
                })}
              >
                {t("filters.zero")}
              </SelectItem>
              <SelectItem value="absent" group={t("filters.groupStatus")}>
                {t("filters.absent")}
              </SelectItem>
              <SelectItem value="banned" group={t("filters.groupStatus")}>
                {t("filters.banned")}
              </SelectItem>
              <SelectItem value="invalid" group={t("filters.groupStatus")}>
                {t("filters.invalid")}
              </SelectItem>
              <SelectItem value="dirty" group={t("filters.groupStatus")}>
                {t("filters.dirty")}
              </SelectItem>
              <SelectItem value="errors" group={t("filters.groupStatus")}>
                {t("filters.errors")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-36">
          <Select
            value={sort}
            onValueChange={(value) => setSort(value as typeof sort)}
          >
            <SelectTrigger
              className="h-9 w-full rounded-squircle text-xs"
              aria-label={t("sort")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir={rtl ? "rtl" : "ltr"}>
              <SelectItem value="code">{t("code")}</SelectItem>
              <SelectItem value="name">{t("name")}</SelectItem>
              <SelectItem value="mark">{t("mark")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-squircle text-xs font-medium gap-1.5"
          onClick={() => setDescending(!descending)}
        >
          {descending ? (
            <ArrowDownWideNarrow aria-hidden="true" className="size-3.5" />
          ) : (
            <ArrowUpNarrowWide aria-hidden="true" className="size-3.5" />
          )}
          {t(descending ? "descending" : "ascending")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-9 rounded-squircle text-xs font-medium",
            onlyMissing &&
              "border-primary/45 bg-primary/10 text-primary hover:bg-primary/15",
          )}
          onClick={() => setOnlyMissing(!onlyMissing)}
        >
          {onlyMissing ? t("all") : t("missing")}
        </Button>
        {(filter !== "all" || onlyMissing || searchText.trim() !== "") && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 rounded-squircle text-xs text-muted-foreground hover:text-foreground gap-1"
            onClick={() => {
              setSearchText("");
              onSearchChange("");
              setFilter("all");
              setOnlyMissing(false);
              setSelected([]);
            }}
          >
            <X aria-hidden="true" className="size-3.5" />
            {t("resetFilters")}
          </Button>
        )}
      </div>

      {/* Sheet Tools & Live Pass Rate / Average Strip */}
      <div className="flex flex-wrap items-center gap-2">
        {(caps.canReview || caps.canApproveFinal) && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-squircle text-xs font-medium gap-1.5"
            disabled={busy}
            onClick={async () => {
              if (await save()) setAttemptDialog({ approval: false });
            }}
          >
            <GitCompareArrows className="size-3.5" />
            {t("attempts")}
          </Button>
        )}
        {key === "midterm" && caps.canGrace && (
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 rounded-squircle text-xs font-medium gap-1.5",
              sheet.grace &&
                "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 font-semibold",
            )}
            disabled={
              busy ||
              saving ||
              sheet.locked ||
              !["DRAFT", "RETURNED", "IN_REVIEW"].includes(sheet.workflowState)
            }
            onClick={async () => {
              if (await save()) setGraceOpen(true);
            }}
          >
            <CheckCircle2 className="size-3.5" />
            {sheet.grace
              ? rtl
                ? `درجات الرأفة (+${sheet.grace.amount})`
                : `Grace marks (+${sheet.grace.amount})`
              : rtl
                ? "درجات الرأفة"
                : "Grace marks"}
          </Button>
        )}
        {caps.canManageSchemes && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-squircle text-xs font-medium gap-1.5"
            disabled={pending}
            onClick={onOpenScheme}
          >
            <SlidersHorizontal className="size-3.5" />
            {t("scheme")}
          </Button>
        )}
        {caps.canCreatePetitions && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-squircle text-xs font-semibold gap-1.5 border-primary/35 text-primary hover:bg-primary/10"
            disabled={pending || busy}
            onClick={() => setPetitionCreateOpen(true)}
          >
            <FileEdit className="size-3.5" />
            {rtl ? "طلب التماس درجات" : "Grade Petition"}
          </Button>
        )}
        {caps.canViewAudit && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-squircle text-xs font-medium gap-1.5"
            onClick={onOpenSheetAudit}
          >
            <History className="size-3.5" />
            {t("audit")}
          </Button>
        )}
        {caps.canExport && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-squircle text-xs font-medium gap-1.5"
              disabled={pending || busy}
              onClick={() => setDownloadKind("templates")}
            >
              <Download className="size-3.5" />
              {rtl ? "نماذج" : "Templates"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-squircle text-xs font-medium gap-1.5"
              disabled={pending || busy}
              onClick={() => setDownloadKind("reports")}
            >
              <Download className="size-3.5" />
              {rtl ? "تقرير الكنترول" : "Control reports"}
            </Button>
          </>
        )}
        {caps.canImport && caps.canEdit && !isPartialOpen && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-squircle text-xs font-medium gap-1.5"
            disabled={pending || busy}
            onClick={async () => {
              if (await save()) setImportOpen(true);
            }}
          >
            <Upload className="size-3.5" />
            {t("import")}
          </Button>
        )}
        {(passRate || scoreMetrics.mean !== null) &&
          workbook.data &&
          !workbook.isError && (
            <div className="mr-auto flex max-w-full flex-wrap items-center gap-2 ltr:order-first">
              {passRate && (
                <div
                  role="group"
                  aria-label={t("passRate", {
                    component: t(passRate.component),
                  })}
                  onClick={
                    canManagePassThreshold
                      ? () => {
                          setThresholdInput(String(passRate.threshold));
                          setPassThresholdOpen(true);
                        }
                      : undefined
                  }
                  title={
                    rtl
                      ? `نسبة النجاح = الناجحون (${passRate.passed}) ÷ (الحاضرون ${passRate.presentCount} + المحرومون ${passRate.bannedCount})`
                      : `Pass rate = Passed (${passRate.passed}) / (Present ${passRate.presentCount} + Banned ${passRate.bannedCount})`
                  }
                  className={cn(
                    "inline-flex h-9 w-fit max-w-full items-center gap-2 rounded-squircle border border-primary/20 bg-primary/5 px-3 text-xs rtl:order-last rtl:mr-auto",
                    canManagePassThreshold &&
                      "transition-colors hover:border-primary/50 hover:bg-primary/15 cursor-pointer",
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Percent
                      aria-hidden="true"
                      className="size-3.5 text-primary"
                    />
                    {t("passRate", { component: t(passRate.component) })}
                  </span>
                  <bdi className="text-sm font-bold tabular-nums text-primary">
                    {new Intl.NumberFormat(locale, {
                      style: "percent",
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(passRate.ratio)}
                  </bdi>
                  <bdi className="hidden sm:inline font-mono text-[11px] font-semibold text-muted-foreground tabular-nums">
                    ({passRate.passed}/{passRate.total})
                  </bdi>
                  {canManagePassThreshold && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setThresholdInput(String(passRate.threshold));
                        setPassThresholdOpen(true);
                      }}
                      aria-label={
                        rtl
                          ? "تعديل حد درجة النجاح"
                          : "Edit pass mark threshold"
                      }
                      title={
                        rtl
                          ? `تعديل حد درجة النجاح (الحالي > ${passRate.threshold})`
                          : `Edit pass mark threshold (current > ${passRate.threshold})`
                      }
                      className="inline-flex size-6 items-center justify-center rounded-squircle text-primary/80 transition-colors hover:bg-primary/15 hover:text-primary cursor-pointer"
                    >
                      <SlidersHorizontal
                        aria-hidden="true"
                        className="size-3.5"
                      />
                    </button>
                  )}
                </div>
              )}

              {scoreMetrics.mean !== null && (
                <span
                  title={
                    rtl
                      ? `متوسط درجات الحاضرين المرصودة (${scoreMetrics.scoredCount} طالب) · نصف الدرجة العظمى = ${scoreMetrics.midpoint}`
                      : `Mean of entered present marks (${scoreMetrics.scoredCount} students) · Half mark = ${scoreMetrics.midpoint}`
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-squircle border border-border/70 bg-secondary/40 px-2.5 text-xs font-medium text-muted-foreground"
                >
                  <Calculator
                    aria-hidden="true"
                    className="size-3.5 text-primary/80"
                  />
                  <span>{t("averageScore")}:</span>
                  <bdi
                    dir="ltr"
                    className="font-mono font-bold tabular-nums text-foreground"
                  >
                    {scoreMetrics.mean}/{scoreMetrics.maxMark}
                  </bdi>
                </span>
              )}

              {passRate && (
                <div
                  aria-label={
                    rtl
                      ? "إحصائيات الحضور والحرمان والغياب الحية"
                      : "Live present, banned, and absent counts"
                  }
                  className="flex flex-wrap items-center gap-1.5 text-[11px]"
                >
                  <span
                    title={
                      rtl
                        ? "الطلاب الحاضرون في هذا الامتحان (يدخلون في حساب نسبة النجاح)"
                        : "Present students included in pass rate"
                    }
                    className="inline-flex h-8 items-center gap-1 rounded-squircle border border-emerald-500/25 bg-emerald-500/10 px-2.5 font-semibold text-emerald-300"
                  >
                    <span>{rtl ? "حاضر:" : "Present:"}</span>
                    <bdi className="font-mono font-bold tabular-nums">
                      {passRate.presentCount}
                    </bdi>
                  </span>
                  <span
                    title={
                      rtl
                        ? "الطلاب المحرومون في هذا الامتحان (يدخلون في حساب نسبة النجاح)"
                        : "Banned students included in pass rate"
                    }
                    className="inline-flex h-8 items-center gap-1 rounded-squircle border border-amber-500/30 bg-amber-500/10 px-2.5 font-semibold text-amber-300"
                  >
                    <span>{rtl ? "محروم:" : "Banned:"}</span>
                    <bdi className="font-mono font-bold tabular-nums">
                      {passRate.bannedCount}
                    </bdi>
                  </span>
                  <span
                    title={
                      rtl
                        ? "الطلاب الغائبون (مستبعدون من مقام نسبة النجاح)"
                        : "Absent students (excluded from pass rate)"
                    }
                    className="inline-flex h-8 items-center gap-1 rounded-squircle border border-border/70 bg-secondary/40 px-2.5 font-medium text-muted-foreground"
                  >
                    <span>{rtl ? "غائب:" : "Absent:"}</span>
                    <bdi className="font-mono font-bold tabular-nums text-foreground/85">
                      {passRate.absentCount}
                    </bdi>
                  </span>
                </div>
              )}
            </div>
          )}
      </div>
      {sheetPetitions.length > 0 && (
        <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
              <FileCheck2 className="size-4 text-primary" />
              <span>
                {rtl
                  ? `طلبات التماس تعديل الدرجات على هذا الكشف (${sheetPetitions.length})`
                  : `Grade Adjustment Petitions on this Sheet (${sheetPetitions.length})`}
              </span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 rounded-squircle text-xs text-primary"
              onClick={() =>
                router.push(
                  `/${locale}/admin/control/petitions?academicYear=${encodeURIComponent(sheet.academicYear)}&semester=${encodeURIComponent(sheet.semester)}`,
                )
              }
            >
              {rtl ? "عرض كل طلبات الالتماس" : "View All Petitions"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sheetPetitions.slice(0, 4).map((p) => {
              const isUnreadDecision =
                p.status !== "PENDING" && p.requesterSeenAt === null;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActivePetitionReview(p)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-squircle border px-3 py-1.5 text-xs transition-all cursor-pointer",
                    p.status === "PENDING"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                      : p.status === "REJECTED"
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
                  )}
                >
                  {isUnreadDecision && (
                    <Bell className="size-3.5 animate-bounce text-primary" />
                  )}
                  <span className="font-bold">
                    {p.status === "PENDING"
                      ? rtl
                        ? `قيد الاعتماد (${p.counts.total} طلاب)`
                        : `Pending (${p.counts.total} students)`
                      : rtl
                        ? `تم البت: موافقة ${p.counts.approved} · رفض ${p.counts.rejected}`
                        : `Decided: ${p.counts.approved} approved · ${p.counts.rejected} rejected`}
                  </span>
                  <span className="text-[11px] opacity-80 truncate max-w-[180px]">
                    — {p.reason}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border p-2">
          <span>{t("selected", { count: selected.length })}</span>
          {caps.canCreatePetitions && (
            <Button
              type="button"
              size="sm"
              className="rounded-squircle gap-1.5 text-xs font-bold"
              disabled={pending}
              onClick={() => setPetitionCreateOpen(true)}
            >
              <FileEdit className="size-3.5" />
              <span>
                {rtl
                  ? `طلب التماس للطلاب المحددين (${selected.length})`
                  : `Create Petition for Selected (${selected.length})`}
              </span>
            </Button>
          )}
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {caps.canEdit && (
            <div className="relative w-full sm:w-80 md:w-96 max-w-full">
              <Input
                aria-label={t("stateReasonOptional")}
                placeholder={t("stateReasonOptional")}
                value={reason}
                maxLength={150}
                onChange={(e) => setReason(e.target.value.slice(0, 150))}
                className="h-9 w-full rounded-squircle pe-12 text-xs"
              />
              <span
                aria-live="polite"
                className={cn(
                  "pointer-events-none absolute top-1/2 end-2.5 -translate-y-1/2 font-mono text-[10px] tabular-nums",
                  reason.length >= 140
                    ? "text-amber-400 font-semibold"
                    : "text-muted-foreground/70",
                )}
              >
                <bdi dir="ltr">{reason.length}/150</bdi>
              </span>
            </div>
          )}
          {hiddenCheckpoint && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-squircle text-xs font-medium"
              onClick={() => {
                const checkpoint: ControlCheckpoint = {
                  ...hiddenCheckpoint,
                  filter: "all",
                  onlyMissing: false,
                  search: "",
                };
                remember(checkpoint, true);
                setRestore(checkpoint);
                setHiddenCheckpoint(null);
              }}
            >
              {t("goToLastStudent")}
            </Button>
          )}
          {(checkpointLoading || restore) && (
            <ControlWorkbookLoading stage="restoringPosition" />
          )}
          {saveError && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 rounded-squircle text-xs"
              onClick={retry}
            >
              {t("retryCheckpoint")}
            </Button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-squircle text-xs font-medium gap-1.5 ms-auto shrink-0"
          onClick={startFromFirstPage}
        >
          <ArrowUpToLine aria-hidden="true" className="size-3.5 text-primary" />
          {t("startFromFirstPage")}
        </Button>
      </div>
      <div
        ref={tableViewport}
        className="max-h-[65vh] overflow-auto scroll-mt-6 rounded-xl border bg-card"
      >
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
              <th className="p-3 min-w-40">
                {t("status")} — {t(key)}
              </th>
              <th className="p-3">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr
                data-checkpoint-row={row.studentId}
                key={row.studentId}
                data-tuition-blocked={row.tuition?.isBlocked || undefined}
                className={cn(
                  "border-t",
                  row.tuition?.isBlocked
                    ? "[&>td]:bg-[color-mix(in_srgb,var(--card)_92%,#f43f5e_8%)] hover:[&>td]:bg-[color-mix(in_srgb,var(--card)_88%,#f43f5e_12%)]"
                    : isPartialOpen && partialAllowedSet.has(row.studentId)
                      ? "[&>td]:bg-amber-500/[0.06] hover:[&>td]:bg-amber-500/[0.11]"
                      : "hover:bg-muted/30",
                )}
              >
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
                <td
                  className={cn(
                    "sticky start-0 z-10 p-3 font-mono",
                    !row.tuition?.isBlocked && "bg-card",
                  )}
                >
                  <bdi dir="ltr">{row.studentCode}</bdi>
                </td>
                <td className="p-3">
                  {rtl ? row.nameAr || row.name : row.name}
                  {isPartialOpen && partialAllowedSet.has(row.studentId) && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-squircle border border-amber-500/35 bg-amber-500/12 px-2 py-0.5 text-[10px] font-bold text-amber-300 ms-1.5">
                      <UserCheck className="size-3 shrink-0" aria-hidden="true" />
                      {rtl ? "مفتوح للرصد الجزئي" : "Partial Entry"}
                      {partialCycle?.studentReasons?.[row.studentId]
                        ? ` · ${partialCycle.studentReasons[row.studentId]}`
                        : ""}
                    </span>
                  )}
                  {isPartialOpen &&
                    !partialAllowedSet.has(row.studentId) &&
                    row.components[key]?.isApproved && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-squircle border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ms-1.5">
                        <ShieldCheck
                          className="size-3 shrink-0"
                          aria-hidden="true"
                        />
                        {rtl ? "معتمد · مقفل" : "Approved · Locked"}
                      </span>
                    )}
                  {row.tuition?.isBlocked && (
                    <span className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-400">
                      <Lock className="size-3 shrink-0" aria-hidden="true" />
                      {t("tuitionBlockedShort")}
                    </span>
                  )}
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
                      (drafts[row.studentId]
                        ? drafts[row.studentId].status
                        : row.components[key]?.status) ?? NOT_ENTERED
                    }
                    disabled={!canEditRow(row)}
                    onValueChange={(value) => edit(row, "status", value)}
                  >
                    <SelectTrigger
                      aria-label={`${row.studentCode} ${t("status")}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir={rtl ? "rtl" : "ltr"}>
                      <SelectItem
                        value={NOT_ENTERED}
                        disabled={
                          !caps.canManageStates &&
                          (CONTROL_RESTRICTED_STATES as readonly string[]).includes(
                            row.components[key]?.status ?? "",
                          )
                        }
                      >
                        {t("notEntered")}
                      </SelectItem>
                      {key === "midterm" &&
                        row.components[key]?.status &&
                        !(CONTROL_MIDTERM_STATES as readonly string[]).includes(
                          row.components[key]!.status!,
                        ) && (
                          <SelectItem
                            value={row.components[key]!.status!}
                            disabled
                          >
                            {t(`states.${row.components[key]!.status}`)}
                          </SelectItem>
                        )}
                      {(key === "midterm"
                        ? CONTROL_MIDTERM_STATES
                        : GRADE_STATUS_VALUES
                      ).map((state) => (
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
                          className="z-50 min-w-[160px] rounded-squircle border bg-popover p-1.5 text-popover-foreground shadow-lg space-y-0.5"
                          dir={rtl ? "rtl" : "ltr"}
                        >
                          {caps.canViewAudit && (
                            <DropdownMenuItem
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-surface/80 focus:bg-surface/80 outline-none"
                              onSelect={() => onOpenRowAudit(row)}
                            >
                              <History className="size-3.5 text-primary shrink-0" />
                              <span>{t("audit")}</span>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            disabled={!canEditRow(row) || pending}
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-rose-500 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:text-rose-400 outline-none disabled:opacity-50 disabled:pointer-events-none"
                            onSelect={() => {
                              setSelected([row.studentId]);
                              setAction("CLEAR");
                            }}
                          >
                            <Trash2 className="size-3.5 text-rose-500 shrink-0" />
                            <span>{t("CLEAR")}</span>
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
        open={Boolean(partialAction)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPartialAction(null);
            setPartialReason("");
          }
        }}
      >
        <DialogContent flush dir={rtl ? "rtl" : "ltr"} className="max-w-lg">
          <DialogHeader>
            <div className="flex items-start gap-3 text-start">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-squircle border border-primary/30 bg-primary/15 text-primary">
                <UserCheck className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <DialogTitle className="text-base font-bold text-start">
                  {partialAction === "PARTIAL_SUBMIT"
                    ? rtl
                      ? "إرسال درجات الرصد الجزئي للاعتماد"
                      : "Submit Partial Marks for Approval"
                    : partialAction === "PARTIAL_RETURN"
                      ? rtl
                        ? "إعادة درجات الرصد الجزئي للمراجعة"
                        : "Return Partial Marks for Review"
                      : rtl
                        ? "اعتماد ونشر الدرجات الجديدة"
                        : "Approve & Publish New Marks"}
                </DialogTitle>
                <DialogDescription className="text-start text-xs">
                  {partialAction === "PARTIAL_SUBMIT"
                    ? rtl
                      ? "سيُغلق تعديل درجات الطلاب المحددين أثناء انتظار اعتماد العميد، مع بقاء الدرجات الأصلية محمية ومنشورة."
                      : "Editing for selected students will lock while awaiting dean approval. Original marks stay published."
                    : partialAction === "PARTIAL_RETURN"
                      ? rtl
                        ? "سيُعاد فتح الرصد للطلاب المعنيين في الدورة الجزئية فقط دون المساس بالدرجات الأصلية."
                        : "Editing will reopen for the selected partial-entry students only."
                      : rtl
                        ? "سيتم اعتماد ونشر درجات الطلاب الجدد فقط وإغلاق دورة الرصد الجزئي نهائيًا داخل Transaction."
                        : "Only the newly entered marks will be approved and published, and the partial cycle will close."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogBody>
            <div className="rounded-xl border border-border/60 bg-secondary/20 p-3.5 space-y-2">
              <label className="block space-y-1.5 text-xs font-semibold text-foreground">
                <span>
                  {partialAction === "PARTIAL_RETURN"
                    ? rtl
                      ? "سبب الإعادة للمراجعة (مطلوب):"
                      : "Return reason (required):"
                    : rtl
                      ? "ملاحظة / سبب الإجراء (اختياري):"
                      : "Note / reason (optional):"}
                </span>
                <Input
                  value={partialReason}
                  maxLength={500}
                  disabled={busy}
                  onChange={(e) => setPartialReason(e.target.value)}
                  className="rounded-squircle h-9 text-xs"
                />
              </label>
            </div>
          </DialogBody>
          <DialogFooter className="gap-2 rtl:sm:justify-start">
            <Button
              type="button"
              disabled={
                busy ||
                saving ||
                (partialAction === "PARTIAL_RETURN" &&
                  partialReason.trim().length < 3)
              }
              onClick={() => void transitionPartial()}
              className="rounded-squircle gap-1.5"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              <span>{rtl ? "تأكيد ومتابعة" : "Confirm"}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setPartialAction(null);
                setPartialReason("");
              }}
              className="rounded-squircle"
            >
              {rtl ? "إلغاء" : "Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {t(
                action === "SUBMIT_APPROVAL"
                  ? "sendApprovalExplanation"
                  : action === "APPROVE"
                    ? "approvalExplanation"
                    : action === "RETURN"
                      ? "returnExplanation"
                      : action === "REOPEN"
                        ? "reopenExplanation"
                        : action === "CLEAR"
                          ? "clearExplanation"
                          : "reviewExplanation",
              )}
            </DialogDescription>
          </DialogHeader>
          {(action === "SUBMIT" ||
            action === "SUBMIT_APPROVAL" ||
            action === "APPROVE") && (
            <div
              className={cn(
                "rounded-xl border p-3 text-xs space-y-2",
                readiness.total === readiness.entered
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-300",
              )}
            >
              <div className="font-bold flex items-center justify-between gap-2">
                <span>{t("readinessTitle")}</span>
                <span className="font-mono" dir="ltr">
                  {readiness.entered} / {readiness.total}
                </span>
              </div>
              <p>
                {t("readinessStats", {
                  total: readiness.total,
                  entered: readiness.entered,
                  missing: readiness.total - readiness.entered,
                })}
              </p>
              <p className="leading-relaxed">
                {readiness.total === readiness.entered
                  ? t("readinessReady", { total: readiness.total })
                  : t("readinessWarning", {
                      total: readiness.total,
                      missing: readiness.total - readiness.entered,
                    })}
              </p>
              {!readiness.ready && readiness.missing > 0 && (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-squircle text-xs border-amber-500/40 text-amber-200 hover:bg-amber-500/20"
                    onClick={() => {
                      setOnlyMissing(true);
                      setAction(null);
                    }}
                  >
                    {t("showMissingRows")}
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="rtl:sm:justify-start">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              {rtl ? "لا، رجوع" : "No, go back"}
            </Button>
            <Button disabled={busy || saving} onClick={() => void transition()}>
              {busy && <Loader2 className="size-4 animate-spin me-2" />}
              {rtl ? "نعم، متابعة" : t("confirm")}
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
              <p
                key={change.opId}
                className="flex flex-wrap items-center gap-1.5 text-sm font-mono"
              >
                <bdi>{byId.get(change.studentId)?.studentCode}</bdi>:{" "}
                <span>
                  {byId.get(change.studentId)?.components[key]?.score ?? "—"}
                </span>
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0 text-primary rtl:rotate-180"
                  aria-hidden="true"
                />
                <span>{change.score ?? t("states." + change.status)}</span>
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
