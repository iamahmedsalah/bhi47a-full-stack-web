'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  History,
  Loader2,
  Lock,
  MoreVertical,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Unlock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CONTROL_RESTRICTED_STATES,
  CONTROL_SCORELESS_STATES,
  parseMarkInput,
  validateMark,
  type GradeStatus,
  type MarkValidationError,
} from '@student-portal/shared';
import { CAIRO_TIME_ZONE } from '@/lib/cairo-time';
import { getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CustomDropdown,
  type CustomDropdownOption,
} from '@/components/ui/custom-dropdown';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GlassCard } from '@/components/ui/glass-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { applyControlChanges } from '../api';
import type {
  ControlEntry,
  ControlRosterRow,
  ControlSheetDetails,
  GradeChangeInput,
} from '../types';

export type GridFilterMode =
  | 'all'
  | 'not_entered'
  | 'invalid'
  | 'absent'
  | 'dirty'
  | 'conflict';

interface CellDraft {
  score: number | null;
  status: GradeStatus | null;
  rawText: string;
  validationError: MarkValidationError | null;
  reason?: string;
}

interface ConflictInfo {
  studentId: string;
  studentName: string;
  studentCode: string;
  yours: { score: number | null; status: GradeStatus | null };
  theirs: ControlEntry | null;
}

interface PastePreviewItem {
  studentId: string;
  studentCode: string;
  studentName: string;
  oldScore: number | null;
  oldStatus: string | null;
  newScore: number | null;
  newStatus: GradeStatus | null;
  rawText: string;
  validationError: MarkValidationError | null;
  overwritesExisting: boolean;
  needsPublishedReason: boolean;
}

interface UndoSnapshotItem {
  studentId: string;
  score: number | null;
  status: GradeStatus | null;
}

interface ControlGridProps {
  sheetDetails: ControlSheetDetails;
  initialRows: ControlRosterRow[];
  locale: string;
  search: string;
  onSearchChange: (val: string) => void;
  filterMode: GridFilterMode;
  onFilterModeChange: (mode: GridFilterMode) => void;
  onOpenScheme: () => void;
  onOpenSheetAudit: () => void;
  onOpenRowAudit: (row: ControlRosterRow) => void;
  onLockToggleRequest: () => void;
  onEntriesUpdated?: () => void;
}

function makeOpId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function formatValidationMessage(
  err: MarkValidationError,
  rules: { max: number; step: number },
  isAr: boolean,
): string {
  if (isAr) {
    switch (err) {
      case 'not_a_number':
        return 'القيمة المدخلة ليست رقماً صالحاً';
      case 'negative':
        return 'لا يمكن إدخال درجة سالبة';
      case 'above_max':
        return `أكبر من الدرجة العظمى (${rules.max})`;
      case 'off_step':
        return `الدرجة يجب أن تكون من مضاعفات (${rules.step})`;
      case 'too_many_decimals':
        return 'يُسمح برقمين عشريين كحد أقصى';
    }
  }
  switch (err) {
    case 'not_a_number':
      return 'Not a valid number';
    case 'negative':
      return 'Cannot be negative';
    case 'above_max':
      return `Greater than maximum (${rules.max})`;
    case 'off_step':
      return `Must be a multiple of step (${rules.step})`;
    case 'too_many_decimals':
      return 'At most 2 decimal places allowed';
  }
}

