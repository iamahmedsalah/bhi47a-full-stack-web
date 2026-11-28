"use client";

import { HelpNote } from "@/components/ui/help-note";

import { curriculumDepartmentLabel, type StudentCodeAuditResult } from "@student-portal/shared";
import { AdmissionSection } from "@/features/admissions/admission-section";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Eye,

  MoreVertical,
  User,
  GraduationCap,
  Phone,
  Mail,
  Hash,
  CreditCard,
  ShieldCheck,

  Loader2,
  History,
  Lock,
  Unlock,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
  BookOpenCheck,
} from "lucide-react";
import { getStudent } from "@/features/students/api";
import { CopyButton } from "@/components/ui/copy-button";
import { toast } from "sonner";
import {
  PERMISSIONS,
  STUDENT_CODE_STATUSES,
  isAdmissionAcademicYear,
  admissionYearPrefix,
  type StudentCodeFinding,
} from "@student-portal/shared";
import { useAuth } from "@/providers/auth-provider";
import { useTableState } from "@/hooks/use-table-state";
import { PageTitleBanner } from "@/components/ui/page-title-banner";
import { RestrictedFeature } from "@/components/admin/restricted-feature";
import {
  DataTableShell,
  type ColumnDef,
} from "@/components/ui/data-table-shell";
import { TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCodeAudit,
  exportCodeAudit,
  initializeCodeYear,
  recoverStudentCode,
  holdPreviousStudentCode,
  deleteCodeStudent,
  manageStudentCode,
  type CodeAuditScope,
} from "@/features/student-codes/api";
import {
  CodeScopeForm,
  CodeWriteDialog,
  type CodeWriteIntent,
  type CodeConfirmationValues,
} from "@/features/student-codes/forms";
import { CodeHistoryDialog } from "@/features/student-codes/history-dialog";
import { MappingCorrection } from "./mapping-correction";

