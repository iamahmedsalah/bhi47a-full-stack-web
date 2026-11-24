"use client";

import { useTranslations } from "next-intl";
import React, { Suspense, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  FileEdit,
  FileSpreadsheet,
  GitBranch,
  History,
  Loader2,
  Lock,
  MoreVertical,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import {
  PERMISSIONS,
  type Semester,
  type ControlComponentKey,
} from "@student-portal/shared";
import { getApiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTableState } from "@/hooks/use-table-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CustomDropdown,
  type CustomDropdownOption,
} from "@/components/ui/custom-dropdown";
import {
  DataTableShell,
  type ColumnDef,
} from "@/components/ui/data-table-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { HelpNote } from "@/components/ui/help-note";
import { Label } from "@/components/ui/label";
import { PageSkeletonLoader } from "@/components/ui/page-suspense-fallback";
import { PageTitleBanner } from "@/components/ui/page-title-banner";
import { PermissionGuard } from "@/components/ui/permission-guard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableCell } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  controlKeys,
  getControlCapabilities,
  getControlPetitionsSummary,
  listControlCourses,
  lockControlSheet,
  openControlSheet,
  unlockControlSheet,
} from "@/features/control/api";
import { ControlBulkLockDialog } from "@/features/control/components/control-bulk-lock-dialog";
import { ControlWorkbookLoading } from "@/features/control/components/control-workbook-loading";
import {
  ControlWorkflowHistoryDialog,
  type WorkflowHistoryTarget,
} from "@/features/control/components/control-workflow-history-dialog";
import { GradingSchemeDialog } from "@/features/control/components/grading-scheme-dialog";
import type { ControlCourseSummary } from "@/features/control/types";

