"use client";
import { getAdmissionErrorMessage } from "./admission-error";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ADMISSION_REQUEST_STATUSES,
  ADMISSION_REJECTION_REASONS,
  PERMISSIONS,
  type AdmissionRequestItem,
  type AdmissionGroupItem,
} from "@student-portal/shared";
import { useTableState } from "@/hooks/use-table-state";
import {
  DataTableShell,
  type ColumnDef,
} from "@/components/ui/data-table-shell";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { TableCell } from "@/components/ui/table";
import { FilterBar } from "@/components/ui/filter-bar";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  Eye,
  User,
  GraduationCap,
  Hash,
  Calendar,
  Clock,
  XCircle,
  Copy,
  Edit2,
  CheckCircle,
  Trash2,
  Loader2,
  ShieldAlert,
  MapPin,
  School,
  Users,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/ui/copy-button";
import { StatusBadge } from "@/components/ui/status-badge";

import { cairoDateTimeToIso } from "@/lib/cairo-time";
import { cn } from "@/lib/cn";
import { ApplicantForm } from "./applicant-form";
import {
  admissionAction,
  admissionDetail,
  admissionDownload,
  admissionList,
  admissionUpdate,
  admissionDeleteRequest,
} from "./workflow-api";
import {
  AdmissionDialog,
  AdmissionInput,
  AdmissionMenu,
  AdmissionPagination,
  Choice,
  Field,
  useAdmissionUI,
} from "./workflow-ui";