const defaults = { academicYear: "", yearPrefix: "", status: "all" };
const statuses = [...STUDENT_CODE_STATUSES, "MISSING"] as const;
export default function StudentCodesPage({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const t = useTranslations("studentCodes");
  const locale = useLocale();
  const dir = locale === "ar" ? "rtl" : "ltr";
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || Boolean(user?.permissions?.includes(PERMISSIONS.STUDENT_CODES_MANAGE));
  const canRecover = isAdmin || Boolean(user?.permissions?.includes(PERMISSIONS.STUDENT_CODES_RECOVER));
  const canDeleteStudent = isAdmin || Boolean(user?.permissions?.includes(PERMISSIONS.STUDENT_CODES_DELETE_STUDENT));
  const canRead =
    isAdmin ||
    Boolean(user?.permissions?.includes(PERMISSIONS.STUDENT_CODES_READ));
  const canViewStudent =
    isAdmin ||
    Boolean(user?.permissions?.includes(PERMISSIONS.STUDENTS_READ));
  const nextHoldRow = (snapshot: StudentCodeAuditResult): StudentCodeFinding | undefined => {
    const code = snapshot.nextReservationCode;
    if (!code) return undefined;
    return snapshot.items.find((row) => row.studentCode === code) ??
      { studentCode: code, sequence: Number(code.slice(2)), status: 'MISSING', reason: 'UNVERIFIED_GAP' };
  };
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = useTableState({ defaultFilters: defaults });
  const { academicYear, yearPrefix, status } = state.filters;
  const validScope =
    isAdmissionAcademicYear(academicYear) && /^\d{2}$/.test(yearPrefix);
  const page = Math.max(1, Math.trunc(state.page));
  const limit = Math.min(100, Math.max(1, Math.trunc(state.limit)));
  const [search, setSearch] = useState(state.search);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(state.search), 350);
    return () => clearTimeout(timer);
  }, [state.search]);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [
      "student-code-audit",
      user?._id,
      academicYear,
      yearPrefix,
      status,
      page,
      limit,
      search,
    ],
    queryFn: () =>
      getCodeAudit({
        academicYear,
        yearPrefix,
        page,
        limit,
        ...(statuses.includes(status as (typeof statuses)[number])
          ? { status }
          : {}),
        ...(search ? { search } : {}),
      }),
    enabled: Boolean(canRead && validScope),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
  const rows = useMemo(() => query.data?.items ?? [], [query.data]);
  const { selectedKeys, setSelectedKeys } = state;
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const [intent, setIntent] = useState<CodeWriteIntent | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [finding, setFinding] = useState<StudentCodeFinding | null>(null);
  const [inspect, setInspect] = useState(false);
  const [pending, setPending] = useState(false);
  const [profileStudentId, setProfileStudentId] = useState<string | null>(null);

  const studentProfileQuery = useQuery({
    queryKey: ["student-profile-audit", user?._id, profileStudentId],
    queryFn: () => getStudent(profileStudentId!),
    enabled: Boolean(profileStudentId && canViewStudent),
  });
  const refresh = async () => {
    setSelectedKeys([]);
    await client.invalidateQueries({ queryKey: ["student-code-audit"] });
    await client.invalidateQueries({ queryKey: ["student-code-history"] });
    await client.invalidateQueries({ queryKey: ["students"] });
    await client.invalidateQueries({ queryKey: ["admin-students-stats"] });
    await client.invalidateQueries({ queryKey: ["admission-requests"] });
    await client.invalidateQueries({ queryKey: ["admission-groups"] });
  };
  const scan = (scope: CodeAuditScope) => {
    const next = new URLSearchParams(params.toString());
    next.set("academicYear", scope.academicYear);
    next.set("yearPrefix", scope.yearPrefix);
    next.delete("page");
    next.delete("search");
    next.delete("status");
    setSelectedKeys([]);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    void client.invalidateQueries({ queryKey: ["student-code-audit"] });
  };
  const save = async (values: CodeConfirmationValues) => {
    if (!intent) return;
    const { snapshot, row } = intent;
    const input = {
      academicYear: snapshot.academicYear,
      yearPrefix: snapshot.yearPrefix,
      fingerprint: snapshot.fingerprint,
      reason: values.reason,
      confirmed: true as const,
    };
    setPending(true);
    try {
      if (row && intent.adminAction)
        await manageStudentCode(row.studentCode, { ...input, action: intent.adminAction, origin: values.origin, ...(values.sourceFile.trim() ? { sourceFile: values.sourceFile.trim() } : {}) });
      else if (row && intent.deleteStudent)
        await deleteCodeStudent(row.studentCode, input);
      else if (row && intent.hold)
        await holdPreviousStudentCode(row.studentCode, input);
      else if (row)
        await recoverStudentCode(row.studentCode, {
          ...input,
          neverAssignedConfirmed: true,
        });
      else await initializeCodeYear(input);
      await refresh();
      setIntent(null);
      toast.success(t("saved"));
    } finally {
      setPending(false);
    }
  };
  const columns = useMemo<ColumnDef<StudentCodeFinding>[]>(
    () => [
      {
        key: "select",
        header: (
          <Checkbox
            aria-label={t("selectAll")}
            checked={
              rows.length > 0 &&
              rows.every((row) => selected.has(row.studentCode))
            }
            disabled={pending}
            onCheckedChange={(checked) =>
              setSelectedKeys(
                checked === true ? rows.map((row) => row.studentCode) : [],
              )
            }
          />
        ),
        render: (row) => (
          <TableCell className="w-8 text-center">
            <Checkbox
              aria-label={t("select", { code: row.studentCode })}
              checked={selected.has(row.studentCode)}
              disabled={pending}
              onCheckedChange={(checked) =>
                setSelectedKeys(
                  checked === true
                    ? [...selectedKeys, row.studentCode]
                    : selectedKeys.filter((key) => key !== row.studentCode),
                )
              }
            />
          </TableCell>
        ),
      },
      {
        key: "studentCode",
        header: t("fields.studentCode"),
        className: "min-w-[140px] text-start",
        render: (row) => (
          <TableCell className="min-w-35 py-2.5 px-3">
            <div className="inline-flex items-center gap-1.5 rounded-squircle border border-border/80 bg-card/80 px-2.5 py-1 text-xs font-mono font-bold text-foreground shadow-2xs">
              <Hash className="h-3.5 w-3.5 text-primary shrink-0" />
              {canViewStudent && (row.currentStudentId || row.observedStudentId) ? (
                <button
                  type="button"
                  onClick={() =>
                    setProfileStudentId(
                      row.studentProfileId || row.currentStudentId || row.observedStudentId!,
                    )
                  }
                  className="hover:text-primary transition-colors cursor-pointer select-none"
                  title={
                    dir === "rtl"
                      ? "عرض ملف الطالب المرتبط بهذا الكود"
                      : "View student profile"
                  }
                >
                  <span dir="ltr">{row.studentCode}</span>
                </button>
              ) : (
                <span dir="ltr">{row.studentCode}</span>
              )}
              <CopyButton value={row.studentCode} className="h-5 w-5 text-muted-foreground hover:text-foreground" />
            </div>
          </TableCell>
        ),
      },
      {
        key: "student",
        header: t("linkedStudent"),
        className: "min-w-[200px] text-start",
        render: (row) => {
          const hasOwner = Boolean(row.currentStudentId || row.observedStudentId);
          const studentName =
            locale === "ar"
              ? row.studentNameAr || row.studentName
              : row.studentName || row.studentNameAr;

          return (
            <TableCell className="min-w-50 py-2.5 px-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-squircle border transition-colors ${
                    hasOwner
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border/60 bg-secondary/40 text-muted-foreground/60"
                  }`}
                >
                  {hasOwner ? (
                    <GraduationCap className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {hasOwner ? (
                    canViewStudent ? (
                      <button
                        type="button"
                        onClick={() =>
                          setProfileStudentId(
                            row.studentProfileId || row.currentStudentId || row.observedStudentId!,
                          )
                        }
                        className="font-semibold text-foreground hover:text-primary transition-colors text-start block truncate max-w-55 cursor-pointer"
                      >
                        {studentName}
                      </button>
                    ) : (
                      <div className="font-semibold text-foreground truncate max-w-55">
                        {studentName}
                      </div>
                    )
                  ) : (
                    <div className="text-xs text-muted-foreground/80 italic">
                      {dir === "rtl" ? "غير مسند لطالب حالياً" : "Unassigned code"}
                    </div>
                  )}
                  {hasOwner && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <bdi className="font-mono text-[10px]">{row.studentCode}</bdi>
                    </div>
                  )}
                </div>
              </div>
            </TableCell>
          );
        },
      },
      {
        key: "department",
        header: t("department"),
        className: "min-w-[130px] text-start",
        render: (row) => (
          <TableCell className="min-w-32.5 py-2.5 px-3 text-xs">
            <span className="font-medium text-foreground">
              {curriculumDepartmentLabel(row.department, locale)}
            </span>
          </TableCell>
        ),
      },
      {
        key: "level",
        header: t("level"),
        className: "w-24 text-center",
        render: (row) => (
          <TableCell className="w-24 py-2.5 px-2 text-center text-xs">
            {row.level ? (
              <span className="inline-block rounded-squircle border border-border/60 bg-secondary/50 px-2 py-0.5 font-semibold text-foreground text-[11px]">
                {dir === "rtl" ? `المستوى ${row.level}` : `Level ${row.level}`}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
        ),
      },
      {
        key: "status",
        header: t("status"),
        className: "min-w-[160px] text-center",
        render: (row) => {
          let badgeColor = "border-border/60 bg-muted/40 text-muted-foreground";
          let badgeIcon = <Info className="h-3 w-3 shrink-0" />;

          if (row.status === "ASSIGNED") {
            badgeColor = "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
            badgeIcon = <UserCheck className="h-3 w-3 shrink-0" />;
          } else if (row.status === "AVAILABLE") {
            badgeColor = "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400";
            badgeIcon = <CheckCircle2 className="h-3 w-3 shrink-0" />;
          } else if (row.status === "RESERVED" || row.status === "RELEASED") {
            badgeColor = "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
            badgeIcon = <Lock className="h-3 w-3 shrink-0" />;
          } else if (row.status === "MISSING") {
            badgeColor = "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400";
            badgeIcon = <AlertTriangle className="h-3 w-3 shrink-0" />;
          } else if (row.status === "REQUIRES_REVIEW") {
            badgeColor = "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400";
            badgeIcon = <AlertTriangle className="h-3 w-3 shrink-0" />;
          }

          return (
            <TableCell className="min-w-40 py-2.5 px-3 text-center">
              <span className={`inline-flex items-center gap-1.5 rounded-squircle border px-2.5 py-1 text-xs font-semibold select-none ${badgeColor}`}>
                {badgeIcon}
                <span>{t(`statuses.${row.status}`)}</span>
                {row.permanent && <span className="text-xs">{t('permanent')}</span>}
              </span>
            </TableCell>
          );
        },
      },
      { key: "provenance", header: t("lastSource"), className: "min-w-[170px] text-start", render: (row) => <TableCell className="text-xs space-y-1"><p>{t.has(`sources.${row.provenance?.source ?? 'unknown'}`) ? t(`sources.${row.provenance?.source ?? 'unknown'}`) : t("sources.unknown")}</p>{row.provenance?.verification === 'admin_confirmed' && <p className="text-muted-foreground">{t("adminConfirmedOrigin")}</p>}{row.provenance?.sourceFile && <p><bdi>{row.provenance.sourceFile}</bdi></p>}{Boolean(row.provenance?.rowNumber) && <p>{t("importRow", { row: row.provenance!.rowNumber! })}</p>}</TableCell> },
      {
        key: "reason",
        header: t("explanation"),
        className: "min-w-[200px] text-start",
        render: (row) => (
          <TableCell className="min-w-50 py-2.5 px-3 text-xs text-muted-foreground leading-relaxed">
            <span>{t(`reasons.${row.reason}`)}</span>
            {row.studentAcademicYear && row.registryAcademicYear && row.studentAcademicYear !== row.registryAcademicYear && (
              <p className="mt-1">{t("ownerYear")}: <bdi>{row.studentAcademicYear}</bdi> · {t("registryYear")}: <bdi>{row.registryAcademicYear}</bdi></p>
            )}
          </TableCell>
        ),
      },
      {
        key: "nextAction",
        header: t("nextAction"),
        className: "min-w-[220px] text-start",
        render: (row) => {
          let icon = <Info className="h-3.5 w-3.5 text-primary shrink-0" />;
          let textKey = "reviewHelp";
          let colorClass = "border-border/60 bg-muted/30 text-muted-foreground";

          if (row.reason === "PREVIOUS_OWNER_MISSING") {
            icon = <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
            textKey = "holdHint";
            colorClass = "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300";
          } else if (row.status === "ASSIGNED") {
            icon = <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />;
            textKey = "assignedHelp";
            colorClass = "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300";
          } else if (row.status === "MISSING") {
            icon = <Unlock className="h-3.5 w-3.5 text-rose-500 shrink-0" />;
            textKey = "gapHelp";
            colorClass = "border-rose-500/20 bg-rose-500/5 text-rose-700 dark:text-rose-300";
          } else if (row.status === "RELEASED") {
            icon = <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
            textKey = "heldHelp";
            colorClass = "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300";
          }

          return (
            <TableCell className="min-w-55 py-2.5 px-3">
              <div className={`flex items-start gap-1.5 rounded-lg border p-2 text-xs leading-relaxed ${colorClass}`}>
                <span className="mt-0.5">{icon}</span>
                <span>{t(textKey)}</span>
              </div>
            </TableCell>
          );
        },
      },
      {
        key: "actions",
        header: t("actions"),
        className: "w-16 text-center",
        render: (row) => (
          <TableCell className="w-16 py-2.5 px-2 text-center">
            <DropdownMenu.Root dir={dir}>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("actionsFor", { code: row.studentCode })}
                  disabled={pending}
                  className="rounded-squircle cursor-pointer"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  {...{ dir }}
                  className="z-50 min-w-52.5 rounded-xl border bg-popover p-1.5 text-start shadow-xl space-y-0.5"
                >
                  {/* View Audit Details */}
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-xs outline-none hover:bg-secondary focus:bg-secondary transition-colors"
                    onSelect={() => setFinding(row)}
                  >
                    <Eye className="h-4 w-4 text-primary shrink-0" />
                    <span>{t("viewAudit")}</span>
                  </DropdownMenu.Item>

                  {/* View Student Profile */}
                  {canViewStudent && (row.currentStudentId || row.observedStudentId) && (
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-xs outline-none hover:bg-secondary focus:bg-secondary transition-colors"
                      onSelect={() =>
                        setProfileStudentId(
                          row.studentProfileId || row.currentStudentId || row.observedStudentId!,
                        )
                      }
                    >
                      <User className="h-4 w-4 text-primary shrink-0" />
                      <span>
                        {dir === "rtl"
                          ? "عرض ملف الطالب"
                          : "View Student Profile"}
                      </span>
                    </DropdownMenu.Item>
                  )}

                  {/* Allocation & Event History */}
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-xs outline-none hover:bg-secondary focus:bg-secondary transition-colors"
                    disabled={!/^\d{6}$/.test(row.studentCode)}
                    onSelect={() => setHistory(row.studentCode)}
                  >
                    <History className="h-4 w-4 text-primary shrink-0" />
                    <span>{t("history")}</span>
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className="my-1 h-px bg-border/60" />

                  {isAdmin && !query.data?.truncated && /^\d{6}$/.test(row.studentCode) && <>
                    {(row.observedStudentId || row.currentStudentId) && ["CURRENT_OWNER", "REGISTRY_YEAR_MISMATCH"].includes(row.reason) && <DropdownMenu.Item className="cursor-pointer rounded-squircle px-3 py-2 text-xs outline-none focus:bg-secondary" onSelect={() => setIntent({ snapshot: query.data!, row, adminAction: "CONFIRM_OWNER" })}>{t("adminActions.CONFIRM_OWNER")}</DropdownMenu.Item>}
                    {!row.observedStudentId && !row.currentStudentId && <>
                      <DropdownMenu.Item className="cursor-pointer rounded-squircle px-3 py-2 text-xs text-primary outline-none focus:bg-secondary" onSelect={() => setIntent({ snapshot: query.data!, row, adminAction: "FREE" })}>{t("adminActions.FREE")}</DropdownMenu.Item>
                      <DropdownMenu.Item className="cursor-pointer rounded-squircle px-3 py-2 text-xs text-warning outline-none focus:bg-secondary" onSelect={() => setIntent({ snapshot: query.data!, row, adminAction: "BAN" })}>{t("adminActions.BAN")}</DropdownMenu.Item>
                    </>}
                  </>}
                  {/* Action: Free / Recover Gap */}
                  {canRecover &&
                    ["MISSING", "RESERVED"].includes(row.status) &&
                    query.data?.policy &&
                    !query.data.mappingConflict &&
                    !query.data.truncated && (
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 outline-none hover:bg-emerald-500/10 focus:bg-emerald-500/10 transition-colors"
                        onSelect={() =>
                          setIntent({ snapshot: query.data!, row })
                        }
                      >
                        <Unlock className="h-4 w-4 text-emerald-500 shrink-0" />
                        <span>{t(row.status === 'RESERVED' ? 'unreserve' : 'recover')}</span>
                      </DropdownMenu.Item>
                    )}

                  {/* Action: Hold / Reserve Code */}
                  {canManage && !row.permanent &&
                    (row.reason === "PREVIOUS_OWNER_MISSING" || (query.data?.policy && !query.data.mappingConflict && ['UNVERIFIED_GAP', 'CONFIRMED_AVAILABLE'].includes(row.reason))) &&
                    !query.data?.truncated && (
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 outline-none hover:bg-amber-500/10 focus:bg-amber-500/10 transition-colors"
                        onSelect={() =>
                          setIntent({ snapshot: query.data!, row, hold: true })
                        }
                      >
                        <Lock className="h-4 w-4 text-amber-500 shrink-0" />
                        <span>{t(row.reason === 'PREVIOUS_OWNER_MISSING' ? 'holdPreviousOwner' : 'hold')}</span>
                      </DropdownMenu.Item>
                    )}

                  {canDeleteStudent && row.status === "ASSIGNED" && !row.permanent && !query.data?.truncated && (
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-xs text-danger outline-none focus:bg-secondary"
                      onSelect={() => setIntent({ snapshot: query.data!, row, deleteStudent: true })}
                    >
                      <Lock className="h-4 w-4" />{t("deleteStudent")}
                    </DropdownMenu.Item>
                  )}
                  {/* Contextual Status Badges */}
                  {row.status === "RELEASED" && (
                    <div className="flex items-center gap-2 rounded-squircle px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/40 cursor-default select-none">
                      <Lock className="h-3.5 w-3.5 text-amber-500/70 shrink-0" />
                      <span>{dir === "rtl" ? "الكود محجوز ضد إعادة الاستخدام" : "Code held against re-use"}</span>
                    </div>
                  )}

                  {row.status === "ASSIGNED" && (
                    <div className="flex items-center gap-2 rounded-squircle px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/40 cursor-default select-none">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/70 shrink-0" />
                      <span>{dir === "rtl" ? "الكود مخصص ومستقر لطالب" : "Code actively assigned"}</span>
                    </div>
                  )}

                  {row.status === "AVAILABLE" && (
                    <div className="flex items-center gap-2 rounded-squircle px-3 py-1.5 text-[11px] text-teal-600 dark:text-teal-400 bg-teal-500/10 cursor-default select-none">
                      <CheckCircle2 className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                      <span>{dir === "rtl" ? "الكود جاهز للتخصيص الآلي" : "Ready for allocation"}</span>
                    </div>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </TableCell>
        ),
      },
    ],
    [
      t,
      rows,
      selected,
      selectedKeys,
      setSelectedKeys,
      pending,
      dir,
      canManage,
      isAdmin,
      canRecover,
      canDeleteStudent,
      canViewStudent,
      locale,
      query.data,
    ],
  );
  if (!canRead)
    return (
      <RestrictedFeature
        featureName={t("title")}
        permission={PERMISSIONS.STUDENT_CODES_READ}
      />
    );
  return (
    <div className={embedded ? "space-y-5" : "space-y-5 p-2 md:p-6"}>
      {embedded ? (
        <AdmissionSection
          title={t("title")}
          description={t("description")}
          icon={<ShieldCheck className="h-5 w-5" />}
          actions={
            <>
              {" "}
              {(isAdmin ||
                user?.permissions?.includes(
                  PERMISSIONS.STUDENT_CODES_EXPORT,
                )) && (
                <Button
                  variant="outline"
                  disabled={!validScope || query.isFetching}
                  onClick={async () => {
                    try {
                      await exportCodeAudit({
                        academicYear,
                        yearPrefix,
                        ...(status !== "all" ? { status } : {}),
                        ...(search ? { search } : {}),
                      });
                    } catch {
                      toast.error(t("exportFailed"));
                    }
                  }}
                >
                  {t("export")}
                </Button>
              )}
            </>
          }
        />
      ) : (
        <PageTitleBanner
          title={t("title")}
          subtitle={t("description")}
          icon={<ShieldCheck className="h-5 w-5" />}
        >
          {" "}
          {(isAdmin ||
            user?.permissions?.includes(PERMISSIONS.STUDENT_CODES_EXPORT)) && (
            <Button
              variant="outline"
              disabled={!validScope || query.isFetching}
              onClick={async () => {
                try {
                  await exportCodeAudit({
                    academicYear,
                    yearPrefix,
                    ...(status !== "all" ? { status } : {}),
                    ...(search ? { search } : {}),
                  });
                } catch {
                  toast.error(t("exportFailed"));
                }
              }}
            >
              {t("export")}
            </Button>
          )}
        </PageTitleBanner>
      )}
      <HelpNote title={t("auditGuide")} icon={<BookOpenCheck className="size-4 shrink-0 text-primary" />}>
        <p className="text-xs text-muted-foreground">
          {t("workflowHelp")}
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 pt-1">
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs">
            <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 mb-1">
              <Lock className="h-3.5 w-3.5" />
              <span>{dir === "rtl" ? "حجز الكود" : "Hold a code"}</span>
            </span>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {dir === "rtl"
                ? "يُستخدم لتجميد الكود وحظر تخصيصه لأي طالب جديد، لحماية السجلات الأكاديمية السابقة ومنع تداخل الهويات."
                : "Freezes the code and locks it against reassignment to safeguard historical academic records."}
            </p>
          </div>

          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mb-1">
              <Unlock className="h-3.5 w-3.5" />
              <span>{dir === "rtl" ? "تحرير الكود" : "Recover a code"}</span>
            </span>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {dir === "rtl"
                ? "يُستخدم لسد الفجوات الترقيمية غير المستخدمة مسبقاً وتجهيز الكود ضمن تسلسل القبول المتاح للدفعة."
                : "Recovers unassigned gaps in numbering sequence and makes them available for upcoming intake."}
            </p>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs">
            <span className="font-semibold text-primary flex items-center gap-1.5 mb-1">
              <History className="h-3.5 w-3.5" />
              <span>{dir === "rtl" ? "سجل التخصيص" : "Allocation history"}</span>
            </span>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {dir === "rtl"
                ? "تتبع تسلسلي لكافة الحركات والعمليات التي تمت على الكود (التخصيص، الحجز، التحرير، وهوية المنفذ)."
                : "Full chronological timeline of all lifecycle events on this code with actor identity and timestamps."}
            </p>
          </div>
        </div>
      </HelpNote>
      <CodeScopeForm
        configuredYears
        key={`${academicYear}/${yearPrefix}`}
        initial={{ academicYear, yearPrefix }}
        pending={pending}
        scan={scan}
      />
      {validScope && yearPrefix !== admissionYearPrefix(academicYear) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 p-3 text-sm">
          <p>
            {t("legacyScope", { prefix: admissionYearPrefix(academicYear) })}
          </p>
          <Button
            variant="outline"
            onClick={() =>
              scan({
                academicYear,
                yearPrefix: admissionYearPrefix(academicYear),
              })
            }
          >
            {t("scanCurrentPrefix")}
          </Button>
        </div>
      )}
      {isAdmin && <MappingCorrection academicYear={academicYear} />}
      {!validScope ? (
        <p className="rounded-xl border p-5">{t("chooseScope")}</p>
      ) : (
        <>
          {query.data && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm">
                <div>
                  <p>{t("lastScanScope")}: <bdi>{query.data.academicYear}</bdi> / <bdi>{query.data.yearPrefix}</bdi></p>
                  <p className="text-xs text-muted-foreground">
                    {t("scannedAt", { value: new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
                      timeZone: "Africa/Cairo",
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(query.data.scannedAt)) })}
                  </p>
                </div>
                {query.data.nextReservationCode && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{t("nextCandidate")} <bdi className="font-mono font-semibold">{query.data.nextReservationCode}</bdi></span>
                    {canManage && <Button disabled={pending || query.isFetching} onClick={() => {
                      const snapshot = query.data!;
                      setIntent({ snapshot, row: nextHoldRow(snapshot), hold: true, nextHold: true });
                    }}>{t("holdNext")}</Button>}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
                {statuses.map((key) => (
                  <button
                    type="button"
                    key={key}
                    aria-pressed={status === key}
                    onClick={() => {
                      setSelectedKeys([]);
                      state.setFilter("status", key);
                    }}
                    className="min-w-0 rounded-xl border border-border/70 bg-card p-3 text-start transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary aria-pressed:border-primary/60 aria-pressed:bg-primary/10"
                  >
                    <p className="text-xs text-muted-foreground">
                      {t(`statuses.${key}`)}
                    </p>
                    <p className="text-xl font-bold">
                      {query.data.summary[key].toLocaleString(
                        locale === "ar" ? "ar-EG" : "en-GB",
                      )}
                    </p>
                  </button>
                ))}
              </div>
              {query.data.truncated && (
                <p role="alert" className="text-danger">
                  {t("truncated")}
                </p>
              )}
              {query.data.mappingConflict && (
                <p role="alert" className="text-danger">
                  {t("errors.mapping")}
                </p>
              )}
              {query.data.policy ? (
                <p className="flex flex-wrap gap-3 text-sm">
                  <span>
                    {t("configuredYear")}:{" "}
                    <bdi>{query.data.policy.academicYear}</bdi>
                  </span>
                  <span>
                    {t("configuredPrefix")}:{" "}
                    <bdi>{query.data.policy.yearPrefix}</bdi>
                  </span>
                  <span>
                    {t("expectedPrefix")}: <bdi>{admissionYearPrefix(academicYear)}</bdi>
                  </span>
                  <span>
                    {t("configuredNext")}:{" "}
                    <bdi>
                      {query.data.policy.nextSequence.toLocaleString(
                        locale === "ar" ? "ar-EG" : "en-GB",
                      )}
                    </bdi>
                  </span>
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t("setupHint")}
                  </p>
                  {canManage && (
                    <Button
                      disabled={
                        !query.data.canInitialize || pending || query.isFetching
                      }
                      onClick={() => setIntent({ snapshot: query.data! })}
                    >
                      {t("initialize")}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="max-w-xs rounded-squircle text-left"
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              aria-label={t("search")}
              placeholder={t("search")}
              value={state.search}
              onChange={(event) => {
                const value = event.target.value.replace(/\D/g, "");
                setSelectedKeys([]);
                state.setSearch(value);
              }}
            />
            <DropdownMenu.Root dir={dir}>
              <DropdownMenu.Trigger asChild>
                <Button variant="outline" disabled={pending}>
                  {t("status")}:{" "}
                  {status === "all" ||
                  !statuses.includes(status as (typeof statuses)[number])
                    ? t("all")
                    : t(`statuses.${status}`)}
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  {...{ dir }}
                  className="z-50 rounded-xl border bg-popover p-1 text-start shadow-lg"
                >
                  <DropdownMenu.RadioGroup
                    value={status}
                    onValueChange={(value) => {
                      setSelectedKeys([]);
                      state.setFilter("status", value);
                    }}
                  >
                    {["all", ...statuses].map((value) => (
                      <DropdownMenu.RadioItem
                        key={value}
                        value={value}
                        className="cursor-pointer rounded-squircle px-3 py-2 text-sm outline-none focus:bg-secondary"
                      >
                        {value === "all" ? t("all") : t(`statuses.${value}`)}
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
              <span>{t("selected", { count: selected.size })}</span>
              <Button variant="outline" onClick={() => setInspect(true)}>
                {t("inspectSelection")}
              </Button>
              <Button variant="ghost" onClick={() => setSelectedKeys([])}>
                {t("clearSelection")}
              </Button>
            </div>
          )}
          <DataTableShell
            columns={columns}
            data={rows}
            keyExtractor={(row) => row.studentCode}
            isLoading={query.isLoading}
            isError={query.isError}
            errorMessage={t("errors.load")}
            onRetry={() => {
              void query.refetch();
            }}
            retryLabel={t("retry")}
            emptyMessage={t("empty")}
            loadingMessage={t("loading")}
          />
          <div className="flex items-center justify-between text-sm">
            <Button
              variant="outline"
              disabled={page <= 1 || query.isFetching || pending}
              onClick={() => state.setPage(page - 1)}
            >
              {t("previous")}
            </Button>
            <span>
              {t("pagination", { page, total: query.data?.totalPages ?? 1 })}
            </span>
            <Button
              variant="outline"
              disabled={
                page >= (query.data?.totalPages ?? 1) ||
                query.isFetching ||
                pending
              }
              onClick={() => state.setPage(page + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </>
      )}
      {intent && (
        <CodeWriteDialog
          intent={intent}
          pending={pending}
          close={() => setIntent(null)}
          refreshPreview={async () => {
            const latest = await getCodeAudit({ academicYear: intent.snapshot.academicYear, yearPrefix: intent.snapshot.yearPrefix, page: 1, limit: 100, ...(intent.row ? { search: intent.row.studentCode } : {}) });
            const row = intent.nextHold ? nextHoldRow(latest) : intent.row ? latest.items.find((row) => row.studentCode === intent.row?.studentCode) ?? intent.row : undefined;
            if (intent.nextHold && !row) { setIntent(null); return; }
            setIntent({ ...intent, snapshot: latest, row });
          }}
          save={save}
        />
      )}
      {history && (
        <CodeHistoryDialog
          key={history}
          code={history}
          close={() => setHistory(null)}
        />
      )}
      {profileStudentId && canViewStudent && (
        <Dialog
          open={Boolean(profileStudentId)}
          onOpenChange={(open) => !open && setProfileStudentId(null)}
        >
          <DialogContent
            dir={dir}
            className="max-w-lg rounded-2xl border border-border/80 bg-card p-6 shadow-xl"
          >
            <DialogHeader className="text-start pb-3 border-b border-border/50">
              <DialogTitle className="flex items-center gap-2.5 text-lg font-bold">
                <GraduationCap className="h-5 w-5 text-primary" />
                <span>
                  {dir === "rtl"
                    ? "ملف الطالب الأكاديمي"
                    : "Student Academic Profile"}
                </span>
              </DialogTitle>
            </DialogHeader>

            {studentProfileQuery.isLoading ? (
              <div className="flex flex-col items-center justify-center p-8 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">
                  {t("loading")}
                </span>
              </div>
            ) : studentProfileQuery.data ? (
              <div className="space-y-4 pt-2">
                {(() => {
                  const s = studentProfileQuery.data!;
                  return (
                    <>
                      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-surface/50 border border-border/40">
                        <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                          {(s.fullNameAr || s.fullName || "ط").charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-foreground text-base truncate">
                            {dir === "rtl"
                              ? s.fullNameAr || s.fullName
                              : s.fullName}
                          </h4>
                          {s.fullNameAr && s.fullName !== s.fullNameAr && (
                            <p className="text-xs text-muted-foreground truncate">
                              {s.fullName}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="px-2 py-0.5 rounded-squircle text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                              {curriculumDepartmentLabel(s.department, locale)}
                            </span>
                            <span className="px-2 py-0.5 rounded-squircle text-[10px] font-semibold bg-secondary text-secondary-foreground">
                              {dir === "rtl"
                                ? `المستوى ${s.level ?? 1}`
                                : `Level ${s.level ?? 1}`}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 text-xs">
                        <div className="p-2.5 rounded-lg border border-border/40 bg-surface/30">
                          <span className="text-muted-foreground mb-0.5 flex items-center gap-1">
                            <Hash className="h-3 w-3 text-primary" />
                            {dir === "rtl" ? "كود الطالب" : "Student Code"}
                          </span>
                          <bdi className="font-mono font-bold text-foreground text-sm">
                            {s.studentCode}
                          </bdi>
                        </div>
                        <div className="p-2.5 rounded-lg border border-border/40 bg-surface/30">
                          <span className="text-muted-foreground mb-0.5 flex items-center gap-1">
                            <CreditCard className="h-3 w-3 text-primary" />
                            {dir === "rtl" ? "الرقم القومي" : "National ID"}
                          </span>
                          <bdi className="font-mono font-semibold text-foreground text-sm">
                            {s.nationalId || s.nationalIdMasked || "—"}
                          </bdi>
                        </div>
                        <div className="p-2.5 rounded-lg border border-border/40 bg-surface/30">
                          <span className="text-muted-foreground mb-0.5 flex items-center gap-1">
                            <Phone className="h-3 w-3 text-primary" />
                            {dir === "rtl" ? "رقم الهاتف" : "Phone"}
                          </span>
                          <bdi className="font-mono text-foreground">
                            {s.phone ?? "—"}
                          </bdi>
                        </div>
                        <div className="p-2.5 rounded-lg border border-border/40 bg-surface/30">
                          <span className="text-muted-foreground mb-0.5 flex items-center gap-1">
                            <Mail className="h-3 w-3 text-primary" />
                            {dir === "rtl"
                              ? "البريد الأكاديمي"
                              : "Academic Email"}
                          </span>
                          <bdi className="font-mono text-foreground truncate block">
                            {s.academicEmail || "—"}
                          </bdi>
                        </div>
                      </div>

                      <div className="flex justify-end pt-2 rtl:justify-start">
                        <Button
                          variant="outline"
                          onClick={() => setProfileStudentId(null)}
                          className="rounded-squircle"
                        >
                          {t("close")}
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {dir === "rtl"
                  ? "لم يتم العثور على بيانات الطالب."
                  : "Student profile could not be loaded."}
                <Button
                  variant="outline"
                  onClick={() => studentProfileQuery.refetch()}
                >
                  {t("retry")}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
      <Dialog
        open={Boolean(finding)}
        onOpenChange={(open) => !open && setFinding(null)}
      >
        <DialogContent dir={dir} className="max-w-xl rounded-2xl">
          <DialogHeader className="text-start">
            <DialogTitle>{t("viewAudit")}</DialogTitle>
          </DialogHeader>
          {finding && (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <bdi className="font-mono text-lg font-bold text-primary">
                  {finding.studentCode}
                </bdi>
                <p className="mt-2">{t(`statuses.${finding.status}`)}</p>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">
                    {t("linkedStudent")}
                  </dt>
                  <dd className="font-semibold">
                    {locale === "ar"
                      ? finding.studentNameAr || finding.studentName || "—"
                      : finding.studentName || finding.studentNameAr || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("department")}</dt>
                  <dd>
                    <bdi>{curriculumDepartmentLabel(finding.department, locale)}</bdi>
                  </dd>
                </div>
              </dl>
              <p>{t(`reasons.${finding.reason}`)}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={!/^\d{6}$/.test(finding.studentCode)}
                  onClick={() => {
                    setHistory(finding.studentCode);
                    setFinding(null);
                  }}
                >
                  {t("history")}
                </Button>
                {canViewStudent && (finding.currentStudentId || finding.observedStudentId) && (
                  <Button
                    onClick={() => {
                      setProfileStudentId(
                        finding.studentProfileId || finding.currentStudentId || finding.observedStudentId!,
                      );
                      setFinding(null);
                    }}
                  >
                    {t("linkedStudent")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={inspect} onOpenChange={setInspect}>
        <DialogContent
          dir={dir}
          className="max-h-[90vh] overflow-y-auto rounded-2xl"
        >
          <DialogHeader className="text-start">
            <DialogTitle>{t("inspectSelection")}</DialogTitle>
          </DialogHeader>
          {rows
            .filter((row) => selected.has(row.studentCode))
            .map((row) => (
              <p
                key={row.studentCode}
                className="rounded-xl border p-3 text-sm"
              >
                <bdi>{row.studentCode}</bdi>: {t(`statuses.${row.status}`)} —{" "}
                {t(`reasons.${row.reason}`)}
              </p>
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
