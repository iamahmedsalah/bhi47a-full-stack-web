"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CalendarDays, Edit2, MoreVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PERMISSIONS, type AdmissionPeriodItem } from "@student-portal/shared";
import { useAuth } from "@/providers/auth-provider";
import { useTableState } from "@/hooks/use-table-state";
import { RestrictedFeature } from "@/components/admin/restricted-feature";
import { PageTitleBanner } from "@/components/ui/page-title-banner";
import {
  DataTableShell,
  type ColumnDef,
} from "@/components/ui/data-table-shell";
import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AdmissionPeriodForm } from "@/features/admissions/admission-period-form";
import { getAdmissionErrorMessage } from "./admission-error";
import {
  listAdmissionPeriods,
  createAdmissionPeriod,
  updateAdmissionPeriod,
  deleteAdmissionPeriod,
} from "@/features/admissions/api";
import {
  periodTimes,
  type AdmissionPeriodFormValues,
} from "@/features/admissions/period-form";

export default function AdmissionPeriodsPage() {
  const t = useTranslations("admissions");
  const workflowT = useTranslations("admissionWorkflow");
  const locale = useLocale();
  const { user } = useAuth();
  const canManage =
    user?.role === "admin" ||
    Boolean(user?.permissions?.includes(PERMISSIONS.ADMISSIONS_PERIODS_MANAGE));
  const canRead =
    canManage ||
    Boolean(user?.permissions?.includes(PERMISSIONS.ADMISSIONS_PERIODS_READ));
  const state = useTableState({ defaultFilters: {} });
  const page = Math.max(1, Math.trunc(state.page));
  const limit = Math.min(100, Math.max(1, Math.trunc(state.limit)));
  const [searchInput, setSearchInput] = useState({
    value: state.search,
    source: state.search,
  });
  // Keep spaces while typing, but follow URL changes (including browser history).
  if (searchInput.source !== state.search) {
    setSearchInput({ value: state.search, source: state.search });
  }
  const commitSearch = state.setSearch;
  useEffect(() => {
    const timer = setTimeout(() => commitSearch(searchInput.value), 350);
    return () => clearTimeout(timer);
  }, [searchInput.value, commitSearch]);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admission-periods", page, limit, state.search, user?._id],
    queryFn: () =>
      listAdmissionPeriods({
        page,
        limit,
        search: state.search.trim() || undefined,
      }),
    enabled: Boolean(user && canRead),
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  const [form, setForm] = useState<AdmissionPeriodItem | "create" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdmissionPeriodItem | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const rows = useMemo(() => query.data?.items ?? [], [query.data]);
  const { selectedKeys, setSelectedKeys } = state;
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["admission-periods"] });
  const save = async (values: AdmissionPeriodFormValues) => {
    const initial = form && form !== "create" ? form : undefined;
    const times = periodTimes(values, initial);
    if (!times.opensAt || !times.closesAt)
      throw new Error("Invalid period window");
    setPending(true);
    try {
      const input = {
        name: values.name,
        nameAr: values.nameAr,
        ...times,
        opensAt: times.opensAt,
        closesAt: times.closesAt,
        isEnabled: values.isEnabled,
      };
      if (initial)
        await updateAdmissionPeriod(initial._id, {
          ...input,
          revision: initial.revision,
        });
      else
        await createAdmissionPeriod({
          ...input,
          code: values.code,
          academicYear: values.academicYear,
        });
      await refresh();
      setForm(null);
      toast.success(t("saved"));
    } finally {
      setPending(false);
    }
  };
  const disableSelected = async () => {
    setPending(true);
    const targets = rows.filter(
      (period) => selected.has(period._id) && period.isEnabled,
    );
    try {
      const results = await Promise.allSettled(
        targets.map((period) =>
          updateAdmissionPeriod(period._id, {
            revision: period.revision,
            isEnabled: false,
          }),
        ),
      );
      const failed = targets
        .filter((_, index) => results[index].status === "rejected")
        .map((period) => period._id);
      setSelectedKeys(failed);
      await refresh();
      setConfirm(false);
      if (failed.length) toast.error(t("bulkFailed", { count: failed.length }));
      else toast.success(t("saved"));
    } finally {
      setPending(false);
    }
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setPending(true);
    try {
      await deleteAdmissionPeriod(deleteTarget._id, deleteTarget.revision);
      toast.success(t("deleted"));
      setDeleteTarget(null);
      await refresh();
    } catch (error) {
      toast.error(getAdmissionErrorMessage(error, workflowT));
    } finally {
      setPending(false);
    }
  };
  const formatDate = useCallback(
    (value: string) =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
        timeZone: "Africa/Cairo",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value)),
    [locale],
  );
  const columns = useMemo<ColumnDef<AdmissionPeriodItem>[]>(
    () => [
      ...(canManage
        ? [
            {
              key: "select",
              header: (
                <Checkbox
                  aria-label={t("selectAll")}
                  checked={
                    rows.length > 0 &&
                    rows.every((period) => selected.has(period._id))
                  }
                  disabled={pending}
                  onCheckedChange={(checked) =>
                    setSelectedKeys(
                      checked === true ? rows.map((period) => period._id) : [],
                    )
                  }
                  className="mx-auto"
                />
              ),
              className: "w-12 px-4 py-3 text-center",
              render: (period: AdmissionPeriodItem) => (
                <TableCell className="w-12 px-4 py-3 text-center">
                  <Checkbox
                    aria-label={t("select", { code: period.code })}
                    disabled={pending}
                    checked={selected.has(period._id)}
                    onCheckedChange={(checked) =>
                      setSelectedKeys(
                        checked === true
                          ? [...selectedKeys, period._id]
                          : selectedKeys.filter((id) => id !== period._id),
                      )
                    }
                    className="mx-auto"
                  />
                </TableCell>
              ),
            },
          ]
        : []),
      {
        key: "name",
        header: t("periodName"),
        render: (period) => (
          <TableCell>
            <p className="font-semibold">
              {locale === "ar" ? period.nameAr || period.name : period.name}
            </p>
            <bdi className="text-xs text-muted-foreground">{period.code}</bdi>
          </TableCell>
        ),
      },
      {
        key: "year",
        header: t("fields.academicYear"),
        render: (period) => (
          <TableCell>
            <bdi>{period.academicYear}</bdi>
          </TableCell>
        ),
      },
      {
        key: "opensAt",
        header: t("fields.opensAt"),
        render: (period) => <TableCell>{formatDate(period.opensAt)}</TableCell>,
      },
      {
        key: "closesAt",
        header: t("fields.closesAt"),
        render: (period) => (
          <TableCell>{formatDate(period.closesAt)}</TableCell>
        ),
      },
      {
        key: "status",
        header: t("status"),
        render: (period) => (
          <TableCell>
            <span className="rounded-squircle border border-primary/30 bg-primary/10 px-2 py-1 text-xs">
              {t(`statuses.${period.status}`)}
            </span>
          </TableCell>
        ),
      },
      ...(canManage
        ? [
            {
              key: "actions",
              header: t("actions"),
              render: (period: AdmissionPeriodItem) => (
                <TableCell>
                  <DropdownMenu.Root dir={locale === "ar" ? "rtl" : "ltr"}>
                    <DropdownMenu.Trigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        aria-label={t("actions")}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        {...{ dir: locale === "ar" ? "rtl" : "ltr" }}
                        className="z-50 min-w-40 rounded-xl border bg-popover p-1 text-start shadow-lg"
                      >
                        <DropdownMenu.Item
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none focus:bg-secondary"
                          onSelect={() => setForm(period)}
                        >
                          <Edit2 className="h-4 w-4" />
                          <span>{t("edit")}</span>
                        </DropdownMenu.Item>
                        {user?.role === "admin" && (
                          <DropdownMenu.Item
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger outline-none focus:bg-danger/10 focus:text-danger"
                            onSelect={() => setDeleteTarget(period)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>{t("delete")}</span>
                          </DropdownMenu.Item>
                        )}
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </TableCell>
              ),
            },
          ]
        : []),
    ],
    [
      canManage,
      rows,
      selected,
      selectedKeys,
      setSelectedKeys,
      pending,
      t,
      locale,
      formatDate,
    ],
  );
  if (!canRead)
    return (
      <RestrictedFeature
        featureName={t("title")}
        permission={PERMISSIONS.ADMISSIONS_PERIODS_READ}
      />
    );
  return (
    <div className="space-y-5 p-2 md:p-6">
      <PageTitleBanner
        title={t("title")}
        subtitle={t("description")}
        icon={<CalendarDays className="h-5 w-5" />}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-md rounded-squircle"
          aria-label={t("search")}
          placeholder={t("search")}
          value={searchInput.value}
          maxLength={100}
          onChange={(event) => {
            setSelectedKeys([]);
            setSearchInput({ value: event.target.value, source: state.search });
          }}
        />
        {canManage && (
          <Button disabled={pending} onClick={() => setForm("create")}>
            <Plus className="h-4 w-4" />
            {t("create")}
          </Button>
        )}
      </div>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border p-3">
          <span>{t("selected", { count: selected.size })}</span>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setConfirm(true)}
          >
            {t("disableSelected")}
          </Button>
        </div>
      )}
      <DataTableShell
        columns={columns}
        data={rows}
        keyExtractor={(period) => period._id}
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
      <div className="flex items-center justify-between gap-3 text-sm">
        <Button
          variant="outline"
          disabled={page <= 1 || query.isFetching}
          onClick={() => state.setPage(page - 1)}
        >
          {t("previous")}
        </Button>
        <span>
          {t("pagination", {
            page,
            totalPages: Math.max(1, query.data?.totalPages ?? 1),
          })}
        </span>
        <Button
          variant="outline"
          disabled={page >= (query.data?.totalPages ?? 1) || query.isFetching}
          onClick={() => state.setPage(page + 1)}
        >
          {t("next")}
        </Button>
      </div>
      {form && (
        <AdmissionPeriodForm
          key={form === "create" ? "create" : form._id}
          initial={form === "create" ? undefined : form}
          pending={pending}
          close={() => setForm(null)}
          save={save}
        />
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        dir={locale === "ar" ? "rtl" : "ltr"}
        title={t("disableSelected")}
        description={t("disableConfirm")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        disabled={pending}
        onConfirm={() => {
          void disableSelected();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleteTarget(null);
        }}
        dir={locale === "ar" ? "rtl" : "ltr"}
        title={t("delete")}
        description={t("confirmDelete")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        destructive
        disabled={pending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
