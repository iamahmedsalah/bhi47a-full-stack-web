"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Fingerprint, MoreVertical } from "lucide-react";
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
            <bdi className="font-mono font-semibold">{row.studentCode}</bdi>
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
            <bdi className="text-xs text-muted-foreground">
              {row.currentStudentId ?? "—"}
            </bdi>
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
              <span>{t("configuredYear")}: <bdi>{query.data.policy.academicYear}</bdi></span>
              <span>{t("configuredPrefix")}: <bdi>{query.data.policy.yearPrefix}</bdi></span>
              <span>{t("configuredNext")}: <bdi>{query.data.policy.nextSequence.toLocaleString(locale === "ar" ? "ar-EG" : "en-GB")}</bdi></span>
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