export function AdmissionRequests() {
  const { t, can, date, userId, locale, isAdmin } = useAdmissionUI(),
    state = useTableState({
      defaultFilters: { status: "ALL", academicYear: "", from: "", to: "" },
    }),
    client = useQueryClient();
  const [search, setSearch] = useState(state.search),
    [selected, setSelected] = useState<{ id: string; action: string } | null>(
      null,
    ),
    [inspect, setInspect] = useState(false),
    [bulkAction, setBulkAction] = useState<"waitlist" | "reject" | null>(null),
    [bulkPending, setBulkPending] = useState(false),
    [deleting, setDeleting] = useState<AdmissionRequestItem | null>(null),
    [error, setError] = useState("");
  const commitSearch = state.setSearch;
  useEffect(() => {
    const timer = setTimeout(() => commitSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search, commitSearch]);
  const params = {
    page: state.page,
    limit: state.limit,
    search: state.search || undefined,
    status: state.filters.status === "ALL" ? undefined : state.filters.status,
    academicYear: state.filters.academicYear || undefined,
    from: state.filters.from
      ? (cairoDateTimeToIso(`${state.filters.from}T00:00`) ??
        cairoDateTimeToIso(`${state.filters.from}T01:00`))
      : undefined,
    to: state.filters.to
      ? cairoDateTimeToIso(`${state.filters.to}T23:59`)
      : undefined,
  };
  const query = useQuery({
    queryKey: ["admission-requests", params, userId],
    queryFn: () => admissionList<AdmissionRequestItem>("requests", params),
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["admission-requests"] });
    await client.invalidateQueries({ queryKey: ["admission-detail"] });
    await client.invalidateQueries({ queryKey: ["admission-groups"] });
  };
  const executeBulkAction = async () => {
    if (!bulkAction || state.selectedKeys.length === 0) return;
    setBulkPending(true);
    setError("");
    try {
      const itemsToAct = (query.data?.items ?? []).filter(
        (r) =>
          state.selectedKeys.includes(r._id) &&
          (bulkAction === "waitlist"
            ? r.status === "PENDING"
            : ["PENDING", "WAITLISTED"].includes(r.status)),
      );
      const remaining = new Set(state.selectedKeys);
      let succeeded = 0;
      for (const row of itemsToAct) {
        try {
          await admissionAction(row._id, bulkAction, {
            revision: row.revision,
            confirmed: true,
            reason: t(
              bulkAction === "reject"
                ? "bulk.rejectReason"
                : "bulk.waitlistReason",
            ),
            ...(bulkAction === "reject" ? { reasonCode: "OTHER" } : {}),
          });
          remaining.delete(row._id);
          succeeded++;
        } catch {
          // Keep failed selections so the operator can inspect and retry them.
        }
      }
      if (succeeded) toast.success(t("bulk.applied", { count: succeeded }));
      if (remaining.size) {
        const message = t("bulk.notApplied", { count: remaining.size });
        setError(message);
        toast.error(message);
      }
      state.setSelectedKeys([...remaining]);
      await refresh();
    } catch (e) {
      setError(getAdmissionErrorMessage(e, t));
    } finally {
      setBulkPending(false);
      setBulkAction(null);
    }
  };

  const columns: ColumnDef<AdmissionRequestItem>[] = useMemo(
    () => [
      {
        key: "code",
        header: (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Hash className="h-3.5 w-3.5 text-primary/70 shrink-0" />
            <span>{t("studentCode")}</span>
          </span>
        ),
        className: "min-w-[140px] whitespace-nowrap text-start",
        render: (row) => (
          <TableCell className="min-w-[140px] py-2.5 px-3 whitespace-nowrap">
            {row.studentCode ? (
              <span className="inline-flex items-center gap-1.5 rounded-squircle border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-mono font-bold text-primary select-none">
                <Hash className="h-3 w-3 text-primary/70 shrink-0" />
                <span dir="ltr">{row.studentCode}</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground font-mono">—</span>
            )}
          </TableCell>
        ),
      },
      {
        key: "name",
        header: (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <User className="h-3.5 w-3.5 text-primary/70 shrink-0" />
            <span>{t("fields.fullName")}</span>
          </span>
        ),
        className: "min-w-[220px] text-start",
        render: (row) => {
          const isAr = locale === "ar";
          const primary = isAr ? row.fullNameAr || row.fullName : row.fullName;
          const secondary = isAr ? row.fullName : row.fullNameAr;
          return (
            <TableCell className="min-w-[220px] py-2.5 px-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-squircle border border-border/60 bg-secondary/40 text-muted-foreground">
                  <GraduationCap className="h-4 w-4 text-primary/80" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground leading-tight truncate">
                    {primary}
                  </div>
                  {secondary && secondary !== primary ? (
                    <div className="text-[11px] text-muted-foreground/80 mt-0.5 truncate max-w-[220px]">
                      {secondary}
                    </div>
                  ) : null}
                  <div
                    className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/70 font-mono"
                    dir="ltr"
                  >
                    <span>{row.publicReference}</span>
                  </div>
                </div>
              </div>
            </TableCell>
          );
        },
      },
      {
        key: "nationalId",
        header: locale === "ar" ? "الرقم القومي" : t("fields.nationalId"),
        className: "min-w-[150px] text-start",
        render: (row) => (
          <TableCell className="min-w-[150px] py-2.5 px-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-foreground tracking-wide">
                {row.nationalId || row.nationalIdMasked || "—"}
              </span>
              {(row.nationalId || row.nationalIdMasked) && (
                <CopyButton
                  value={row.nationalId || row.nationalIdMasked || ""}
                  successMessage={
                    locale === "ar"
                      ? "تم نسخ الرقم القومي"
                      : "National ID copied"
                  }
                  className="rounded-squircle h-6 w-6 p-1 shrink-0"
                />
              )}
            </div>
          </TableCell>
        ),
      },
      {
        key: "year",
        header: t("fields.academicYear"),
        className: "min-w-[110px] text-start",
        render: (row) => (
          <TableCell className="min-w-[110px] py-2.5 px-3 text-xs font-mono text-muted-foreground">
            <bdi>{row.academicYear}</bdi>
          </TableCell>
        ),
      },
      {
        key: "type",
        header: t("fields.studentType"),
        className: "min-w-[100px] text-start",
        render: (row) => (
          <TableCell className="min-w-[100px] py-2.5 px-3">
            <span className="inline-flex items-center rounded-squircle bg-surface/80 px-2 py-0.5 text-xs font-medium border border-border">
              {t(`types.${row.studentType}`)}
            </span>
          </TableCell>
        ),
      },
      {
        key: "status",
        header: t("statusLabel"),
        className: "min-w-[120px] text-center",
        render: (row) => (
          <TableCell className="min-w-[120px] py-2.5 px-3 text-center">
            <div>
              <StatusBadge
                label={t(`status.${row.status}`)}
                variant={
                  row.status === "APPROVED"
                    ? "success"
                    : row.status === "REJECTED" || row.status === "CANCELLED"
                      ? "danger"
                      : row.status === "WAITLISTED"
                        ? "warning"
                        : "neutral"
                }
              />
              {row.duplicateReviewRequired && (
                <p className="mt-1 text-xs text-danger font-medium">
                  {t("identityReview")}
                </p>
              )}
            </div>
          </TableCell>
        ),
      },
      {
        key: "submittedAt",
        header: (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Calendar className="h-3.5 w-3.5 text-primary/70 shrink-0" />
            <span>{t("submittedAt")}</span>
          </span>
        ),
        className: "min-w-[140px] whitespace-nowrap text-start",
        render: (row) => (
          <TableCell className="text-muted-foreground text-xs whitespace-nowrap py-2.5 px-3">
            {date(row.submittedAt)}
          </TableCell>
        ),
      },
      {
        key: "actions",
        header: t("actions"),
        className: "min-w-[150px] text-center",
        render: (row) => (
          <TableCell className="min-w-[150px] text-center">
            <div className="flex items-center justify-end gap-2">
              {["PENDING", "WAITLISTED"].includes(row.status) &&
                can(PERMISSIONS.ADMISSIONS_REQUESTS_APPROVE) &&
                can(PERMISSIONS.ADMISSIONS_ACADEMIC_MANAGE) && (
                  <Button
                    size="sm"
                    className="gap-1.5 rounded-squircle"
                    disabled={row.duplicateReviewRequired}
                    onClick={() =>
                      setSelected({ id: row._id, action: "approve" })
                    }
                  >
                    <CheckCircle className="h-4 w-4" />
                    {t("approve")}
                  </Button>
                )}
              <AdmissionMenu
                actions={[
                  {
                    label: t("view"),
                    icon: <Eye className="h-3.5 w-3.5 text-primary" />,
                    onClick: () => setSelected({ id: row._id, action: "view" }),
                  },
                  ...(["PENDING", "WAITLISTED"].includes(row.status)
                    ? [
                        ...(can(PERMISSIONS.ADMISSIONS_REQUESTS_UPDATE)
                          ? [
                              {
                                label: t("edit"),
                                icon: (
                                  <Edit2 className="h-3.5 w-3.5 text-primary" />
                                ),
                                onClick: () =>
                                  setSelected({
                                    id: row._id,
                                    action: "update",
                                  }),
                              },
                            ]
                          : []),
                        ...(can(PERMISSIONS.ADMISSIONS_REQUESTS_WAITLIST)
                          ? [
                              {
                                label: t(
                                  row.status === "WAITLISTED"
                                    ? "pending"
                                    : "waitlist",
                                ),
                                icon: (
                                  <Clock className="h-3.5 w-3.5 text-amber-400" />
                                ),
                                onClick: () =>
                                  setSelected({
                                    id: row._id,
                                    action:
                                      row.status === "WAITLISTED"
                                        ? "pending"
                                        : "waitlist",
                                  }),
                              },
                            ]
                          : []),
                        ...(can(PERMISSIONS.ADMISSIONS_REQUESTS_REJECT)
                          ? [
                              {
                                label: t("reject"),
                                icon: (
                                  <XCircle className="h-3.5 w-3.5 text-danger" />
                                ),
                                variant: "destructive" as const,
                                onClick: () =>
                                  setSelected({
                                    id: row._id,
                                    action: "reject",
                                  }),
                              },
                            ]
                          : []),
                      ]
                    : []),
                  ...(row.status === "APPROVED" &&
                  can(PERMISSIONS.ADMISSIONS_REQUESTS_CANCEL)
                    ? [
                        {
                          label: t("cancelAdmission"),
                          icon: <Trash2 className="h-3.5 w-3.5 text-danger" />,
                          variant: "destructive" as const,
                          onClick: () =>
                            setSelected({ id: row._id, action: "cancel" }),
                        },
                      ]
                    : []),
                  ...(isAdmin
                    ? [
                        {
                          label: t("deleteRequest"),
                          icon: <Trash2 className="h-3.5 w-3.5 text-danger" />,
                          variant: "destructive" as const,
                          onClick: () => setDeleting(row),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          </TableCell>
        ),
      },
    ],
    [t, locale, date, can, isAdmin],
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("requestDescription")}</p>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !bulkPending) setDeleting(null);
        }}
        title={t("deleteRequest")}
        description={t("deleteRequestDescription")}
        confirmLabel={t("deleteRequest")}
        cancelLabel={t("close")}
        disabled={bulkPending}
        onConfirm={async () => {
          if (!deleting) return;
          setBulkPending(true);
          try {
            await admissionDeleteRequest(
              deleting._id,
              deleting.revision,
              t("deleteRequestReason"),
            );
            setDeleting(null);
            await refresh();
          } catch (e) {
            setError(getAdmissionErrorMessage(e, t));
          } finally {
            setBulkPending(false);
          }
        }}
      />
      <FilterBar
        wrapFilters
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("search")}
      >
        <Select
          value={state.filters.status || "ALL"}
          onValueChange={(value) => state.setFilter("status", value)}
        >
          <SelectTrigger
            className="h-10 w-[150px] rounded-squircle bg-card"
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <SelectValue placeholder={t("statusLabel")} />
          </SelectTrigger>
          <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
            <SelectItem value="ALL">
              {t("status.ALL") ||
                (locale === "ar" ? "كل الحالات" : "All Statuses")}
            </SelectItem>
            {ADMISSION_REQUEST_STATUSES.map((val) => (
              <SelectItem key={val} value={val}>
                {t(`status.${val}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <AdmissionInput
          aria-label={t("fields.academicYear")}
          placeholder="2026-2027"
          dir="ltr"
          className="h-10 w-[120px] rounded-squircle text-left"
          value={state.filters.academicYear ?? ""}
          onChange={(event) =>
            state.setFilter("academicYear", event.target.value)
          }
        />

        <DatePicker
          value={(state.filters.from ?? "").slice(0, 10)}
          onChange={(val) => state.setFilter("from", val)}
          locale={locale}
          placeholder={t("from")}
          className="w-full min-w-[195px] shrink-0 sm:w-[210px]"
        />

        <DatePicker
          value={(state.filters.to ?? "").slice(0, 10)}
          onChange={(val) => state.setFilter("to", val)}
          locale={locale}
          placeholder={t("to")}
          className="w-full min-w-[195px] shrink-0 sm:w-[210px]"
        />

        {can(PERMISSIONS.ADMISSIONS_EXPORT) && (
          <Button
            variant="outline"
            className="h-10 gap-1.5 rounded-squircle shrink-0"
            onClick={async () => {
              try {
                await admissionDownload("export", params);
              } catch (e) {
                setError(getAdmissionErrorMessage(e, t));
              }
            }}
          >
            <Download className="h-4 w-4" />
            <span>{t("export")}</span>
          </Button>
        )}

        {state.selectedKeys.length > 0 && (
          <Button
            variant="secondary"
            className="h-10 gap-1.5 rounded-squircle"
            onClick={() => setInspect(true)}
          >
            <Eye className="h-4 w-4" />
            <span>
              {t("inspectSelected", { count: state.selectedKeys.length })}
            </span>
          </Button>
        )}
      </FilterBar>

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}

      <DataTableShell
        columns={columns}
        data={query.data?.items ?? []}
        keyExtractor={(row) => row._id}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => query.refetch()}
        emptyMessage={t("empty")}
        enableSelection={true}
        selectedKeys={state.selectedKeys}
        onSelectedKeysChange={state.setSelectedKeys}
        bulkActions={[
          ...(can(PERMISSIONS.ADMISSIONS_REQUESTS_WAITLIST)
            ? [
                {
                  label: t("waitlist"),
                  onClick: () => setBulkAction("waitlist"),
                  variant: "outline" as const,
                  icon: <Clock className="h-3.5 w-3.5 text-amber-400" />,
                },
              ]
            : []),
          ...(can(PERMISSIONS.ADMISSIONS_REQUESTS_REJECT)
            ? [
                {
                  label: t("reject"),
                  onClick: () => setBulkAction("reject"),
                  variant: "destructive" as const,
                  icon: <XCircle className="h-3.5 w-3.5" />,
                },
              ]
            : []),
        ]}
      />

      <ConfirmDialog
        open={bulkAction !== null}
        onOpenChange={(open) => {
          if (!open) setBulkAction(null);
        }}
        title={
          bulkAction === "reject"
            ? locale === "ar"
              ? "رفض الطلبات المحددة"
              : "Reject Selected Requests"
            : locale === "ar"
              ? "نقل الطلبات إلى قائمة الانتظار"
              : "Waitlist Selected Requests"
        }
        description={
          locale === "ar"
            ? `هل أنت متأكد من تنفيذ هذا الإجراء على ${state.selectedKeys.length} طلب محدد؟`
            : `Are you sure you want to apply this action to ${state.selectedKeys.length} selected requests?`
        }
        confirmLabel={
          bulkAction === "reject"
            ? locale === "ar"
              ? "تأكيد الرفض"
              : "Confirm Reject"
            : locale === "ar"
              ? "تأكيد النقل"
              : "Confirm Waitlist"
        }
        cancelLabel={locale === "ar" ? "إلغاء" : "Cancel"}
        destructive={bulkAction === "reject"}
        onConfirm={executeBulkAction}
      />
      <AdmissionPagination
        page={state.page}
        totalPages={query.data?.totalPages ?? 1}
        onPage={state.setPage}
      />
      {selected && (
        <RequestDialog
          key={`${selected.id}:${selected.action}`}
          id={selected.id}
          action={selected.action}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            await refresh();
            setSelected(null);
          }}
        />
      )}
      <AdmissionDialog
        open={inspect}
        onClose={() => setInspect(false)}
        title={t("inspectSelected", { count: state.selectedKeys.length })}
      >
        <p>{t("individualDecisions")}</p>
        {query.data?.items
          .filter((row) => state.selectedKeys.includes(row._id))
          .map((row) => (
            <p key={row._id}>
              <bdi>{row.publicReference}</bdi> Â· {row.fullName}
            </p>
          ))}
      </AdmissionDialog>
    </div>
  );
}
function RequestDialog({
  id,
  action,
  onClose,
  onSaved,
}: {
  id: string;
  action: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t, date, locale, userId } = useAdmissionUI();
  const query = useQuery({
    queryKey: ["admission-detail", id, userId],
    queryFn: () => admissionDetail(id),
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  const item = query.data;

  const isAr = locale === "ar";
  const primaryName = isAr
    ? item?.fullNameAr || item?.fullName
    : item?.fullName;
  const secondaryName = isAr ? item?.fullName : item?.fullNameAr;

  return (
    <AdmissionDialog
      open
      onClose={onClose}
      title={
        action === "view"
          ? isAr
            ? "ملف ومراجعة طلب الالتحاق"
            : "Admission Application Review"
          : action === "cancel"
            ? t("cancelAdmission")
            : action === "update"
              ? isAr
                ? "تعديل بيانات طلب الالتحاق"
                : "Edit Admission Application"
              : t(action)
      }
      description={primaryName}
    >
      {query.isLoading ? (
        <div className="flex flex-col items-center justify-center p-8 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="p-4 rounded-xl border border-danger/30 bg-danger/10 text-center space-y-2"
        >
          <p className="text-sm text-danger font-semibold">{t("failed")}</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        item && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-surface/50 border border-border/70 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-squircle bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                  <GraduationCap className="h-6 w-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-foreground text-base leading-tight truncate">
                    {primaryName}
                  </h3>
                  {secondaryName && secondaryName !== primaryName && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {secondaryName}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <StatusBadge
                      label={t(`status.${item.status}`)}
                      variant={
                        item.status === "APPROVED"
                          ? "success"
                          : item.status === "REJECTED" ||
                              item.status === "CANCELLED"
                            ? "danger"
                            : item.status === "WAITLISTED"
                              ? "warning"
                              : "neutral"
                      }
                    />
                    <span className="px-2 py-0.5 rounded-squircle text-xs font-mono font-semibold bg-secondary text-secondary-foreground border border-border/60">
                      {item.academicYear}
                    </span>
                    <span className="px-2 py-0.5 rounded-squircle text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                      {t(`types.${item.studentType}`)}
                    </span>
                    {item.waitlistPosition && (
                      <span className="px-2 py-0.5 rounded-squircle text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {t("waitlistPosition", {
                          position: item.waitlistPosition,
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0 self-stretch sm:self-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">
                    مرجع الطلب:
                  </span>
                  <bdi className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded-squircle bg-card border border-border">
                    {item.publicReference}
                  </bdi>
                  <CopyButton
                    value={item.publicReference}
                    className="h-6 w-6 p-1 rounded-squircle"
                  />
                </div>
                {item.studentCode && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">
                      {t("studentCode")}:
                    </span>
                    <bdi className="font-mono text-xs font-bold text-emerald-400 px-2 py-0.5 rounded-squircle bg-emerald-500/10 border border-emerald-500/20">
                      {item.studentCode}
                    </bdi>
                    <CopyButton
                      value={item.studentCode}
                      className="h-6 w-6 p-1 rounded-squircle"
                    />
                  </div>
                )}
              </div>
            </div>

            {item.duplicateReviewRequired && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs font-semibold">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{t("identityReview")}</span>
              </div>
            )}

            {action === "view" ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <User className="h-4 w-4 text-primary" />
                    <span>
                      {isAr
                        ? "البيانات الشخصية وبيانات الاتصال"
                        : "Personal & Contact Information"}
                    </span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl border border-border/60 bg-surface/30 space-y-1">
                      <span className="text-muted-foreground block text-[11px]">
                        {isAr ? "الرقم القومي" : "National ID"}
                      </span>
                      <div className="flex items-center justify-between">
                        <bdi className="font-mono text-sm font-bold text-foreground">
                          {item.nationalId || item.nationalIdMasked || "—"}
                        </bdi>
                        {(item.nationalId || item.nationalIdMasked) && (
                          <CopyButton
                            value={
                              item.nationalId || item.nationalIdMasked || ""
                            }
                            className="h-6 w-6 p-1 rounded-squircle"
                          />
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-border/60 bg-surface/30 space-y-1">
                      <span className="text-muted-foreground block text-[11px]">
                        {isAr ? "رقم الهاتف المحمول" : "Phone Number"}
                      </span>
                      <div className="flex items-center justify-between">
                        <bdi className="font-mono text-sm font-bold text-foreground">
                          {item.phone || "—"}
                        </bdi>
                        {item.phone && (
                          <CopyButton
                            value={item.phone}
                            className="h-6 w-6 p-1 rounded-squircle"
                          />
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-border/60 bg-surface/30 space-y-1 sm:col-span-2">
                      <span className="text-muted-foreground block text-[11px] flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-primary" />
                        {t("fields.address")}
                      </span>
                      <p className="text-sm text-foreground font-medium">
                        {item.address || "—"}
                      </p>
                    </div>
                  </div>
                </div>

                {item.studentType === "TRANSFER" && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <School className="h-4 w-4 text-primary" />
                      <span>
                        {isAr
                          ? "بيانات التحويل الأكاديمي"
                          : "Transfer Information"}
                      </span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl border border-border/60 bg-surface/30 space-y-1">
                        <span className="text-muted-foreground block text-[11px]">
                          {t("fields.previousInstitution")}
                        </span>
                        <p className="text-sm font-semibold text-foreground">
                          {item.previousInstitution || "—"}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl border border-border/60 bg-surface/30 space-y-1">
                        <span className="text-muted-foreground block text-[11px]">
                          {t("fields.previousFaculty")}
                        </span>
                        <p className="text-sm font-semibold text-foreground">
                          {item.previousFaculty || "—"}
                        </p>
                      </div>
                      {item.transferNotes && (
                        <div className="p-3 rounded-xl border border-border/60 bg-surface/30 space-y-1 sm:col-span-2">
                          <span className="text-muted-foreground block text-[11px]">
                            {t("fields.transferNotes")}
                          </span>
                          <p className="text-xs text-foreground">
                            {item.transferNotes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-primary" />
                    <span>
                      {t("guardians")} ({item.guardians?.length ?? 0})
                    </span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {item.guardians?.map((guardian, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-xl border border-border/60 bg-surface/30 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-foreground">
                            {guardian.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                            {guardian.relationship}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                          <bdi className="font-mono text-foreground font-medium">
                            {guardian.phone}
                          </bdi>
                          <CopyButton
                            value={guardian.phone}
                            className="h-5 w-5 p-0.5 rounded-squircle"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {item.rejection && (
                  <div className="p-4 rounded-xl border border-danger/30 bg-danger/10 space-y-1.5">
                    <div className="flex items-center gap-2 text-danger font-bold text-sm">
                      <XCircle className="h-4 w-4" />
                      <span>{t(`reasons.${item.rejection.reasonCode}`)}</span>
                    </div>
                    <p className="text-xs text-foreground/90 leading-relaxed">
                      {item.rejection.explanation}
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <History className="h-4 w-4 text-primary" />
                    <span>{t("history")}</span>
                  </h4>
                  <div className="space-y-2 rounded-xl border border-border/60 bg-surface/20 p-3 max-h-48 overflow-y-auto">
                    {item.history?.map((event, index) => (
                      <div
                        key={index}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-border/30 last:border-b-0 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {t(`events.${event.action}`)}
                          </span>
                          {event.reason && (
                            <span className="text-muted-foreground">
                              · {event.reason}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground shrink-0 font-mono">
                          {date(event.at)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : action === "update" ? (
              <div className="pt-2">
                <ApplicantForm
                  initial={item}
                  onSave={async ({ nationalId: _nationalId, ...values }) => {
                    void _nationalId;
                    await admissionUpdate(id, {
                      ...values,
                      revision: item.revision,
                    });
                    await onSaved();
                  }}
                />
              </div>
            ) : action === "approve" ? (
              <ApprovalForm item={item} onSaved={onSaved} />
            ) : (
              <DecisionForm item={item} action={action} onSaved={onSaved} />
            )}
          </div>
        )
      )}
    </AdmissionDialog>
  );
}
function ApprovalForm({
  item,
  onSaved,
}: {
  item: AdmissionRequestItem;
  onSaved: () => Promise<void>;
}) {
  const { t, can } = useAdmissionUI(),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const schema = z.object({
    level: z.enum(["1", "2", "3", "4"]),
    semester: z.enum(["1", "2"]),
    department: z.string().regex(/^[A-Z][A-Z0-9_-]{1,19}$/, t("invalid")),
    groupId: z.string(),
    passedCourses: z.string().max(3000, t("invalid")),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      level: "1",
      semester: "1",
      department: "GENERAL",
      groupId: "NONE",
      passedCourses: "",
    },
  });
  const groups = useQuery({
    queryKey: ["admission-groups", item.academicYear],
    queryFn: () =>
      admissionList<AdmissionGroupItem>("groups", {
        page: 1,
        limit: 100,
        academicYear: item.academicYear,
      }),
    enabled: can(PERMISSIONS.ADMISSIONS_GROUPS_MANAGE),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        if (!confirmed) return;
        setError("");
        try {
          await admissionAction(item._id, "approve", {
            ...values,
            groupId: values.groupId === "NONE" ? undefined : values.groupId,
            passedCourses: values.passedCourses
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            revision: item.revision,
            confirmed: true,
          });
          await onSaved();
        } catch (e) {
          setError(getAdmissionErrorMessage(e, t));
        }
      })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Choice
          label={t("fields.level")}
          value={form.watch("level")}
          onChange={(value) => form.setValue("level", value as "1")}
          options={["1", "2", "3", "4"].map((value) => ({
            value,
            label: t("levelNumber", { number: value }),
          }))}
        />
        <Choice
          label={t("fields.semester")}
          value={form.watch("semester")}
          onChange={(value) => form.setValue("semester", value as "1")}
          options={["1", "2"].map((value) => ({
            value,
            label: t("semesterNumber", { number: value }),
          }))}
        />
        <Field
          label={t("fields.department")}
          error={form.formState.errors.department?.message}
        >
          <AdmissionInput
            dir="ltr"
            className="text-left"
            {...form.register("department")}
          />
        </Field>
        <Field
          label={t("fields.passedCourses")}
          error={form.formState.errors.passedCourses?.message}
        >
          <AdmissionInput
            dir="ltr"
            className="text-left"
            {...form.register("passedCourses")}
            placeholder={t("courseCodesHint")}
          />
        </Field>
      </div>
      {can(PERMISSIONS.ADMISSIONS_GROUPS_MANAGE) && (
        <Choice
          label={t("fields.group")}
          value={form.watch("groupId")}
          onChange={(value) => form.setValue("groupId", value)}
          options={[
            { value: "NONE", label: t("noGroup") },
            ...(groups.data?.items ?? [])
              .filter(
                (group) =>
                  group.isEnabled &&
                  group.level === form.watch("level") &&
                  group.department === form.watch("department"),
              )
              .map((group) => ({
                value: group._id,
                label: `${group.nameAr || group.name} (${group.enrolled}/${group.capacity})`,
              })),
          ]}
        />
      )}
      <p>{t("approvalNotice")}</p>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={confirmed}
          onCheckedChange={(value) => setConfirmed(Boolean(value))}
        />
        {t("confirmApproval")}
      </label>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <DialogFooter className="rtl:sm:justify-start">
        <Button
          type="submit"
          disabled={
            !confirmed ||
            form.formState.isSubmitting ||
            item.duplicateReviewRequired
          }
        >
          {t("approve")}
        </Button>
      </DialogFooter>
    </form>
  );
}
function DecisionForm({
  item,
  action,
  onSaved,
}: {
  item: AdmissionRequestItem;
  action: string;
  onSaved: () => Promise<void>;
}) {
  const { t, locale } = useAdmissionUI(),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const form = useForm<{ reason: string; reasonCode: string }>({
    defaultValues: { reason: "", reasonCode: "INELIGIBLE" },
  });
  const needsReason =
    action !== "reject" || form.watch("reasonCode") === "OTHER";
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        if (!confirmed) return;
        setError("");
        try {
          const reasonText =
            values.reason.trim() ||
            (action === "reject" ? t(`reasons.${values.reasonCode}`) : action);
          await admissionAction(item._id, action, {
            revision: item.revision,
            reason: reasonText,
            ...(action === "reject" ? { reasonCode: values.reasonCode } : {}),
            confirmed: true,
          });
          await onSaved();
        } catch (e) {
          setError(getAdmissionErrorMessage(e, t));
        }
      })}
    >
      {action === "cancel" && item.status === "APPROVED" && (
        <p className="text-warning text-sm">{t("cancellationCodeHeld")}</p>
      )}
      {action === "reject" && (
        <Choice
          label={t("reasonCode")}
          value={form.watch("reasonCode")}
          onChange={(value) => form.setValue("reasonCode", value)}
          options={ADMISSION_REJECTION_REASONS.map((value) => ({
            value,
            label: t(`reasons.${value}`),
          }))}
        />
      )}
      <Field
        label={`${t("reason")} ${!needsReason ? (locale === "ar" ? "(اختياري)" : "(Optional)") : ""}`}
        error={form.formState.errors.reason?.message}
      >
        <textarea
          className="min-h-20 rounded-xl border border-border/80 bg-background p-3 text-sm focus:border-primary focus:outline-none"
          placeholder={
            !needsReason
              ? locale === "ar"
                ? "ملاحظات إضافية توضيحية لسبب الرفض (اختياري)..."
                : "Additional explanatory notes (optional)..."
              : t("reason")
          }
          {...form.register("reason", {
            validate: (value) =>
              !needsReason ||
              Boolean(value.trim()) ||
              t("errors.reasonRequired"),
            maxLength: { value: 1000, message: t("invalid") },
          })}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <Checkbox
          checked={confirmed}
          onCheckedChange={(value) => setConfirmed(Boolean(value))}
        />
        <span>{t("confirmDecision")}</span>
      </label>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <DialogFooter className="rtl:sm:justify-start">
        <Button
          type="submit"
          variant={
            action === "reject" || action === "cancel"
              ? "destructive"
              : "default"
          }
          disabled={!confirmed || form.formState.isSubmitting}
        >
          {t(action === "cancel" ? "cancelAdmission" : action)}
        </Button>
      </DialogFooter>
    </form>
  );
}