export function ControlGrid({
  sheetDetails,
  initialRows,
  locale,
  search,
  onSearchChange,
  filterMode,
  onFilterModeChange,
  onOpenScheme,
  onOpenSheetAudit,
  onOpenRowAudit,
  onLockToggleRequest,
  onEntriesUpdated,
}: ControlGridProps) {
  const isAr = locale === 'ar';
  const { sheet, rules, capabilities } = sheetDetails;
  const canEdit = capabilities.canEdit && !sheet.locked;

  // Authoritative server rows keyed by studentId
  const [rows, setRows] = useState<ControlRosterRow[]>(initialRows);
  const [prevInitialRows, setPrevInitialRows] =
    useState<ControlRosterRow[]>(initialRows);
  if (prevInitialRows !== initialRows) {
    setPrevInitialRows(initialRows);
    setRows(initialRows);
  }

  // Pending dirty drafts keyed by studentId
  const [drafts, setDrafts] = useState<Record<string, CellDraft>>({});
  // Conflicts keyed by studentId
  const [conflicts, setConflicts] = useState<Record<string, ConflictInfo>>({});
  // Active focused/editing cell
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  // Selected rows for bulk actions / copy / fill down
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Sort state
  const [sortBy, setSortBy] = useState<'code' | 'name' | 'midterm'>('code');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  // Save indicator
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  // Undo stack of last applied batches
  const [undoStack, setUndoStack] = useState<UndoSnapshotItem[][]>([]);

  // Dialog for mandatory reason (editing published grade or restricted status)
  const [reasonPrompt, setReasonPrompt] = useState<{
    open: boolean;
    title: string;
    description: string;
    pendingChanges: Array<{
      studentId: string;
      score: number | null;
      status: GradeStatus | null;
    }>;
  } | null>(null);
  const [promptReasonText, setPromptReasonText] = useState('');

  // Multi-row paste preview dialog
  const [pastePreview, setPastePreview] = useState<{
    open: boolean;
    items: PastePreviewItem[];
    reason: string;
  } | null>(null);

  const rowById = useMemo(
    () => new Map(rows.map((r) => [r.studentId, r])),
    [rows],
  );

  // Effective view of each row combining server state + local draft
  const effectiveRows = useMemo(() => {
    return rows.map((r) => {
      const d = drafts[r.studentId];
      const score = d !== undefined ? d.score : r.score;
      const status = (d !== undefined ? d.status : r.status) as GradeStatus | null;
      const validationError = d?.validationError ?? null;
      const isDirty = d !== undefined;
      const hasConflict = Boolean(conflicts[r.studentId]);
      return {
        ...r,
        effectiveScore: score,
        effectiveStatus: status,
        rawText:
          d?.rawText ??
          (score !== null && score !== undefined ? String(score) : ''),
        validationError,
        isDirty,
        hasConflict,
      };
    });
  }, [rows, drafts, conflicts]);

  // Summary strip metrics (always over full roster so user sees true sheet health)
  const summary = useMemo(() => {
    let entered = 0;
    let sum = 0;
    let countScored = 0;
    let highest: number | null = null;
    let lowest: number | null = null;
    let absentCount = 0;
    let invalidCount = 0;

    for (const r of effectiveRows) {
      if (r.validationError) invalidCount += 1;
      if (r.effectiveStatus !== null) entered += 1;
      if (r.effectiveStatus === 'absent') absentCount += 1;
      if (
        (r.effectiveStatus === 'present' || r.effectiveStatus === 'withheld') &&
        r.effectiveScore !== null &&
        !r.validationError
      ) {
        countScored += 1;
        sum += r.effectiveScore;
        if (highest === null || r.effectiveScore > highest) {
          highest = r.effectiveScore;
        }
        if (lowest === null || r.effectiveScore < lowest) {
          lowest = r.effectiveScore;
        }
      }
    }

    return {
      total: effectiveRows.length,
      entered,
      average: countScored > 0 ? Math.round((sum / countScored) * 100) / 100 : null,
      highest,
      lowest,
      absentCount,
      invalidCount,
    };
  }, [effectiveRows]);

  // Filtered and sorted rows for display
  const visibleRows = useMemo(() => {
    const filtered = effectiveRows.filter((r) => {
      switch (filterMode) {
        case 'not_entered':
          return r.effectiveStatus === null;
        case 'invalid':
          return r.validationError !== null;
        case 'absent':
          return (
            r.effectiveStatus !== null && r.effectiveStatus !== 'present'
          );
        case 'dirty':
          return r.isDirty;
        case 'conflict':
          return r.hasConflict;
        default:
          return true;
      }
    });

    const dir = sortOrder === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') {
        const na = isAr ? a.nameAr || a.name : a.name;
        const nb = isAr ? b.nameAr || b.name : b.name;
        return na.localeCompare(nb) * dir;
      }
      if (sortBy === 'midterm') {
        const sa = a.effectiveScore ?? -1;
        const sb = b.effectiveScore ?? -1;
        return (sa - sb) * dir;
      }
      return a.studentCode.localeCompare(b.studentCode) * dir;
    });
  }, [effectiveRows, filterMode, sortBy, sortOrder, isAr]);

  // Flush valid dirty drafts to backend (autosave)
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const flushChanges = useCallback(
    async (explicitDrafts?: Record<string, CellDraft>) => {
      const sourceDrafts = explicitDrafts ?? drafts;
      const validChanges: GradeChangeInput[] = [];

      for (const [studentId, draft] of Object.entries(sourceDrafts)) {
        if (draft.validationError) continue;
        const serverRow = rowById.get(studentId);
        if (!serverRow) continue;

        const sameStatus = (draft.status ?? null) === (serverRow.status ?? null);
        const sameScore = (draft.score ?? null) === (serverRow.score ?? null);
        if (sameStatus && sameScore) continue;

        validChanges.push({
          studentId,
          score: draft.score,
          status: draft.status ?? undefined,
          expectedRev: serverRow.rev ?? 0,
          opId: makeOpId(),
          reason: draft.reason,
        });
      }

      if (validChanges.length === 0 || isSavingRef.current) return;

      isSavingRef.current = true;
      setSaveState('saving');

      try {
        const res = await applyControlChanges(sheet.id, {
          changes: validChanges,
        });

        setRows((prev) =>
          prev.map((r) => {
            const item = res.results.find((x) => x.studentId === r.studentId);
            if (!item || item.result !== 'ok') return r;
            const entry = item.entry;
            return {
              ...r,
              score: entry?.score ?? null,
              status: entry?.status ?? null,
              rev: entry?.rev ?? 0,
              isPublished: entry?.isPublished ?? r.isPublished,
              updatedAt: entry?.updatedAt ?? r.updatedAt,
            };
          }),
        );

        setDrafts((prev) => {
          const next = { ...prev };
          for (const item of res.results) {
            if (item.result === 'ok') {
              delete next[item.studentId];
            }
          }
          return next;
        });

        const newConflicts: Record<string, ConflictInfo> = {};
        for (const item of res.results) {
          if (item.result === 'conflict') {
            const row = rowById.get(item.studentId);
            const draft = sourceDrafts[item.studentId];
            if (row && draft) {
              newConflicts[item.studentId] = {
                studentId: item.studentId,
                studentCode: row.studentCode,
                studentName: isAr ? row.nameAr || row.name : row.name,
                yours: { score: draft.score, status: draft.status },
                theirs: item.current ?? null,
              };
            }
          } else if (item.result === 'forbidden' || item.result === 'invalid') {
            toast.error(item.message || 'Rejected grade change');
          }
        }

        if (Object.keys(newConflicts).length > 0) {
          setConflicts((prev) => ({ ...prev, ...newConflicts }));
          toast.warning(
            isAr
              ? 'حدث تعارض في بعض الخلايا نتيجة تعديل متزامن؛ يرجى اختيار القيمة المطلوبة'
              : 'Concurrent edit conflict detected; please choose which value to keep',
          );
        }

        setSaveState(res.summary.invalid || res.summary.forbidden ? 'error' : 'saved');
        onEntriesUpdated?.();
      } catch (err) {
        setSaveState('error');
        toast.error(getApiErrorMessage(err));
      } finally {
        isSavingRef.current = false;
      }
    },
    [drafts, rowById, sheet.id, isAr, onEntriesUpdated],
  );

  // Schedule 800ms autosave whenever valid dirty drafts exist
  useEffect(() => {
    const hasValidDirty = Object.values(drafts).some(
      (d) => d.validationError === null,
    );
    if (!hasValidDirty) return undefined;

    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      void flushChanges();
    }, 800);

    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [drafts, flushChanges]);

  // Apply one or more cell edits with permission & reason checks
  const queueCellChanges = useCallback(
    (
      items: Array<{
        studentId: string;
        score: number | null;
        status: GradeStatus | null;
        rawText?: string;
        validationError?: MarkValidationError | null;
      }>,
      providedReason?: string,
      recordUndo = true,
    ) => {
      if (!canEdit) return;

      // Check if any item modifies a published grade or uses a restricted state
      const needsReasonItems = items.filter((item) => {
        if (item.validationError) return false;
        const serverRow = rowById.get(item.studentId);
        const isPublishedEdit = Boolean(serverRow?.isPublished);
        const isRestrictedNew =
          item.status !== null &&
          (CONTROL_RESTRICTED_STATES as readonly string[]).includes(item.status);
        const isRestrictedOld =
          serverRow?.status !== null &&
          serverRow?.status !== undefined &&
          (CONTROL_RESTRICTED_STATES as readonly string[]).includes(
            serverRow.status,
          );
        return isPublishedEdit || isRestrictedNew || isRestrictedOld;
      });

      for (const item of needsReasonItems) {
        const serverRow = rowById.get(item.studentId);
        if (serverRow?.isPublished && !capabilities.canEditPublished) {
          toast.error(
            isAr
              ? 'الدرجة منشورة للطالب وتعديلها يتطلب صلاحية تعديل الدرجات المنشورة'
              : 'Editing a published grade requires control.grades.edit_published',
          );
          return;
        }
        const touchesRestricted =
          (item.status !== null &&
            (CONTROL_RESTRICTED_STATES as readonly string[]).includes(
              item.status,
            )) ||
          (serverRow?.status &&
            (CONTROL_RESTRICTED_STATES as readonly string[]).includes(
              serverRow.status,
            ));
        if (touchesRestricted && !capabilities.canManageStates) {
          toast.error(
            isAr
              ? 'تغيير هذه الحالة يتطلب صلاحية إدارة الحالات الخاصة'
              : 'Setting this state requires control.states.manage',
          );
          return;
        }
      }

      if (needsReasonItems.length > 0 && !providedReason) {
        setPromptReasonText('');
        setReasonPrompt({
          open: true,
          title: isAr
            ? 'سبب التعديل مطلوب للتدقيق'
            : 'Mandatory Reason Required',
          description: isAr
            ? 'تعديل درجة منشورة أو تعيين حالة خاصة يتطلب كتابة سبب واضح يُحفظ في سجل التدقيق.'
            : 'Editing a published mark or setting a special status requires a reason for the audit log.',
          pendingChanges: items.map(({ studentId, score, status }) => ({
            studentId,
            score,
            status,
          })),
        });
        return;
      }

      if (recordUndo) {
        const undoSnap: UndoSnapshotItem[] = items.map((it) => {
          const curDraft = drafts[it.studentId];
          const srv = rowById.get(it.studentId);
          return {
            studentId: it.studentId,
            score: curDraft !== undefined ? curDraft.score : (srv?.score ?? null),
            status: (curDraft !== undefined
              ? curDraft.status
              : (srv?.status ?? null)) as GradeStatus | null,
          };
        });
        setUndoStack((prev) => [...prev.slice(-19), undoSnap]);
      }

      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of items) {
          next[item.studentId] = {
            score: item.score,
            status: item.status,
            rawText:
              item.rawText ??
              (item.score !== null && item.score !== undefined
                ? String(item.score)
                : ''),
            validationError: item.validationError ?? null,
            reason: providedReason,
          };
        }
        return next;
      });
    },
    [
      canEdit,
      rowById,
      capabilities.canEditPublished,
      capabilities.canManageStates,
      isAr,
      drafts,
    ],
  );

  // Commit the active inline cell edit
  const commitCellEdit = useCallback(
    (studentId: string, rawInput: string) => {
      setEditingStudentId(null);
      const parsed = parseMarkInput(rawInput);
      if (!parsed.ok) {
        queueCellChanges([
          {
            studentId,
            score: null,
            status: 'present',
            rawText: rawInput,
            validationError: 'not_a_number',
          },
        ]);
        return;
      }

      if (parsed.value === null) {
        queueCellChanges([
          {
            studentId,
            score: null,
            status: null,
            rawText: '',
            validationError: null,
          },
        ]);
        return;
      }

      const vErr = validateMark(parsed.value, rules);
      queueCellChanges([
        {
          studentId,
          score: parsed.value,
          status: 'present',
          rawText: String(parsed.value),
          validationError: vErr,
        },
      ]);
    },
    [queueCellChanges, rules],
  );

  // Undo last batch
  const handleUndo = () => {
    if (undoStack.length === 0 || !canEdit) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    queueCellChanges(
      last.map((item) => ({
        studentId: item.studentId,
        score: item.score,
        status: item.status,
        rawText: item.score !== null ? String(item.score) : '',
        validationError: null,
      })),
      isAr ? 'تراجع عن آخر تعديل' : 'Undo last edit',
      false,
    );
  };

  // Fill down from the first selected row to all other selected rows
  const handleFillDown = () => {
    if (selectedIds.length < 2 || !canEdit) return;
    const orderedSelected = visibleRows
      .filter((r) => selectedIds.includes(r.studentId))
      .map((r) => r.studentId);
    if (orderedSelected.length < 2) return;

    const sourceRow = effectiveRows.find(
      (r) => r.studentId === orderedSelected[0],
    );
    if (!sourceRow || sourceRow.validationError) return;

    const targetChanges = orderedSelected.slice(1).map((studentId) => ({
      studentId,
      score: sourceRow.effectiveScore,
      status: sourceRow.effectiveStatus,
      rawText:
        sourceRow.effectiveScore !== null
          ? String(sourceRow.effectiveScore)
          : '',
      validationError: null,
    }));
    queueCellChanges(targetChanges);
    toast.success(
      isAr
        ? `تم ملء ${targetChanges.length} خلية للأسفل`
        : `Filled down ${targetChanges.length} cells`,
    );
  };

  // Copy selected rows to clipboard (TSV for Excel)
  const handleCopySelection = async () => {
    const targets =
      selectedIds.length > 0
        ? visibleRows.filter((r) => selectedIds.includes(r.studentId))
        : activeStudentId
          ? visibleRows.filter((r) => r.studentId === activeStudentId)
          : visibleRows;

    const lines = targets.map((r) => {
      const val =
        r.effectiveStatus &&
        (CONTROL_SCORELESS_STATES as readonly string[]).includes(
          r.effectiveStatus,
        )
          ? r.effectiveStatus
          : r.effectiveScore !== null
            ? String(r.effectiveScore)
            : '';
      return `${r.studentCode}\t${isAr ? r.nameAr || r.name : r.name}\t${val}`;
    });

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success(
        isAr
          ? `تم نسخ ${targets.length} صف إلى الحافظة`
          : `Copied ${targets.length} row(s) to clipboard`,
      );
    } catch {
      toast.error(isAr ? 'تعذر النسخ إلى الحافظة' : 'Failed to copy');
    }
  };

  // Multi-row paste from Excel (starting at active row or top of visible list)
  const buildPastePreview = useCallback(
    (text: string) => {
      if (!canEdit) return;
      const rawLines = text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (rawLines.length === 0) return;

      const startIdx = activeStudentId
        ? Math.max(
            0,
            visibleRows.findIndex((r) => r.studentId === activeStudentId),
          )
        : 0;

      // Single value paste into active cell applies immediately
      if (rawLines.length === 1 && !rawLines[0].includes('\t') && activeStudentId) {
        commitCellEdit(activeStudentId, rawLines[0]);
        return;
      }

      const byCode = new Map(
        visibleRows.map((r) => [r.studentCode.trim().toLowerCase(), r]),
      );
      const previewItems: PastePreviewItem[] = [];

      rawLines.forEach((line, idx) => {
        const cols = line.split('\t').map((c) => c.trim());
        let targetRow = visibleRows[startIdx + idx];
        let valueCell = cols[0];

        // If 2+ columns and first column matches a student code in roster, match by code
        if (cols.length >= 2) {
          const matched = byCode.get(cols[0].toLowerCase());
          if (matched) {
            targetRow = matched;
            valueCell = cols[cols.length - 1];
          }
        }
        if (!targetRow) return;

        const lower = valueCell.toLowerCase();
        if (lower === 'absent' || lower === 'غائب') {
          previewItems.push({
            studentId: targetRow.studentId,
            studentCode: targetRow.studentCode,
            studentName: isAr
              ? targetRow.nameAr || targetRow.name
              : targetRow.name,
            oldScore: targetRow.effectiveScore,
            oldStatus: targetRow.effectiveStatus,
            newScore: null,
            newStatus: 'absent',
            rawText: valueCell,
            validationError: null,
            overwritesExisting: targetRow.effectiveStatus !== null,
            needsPublishedReason: Boolean(targetRow.isPublished),
          });
          return;
        }

        const parsed = parseMarkInput(valueCell);
        if (!parsed.ok) {
          previewItems.push({
            studentId: targetRow.studentId,
            studentCode: targetRow.studentCode,
            studentName: isAr
              ? targetRow.nameAr || targetRow.name
              : targetRow.name,
            oldScore: targetRow.effectiveScore,
            oldStatus: targetRow.effectiveStatus,
            newScore: null,
            newStatus: 'present',
            rawText: valueCell,
            validationError: 'not_a_number',
            overwritesExisting: targetRow.effectiveStatus !== null,
            needsPublishedReason: Boolean(targetRow.isPublished),
          });
          return;
        }

        const vErr =
          parsed.value !== null ? validateMark(parsed.value, rules) : null;
        previewItems.push({
          studentId: targetRow.studentId,
          studentCode: targetRow.studentCode,
          studentName: isAr ? targetRow.nameAr || targetRow.name : targetRow.name,
          oldScore: targetRow.effectiveScore,
          oldStatus: targetRow.effectiveStatus,
          newScore: parsed.value,
          newStatus: parsed.value !== null ? 'present' : null,
          rawText: valueCell,
          validationError: vErr,
          overwritesExisting: targetRow.effectiveStatus !== null,
          needsPublishedReason: Boolean(targetRow.isPublished),
        });
      });

      if (previewItems.length > 0) {
        setPastePreview({ open: true, items: previewItems, reason: '' });
      }
    },
    [canEdit, activeStudentId, visibleRows, commitCellEdit, isAr, rules],
  );

  // Move focus between rows by delta
  const moveFocus = (currentId: string, delta: number) => {
    const idx = visibleRows.findIndex((r) => r.studentId === currentId);
    if (idx === -1) return;
    const nextRow = visibleRows[idx + delta];
    if (nextRow) {
      setActiveStudentId(nextRow.studentId);
      const el = document.querySelector<HTMLElement>(
        `[data-control-cell="${nextRow.studentId}"]`,
      );
      el?.focus();
    }
  };

  // Virtualization for large rosters (activate automatically when > 80 rows)
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const ROW_HEIGHT = 48;
  const VIEWPORT_HEIGHT = 560;
  const useVirtual = visibleRows.length > 80;
  const startIndex = useVirtual
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 6)
    : 0;
  const endIndex = useVirtual
    ? Math.min(
        visibleRows.length,
        Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + 6,
      )
    : visibleRows.length;
  const topPad = useVirtual ? startIndex * ROW_HEIGHT : 0;
  const bottomPad = useVirtual
    ? Math.max(0, (visibleRows.length - endIndex) * ROW_HEIGHT)
    : 0;
  const renderedRows = visibleRows.slice(startIndex, endIndex);

  const allVisibleSelected =
    visibleRows.length > 0 && selectedIds.length === visibleRows.length;
  const someVisibleSelected =
    selectedIds.length > 0 && selectedIds.length < visibleRows.length;

  const toggleAllVisible = () => {
    setSelectedIds(
      allVisibleSelected ? [] : visibleRows.map((r) => r.studentId),
    );
  };

  const toggleOneRow = (studentId: string) => {
    setSelectedIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId],
    );
  };

  const toggleSort = (col: 'code' | 'name' | 'midterm') => {
    if (sortBy === col) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
  };

  return (
    <div className="space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Locked sheet banner */}
      {sheet.locked && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <div className="flex items-center gap-2.5">
            <Lock className="h-4 w-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold">
                {isAr
                  ? 'هذا الكشف مقفول (للقراءة فقط)'
                  : 'This sheet is locked (read-only)'}
              </span>
              {sheet.lockedByName && (
                <span>
                  {' — '}
                  {isAr ? `بواسطة ${sheet.lockedByName}` : `by ${sheet.lockedByName}`}
                </span>
              )}
              {sheet.lockedAt && (
                <span>
                  {' · '}
                  {new Intl.DateTimeFormat(isAr ? 'ar-EG' : 'en-GB', {
                    timeZone: CAIRO_TIME_ZONE,
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(sheet.lockedAt))}
                </span>
              )}
              {sheet.lockReason && (
                <span className="block text-[11px] text-amber-300/85 mt-0.5">
                  {isAr ? 'السبب: ' : 'Reason: '}
                  {sheet.lockReason}
                </span>
              )}
            </div>
          </div>
          {capabilities.canUnlock && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-squircle border-amber-400/40 text-amber-200 hover:bg-amber-500/20"
              onClick={onLockToggleRequest}
            >
              <Unlock className="h-3.5 w-3.5 me-1.5" />
              <span>{isAr ? 'فك القفل بسبب' : 'Unlock Sheet'}</span>
            </Button>
          )}
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-border/70 bg-card/85 px-3.5 py-2.5">
          <div className="text-[11px] text-muted-foreground">
            {isAr ? 'المرصود / الإجمالي' : 'Entered / Total'}
          </div>
          <div className="mt-0.5 font-mono text-base font-bold text-foreground" dir="ltr">
            {summary.entered} / {summary.total}
          </div>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/85 px-3.5 py-2.5">
          <div className="text-[11px] text-muted-foreground">
            {isAr ? 'متوسط الدرجات' : 'Average'}
          </div>
          <div className="mt-0.5 font-mono text-base font-bold text-primary" dir="ltr">
            {summary.average !== null ? `${summary.average} / ${rules.max}` : '—'}
          </div>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/85 px-3.5 py-2.5">
          <div className="text-[11px] text-muted-foreground">
            {isAr ? 'أعلى درجة' : 'Highest'}
          </div>
          <div className="mt-0.5 font-mono text-base font-bold text-emerald-400" dir="ltr">
            {summary.highest !== null ? summary.highest : '—'}
          </div>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/85 px-3.5 py-2.5">
          <div className="text-[11px] text-muted-foreground">
            {isAr ? 'أقل درجة' : 'Lowest'}
          </div>
          <div className="mt-0.5 font-mono text-base font-bold text-foreground" dir="ltr">
            {summary.lowest !== null ? summary.lowest : '—'}
          </div>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/85 px-3.5 py-2.5">
          <div className="text-[11px] text-muted-foreground">
            {isAr ? 'الغياب' : 'Absent'}
          </div>
          <div className="mt-0.5 font-mono text-base font-bold text-amber-400" dir="ltr">
            {summary.absentCount}
          </div>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/85 px-3.5 py-2.5">
          <div className="text-[11px] text-muted-foreground">
            {isAr ? 'خلايا غير صالحة' : 'Invalid Cells'}
          </div>
          <div
            className={cn(
              'mt-0.5 font-mono text-base font-bold',
              summary.invalidCount > 0 ? 'text-rose-400' : 'text-muted-foreground',
            )}
            dir="ltr"
          >
            {summary.invalidCount}
          </div>
        </div>
      </div>

      {/* Sticky Toolbar */}
      <GlassCard className="sticky top-2 z-20 p-3 border border-border/80">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={
                isAr
                  ? 'ابحث بالاسم أو كود الطالب...'
                  : 'Search by student name or code...'
              }
              className="h-9 w-full sm:w-64 rounded-squircle text-xs"
            />
            <div className="w-44">
              <Select
                value={filterMode}
                onValueChange={(v) => onFilterModeChange(v as GridFilterMode)}
              >
                <SelectTrigger className="h-9 rounded-squircle text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {isAr ? 'كل الطلاب' : 'All students'}
                  </SelectItem>
                  <SelectItem value="not_entered">
                    {isAr ? 'لم يُرصد بعد (—)' : 'Not entered (—)'}
                  </SelectItem>
                  <SelectItem value="invalid">
                    {isAr ? 'يحتوي على خطأ' : 'Invalid cells'}
                  </SelectItem>
                  <SelectItem value="absent">
                    {isAr ? 'غائب / حالات خاصة' : 'Absent / Special states'}
                  </SelectItem>
                  <SelectItem value="dirty">
                    {isAr ? 'معدّل في انتظار الحفظ' : 'Unsaved changes'}
                  </SelectItem>
                  <SelectItem value="conflict">
                    {isAr ? 'تعارض تزامن' : 'Conflicts'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Save status pill */}
            <div className="inline-flex items-center gap-1.5 rounded-squircle border border-border/70 bg-surface/60 px-3 py-1.5 text-xs font-medium">
              {saveState === 'saving' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                </>
              ) : saveState === 'saved' ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>
                    {isAr ? 'تم حفظ جميع التغييرات' : 'All changes saved'}
                  </span>
                </>
              ) : saveState === 'error' ? (
                <button
                  type="button"
                  onClick={() => void flushChanges()}
                  className="inline-flex items-center gap-1 text-rose-400 hover:underline cursor-pointer"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>
                    {isAr ? 'خطأ — اضغط لإعادة المحاولة' : 'Error — Retry'}
                  </span>
                </button>
              ) : (
                <span className="text-muted-foreground">
                  {isAr
                    ? `العظمى: ${rules.max} · الخطوة: ${rules.step}`
                    : `Max: ${rules.max} · Step: ${rules.step}`}
                </span>
              )}
            </div>

            {canEdit && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-squircle text-xs"
                  disabled={undoStack.length === 0}
                  onClick={handleUndo}
                >
                  <RotateCcw className="h-3.5 w-3.5 me-1" />
                  <span>{isAr ? 'تراجع' : 'Undo'}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-squircle text-xs"
                  disabled={selectedIds.length < 2}
                  onClick={handleFillDown}
                >
                  <span>{isAr ? 'ملء للأسفل' : 'Fill Down'}</span>
                </Button>
              </>
            )}

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 rounded-squircle text-xs"
              onClick={() => void handleCopySelection()}
            >
              <Copy className="h-3.5 w-3.5 me-1" />
              <span>{isAr ? 'نسخ' : 'Copy'}</span>
            </Button>

            {capabilities.canManageSchemes && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-squircle text-xs"
                onClick={onOpenScheme}
              >
                <SlidersHorizontal className="h-3.5 w-3.5 me-1" />
                <span>{isAr ? 'الدرجات العظمى' : 'Max Marks'}</span>
              </Button>
            )}

            {capabilities.canViewAudit && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-squircle text-xs"
                onClick={onOpenSheetAudit}
              >
                <History className="h-3.5 w-3.5 me-1" />
                <span>{isAr ? 'سجل التدقيق' : 'Audit Log'}</span>
              </Button>
            )}

            {(capabilities.canLock || capabilities.canUnlock) && (
              <Button
                type="button"
                size="sm"
                variant={sheet.locked ? 'outline' : 'default'}
                className="h-9 rounded-squircle text-xs"
                onClick={onLockToggleRequest}
              >
                {sheet.locked ? (
                  <>
                    <Unlock className="h-3.5 w-3.5 me-1" />
                    <span>{isAr ? 'فك القفل' : 'Unlock'}</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5 me-1" />
                    <span>{isAr ? 'قفل الكشف' : 'Lock Sheet'}</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Bulk selection bar */}
        {selectedIds.length > 0 && canEdit && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs">
            <span className="font-semibold text-primary">
              {isAr
                ? `تم تحديد ${selectedIds.length} طالب`
                : `${selectedIds.length} student(s) selected`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-squircle text-xs"
                onClick={() =>
                  queueCellChanges(
                    selectedIds.map((studentId) => ({
                      studentId,
                      score: null,
                      status: 'absent',
                    })),
                  )
                }
              >
                {isAr ? 'تعيين المحدد كغائب' : 'Mark Selected Absent'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-squircle text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                onClick={() =>
                  queueCellChanges(
                    selectedIds.map((studentId) => ({
                      studentId,
                      score: null,
                      status: null,
                    })),
                  )
                }
              >
                {isAr ? 'مسح رصد المحدد' : 'Clear Selected Marks'}
              </Button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Conflicts resolution banner */}
      {Object.keys(conflicts).length > 0 && (
        <div className="space-y-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4">
          <div className="text-xs font-bold text-rose-300">
            {isAr
              ? 'تعارض في الحفظ المتزامن — اختر القيمة التي تريد الإبقاء عليها:'
              : 'Concurrent edit conflict — choose which value to keep:'}
          </div>
          {Object.values(conflicts).map((c) => (
            <div
              key={c.studentId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/25 bg-background/70 px-3 py-2 text-xs"
            >
              <div>
                <span className="font-semibold text-foreground">
                  {c.studentName}
                </span>{' '}
                <bdi className="font-mono text-muted-foreground">
                  ({c.studentCode})
                </bdi>
                <span className="mx-2 text-muted-foreground">|</span>
                <span>
                  {isAr ? 'قيمته الحالية: ' : 'Their value: '}
                  <strong className="font-mono text-amber-300">
                    {c.theirs?.score ?? c.theirs?.status ?? '—'}
                  </strong>
                </span>
                <span className="mx-2 text-muted-foreground">·</span>
                <span>
                  {isAr ? 'قيمتك: ' : 'Your value: '}
                  <strong className="font-mono text-primary">
                    {c.yours.score ?? c.yours.status ?? '—'}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-squircle text-xs"
                  onClick={() => {
                    // Keep theirs
                    setRows((prev) =>
                      prev.map((r) =>
                        r.studentId === c.studentId
                          ? {
                              ...r,
                              score: c.theirs?.score ?? null,
                              status: c.theirs?.status ?? null,
                              rev: c.theirs?.rev ?? r.rev,
                            }
                          : r,
                      ),
                    );
                    setDrafts((prev) => {
                      const next = { ...prev };
                      delete next[c.studentId];
                      return next;
                    });
                    setConflicts((prev) => {
                      const next = { ...prev };
                      delete next[c.studentId];
                      return next;
                    });
                  }}
                >
                  {isAr ? 'اعتماد قيمته' : 'Keep Theirs'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 rounded-squircle text-xs"
                  onClick={() => {
                    // Retry yours on top of latest rev
                    setRows((prev) =>
                      prev.map((r) =>
                        r.studentId === c.studentId
                          ? { ...r, rev: c.theirs?.rev ?? r.rev }
                          : r,
                      ),
                    );
                    setConflicts((prev) => {
                      const next = { ...prev };
                      delete next[c.studentId];
                      return next;
                    });
                  }}
                >
                  {isAr ? 'اعتماد قيمتي' : 'Keep Mine'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Supabase-style Interactive Data Grid */}
      <GlassCard className="p-0 overflow-hidden border border-border/80">
        <div
          ref={parentRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          onPaste={(e) => {
            // Only intercept multi-line / spreadsheet paste when not inside the search input
            const target = e.target as HTMLElement;
            if (
              target.tagName === 'INPUT' &&
              !target.hasAttribute('data-control-editor')
            ) {
              return;
            }
            const clip = e.clipboardData?.getData('text/plain') ?? '';
            if (clip.includes('\n') || clip.includes('\t')) {
              e.preventDefault();
              buildPastePreview(clip);
            }
          }}
          className={cn(
            'overflow-auto',
            useVirtual && 'max-h-[560px]',
            sheet.locked && 'opacity-90',
          )}
        >
          <table
            role="grid"
            aria-readonly={!canEdit}
            className="w-full border-collapse text-start text-xs"
          >
            <thead className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
              <tr>
                <th className="w-8 px-3 py-3 text-center">
                  <Checkbox
                    aria-label="Select all"
                    checked={
                      allVisibleSelected
                        ? true
                        : someVisibleSelected
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={toggleAllVisible}
                    className="mx-auto"
                  />
                </th>
                <th className="sticky start-0 z-10 bg-card/95 px-3 py-3 text-start font-semibold text-foreground min-w-[110px]">
                  <button
                    type="button"
                    onClick={() => toggleSort('code')}
                    className="inline-flex items-center gap-1 rounded-squircle px-1.5 py-0.5 hover:bg-surface/70 cursor-pointer"
                  >
                    <span>{isAr ? 'كود الطالب' : 'Student Code'}</span>
                    {sortBy === 'code' ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-3 text-start font-semibold text-foreground min-w-[200px]">
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className="inline-flex items-center gap-1 rounded-squircle px-1.5 py-0.5 hover:bg-surface/70 cursor-pointer"
                  >
                    <span>{isAr ? 'اسم الطالب' : 'Student Name'}</span>
                    {sortBy === 'name' ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-3 text-center font-semibold text-muted-foreground min-w-[100px]">
                  {isAr ? 'أعمال السنة' : 'Coursework'}
                </th>
                <th className="px-3 py-3 text-center font-bold text-primary min-w-[150px] bg-primary/5">
                  <button
                    type="button"
                    onClick={() => toggleSort('midterm')}
                    className="inline-flex items-center gap-1 rounded-squircle px-2 py-0.5 hover:bg-primary/10 cursor-pointer"
                  >
                    <span>
                      {isAr
                        ? `ميدتيرم (${rules.max})`
                        : `Midterm (${rules.max})`}
                    </span>
                    {sortBy === 'midterm' ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-3 text-center font-semibold text-muted-foreground min-w-[100px]">
                  {isAr ? 'النهائي' : 'Final'}
                </th>
                <th className="px-3 py-3 text-center font-semibold text-muted-foreground min-w-[100px]">
                  {isAr ? 'المجموع' : 'Total'}
                </th>
                <th className="px-3 py-3 text-center font-semibold text-foreground min-w-[120px]">
                  {isAr ? 'الحالة' : 'State'}
                </th>
                <th className="px-3 py-3 text-center font-semibold text-foreground min-w-[110px]">
                  {isAr ? 'الظهور للطالب' : 'Visibility'}
                </th>
                <th className="w-12 px-2 py-3 text-center font-semibold text-foreground">
                  {isAr ? 'إجراءات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {topPad > 0 && (
                <tr style={{ height: topPad }} aria-hidden="true">
                  <td colSpan={10} />
                </tr>
              )}

              {renderedRows.map((row) => {
                const isSelected = selectedIds.includes(row.studentId);
                const isEditing = editingStudentId === row.studentId;
                const isActive = activeStudentId === row.studentId;
                const displayName = isAr ? row.nameAr || row.name : row.name;
                const isScoreless =
                  row.effectiveStatus !== null &&
                  (CONTROL_SCORELESS_STATES as readonly string[]).includes(
                    row.effectiveStatus,
                  );

                const rowOptions: CustomDropdownOption[] = [
                  ...(canEdit
                    ? [
                        {
                          value: 'present',
                          label: isAr
                            ? 'حاضر (رصد درجة)'
                            : 'Present (Enter mark)',
                        },
                        {
                          value: 'absent',
                          label: isAr
                            ? 'غائب بدون عذر (0)'
                            : 'Absent without excuse (0)',
                        },
                        ...(capabilities.canManageStates
                          ? [
                              {
                                value: 'excused',
                                label: isAr
                                  ? 'غائب بعذر مقبول (مؤجل)'
                                  : 'Excused (Deferred)',
                              },
                              {
                                value: 'banned',
                                label: isAr ? 'محروم' : 'Banned',
                              },
                              {
                                value: 'withheld',
                                label: isAr
                                  ? 'محجوب النتيجة'
                                  : 'Withheld Result',
                              },
                              {
                                value: 'incomplete',
                                label: isAr ? 'غير مكتمل' : 'Incomplete',
                              },
                            ]
                          : []),
                        {
                          value: 'clear',
                          label: (
                            <div className="flex items-center gap-2 text-xs py-0.5 text-rose-400">
                              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                              <span>
                                {isAr
                                  ? 'مسح الرصد (لم يُرصد —)'
                                  : 'Clear entry (Not entered —)'}
                              </span>
                            </div>
                          ),
                        },
                      ]
                    : []),
                  ...(capabilities.canViewAudit
                    ? [
                        {
                          value: 'audit',
                          label: (
                            <div className="flex items-center gap-2 text-xs py-0.5">
                              <History className="h-3.5 w-3.5 text-primary" />
                              <span>
                                {isAr
                                  ? 'عرض سجل تعديلات الطالب'
                                  : 'View student audit history'}
                              </span>
                            </div>
                          ),
                        },
                      ]
                    : []),
                ];

                return (
                  <tr
                    key={row.studentId}
                    className={cn(
                      'transition-colors hover:bg-surface/40',
                      isSelected && 'bg-primary/5',
                      row.hasConflict && 'bg-rose-500/10',
                    )}
                  >
                    <td className="w-8 px-3 py-2.5 text-center">
                      <Checkbox
                        aria-label={`Select ${row.studentCode}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleOneRow(row.studentId)}
                        className="mx-auto"
                      />
                    </td>

                    <td className="sticky start-0 bg-card/90 px-3 py-2.5 font-mono font-semibold text-foreground">
                      <bdi dir="ltr">{row.studentCode}</bdi>
                    </td>

                    <td className="px-3 py-2.5 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[240px]">
                          {displayName}
                        </span>
                        {row.notRegistered && (
                          <StatusBadge
                            label={isAr ? 'خارج التسجيل' : 'Unregistered'}
                            variant="warning"
                          />
                        )}
                      </div>
                    </td>

                    {/* Coursework (read-only in Phase 1) */}
                    <td
                      className="px-3 py-2.5 text-center font-mono text-muted-foreground/60 select-none"
                      dir="ltr"
                    >
                      —
                    </td>

                    {/* Interactive Midterm cell */}
                    <td className="px-2 py-1.5 text-center bg-primary/[0.03]">
                      {isEditing && canEdit ? (
                        <input
                          data-control-editor="true"
                          autoFocus
                          dir="ltr"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onBlur={() =>
                            commitCellEdit(row.studentId, editingText)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitCellEdit(row.studentId, editingText);
                              moveFocus(row.studentId, 1);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingStudentId(null);
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              commitCellEdit(row.studentId, editingText);
                              moveFocus(row.studentId, 1);
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              commitCellEdit(row.studentId, editingText);
                              moveFocus(row.studentId, -1);
                            }
                          }}
                          className="h-8 w-28 rounded-squircle border-2 border-primary bg-background px-2.5 text-left font-mono text-xs font-bold text-foreground outline-none"
                        />
                      ) : (
                        <div className="relative inline-flex items-center justify-center">
                          <button
                            type="button"
                            role="gridcell"
                            data-control-cell={row.studentId}
                            tabIndex={0}
                            onClick={() => setActiveStudentId(row.studentId)}
                            onDoubleClick={() => {
                              if (!canEdit) return;
                              setActiveStudentId(row.studentId);
                              setEditingStudentId(row.studentId);
                              setEditingText(
                                row.effectiveScore !== null
                                  ? String(row.effectiveScore)
                                  : '',
                              );
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                moveFocus(row.studentId, 1);
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                moveFocus(row.studentId, -1);
                              } else if (e.key === 'Enter' && canEdit) {
                                e.preventDefault();
                                setEditingStudentId(row.studentId);
                                setEditingText(
                                  row.effectiveScore !== null
                                    ? String(row.effectiveScore)
                                    : '',
                                );
                              } else if (
                                (e.key === 'Backspace' || e.key === 'Delete') &&
                                canEdit
                              ) {
                                e.preventDefault();
                                queueCellChanges([
                                  {
                                    studentId: row.studentId,
                                    score: null,
                                    status: null,
                                  },
                                ]);
                              } else if (
                                canEdit &&
                                e.key.length === 1 &&
                                !e.ctrlKey &&
                                !e.metaKey &&
                                !e.altKey
                              ) {
                                e.preventDefault();
                                setEditingStudentId(row.studentId);
                                setEditingText(e.key);
                              }
                            }}
                            title={
                              row.validationError
                                ? formatValidationMessage(
                                    row.validationError,
                                    rules,
                                    isAr,
                                  )
                                : undefined
                            }
                            dir="ltr"
                            className={cn(
                              'relative flex h-8 w-28 items-center justify-center rounded-squircle border px-2.5 font-mono text-xs font-bold transition-all outline-none',
                              canEdit ? 'cursor-text' : 'cursor-default',
                              isActive
                                ? 'border-primary ring-2 ring-primary/30 bg-primary/10'
                                : 'border-border/70 bg-surface/50 hover:border-primary/40',
                              row.validationError &&
                                'border-rose-500 bg-rose-500/15 text-rose-300 ring-2 ring-rose-500/30',
                            )}
                          >
                            {/* Dirty indicator dot */}
                            {row.isDirty && !row.validationError && (
                              <span
                                className="absolute top-1 end-1 h-1.5 w-1.5 rounded-full bg-amber-400"
                                title={
                                  isAr ? 'تعديل قيد الحفظ' : 'Unsaved change'
                                }
                              />
                            )}

                            {row.validationError ? (
                              <span>{row.rawText || '!'}</span>
                            ) : isScoreless ? (
                              <StatusBadge
                                label={row.effectiveStatus ?? 'absent'}
                                variant="warning"
                                className="h-5 px-2 text-[10px]"
                              />
                            ) : row.effectiveScore !== null &&
                              row.effectiveScore !== undefined ? (
                              <span className="text-foreground">
                                {row.effectiveScore}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </button>
                        </div>
                      )}

                      {row.validationError && (
                        <div className="mt-1 text-[10px] font-medium text-rose-400">
                          {formatValidationMessage(
                            row.validationError,
                            rules,
                            isAr,
                          )}
                        </div>
                      )}
                    </td>

                    {/* Final (read-only in Phase 1) */}
                    <td
                      className="px-3 py-2.5 text-center font-mono text-muted-foreground/60 select-none"
                      dir="ltr"
                    >
                      —
                    </td>

                    {/* Total (always computed, incomplete in Phase 1 until all components enabled) */}
                    <td
                      className="px-3 py-2.5 text-center font-mono text-muted-foreground select-none"
                      dir="ltr"
                    >
                      —
                    </td>

                    {/* State badge */}
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge
                        label={row.effectiveStatus ?? 'not_entered'}
                        variant={
                          row.effectiveStatus === 'present'
                            ? 'success'
                            : row.effectiveStatus === null
                              ? 'neutral'
                              : row.effectiveStatus === 'absent' ||
                                  row.effectiveStatus === 'banned'
                                ? 'danger'
                                : 'warning'
                        }
                      />
                    </td>

                    {/* Read-only publication status from Grades module */}
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge
                        label={row.isPublished ? 'published' : 'hidden'}
                        variant={row.isPublished ? 'info' : 'neutral'}
                      />
                    </td>

                    {/* Single 3-dots row action menu */}
                    <td className="w-12 px-2 py-2.5 text-center">
                      {rowOptions.length > 0 && (
                        <div className="inline-flex justify-center">
                          <CustomDropdown
                            value=""
                            ariaLabel={isAr ? 'إجراءات الصف' : 'Row actions'}
                            placeholder={
                              <MoreVertical className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            }
                            options={rowOptions}
                            onValueChange={(val) => {
                              if (val === 'audit') {
                                onOpenRowAudit(row);
                              } else if (val === 'clear') {
                                queueCellChanges([
                                  {
                                    studentId: row.studentId,
                                    score: null,
                                    status: null,
                                  },
                                ]);
                              } else if (val === 'present') {
                                setActiveStudentId(row.studentId);
                                setEditingStudentId(row.studentId);
                                setEditingText(
                                  row.effectiveScore !== null
                                    ? String(row.effectiveScore)
                                    : '',
                                );
                              } else if (val === 'withheld') {
                                queueCellChanges([
                                  {
                                    studentId: row.studentId,
                                    score: row.effectiveScore ?? 0,
                                    status: 'withheld',
                                  },
                                ]);
                              } else {
                                queueCellChanges([
                                  {
                                    studentId: row.studentId,
                                    score: null,
                                    status: val as GradeStatus,
                                  },
                                ]);
                              }
                            }}
                            className="h-8 w-8 min-w-8 p-0 justify-center rounded-squircle border border-border/60 hover:bg-primary/10 [&>svg]:hidden"
                            menuClassName="w-52"
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {bottomPad > 0 && (
                <tr style={{ height: bottomPad }} aria-hidden="true">
                  <td colSpan={10} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Mandatory Reason Dialog (for published grade edit or special status) */}
      <Dialog
        open={Boolean(reasonPrompt?.open)}
        onOpenChange={(o) => {
          if (!o) setReasonPrompt(null);
        }}
      >
        <DialogContent
          dir={isAr ? 'rtl' : 'ltr'}
          className="sm:max-w-md rounded-2xl border-border/80 bg-card/95 backdrop-blur-xl"
        >
          <DialogHeader>
            <DialogTitle>{reasonPrompt?.title}</DialogTitle>
            <DialogDescription>{reasonPrompt?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs font-semibold">
              {isAr ? 'السبب (٣ أحرف على الأقل)' : 'Reason (at least 3 chars)'}
            </Label>
            <Textarea
              value={promptReasonText}
              onChange={(e) => setPromptReasonText(e.target.value)}
              rows={3}
              className="rounded-squircle text-sm"
              placeholder={
                isAr
                  ? 'اكتب سبب التعديل ليُحفظ في سجل التدقيق...'
                  : 'Write the reason to record in the audit trail...'
              }
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-squircle"
              onClick={() => setReasonPrompt(null)}
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              type="button"
              className="rounded-squircle"
              disabled={promptReasonText.trim().length < 3}
              onClick={() => {
                if (!reasonPrompt) return;
                const changes = reasonPrompt.pendingChanges;
                const reason = promptReasonText.trim();
                setReasonPrompt(null);
                queueCellChanges(changes, reason);
              }}
            >
              {isAr ? 'تأكيد وحفظ' : 'Confirm & Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paste from Excel preview modal */}
      <Dialog
        open={Boolean(pastePreview?.open)}
        onOpenChange={(o) => {
          if (!o) setPastePreview(null);
        }}
      >
        <DialogContent
          dir={isAr ? 'rtl' : 'ltr'}
          className="sm:max-w-xl rounded-2xl border-border/80 bg-card/95 backdrop-blur-xl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPaste className="h-5 w-5 text-primary" />
              <span>
                {isAr
                  ? 'معاينة اللصق من Excel'
                  : 'Preview Multi-Row Paste from Excel'}
              </span>
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? `سيتم تطبيق ${pastePreview?.items.filter((i) => !i.validationError).length ?? 0} صف صالح.`
                : `${pastePreview?.items.filter((i) => !i.validationError).length ?? 0} valid row(s) will be applied.`}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-border/70 divide-y divide-border/50 text-xs">
            {pastePreview?.items.map((item) => (
              <div
                key={item.studentId}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-foreground">
                    {item.studentName}
                  </span>{' '}
                  <bdi className="font-mono text-muted-foreground">
                    ({item.studentCode})
                  </bdi>
                </div>
                <div className="flex items-center gap-2 font-mono" dir="ltr">
                  <span className="text-muted-foreground">
                    {item.oldScore ?? item.oldStatus ?? '—'}
                  </span>
                  <span className="text-primary">→</span>
                  {item.validationError ? (
                    <span className="text-rose-400 font-bold">
                      {item.rawText} (
                      {formatValidationMessage(
                        item.validationError,
                        rules,
                        isAr,
                      )}
                      )
                    </span>
                  ) : (
                    <span className="font-bold text-emerald-400">
                      {item.newScore ?? item.newStatus ?? '—'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {pastePreview?.items.some((i) => i.needsPublishedReason) && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isAr
                  ? 'سبب تعديل درجات منشورة ضمن اللصق (إجباري)'
                  : 'Reason for modifying published marks (required)'}
              </Label>
              <Input
                value={pastePreview.reason}
                onChange={(e) =>
                  setPastePreview((prev) =>
                    prev ? { ...prev, reason: e.target.value } : null,
                  )
                }
                className="rounded-squircle text-xs"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-squircle"
              onClick={() => setPastePreview(null)}
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              type="button"
              className="rounded-squircle"
              disabled={
                !pastePreview ||
                pastePreview.items.every((i) => i.validationError !== null) ||
                (pastePreview.items.some((i) => i.needsPublishedReason) &&
                  pastePreview.reason.trim().length < 3)
              }
              onClick={() => {
                if (!pastePreview) return;
                const valid = pastePreview.items.filter(
                  (i) => i.validationError === null,
                );
                const reason = pastePreview.reason.trim() || undefined;
                setPastePreview(null);
                queueCellChanges(
                  valid.map((v) => ({
                    studentId: v.studentId,
                    score: v.newScore,
                    status: v.newStatus,
                    rawText: v.rawText,
                    validationError: null,
                  })),
                  reason,
                );
              }}
            >
              {isAr ? 'تطبيق الصفوف الصالحة' : 'Apply Valid Rows'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