function ControlHomeContent() {
  const releaseText = useTranslations("controlRelease");
  const controlText = useTranslations("control");
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = (params?.locale as string) || "ar";
  const isAr = locale === "ar";

  const {
    search,
    setSearch,
    filters,
    setFilter,
    selectedKeys,
    setSelectedKeys,
  } = useTableState({
    shallow: true,
    defaultFilters: {
      academicYear: "2026-2027",
      semester: "first",
      status: "all",
      component: "midterm",
      level: "all",
    },
  });

  const component = (
    ["midterm", "coursework", "final"].includes(filters.component)
      ? filters.component
      : "midterm"
  ) as ControlComponentKey;
  const academicYear = filters.academicYear || "2026-2027";
  const semester = (filters.semester || "first") as Semester;
  const level = filters.level || "all";

  const { data: caps } = useQuery({
    queryKey: controlKeys.me(),
    queryFn: getControlCapabilities,
  });

  const {
    data: coursesData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: controlKeys.courses(academicYear, semester, level),
    queryFn: () =>
      listControlCourses({
        academicYear,
        semester,
        level: level !== "all" ? level : undefined,
      }),
    enabled: Boolean(academicYear && /^\d{4}-\d{4}$/.test(academicYear)),
  });

  const [schemeTarget, setSchemeTarget] = useState<ControlCourseSummary | null>(
    null,
  );
  const [bulkLockOpen, setBulkLockOpen] = useState(false);
  const [workflowTarget, setWorkflowTarget] =
    useState<WorkflowHistoryTarget | null>(null);

  const { data: petitionsSummary } = useQuery({
    queryKey: controlKeys.petitionsSummary({ academicYear, semester }),
    queryFn: () => getControlPetitionsSummary({ academicYear, semester }),
    enabled: Boolean(
      caps?.canCreatePetitions ||
        caps?.canApprovePetitions ||
        caps?.scopeAll,
    ),
  });
  const totalPetitionNotifications =
    (petitionsSummary?.pendingForApprovalCount ?? 0) +
    (petitionsSummary?.unreadDecisionsCount ?? 0);
  const [lockTarget, setLockTarget] = useState<{
    sheetId: string;
    locked: boolean;
    courseCode: string;
    courseName: string;
  } | null>(null);
  const [lockReason, setLockReason] = useState("");

  const toggleLockMutation = useMutation({
    mutationFn: async () => {
      if (!lockTarget) return;
      return lockTarget.locked
        ? unlockControlSheet(lockTarget.sheetId, lockReason.trim())
        : lockControlSheet(lockTarget.sheetId, lockReason.trim() || undefined);
    },
    onSuccess: (updated) => {
      toast.success(
        updated?.sheet.locked
          ? isAr
            ? "تم قفل كشف الرصد بنجاح"
            : "Sheet locked successfully"
          : isAr
            ? "تم فك قفل الكشف بنجاح"
            : "Sheet unlocked successfully",
      );
      setLockTarget(null);
      setLockReason("");
      queryClient.invalidateQueries({
        queryKey: controlKeys.courses(academicYear, semester, level),
      });
      queryClient.invalidateQueries({ queryKey: controlKeys.all });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  const openSheetMutation = useMutation({
    mutationFn: (courseId: string) =>
      openControlSheet({
        academicYear,
        semester,
        courseId,
        component,
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(controlKeys.sheet(res.sheet.id), res);
      if (res.sheet.slug)
        queryClient.setQueryData(controlKeys.sheet(res.sheet.slug), res);
      queryClient.invalidateQueries({
        queryKey: controlKeys.courses(academicYear, semester, level),
        refetchType: "none",
      });
      router.push(`/${locale}/admin/control/${res.sheet.slug || res.sheet.id}`);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  const filteredItems = useMemo(() => {
    const items = coursesData?.items ?? [];
    const needle = search.trim().toLowerCase();
    return items.filter((course) => {
      if (needle) {
        const hay =
          `${course.code} ${course.name} ${course.nameAr ?? ""} ${course.nameEn ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (level !== "all" && course.level && course.level !== level) {
        return false;
      }
      const mid = course.components.find((c) => c.key === component);
      if (filters.status === "locked" && !mid?.locked) return false;
      if (filters.status === "open" && mid?.locked) return false;
      return true;
    });
  }, [coursesData?.items, search, filters.status, component, level]);

  const columns = useMemo<ColumnDef<ControlCourseSummary>[]>(
    () => [
      {
        key: "code",
        header: isAr ? "كود المقرر" : "Course Code",
        className: "w-28",
        render: (item) => (
          <TableCell className="w-28 font-mono font-bold text-foreground">
            <button
              type="button"
              className="text-primary hover:underline disabled:text-muted-foreground"
              disabled={
                openSheetMutation.isPending ||
                !(
                  item.components.find((c) => c.key === component)?.sheetId ||
                  caps?.canCreateSheets ||
                  caps?.scopeAll
                )
              }
              onClick={() => {
                const sheet = item.components.find((c) => c.key === component);
                if (sheet?.sheetId)
                  router.push(
                    `/${locale}/admin/control/${sheet.slug || sheet.sheetId}`,
                  );
                else openSheetMutation.mutate(item.courseId);
              }}
            >
              <bdi dir="ltr">{item.code}</bdi>
            </button>
          </TableCell>
        ),
      },
      {
        key: "name",
        header: isAr ? "اسم المقرر" : "Course Name",
        className: "min-w-[230px]",
        render: (item) => {
          const title = isAr
            ? item.nameAr || item.name
            : item.nameEn || item.name;
          const secondaryTitle =
            item.nameAr && item.nameEn
              ? isAr
                ? item.nameEn
                : item.nameAr
              : null;
          const levelLabel = item.level
            ? isAr
              ? `المستوى ${
                  item.level === "1"
                    ? "الأول"
                    : item.level === "2"
                      ? "الثاني"
                      : item.level === "3"
                        ? "الثالث"
                        : "الرابع"
                }`
              : `Level ${item.level}`
            : null;
          return (
            <TableCell className="min-w-[230px] py-3">
              <div className="flex flex-col items-start gap-1">
                <button
                  type="button"
                  className="text-sm font-bold text-foreground hover:text-primary hover:underline text-start leading-snug disabled:text-muted-foreground cursor-pointer"
                  disabled={
                    openSheetMutation.isPending ||
                    !(
                      item.components.find((c) => c.key === component)
                        ?.sheetId ||
                      caps?.canCreateSheets ||
                      caps?.scopeAll
                    )
                  }
                  onClick={() => {
                    const sheet = item.components.find(
                      (c) => c.key === component,
                    );
                    if (sheet?.sheetId)
                      router.push(
                        `/${locale}/admin/control/${sheet.slug || sheet.sheetId}`,
                      );
                    else openSheetMutation.mutate(item.courseId);
                  }}
                >
                  {title}
                </button>
                {(levelLabel || secondaryTitle) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {levelLabel && (
                      <Badge
                        variant="outline"
                        className="rounded-squircle border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary whitespace-nowrap"
                      >
                        {levelLabel}
                      </Badge>
                    )}
                    {secondaryTitle && (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                        <bdi>{secondaryTitle}</bdi>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </TableCell>
          );
        },
      },
      {
        key: "component",
        header: isAr ? "المكوّن" : "Component",
        className: "w-28 text-center",
        render: () => (
          <TableCell className="w-28 text-center">
            <StatusBadge label={releaseText(component)} variant="primary" />
          </TableCell>
        ),
      },
      {
        key: "progress",
        header: isAr ? "تقدم الرصد (المرصود / المسجلين)" : "Entry Progress",
        className: "min-w-[185px]",
        render: (item) => {
          const mid = item.components.find((c) => c.key === component);
          const entered = mid?.entered ?? 0;
          const total = Math.max(item.rosterCount, entered);
          const pct =
            total > 0 ? Math.min(100, Math.round((entered / total) * 100)) : 0;

          return (
            <TableCell className="min-w-[185px]">
              <div className="space-y-1.5">
                <div
                  className="flex items-center justify-between text-xs font-mono"
                  dir="ltr"
                >
                  <span className="font-bold text-foreground">
                    {entered} / {item.rosterCount}
                  </span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-squircle bg-surface/80 border border-border/60">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </TableCell>
          );
        },
      },
      {
        key: "workflow",
        header: isAr ? "حالة الرصد" : "Grading Status",
        className: "w-44 text-center",
        render: (item) => {
          const mid = item.components.find((c) => c.key === component);
          const hasSheet = Boolean(mid?.sheetId);
          const wfState = mid?.workflowState ?? "DRAFT";
          const displayLabel = !hasSheet
            ? isAr
              ? "لم يبدأ الرصد"
              : "Not Started"
            : wfState === "DRAFT"
              ? isAr
                ? "مسودة · قيد الرصد"
                : "Draft · Entering"
              : controlText(`workflow.${wfState}`);

          const styleClass = !hasSheet
            ? "border-border/70 bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
            : wfState === "APPROVED"
              ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-400 hover:bg-emerald-500/20"
              : wfState === "RETURNED"
                ? "border-rose-500/35 bg-rose-500/12 text-rose-400 hover:bg-rose-500/20"
                : wfState === "IN_REVIEW"
                  ? "border-amber-500/35 bg-amber-500/12 text-amber-400 hover:bg-amber-500/20"
                  : wfState === "PENDING_APPROVAL"
                    ? "border-indigo-500/35 bg-indigo-500/12 text-indigo-300 hover:bg-indigo-500/20"
                    : "border-sky-500/35 bg-sky-500/12 text-sky-400 hover:bg-sky-500/20";

          const StateIcon = !hasSheet
            ? Clock
            : wfState === "APPROVED"
              ? CheckCircle2
              : wfState === "RETURNED"
                ? RotateCcw
                : wfState === "IN_REVIEW" || wfState === "PENDING_APPROVAL"
                  ? GitBranch
                  : FileEdit;

          const canViewWorkflowHistory = Boolean(caps?.canViewAudit);

          return (
            <TableCell className="w-44 text-center">
              {canViewWorkflowHistory ? (
                <button
                  type="button"
                  onClick={() =>
                    setWorkflowTarget({
                      sheetId: mid?.sheetId ?? null,
                      slug: mid?.slug ?? null,
                      courseId: item.courseId,
                      courseCode: item.code,
                      courseName: isAr
                        ? item.nameAr || item.name
                        : item.nameEn || item.name,
                      component,
                      workflowState: mid?.workflowState,
                      locked: Boolean(mid?.locked),
                    })
                  }
                  title={
                    isAr
                      ? "اضغط لعرض كل مراحل الرصد والاعتماد ومن قام بها"
                      : "Click to view all grading stages and who performed them"
                  }
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-squircle border px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap",
                    styleClass,
                  )}
                >
                  <StateIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>{displayLabel}</span>
                </button>
              ) : (
                <span
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-squircle border px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
                    styleClass,
                  )}
                >
                  <StateIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>{displayLabel}</span>
                </span>
              )}
            </TableCell>
          );
        },
      },
      {
        key: "status",
        header: isAr ? "حالة الكشف" : "Sheet Lock",
        className: "w-28 text-center",
        render: (item) => {
          const mid = item.components.find((c) => c.key === component);
          const isLocked = Boolean(mid?.locked);
          const canToggle = Boolean(
            mid?.sheetId &&
            ((isLocked && caps?.canUnlock) || (!isLocked && caps?.canLock)),
          );

          return (
            <TableCell className="w-28 text-center">
              {canToggle ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!mid?.sheetId) return;
                    setLockReason("");
                    setLockTarget({
                      sheetId: mid.sheetId,
                      locked: isLocked,
                      courseCode: item.code,
                      courseName: isAr
                        ? item.nameAr || item.name
                        : item.nameEn || item.name,
                    });
                  }}
                  title={
                    isAr
                      ? isLocked
                        ? "الكشف مقفول - انقر لفك القفل"
                        : "الكشف مفتوح - انقر للقفل"
                      : isLocked
                        ? "Sheet is locked - click to unlock"
                        : "Sheet is open - click to lock"
                  }
                  className={cn(
                    "group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-squircle text-xs font-semibold transition-all border cursor-pointer whitespace-nowrap",
                    isLocked
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20",
                  )}
                >
                  {isLocked ? (
                    <Lock className="h-3 w-3 text-amber-400" />
                  ) : (
                    <Unlock className="h-3 w-3 text-emerald-400" />
                  )}
                  <span>
                    {isAr
                      ? isLocked
                        ? "مغلق"
                        : "مفتوح"
                      : isLocked
                        ? "Locked"
                        : "Open"}
                  </span>
                </button>
              ) : (
                <StatusBadge
                  label={isLocked ? "locked" : "unlocked"}
                  variant={isLocked ? "warning" : "success"}
                />
              )}
            </TableCell>
          );
        },
      },
      {
        key: "visibility",
        header: isAr ? "الظهور للطالب" : "Visibility",
        className: "w-32 text-center",
        render: (item) => {
          const mid = item.components.find((c) => c.key === component);
          const pub = mid?.published ?? 0;
          return (
            <TableCell className="w-32 text-center">
              <StatusBadge
                label={
                  pub > 0
                    ? isAr
                      ? `منشور (${pub})`
                      : `Published (${pub})`
                    : "hidden"
                }
                variant={pub > 0 ? "info" : "neutral"}
              />
            </TableCell>
          );
        },
      },
      {
        key: "actions",
        header: isAr ? "إجراءات" : "Actions",
        className: "w-14 text-center",
        render: (item) => {
          const mid = item.components.find((c) => c.key === component);
          const canOpen = Boolean(
            mid?.sheetId || caps?.canCreateSheets || caps?.scopeAll,
          );
          const isLocked = Boolean(mid?.locked);
          const options: CustomDropdownOption[] = [
            ...(canOpen
              ? [
                  {
                    value: "open",
                    label: (
                      <div className="flex items-center gap-2 text-xs py-0.5">
                        <ExternalLink className="h-3.5 w-3.5 text-primary" />
                        <span>
                          {mid?.sheetId
                            ? isAr
                              ? "فتح شبكة رصد الدرجات"
                              : "Open Grade Sheet Grid"
                            : isAr
                              ? "إنشاء وفتح كشف الرصد"
                              : "Create & Open Grade Sheet"}
                        </span>
                      </div>
                    ),
                  },
                ]
              : []),
            ...(caps?.canViewAudit
              ? [
                  {
                    value: "workflow",
                    label: (
                      <div className="flex items-center gap-2 text-xs py-0.5">
                        <History className="h-3.5 w-3.5 text-primary" />
                        <span>
                          {isAr
                            ? "عرض سجل مراحل الرصد والاعتماد"
                            : "View Workflow Stage History"}
                        </span>
                      </div>
                    ),
                  },
                ]
              : []),
            ...(mid?.sheetId && !isLocked && caps?.canLock
              ? [
                  {
                    value: "lock",
                    label: (
                      <div className="flex items-center gap-2 text-xs py-0.5 text-amber-400">
                        <Lock className="h-3.5 w-3.5 text-amber-400" />
                        <span>
                          {isAr ? "قفل كشف الرصد" : "Lock Grade Sheet"}
                        </span>
                      </div>
                    ),
                  },
                ]
              : []),
            ...(mid?.sheetId && isLocked && caps?.canUnlock
              ? [
                  {
                    value: "unlock",
                    label: (
                      <div className="flex items-center gap-2 text-xs py-0.5 text-emerald-400">
                        <Unlock className="h-3.5 w-3.5 text-emerald-400" />
                        <span>
                          {isAr ? "فك قفل كشف الرصد" : "Unlock Grade Sheet"}
                        </span>
                      </div>
                    ),
                  },
                ]
              : []),
            ...(caps?.canManageSchemes
              ? [
                  {
                    value: "scheme",
                    label: (
                      <div className="flex items-center gap-2 text-xs py-0.5">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                        <span>
                          {isAr
                            ? "ضبط الدرجات العظمى وخطوة الرصد"
                            : "Configure Max Marks & Step"}
                        </span>
                      </div>
                    ),
                  },
                ]
              : []),
          ];

          return (
            <TableCell className="w-14 text-center">
              {options.length > 0 && (
                <div className="inline-flex justify-center">
                  <CustomDropdown
                    value=""
                    ariaLabel={isAr ? "إجراءات المقرر" : "Course actions"}
                    placeholder={
                      <MoreVertical className="h-4 w-4 text-muted-foreground hover:text-primary" />
                    }
                    options={options}
                    onValueChange={(val) => {
                      if (val === "open") {
                        if (mid?.sheetId) {
                          router.push(
                            `/${locale}/admin/control/${mid.slug || mid.sheetId}`,
                          );
                        } else {
                          openSheetMutation.mutate(item.courseId);
                        }
                      } else if (val === "workflow") {
                        setWorkflowTarget({
                          sheetId: mid?.sheetId ?? null,
                          slug: mid?.slug ?? null,
                          courseId: item.courseId,
                          courseCode: item.code,
                          courseName: isAr
                            ? item.nameAr || item.name
                            : item.nameEn || item.name,
                          component,
                          workflowState: mid?.workflowState,
                          locked: Boolean(mid?.locked),
                        });
                      } else if (val === "lock" || val === "unlock") {
                        if (!mid?.sheetId) return;
                        setLockReason("");
                        setLockTarget({
                          sheetId: mid.sheetId,
                          locked: isLocked,
                          courseCode: item.code,
                          courseName: isAr
                            ? item.nameAr || item.name
                            : item.nameEn || item.name,
                        });
                      } else if (val === "scheme") {
                        setSchemeTarget(item);
                      }
                    }}
                    className="h-8 w-8 min-w-8 p-0 justify-center rounded-squircle border border-border/60 hover:bg-primary/10 [&>svg]:hidden"
                    menuClassName="w-60"
                  />
                </div>
              )}
            </TableCell>
          );
        },
      },
    ],
    [isAr, caps, locale, router, openSheetMutation, component, releaseText, controlText],
  );

  return (
    <PermissionGuard
      permissions={[
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_SHEETS_VIEW,
      ]}
    >
      <div className="space-y-6" dir={isAr ? "rtl" : "ltr"}>
        <PageTitleBanner
          title={
            isAr
              ? "الكنترول — رصد ومراجعة الدرجات"
              : "Control — Grade Entry & Sheets"
          }
          subtitle={
            isAr
              ? "إدخال ومراجعة درجات الميدتيرم عبر شبكة تفاعلية سريعة مع سجل تدقيق كامل وقفل الكشوف. نشر النتائج للطلاب يظل حصرياً في موديول الدرجات."
              : "Interactive spreadsheet-style coursework, midterm and final grade entry with full audit logging and sheet locking. Publishing to students remains in the Grades module."
          }
          icon={<FileSpreadsheet className="h-6 w-6 text-primary" />}
        >
          {(caps?.canCreatePetitions ||
            caps?.canApprovePetitions ||
            caps?.scopeAll) && (
            <Button
              type="button"
              variant="outline"
              className="flex items-center gap-2 rounded-squircle border-primary/30 font-semibold hover:bg-primary/10"
              onClick={() =>
                router.push(
                  `/${locale}/admin/control/petitions?academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}`,
                )
              }
            >
              <FileCheck2 className="h-4 w-4 text-primary" />
              <span>
                {isAr ? "طلبات التماس الدرجات" : "Grade Petitions"}
              </span>
              {totalPetitionNotifications > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground animate-pulse">
                  <Bell className="size-2.5" />
                  {totalPetitionNotifications}
                </span>
              )}
            </Button>
          )}

          {(caps?.canLock || caps?.canUnlock) && (
            <Button
              type="button"
              className="flex items-center gap-2 bg-primary font-semibold text-white hover:bg-primary-hover rounded-squircle"
              onClick={() => setBulkLockOpen(true)}
            >
              <Lock className="h-4 w-4" />
              <span>
                {isAr
                  ? "إدارة قفل الكنترول الجماعي"
                  : "Bulk Lock / Unlock Control"}
              </span>
            </Button>
          )}
        </PageTitleBanner>

        {selectedKeys.length > 0 && (caps?.canLock || caps?.canUnlock) && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs">
            <span className="font-bold text-foreground">
              {isAr
                ? `تم تحديد ${selectedKeys.length} مقرر دراسي`
                : `${selectedKeys.length} course(s) selected`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-squircle text-xs font-bold gap-1.5"
                onClick={() => setBulkLockOpen(true)}
              >
                <Lock className="size-3.5" />
                <span>
                  {isAr
                    ? "قفل / فك قفل المقررات المحددة (ميدتيرم / أعمال سنة / فاينل)"
                    : "Lock / Unlock Selected Courses"}
                </span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-squircle text-xs"
                onClick={() => setSelectedKeys([])}
              >
                {isAr ? "إلغاء التحديد" : "Clear Selection"}
              </Button>
            </div>
          </div>
        )}

        <FilterBar
          compact
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={
            isAr
              ? "ابحث بكود المقرر أو اسمه..."
              : "Search by course code or name..."
          }
          wrapFilters
        >
          <div className="w-36">
            <Input
              dir="ltr"
              value={academicYear}
              onChange={(e) => setFilter("academicYear", e.target.value)}
              placeholder="2026-2027"
              className="h-10 rounded-squircle text-left font-mono text-xs"
            />
          </div>
          <div className="w-44">
            <Select
              value={semester}
              onValueChange={(v) => setFilter("semester", v)}
            >
              <SelectTrigger className="h-10 rounded-squircle text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="first">
                  {isAr ? "الفصل الدراسي الأول" : "First Semester"}
                </SelectItem>
                <SelectItem value="second">
                  {isAr ? "الفصل الدراسي الثاني" : "Second Semester"}
                </SelectItem>
                <SelectItem value="summer">
                  {isAr ? "الفصل الصيفي" : "Summer Semester"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <Select
              value={component}
              onValueChange={(v) => setFilter("component", v)}
            >
              <SelectTrigger aria-label={releaseText("component")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={isAr ? "rtl" : "ltr"}>
                {["midterm", "coursework", "final"].map((v) => (
                  <SelectItem value={v} key={v}>
                    {releaseText(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Select
              value={filters.level || "all"}
              onValueChange={(v) => setFilter("level", v)}
            >
              <SelectTrigger className="h-10 rounded-squircle text-xs">
                <SelectValue placeholder={isAr ? "المستوى الدراسي" : "Level"} />
              </SelectTrigger>
              <SelectContent dir={isAr ? "rtl" : "ltr"}>
                <SelectItem value="all">
                  {isAr ? "كل المستويات الدراسية" : "All Levels"}
                </SelectItem>
                <SelectItem value="1">
                  {isAr ? "المستوى الأول" : "Level 1"}
                </SelectItem>
                <SelectItem value="2">
                  {isAr ? "المستوى الثاني" : "Level 2"}
                </SelectItem>
                <SelectItem value="3">
                  {isAr ? "المستوى الثالث" : "Level 3"}
                </SelectItem>
                <SelectItem value="4">
                  {isAr ? "المستوى الرابع" : "Level 4"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Select
              value={filters.status}
              onValueChange={(v) => setFilter("status", v)}
            >
              <SelectTrigger className="h-10 rounded-squircle text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {isAr ? "كل الكشوف" : "All Sheets"}
                </SelectItem>
                <SelectItem value="open">
                  {isAr ? "مفتوحة للرصد" : "Open for Entry"}
                </SelectItem>
                <SelectItem value="locked">
                  {isAr ? "مقفولة" : "Locked"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FilterBar>

        {openSheetMutation.isPending && (
          <ControlWorkbookLoading stage="openingSheet" />
        )}

        {!isLoading && !isError && !coursesData?.items.length && (
          <div className="rounded-xl border p-4 text-sm space-y-2">
            <p>{releaseText("emptyHelp")}</p>
            <a
              className="text-primary underline"
              href={`/${locale}/admin/courses`}
            >
              {releaseText("setupCourses")}
            </a>
          </div>
        )}
        {isLoading ? (
          <ControlWorkbookLoading stage="loadingList" />
        ) : (
          <DataTableShell
            columns={columns}
            data={filteredItems}
            keyExtractor={(item) => item.courseId}
            isError={isError}
            error={error}
            onRetry={() => void refetch()}
            enableSelection
            selectedKeys={selectedKeys}
            onSelectedKeysChange={setSelectedKeys}
            emptyMessage={
              isAr
                ? "لا توجد مقررات متاحة ضمن نطاق صلاحياتك لهذا الفصل الدراسي."
                : "No courses available within your scope for this semester."
            }
          />
        )}

        {bulkLockOpen && (caps?.canLock || caps?.canUnlock) && (
          <ControlBulkLockDialog
            open={bulkLockOpen}
            onOpenChange={setBulkLockOpen}
            locale={locale}
            academicYear={academicYear}
            semester={semester}
            courses={coursesData?.items ?? []}
            initialSelectedCourseIds={selectedKeys}
            initialComponent={component}
            canLock={Boolean(caps?.canLock)}
            canUnlock={Boolean(caps?.canUnlock)}
          />
        )}

        {schemeTarget && (
          <GradingSchemeDialog
            open={Boolean(schemeTarget)}
            onOpenChange={(o) => {
              if (!o) setSchemeTarget(null);
            }}
            courseId={schemeTarget.courseId}
            courseCode={schemeTarget.code}
            courseTitle={
              isAr
                ? schemeTarget.nameAr || schemeTarget.name
                : schemeTarget.nameEn || schemeTarget.name
            }
            academicYear={academicYear}
            semester={semester}
            locale={locale}
          />
        )}

        {caps?.canViewAudit && (
          <ControlWorkflowHistoryDialog
            target={workflowTarget}
            open={Boolean(workflowTarget)}
            onOpenChange={(o) => {
              if (!o) setWorkflowTarget(null);
            }}
            locale={locale}
            canOpenSheet={Boolean(
              workflowTarget?.sheetId ||
                caps?.canCreateSheets ||
                caps?.scopeAll,
            )}
            onOpenSheet={(target) => {
              if (target.sheetId) {
                router.push(
                  `/${locale}/admin/control/${target.slug || target.sheetId}`,
                );
              } else {
                openSheetMutation.mutate(target.courseId);
              }
            }}
          />
        )}

        {/* Sheet Lock / Unlock Dialog */}
        <Dialog
          open={Boolean(lockTarget)}
          onOpenChange={(open) => {
            if (!open) {
              setLockTarget(null);
              setLockReason("");
            }
          }}
        >
          <DialogContent
            dir={isAr ? "rtl" : "ltr"}
            className="sm:max-w-md rounded-2xl border-border/80 bg-card/95 backdrop-blur-xl"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {lockTarget?.locked ? (
                  <Unlock className="h-5 w-5 text-amber-400" />
                ) : (
                  <Lock className="h-5 w-5 text-primary" />
                )}
                <span>
                  {lockTarget?.locked
                    ? isAr
                      ? "فك قفل كشف الرصد"
                      : "Unlock Grade Sheet"
                    : isAr
                      ? "قفل كشف الرصد"
                      : "Lock Grade Sheet"}
                </span>
              </DialogTitle>
              <DialogDescription>
                {lockTarget?.courseCode} — {lockTarget?.courseName}
                <br />
                {lockTarget?.locked
                  ? isAr
                    ? "فك القفل يتيح التعديل مجدداً للمصرح لهم. السبب اختياري والإجراء يُسجل في سجل التدقيق."
                    : "Unlocking allows authorized edits again. The reason is optional and the action is audited."
                  : isAr
                    ? "قفل الكشف يمنع أي تعديلات إضافية على الدرجات ويجعله للقراءة فقط حتى يتم فك قفله من مسؤول الكنترول."
                    : "Locking prevents any further edits and turns the sheet read-only."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <HelpNote
                title={
                  isAr ? "ضوابط صلاحيات حالة الكشف" : "Sheet status permissions"
                }
                icon={<ShieldCheck className="size-4" />}
              >
                <p>
                  {isAr
                    ? "• القفل يتطلب صلاحية (control.sheets.lock)"
                    : "• Locking requires permission (control.sheets.lock)"}
                </p>
                <p>
                  {isAr
                    ? "• فك القفل يتطلب صلاحية (control.sheets.unlock)، والسبب اختياري مع تسجيل الإجراء."
                    : "• Unlocking requires (control.sheets.unlock); the reason is optional and the action is audited."}
                </p>
              </HelpNote>

              {lockTarget?.locked && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    {isAr
                      ? "سبب فك القفل (اختياري)"
                      : "Unlock reason (optional)"}
                  </Label>
                  <Textarea
                    value={lockReason}
                    onChange={(e) => setLockReason(e.target.value)}
                    placeholder={
                      isAr
                        ? "مثال: تصحيح درجة بناءً على تظلم معتمد رقم..."
                        : "e.g. Correcting marks based on approved student grievance #..."
                    }
                    className="min-h-[80px] rounded-squircle text-xs resize-none"
                  />
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:justify-start rtl:sm:justify-start">
              <Button
                type="button"
                variant={lockTarget?.locked ? "default" : "destructive"}
                className="rounded-squircle"
                disabled={toggleLockMutation.isPending}
                onClick={() => toggleLockMutation.mutate()}
              >
                {toggleLockMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin me-1.5" />
                )}
                <span>
                  {lockTarget?.locked
                    ? isAr
                      ? "تأكيد فك القفل"
                      : "Confirm Unlock"
                    : isAr
                      ? "تأكيد قفل الكشف"
                      : "Confirm Lock"}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-squircle"
                onClick={() => {
                  setLockTarget(null);
                  setLockReason("");
                }}
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}

export default function ControlAdminPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <ControlHomeContent />
    </Suspense>
  );
}
