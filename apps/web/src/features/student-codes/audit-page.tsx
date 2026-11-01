"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Fingerprint,
  MoreVertical,
  User,
  GraduationCap,
  Phone,
  Mail,
  Hash,
  CreditCard,
  ShieldCheck,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { getStudent } from "@/features/students/api";
import { toast } from "sonner";
import {
  PERMISSIONS,
  STUDENT_CODE_STATUSES,
  isAdmissionAcademicYear,
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
export default function StudentCodesPage() {
  const t = useTranslations("studentCodes");
  const locale = useLocale();
  const dir = locale === "ar" ? "rtl" : "ltr";
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const canRead =
    canManage ||
    Boolean(user?.permissions?.includes(PERMISSIONS.STUDENT_CODES_READ));
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
  const [inspect, setInspect] = useState(false);
  const [pending, setPending] = useState(false);
  const [profileStudentId, setProfileStudentId] = useState<string | null>(null);

  const studentProfileQuery = useQuery({
    queryKey: ["student-profile-audit", profileStudentId],
    queryFn: () => getStudent(profileStudentId!),
    enabled: Boolean(profileStudentId),
  });
  const refresh = async () => {
    setSelectedKeys([]);
    await client.invalidateQueries({ queryKey: ["student-code-audit"] });
    await client.invalidateQueries({ queryKey: ["student-code-history"] });
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
      if (row)
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
        render: (row) => (
          <TableCell>
            {row.status === "ASSIGNED" || row.currentStudentId ? (
              <button
                type="button"
                onClick={() =>
                  setProfileStudentId(row.studentCode || row.currentStudentId!)
                }
                className="group inline-flex items-center gap-1.5 rounded-squircle border border-border/70 bg-card/60 px-2.5 py-1 text-xs font-mono font-bold text-primary transition-all hover:border-primary/50 hover:bg-primary/10 hover:shadow-xs cursor-pointer select-none"
                title={
                  dir === "rtl"
                    ? "عرض ملف الطالب المرتبط بهذا الكود"
                    : "View student profile linked to this code"
                }
              >
                <Hash className="h-3 w-3 text-primary/60 group-hover:text-primary transition-colors shrink-0" />
                <span dir="ltr">{row.studentCode}</span>
              </button>
            ) : (
              <bdi className="font-mono font-semibold">{row.studentCode}</bdi>
            )}
          </TableCell>
        ),
      },
      {
        key: "status",
        header: t("status"),
        render: (row) => (
          <TableCell>
            <span className="rounded-squircle border bg-primary/10 px-2 py-1 text-xs">
              {t(`statuses.${row.status}`)}
            </span>
          </TableCell>
        ),
      },
      {
        key: "reason",
        header: t("explanation"),
        render: (row) => (
          <TableCell className="max-w-sm text-sm">
            {t(`reasons.${row.reason}`)}
          </TableCell>
        ),
      },
      {
        key: "owner",
        header: t("fields.currentStudentId"),
        render: (row) => (
          <TableCell>
            {row.currentStudentId ||
            (row.status === "ASSIGNED" && row.studentCode) ? (
              <button
                type="button"
                onClick={() =>
                  setProfileStudentId(row.studentCode || row.currentStudentId!)
                }
                className="inline-flex items-center gap-1.5 font-mono text-xs text-primary hover:underline cursor-pointer"
                title={
                  dir === "rtl" ? "عرض ملف الطالب" : "View student profile"
                }
              >
                <User className="h-3 w-3" />
                <bdi>{row.currentStudentId || row.studentCode}</bdi>
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </TableCell>
        ),
      },
      {
        key: "actions",
        header: t("actions"),
        render: (row) => (
          <TableCell>
            <DropdownMenu.Root dir={dir}>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("actionsFor", { code: row.studentCode })}
                  disabled={pending}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  {...{ dir }}
                  className="z-50 rounded-xl border bg-popover p-1 text-start shadow-lg"
                >
                  {row.currentStudentId && (
                    <DropdownMenu.Item
                      className="cursor-pointer rounded-squircle px-3 py-2 text-sm outline-none focus:bg-secondary flex items-center gap-2"
                      onSelect={() =>
                        setProfileStudentId(row.currentStudentId!)
                      }
                    >
                      <User className="h-4 w-4 text-primary" />
                      <span>
                        {dir === "rtl"
                          ? "عرض ملف الطالب"
                          : "View Student Profile"}
                      </span>
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item
                    className="cursor-pointer rounded-squircle px-3 py-2 text-sm outline-none focus:bg-secondary"
                    disabled={!/^\d{6}$/.test(row.studentCode)}
                    onSelect={() => setHistory(row.studentCode)}
                  >
                    {t("history")}
                  </DropdownMenu.Item>
                  {canManage &&
                    row.status === "MISSING" &&
                    query.data?.policy &&
                    !query.data.mappingConflict &&
                    !query.data.truncated && (
                      <DropdownMenu.Item
                        className="cursor-pointer rounded-squircle px-3 py-2 text-sm outline-none focus:bg-secondary"
                        onSelect={() =>
                          setIntent({ snapshot: query.data!, row })
                        }
                      >
                        {t("recover")}
                      </DropdownMenu.Item>
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
    <div className="space-y-5 p-2 md:p-6">
      <PageTitleBanner
        title={t("title")}
        subtitle={t("description")}
        icon={<Fingerprint className="h-5 w-5" />}
      />
      <CodeScopeForm
        key={`${academicYear}/${yearPrefix}`}
        initial={{ academicYear, yearPrefix }}
        pending={pending}
        scan={scan}
      />
      <p className="text-sm text-muted-foreground">{t("safetyHint")}</p>
      {canManage && <MappingCorrection />}
      {!validScope ? (
        <p className="rounded-xl border p-5">{t("chooseScope")}</p>
      ) : (
        <>
          {query.data && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {statuses.map((key) => (
                  <div key={key} className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">
                      {t(`statuses.${key}`)}
                    </p>
                    <p className="text-xl font-bold">
                      {query.data.summary[key].toLocaleString(
                        locale === "ar" ? "ar-EG" : "en-GB",
                      )}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("scannedAt", {
                  value: new Intl.DateTimeFormat(
                    locale === "ar" ? "ar-EG" : "en-GB",
                    {
                      timeZone: "Africa/Cairo",
                      dateStyle: "medium",
                      timeStyle: "short",
                    },
                  ).format(new Date(query.data.scannedAt)),
                })}
              </p>
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
            {(canManage ||
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
      {profileStudentId && (
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
                  const s = studentProfileQuery.data as any;
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
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                              {s.department || "عام"}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-secondary-foreground">
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
                            {s.nationalId ?? "—"}
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
                            {s.academicEmail || s.email || "—"}
                          </bdi>
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
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
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
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
