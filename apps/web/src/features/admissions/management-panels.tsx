"use client";
import { AdmissionSection } from "./admission-section";
import { AcademicYearChoice } from "./academic-year-choice";
import { getAdmissionErrorMessage } from "./admission-error";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import QRCode from "qrcode";
import {
  isAdmissionAcademicYear,
  type AdmissionAccessItem,
  type AdmissionAccessSecret,
  type AdmissionGroupItem,
} from "@student-portal/shared";
import { useTableState } from "@/hooks/use-table-state";
import {
  DataTableShell,
  type ColumnDef,
} from "@/components/ui/data-table-shell";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { TableCell } from "@/components/ui/table";
import { getApiErrorDetails, getApiErrorMessage } from "@/lib/api";
import { cairoDateTimeToIso, toCairoDateTimeLocal } from "@/lib/cairo-time";
import { exportElementToPng } from "@/lib/export-utils";
import { cn } from "@/lib/cn";
import { Ban, Edit2, Loader2, QrCode, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { listStudents } from "@/features/students/api";
import { listAdmissionPeriods } from "./api";
import {
  admissionAccessCreate,
  admissionAccessDelete,
  admissionAccessGetSecret,
  admissionAccessRevoke,
  admissionGroupDelete,
  admissionGroupSave,
  admissionGroupStudents,
  admissionList,
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

function selectionColumn<T extends { _id: string }>(
  rows: T[],
  selected: string[],
  onChange: (ids: string[]) => void,
  select: string,
  selectAll: string,
): ColumnDef<T> {
  return {
    key: "selection",
    header: (
      <Checkbox
        aria-label={selectAll}
        checked={Boolean(
          rows.length && rows.every((row) => selected.includes(row._id)),
        )}
        onCheckedChange={(value) =>
          onChange(value ? rows.map((row) => row._id) : [])
        }
        className="mx-auto"
      />
    ),
    className: "w-12 px-4 py-3 text-center",
    render: (row) => (
      <TableCell className="w-12 px-4 py-3 text-center">
        <Checkbox
          aria-label={select}
          checked={selected.includes(row._id)}
          onCheckedChange={(value) =>
            onChange(
              value
                ? [...selected, row._id]
                : selected.filter((id) => id !== row._id),
            )
          }
          className="mx-auto"
        />
      </TableCell>
    ),
  };
}
export function AdmissionAccessPanel() {
  const { t, date, userId, isAdmin } = useAdmissionUI(),
    client = useQueryClient(),
    state = useTableState({ defaultFilters: {} });
  const [creating, setCreating] = useState(false),
    [secret, setSecret] = useState<AdmissionAccessSecret | null>(null),
    [revoke, setRevoke] = useState<string[] | null>(null),
    [deleteAccessItem, setDeleteAccessItem] = useState<string | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["admission-access", state.page, userId],
    queryFn: () =>
      admissionList<AdmissionAccessItem>("access", {
        page: state.page,
        limit: state.limit,
      }),
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  const rows = query.data?.items ?? [];
  const columns: ColumnDef<AdmissionAccessItem>[] = [
    selectionColumn(
      rows,
      state.selectedKeys,
      state.setSelectedKeys,
      t("select"),
      t("selectAll"),
    ),
    {
      key: "label",
      header: t("fields.label"),
      render: (row) => (
        <TableCell className="font-semibold text-foreground">
          {row.label}
        </TableCell>
      ),
    },
    {
      key: "year",
      header: t("fields.academicYear"),
      render: (row) => (
        <TableCell>
          <bdi>{row.academicYear}</bdi>
        </TableCell>
      ),
    },
    {
      key: "method",
      header: t("fields.method"),
      render: (row) => (
        <TableCell>
          <span className="inline-flex items-center rounded-squircle bg-surface/80 px-2 py-0.5 text-xs font-medium border border-border">
            {t(`methods.${row.method}`)}
          </span>
        </TableCell>
      ),
    },
    {
      key: "expiry",
      header: t("fields.expiresAt"),
      render: (row) => (
        <TableCell className="text-muted-foreground">
          {date(row.expiresAt)}
        </TableCell>
      ),
    },
    {
      key: "uses",
      header: t("uses"),
      render: (row) => (
        <TableCell>
          <bdi className="font-mono text-xs">
            {row.usedCount} / {row.maxRegistrations}
          </bdi>
        </TableCell>
      ),
    },
    {
      key: "status",
      header: t("statusLabel"),
      render: (row) => {
        const isRevoked = row.status === "REVOKED";
        const isExpired = new Date(row.expiresAt) <= new Date();
        const isExhausted = row.usedCount >= row.maxRegistrations;
        const statusKey =
          row.effectiveStatus ??
          (isRevoked
            ? "REVOKED"
            : isExpired
              ? "EXPIRED"
              : isExhausted
                ? "EXHAUSTED"
                : "ACTIVE");
        const variantClass =
          statusKey === "ACTIVE"
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            : statusKey === "REVOKED"
              ? "bg-danger/10 text-danger border-danger/20"
              : "bg-amber-500/10 text-amber-400 border-amber-500/20";
        return (
          <TableCell>
            <span
              className={cn(
                "inline-flex items-center rounded-squircle px-2.5 py-0.5 text-xs font-semibold border",
                variantClass,
              )}
            >
              {t(`accessStatus.${statusKey}`)}
            </span>
            {row.pinConfigurationIssue && (
              <p className="mt-2 max-w-xs text-xs text-warning">
                {t("pinConfigurationIssue")}
              </p>
            )}
            {statusKey === "PERIOD_SCHEDULED" && row.periodOpensAt && (
              <p className="mt-2 text-xs text-muted-foreground">
                {date(row.periodOpensAt)}
              </p>
            )}
          </TableCell>
        );
      },
    },
    {
      key: "actions",
      header: t("actions"),
      className: "text-center",
      render: (row) => (
        <TableCell className="text-center">
          <AdmissionMenu
            actions={[
              {
                label: t("viewPoster"),
                icon: <QrCode className="h-4 w-4" />,
                onClick: async () => {
                  try {
                    const secretData = await admissionAccessGetSecret(row._id);
                    setSecret(secretData);
                  } catch {
                    setSecret(row as AdmissionAccessSecret);
                  }
                },
              },
              {
                label: t("revoke"),
                icon: <Ban className="h-4 w-4" />,
                disabled: row.status === "REVOKED",
                onClick: () => setRevoke([row._id]),
              },
              ...(isAdmin
                ? [
                    {
                      label: t("deleteAccess"),
                      icon: <Trash2 className="h-4 w-4" />,
                      variant: "destructive" as const,
                      onClick: () => setDeleteAccessItem(row._id),
                    },
                  ]
                : []),
            ]}
          />
        </TableCell>
      ),
    },
  ];
  return (
    <div className="space-y-4">
      <AdmissionSection
        title={t("tabs.access")}
        description={t("accessDescription")}
        icon={<QrCode className="h-5 w-5" />}
        actions={
          <Button onClick={() => setCreating(true)}>{t("createAccess")}</Button>
        }
      />
      <div className="flex gap-3">
        {state.selectedKeys.length > 0 && (
          <Button
            variant="outline"
            onClick={() => setRevoke(state.selectedKeys)}
          >
            {t("revokeSelected")}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <DataTableShell
        data={rows}
        columns={columns}
        keyExtractor={(row) => row._id}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => query.refetch()}
        emptyMessage={t("empty")}
      />
      <AdmissionPagination
        page={state.page}
        totalPages={query.data?.totalPages ?? 1}
        onPage={state.setPage}
      />
      {creating && (
        <AdmissionDialog
          open
          onClose={() => setCreating(false)}
          title={t("createAccess")}
        >
          <AccessForm
            onCancel={() => setCreating(false)}
            onSave={async (value) => {
              setSecret(value);
              setCreating(false);
              await client.invalidateQueries({
                queryKey: ["admission-access"],
              });
            }}
          />
        </AdmissionDialog>
      )}
      {secret && (
        <AdmissionPoster secret={secret} onClose={() => setSecret(null)} />
      )}
      <ConfirmDialog
        open={Boolean(revoke)}
        onOpenChange={(open) => {
          if (!open && !pending) setRevoke(null);
        }}
        title={t("revoke")}
        description={t("confirmRevoke")}
        confirmLabel={t("revoke")}
        cancelLabel={t("close")}
        disabled={pending}
        onConfirm={async () => {
          setPending(true);
          setError("");
          try {
            for (const id of revoke ?? []) await admissionAccessRevoke(id);
            setRevoke(null);
            state.setSelectedKeys([]);
          } catch (e) {
            setError(getAdmissionErrorMessage(e, t));
          } finally {
            setPending(false);
            await client.invalidateQueries({ queryKey: ["admission-access"] });
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteAccessItem)}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleteAccessItem(null);
        }}
        title={t("deleteAccess")}
        description={t("confirmDeleteAccess")}
        confirmLabel={t("deleteAccess")}
        cancelLabel={t("close")}
        destructive
        disabled={pending}
        onConfirm={async () => {
          if (!deleteAccessItem) return;
          setPending(true);
          setError("");
          try {
            await admissionAccessDelete(deleteAccessItem);
            setDeleteAccessItem(null);
            state.setSelectedKeys(
              state.selectedKeys.filter((id) => id !== deleteAccessItem),
            );
          } catch (e) {
            setError(getAdmissionErrorMessage(e, t));
          } finally {
            setPending(false);
            await client.invalidateQueries({ queryKey: ["admission-access"] });
          }
        }}
      />
    </div>
  );
}
function AccessForm({
  onSave,
  onCancel,
}: {
  onSave: (value: AdmissionAccessSecret) => Promise<void>;
  onCancel: () => void;
}) {
  const { t, locale, date } = useAdmissionUI(),
    [error, setError] = useState("");
  const schema = z.object({
    label: z.string().trim().min(2, t("invalid")).max(120, t("invalid")),
    admissionPeriodId: z.string().regex(/^[a-f0-9]{24}$/, t("invalid")),
    method: z.enum(["PIN", "QR", "BOTH"]),
    pin: z
      .string()
      .refine((value) => !value || /^\d{8,12}$/.test(value), t("pinHint")),
    expiresAt: z
      .string()
      .refine((value) => Boolean(cairoDateTimeToIso(value)), t("invalid")),
    maxRegistrations: z.number().int().min(1).max(100000),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      label: "",
      admissionPeriodId: "",
      method: "BOTH",
      pin: "",
      expiresAt: "",
      maxRegistrations: 1000,
    },
  });
  const periods = useQuery({
    queryKey: ["admission-access-periods"],
    queryFn: () => listAdmissionPeriods({ page: 1, limit: 100 }),
  });
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={form.handleSubmit(async (value) => {
        setError("");
        try {
          await onSave(
            await admissionAccessCreate({
              ...value,
              pin: value.pin || undefined,
              expiresAt: cairoDateTimeToIso(value.expiresAt),
            }),
          );
        } catch (e) {
          const details = getApiErrorDetails(e);
          const rawMsg = details.message ?? "";
          const msg =
            details.code === "ADMISSION_PERIOD_EXPIRY_MISMATCH" ||
            rawMsg.includes("inside the admission period")
              ? locale === "ar"
                ? "يجب أن يقع موعد انتهاء الدعوة داخل نطاق فترة القبول المحددة."
                : "Invitation expiry must fall inside the admission period."
              : details.code === "ADMISSIONS_SECURITY_CONFIGURATION" ||
                  rawMsg.includes("encryption") ||
                  rawMsg.includes("security keys")
                ? locale === "ar"
                  ? "يجب ضبط مفاتيح تشفير وتأمين القبول أولاً."
                  : "Admission encryption and security keys must be configured."
                : details.code === "ADMISSION_PIN_EXISTS" ||
                    rawMsg.includes("active invitation already uses this PIN")
                  ? locale === "ar"
                    ? "رمز الدخول هذا مستخدم بالفعل في دعوة نشطة. اختر رمزاً آخر أو اتركه فارغاً لإنشائه تلقائياً."
                    : "An active invitation already uses this PIN. Choose another PIN or generate one automatically."
                  : getAdmissionErrorMessage(e, t);
          setError(msg);
        }
      })}
    >
      <Field
        label={t("fields.label")}
        error={form.formState.errors.label?.message}
      >
        <AdmissionInput {...form.register("label")} />
      </Field>
      <Choice
        label={t("fields.period")}
        value={form.watch("admissionPeriodId")}
        onChange={(value) => {
          form.setValue("admissionPeriodId", value, { shouldValidate: true });
          const target = periods.data?.items?.find((p) => p._id === value);
          if (target?.closesAt) {
            form.setValue("expiresAt", toCairoDateTimeLocal(target.closesAt), {
              shouldValidate: true,
            });
          }
        }}
        options={(periods.data?.items ?? []).map((period) => ({
          value: period._id,
          label: `${locale === "ar" ? period.nameAr || period.name : period.name} (${period.academicYear})`,
        }))}
      />
      {(() => {
        const selected = periods.data?.items?.find(
          (p) => p._id === form.watch("admissionPeriodId"),
        );
        if (!selected) return null;
        return (
          <div className="rounded-lg bg-teal-500/10 border border-teal-500/20 px-3 py-2 text-xs text-teal-300">
            <span className="font-medium text-teal-400">
              {locale === "ar"
                ? "النطاق الزمني لفترة القبول: "
                : "Admission period range: "}
            </span>
            <span className="font-bold">{date(selected.opensAt)}</span>
            <span className="mx-1.5">—</span>
            <span className="font-bold">{date(selected.closesAt)}</span>
          </div>
        );
      })()}
      {form.formState.errors.admissionPeriodId && (
        <p className="text-danger">{t("invalid")}</p>
      )}
      {periods.isError && (
        <Button type="button" onClick={() => periods.refetch()}>
          {t("retry")}
        </Button>
      )}
      <Choice
        label={t("fields.method")}
        value={form.watch("method")}
        onChange={(value) => form.setValue("method", value as "BOTH")}
        options={["PIN", "QR", "BOTH"].map((value) => ({
          value,
          label: t(`methods.${value}`),
        }))}
      />
      {form.watch("method") !== "QR" && (
        <Field
          label={t("fields.pin")}
          error={form.formState.errors.pin?.message}
        >
          <AdmissionInput
            {...form.register("pin")}
            dir="ltr"
            className="text-left"
            inputMode="numeric"
            maxLength={12}
            placeholder={t("automaticPin")}
          />
          <span className="text-xs text-muted-foreground">{t("pinHint")}</span>
        </Field>
      )}
      <Field
        label={t("fields.expiresAt")}
        error={form.formState.errors.expiresAt?.message}
      >
        <DateTimePicker
          value={form.watch("expiresAt")}
          onChange={(value) =>
            form.setValue("expiresAt", value, { shouldValidate: true })
          }
          locale={locale}
          timeZone="Africa/Cairo"
        />
      </Field>
      <p className="text-xs">{t("cairoHint")}</p>
      <Field
        label={t("fields.maxRegistrations")}
        error={form.formState.errors.maxRegistrations?.message}
      >
        <AdmissionInput
          type="number"
          dir="ltr"
          className="text-left"
          {...form.register("maxRegistrations", { valueAsNumber: true })}
          min={1}
          max={100000}
        />
      </Field>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4 sm:col-span-2 rtl:justify-start">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={form.formState.isSubmitting}
        >
          {t("close")}
        </Button>
        <Button disabled={form.formState.isSubmitting}>
          {t("createAccess")}
        </Button>
      </div>
    </form>
  );
}
function AdmissionPoster({
  secret,
  onClose,
}: {
  secret: AdmissionAccessSecret;
  onClose: () => void;
}) {
  const { t, locale, dir, date } = useAdmissionUI(),
    [qr, setQr] = useState(""),
    [error, setError] = useState(""),
    poster = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const url = origin
    ? `${origin}/${locale}/admission#access=${secret._id}${secret.token ? `&token=${secret.token}` : ""}`
    : "";
  useEffect(() => {
    let cancelled = false;
    if (url)
      QRCode.toDataURL(url, { width: 320, margin: 2 })
        .then((value) => {
          if (!cancelled) setQr(value);
        })
        .catch(() => {
          if (!cancelled) setError(t("failed"));
        });
    return () => {
      cancelled = true;
    };
  }, [url, t]);
  const print = () => {
    if (!poster.current) return;
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.append(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      return;
    }
    const style = doc.createElement("style");
    style.textContent = `
      @page { size: A4 portrait; margin: 15mm; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; text-align: center; color: #0f172a; background: #ffffff; margin: 0; padding: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .poster-logo { width: 80px; height: 80px; margin: 0 auto 8px; display: block; object-fit: contain; }
      .institute-title { font-size: 16px; font-weight: bold; color: #1e293b; margin-bottom: 8px; }
      .poster-label { font-size: 24px; font-weight: 800; color: #0f172a; margin: 8px 0; }
      .poster-year { font-size: 15px; color: #475569; margin-bottom: 16px; }
      .poster-qr { width: 280px; height: 280px; margin: 0 auto 16px; display: block; }
      .poster-instructions { font-size: 14px; color: #334155; margin-bottom: 6px; font-weight: 600; }
      .poster-url { font-family: monospace; font-size: 11px; word-break: break-all; color: #0d9488; text-decoration: none; display: block; margin-bottom: 16px; }
      .highlight-card { border: 2px solid #0d9488; background-color: #f0fdfa !important; padding: 16px; border-radius: 12px; margin: 16px auto; max-width: 380px; }
      .pin-title { font-size: 12px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
      .pin-value { font-family: monospace; font-size: 32px; font-weight: 900; letter-spacing: 4px; color: #0f766e; }
      .expiry-line { font-size: 13px; color: #0f172a; margin-top: 10px; padding-top: 10px; border-top: 1px solid #ccfbf1; font-weight: 600; }
    `;
    doc.head.append(style);
    doc.body.dir = dir;
    doc.body.append(poster.current.cloneNode(true));
    const ready = Array.from(doc.images).map((image) =>
      image.decode().catch(() => undefined),
    );
    void Promise.all(ready).then(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1000);
    });
  };
  return (
    <AdmissionDialog open onClose={onClose} title={t("poster")}>
      <p role="alert" className="text-sm text-muted-foreground">
        {t("secretOnce")}
      </p>
      <div
        ref={poster}
        className="space-y-4 rounded-xl bg-white p-6 text-center text-slate-900 shadow-sm border border-border/40"
        dir={dir}
      >
        <img
          src="/logo.webp"
          alt="Institute Logo"
          width={80}
          height={80}
          className="poster-logo mx-auto h-20 w-20 object-contain"
        />
        <h3 className="institute-title text-base font-bold text-slate-800">
          المعهد العالي للعلوم الإدارية المتقدمة والحاسبات (47 ك)
        </h3>
        <h2 className="poster-label text-2xl font-extrabold text-slate-950">
          {secret.label}
        </h2>
        <p className="poster-year text-sm text-slate-600">
          <bdi>{secret.academicYear}</bdi>
        </p>
        {qr && (
          <img
            src={qr}
            width={280}
            height={280}
            alt={t("qrAlt")}
            className="poster-qr mx-auto rounded-lg"
          />
        )}
        <p className="poster-instructions text-sm font-semibold text-slate-700">
          {t("posterInstructions")}
        </p>
        <a
          className="poster-url block break-all text-xs font-mono text-teal-700 hover:underline"
          dir="ltr"
          href={url}
        >
          {url}
        </a>
        <div className="highlight-card mx-auto my-4 max-w-sm rounded-2xl border-2 border-teal-600/40 bg-teal-50/90 p-4 text-center">
          {secret.method !== "QR" &&
            (secret.pin ? (
              <div className="mb-2">
                <span className="pin-title block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  {t("fields.pin")}
                </span>
                <bdi className="pin-value font-mono text-3xl font-black tracking-widest text-teal-900">
                  {secret.pin}
                </bdi>
              </div>
            ) : (
              <div className="mb-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                <span>
                  {locale === "ar"
                    ? "تم إنشاء هذه الدعوة قبل تفعيل الحفظ المشفر لرمز PIN. لعرض الرمز يرجى إنشاء دعوة جديدة."
                    : "This invitation was created before PIN cipher was active. Create a new invitation to view its PIN."}
                </span>
              </div>
            ))}
          <div
            className={cn(
              "expiry-line text-xs font-medium text-slate-700",
              secret.method !== "QR" && "border-t border-teal-200/80 pt-2",
            )}
          >
            <span className="text-slate-500">{t("fields.expiresAt")}: </span>
            <span className="font-bold text-teal-950">
              {date(secret.expiresAt)}
            </span>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={!qr}
          onClick={() =>
            exportElementToPng(poster.current, "admission-poster.png").catch(
              () => setError(t("failed")),
            )
          }
        >
          {t("downloadPoster")}
        </Button>
        <Button variant="outline" disabled={!qr} onClick={print}>
          {t("print")}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            navigator.clipboard
              .writeText(url)
              .catch(() => setError(t("failed")))
          }
        >
          {t("copyLink")}
        </Button>
      </div>
    </AdmissionDialog>
  );
}
export function AdmissionGroupsPanel() {
  const { t, userId, locale, isAdmin } = useAdmissionUI(),
    client = useQueryClient(),
    state = useTableState({ defaultFilters: { academicYear: "" } }),
    [editing, setEditing] = useState<AdmissionGroupItem | "create" | null>(
      null,
    ),
    [inspect, setInspect] = useState(false),
    [viewingGroup, setViewingGroup] = useState<AdmissionGroupItem | null>(null),
    [deleteGroupTarget, setDeleteGroupTarget] =
      useState<AdmissionGroupItem | null>(null),
    [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const query = useQuery({
    queryKey: [
      "admission-groups",
      state.page,
      state.filters.academicYear,
      userId,
    ],
    queryFn: () =>
      admissionList<AdmissionGroupItem>("groups", {
        page: state.page,
        limit: state.limit,
        academicYear: state.filters.academicYear || undefined,
      }),
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  const rows = query.data?.items ?? [];
  const columns: ColumnDef<AdmissionGroupItem>[] = [
    selectionColumn(
      rows,
      state.selectedKeys,
      state.setSelectedKeys,
      t("select"),
      t("selectAll"),
    ),
    {
      key: "name",
      header: t("fields.name"),
      render: (row) => (
        <TableCell className="font-semibold text-foreground">
          {locale === "ar" ? row.nameAr || row.name : row.name}
        </TableCell>
      ),
    },
    {
      key: "year",
      header: t("fields.academicYear"),
      render: (row) => (
        <TableCell>
          <bdi>{row.academicYear}</bdi>
        </TableCell>
      ),
    },
    {
      key: "level",
      header: t("fields.level"),
      render: (row) => (
        <TableCell>{t("levelNumber", { number: row.level })}</TableCell>
      ),
    },
    {
      key: "department",
      header: t("fields.department"),
      render: (row) => (
        <TableCell>
          <bdi>{row.department}</bdi>
        </TableCell>
      ),
    },
    {
      key: "capacity",
      header: t("fields.capacity"),
      render: (row) => (
        <TableCell>
          <bdi className="font-mono text-xs">
            {row.enrolled} / {row.capacity}
          </bdi>
        </TableCell>
      ),
    },
    {
      key: "enabled",
      header: t("statusLabel"),
      render: (row) => (
        <TableCell>
          <span
            className={cn(
              "inline-flex items-center rounded-squircle px-2.5 py-0.5 text-xs font-semibold border",
              row.isEnabled
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-surface text-muted-foreground border-border",
            )}
          >
            {t(row.isEnabled ? "enabled" : "disabled")}
          </span>
        </TableCell>
      ),
    },
    {
      key: "actions",
      header: t("actions"),
      className: "text-center",
      render: (row) => (
        <TableCell className="text-center">
          <AdmissionMenu
            actions={[
              {
                label:
                  locale === "ar"
                    ? "عرض طلاب المجموعة"
                    : t("viewGroupStudents"),
                icon: <Users className="h-4 w-4 text-primary" />,
                onClick: () => setViewingGroup(row),
              },
              {
                label: locale === "ar" ? "تعديل المجموعة" : t("edit"),
                icon: <Edit2 className="h-4 w-4 text-foreground/80" />,
                onClick: () => setEditing(row),
              },
              ...(isAdmin
                ? [
                    {
                      label: locale === "ar" ? "حذف المجموعة" : "Delete Group",
                      icon: <Trash2 className="h-4 w-4 text-danger" />,
                      variant: "destructive" as const,
                      onClick: () => setDeleteGroupTarget(row),
                    },
                  ]
                : []),
            ]}
          />
        </TableCell>
      ),
    },
  ];
  return (
    <div className="space-y-4">
      <AdmissionSection
        title={t("tabs.groups")}
        description={t("groupsDescription")}
        icon={<Users className="h-5 w-5" />}
        actions={
          <Button onClick={() => setEditing("create")}>
            {t("createGroup")}
          </Button>
        }
      />
      <div className="flex flex-wrap gap-3">
        <div className="w-full sm:w-60">
          <AcademicYearChoice
            includeAll
            value={state.filters.academicYear ?? ""}
            onChange={(value) => state.setFilter("academicYear", value)}
          />
        </div>
        {state.selectedKeys.length > 0 && (
          <Button variant="outline" onClick={() => setInspect(true)}>
            {t("inspectSelected", { count: state.selectedKeys.length })}
          </Button>
        )}
      </div>
      <DataTableShell
        data={rows}
        columns={columns}
        keyExtractor={(row) => row._id}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => query.refetch()}
        emptyMessage={t("empty")}
      />
      <AdmissionPagination
        page={state.page}
        totalPages={query.data?.totalPages ?? 1}
        onPage={state.setPage}
      />
      {editing && (
        <AdmissionDialog
          open
          onClose={() => setEditing(null)}
          title={t(editing === "create" ? "createGroup" : "edit")}
        >
          <GroupForm
            onCancel={() => setEditing(null)}
            initial={editing === "create" ? undefined : editing}
            onSaved={async () => {
              await client.invalidateQueries({
                queryKey: ["admission-groups"],
              });
              setEditing(null);
            }}
          />
        </AdmissionDialog>
      )}
      <AdmissionDialog
        open={inspect}
        onClose={() => setInspect(false)}
        title={t("inspectSelected", { count: state.selectedKeys.length })}
      >
        {rows
          .filter((row) => state.selectedKeys.includes(row._id))
          .map((row) => (
            <p key={row._id}>
              {row.name} ·{" "}
              <bdi>
                {row.enrolled}/{row.capacity}
              </bdi>
            </p>
          ))}
      </AdmissionDialog>
      {viewingGroup && (
        <GroupStudentsDialog
          group={viewingGroup}
          onClose={() => setViewingGroup(null)}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteGroupTarget)}
        onOpenChange={(open) => !open && setDeleteGroupTarget(null)}
        title={locale === "ar" ? "حذف المجموعة الدراسية" : "Delete Study Group"}
        description={
          locale === "ar"
            ? `هل أنت متأكد من حذف المجموعة "${deleteGroupTarget?.nameAr || deleteGroupTarget?.name}"؟ لا يمكن حذف مجموعة تحتوي على طلاب مسجلين.`
            : `Are you sure you want to delete group "${deleteGroupTarget?.name}"? Groups with enrolled students cannot be deleted.`
        }
        confirmLabel={locale === "ar" ? "حذف المجموعة" : "Delete Group"}
        cancelLabel={locale === "ar" ? "إلغاء" : "Cancel"}
        destructive
        disabled={isDeletingGroup}
        onConfirm={async () => {
          if (!deleteGroupTarget) return;
          setIsDeletingGroup(true);
          try {
            await admissionGroupDelete(deleteGroupTarget._id);
            toast.success(
              locale === "ar"
                ? "تم حذف المجموعة بنجاح"
                : "Group deleted successfully",
            );
            setDeleteGroupTarget(null);
            await client.invalidateQueries({ queryKey: ["admission-groups"] });
          } catch (e) {
            toast.error(
              getApiErrorMessage(
                e,
                locale === "ar"
                  ? "تعذر حذف المجموعة"
                  : "Failed to delete group",
              ),
            );
          } finally {
            setIsDeletingGroup(false);
          }
        }}
      />
    </div>
  );
}

function GroupStudentsDialog({
  group,
  onClose,
}: {
  group: AdmissionGroupItem;
  onClose: () => void;
}) {
  const { t, locale, dir } = useAdmissionUI();
  const studentsQuery = useQuery({
    queryKey: ["group-students", group._id],
    queryFn: async () => {
      return admissionGroupStudents(group._id);
    },
  });

  return (
    <AdmissionDialog
      open
      onClose={onClose}
      title={`${locale === "ar" ? "طلاب المجموعة" : "Group Students"}: ${locale === "ar" ? group.nameAr || group.name : group.name}`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl border border-border/60 bg-surface/40">
            <span className="text-muted-foreground block text-[11px]">
              {t("fields.academicYear")}
            </span>
            <span className="font-mono font-bold text-foreground">
              {group.academicYear}
            </span>
          </div>
          <div className="p-2.5 rounded-xl border border-border/60 bg-surface/40">
            <span className="text-muted-foreground block text-[11px]">
              {t("fields.level")}
            </span>
            <span className="font-semibold text-foreground">
              {t("levelNumber", { number: group.level })}
            </span>
          </div>
          <div className="p-2.5 rounded-xl border border-border/60 bg-surface/40">
            <span className="text-muted-foreground block text-[11px]">
              {t("fields.department")}
            </span>
            <span className="font-mono font-bold text-foreground">
              {group.department}
            </span>
          </div>
          <div className="p-2.5 rounded-xl border border-border/60 bg-surface/40">
            <span className="text-muted-foreground block text-[11px]">
              {t("fields.capacity")}
            </span>
            <span className="font-mono font-bold text-teal-400">
              {group.enrolled} / {group.capacity}
            </span>
          </div>
        </div>

        {studentsQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center p-8 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">
              {t("loading")}
            </span>
          </div>
        ) : (studentsQuery.data?.length ?? 0) > 0 ? (
          <div className="max-h-[350px] overflow-y-auto rounded-xl border border-border/60">
            <table className="w-full text-xs" dir={dir}>
              <thead className="bg-surface/80 border-b border-border/60 text-muted-foreground sticky top-0 backdrop-blur-sm">
                <tr>
                  <th className="p-2.5 text-start font-semibold">
                    {t("studentCode")}
                  </th>
                  <th className="p-2.5 text-start font-semibold">
                    {t("fields.name")}
                  </th>
                  <th className="p-2.5 text-start font-semibold">
                    {t("fields.department")}
                  </th>
                  <th className="p-2.5 text-center font-semibold">
                    {t("statusLabel")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {studentsQuery.data!.map((st) => (
                  <tr
                    key={st._id}
                    className="hover:bg-surface/60 transition-colors"
                  >
                    <td className="p-2.5 font-mono font-bold text-primary">
                      <a
                        href={`/${locale}/admin/students?search=${encodeURIComponent(st.studentCode)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                        title={
                          locale === "ar" ? "عرض بيانات الطالب" : "View student"
                        }
                      >
                        {st.studentCode}
                      </a>
                    </td>
                    <td className="p-2.5 font-medium text-foreground">
                      {locale === "ar"
                        ? st.fullNameAr || st.fullName
                        : st.fullName}
                    </td>
                    <td className="p-2.5 font-mono">{st.department}</td>
                    <td className="p-2.5 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {t("enabled")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-xs text-muted-foreground">
            {t("noStudentsInGroup")}
          </div>
        )}
      </div>
    </AdmissionDialog>
  );
}

function GroupForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: AdmissionGroupItem;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const { t, locale } = useAdmissionUI(),
    [error, setError] = useState("");
  const schema = z.object({
    name: z.string().trim().min(1, t("invalid")).max(80),
    nameAr: z.string().max(80),
    academicYear: z.string().refine(isAdmissionAcademicYear, t("invalid")),
    level: z.enum(["1", "2", "3", "4"]),
    department: z.string().regex(/^[A-Z][A-Z0-9_-]{1,19}$/, t("invalid")),
    capacity: z.number().int().min(1).max(10000),
    isEnabled: z.boolean(),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? "",
      nameAr: initial?.nameAr ?? "",
      academicYear: initial?.academicYear ?? "",
      level: (initial?.level ?? "1") as "1",
      department: initial?.department ?? "GENERAL",
      capacity: initial?.capacity ?? 50,
      isEnabled: initial?.isEnabled ?? true,
    },
  });
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={form.handleSubmit(async (values) => {
        setError("");
        try {
          const { isEnabled, ...create } = values;
          await admissionGroupSave(
            initial?._id,
            initial
              ? {
                  nameAr: values.nameAr,
                  capacity: values.capacity,
                  isEnabled,
                  revision: initial.revision,
                }
              : create,
          );
          await onSaved();
        } catch (e) {
          setError(getAdmissionErrorMessage(e, t));
        }
      })}
    >
      <Field
        label={t("fields.name")}
        error={form.formState.errors.name?.message}
      >
        <AdmissionInput
          {...form.register("name")}
          disabled={Boolean(initial)}
        />
      </Field>
      <Field
        label={t("fields.nameAr")}
        error={form.formState.errors.nameAr?.message}
      >
        <AdmissionInput {...form.register("nameAr")} dir="rtl" />
      </Field>
      <AcademicYearChoice
        value={form.watch("academicYear")}
        onChange={(value) =>
          form.setValue("academicYear", value, { shouldValidate: true })
        }
        disabled={Boolean(initial)}
      />
      {form.formState.errors.academicYear && (
        <p role="alert" className="text-danger text-xs">
          {form.formState.errors.academicYear.message}
        </p>
      )}
      <Choice
        label={t("fields.level")}
        value={form.watch("level")}
        onChange={(val) => form.setValue("level", val as "1")}
        disabled={Boolean(initial)}
        options={["1", "2", "3", "4"].map((l) => ({
          value: l,
          label: t("levelNumber", { number: l }),
        }))}
      />
      <Field
        label={t("fields.department")}
        error={form.formState.errors.department?.message}
      >
        <AdmissionInput
          {...form.register("department")}
          dir="ltr"
          disabled={Boolean(initial)}
        />
      </Field>
      <Field
        label={t("fields.capacity")}
        error={form.formState.errors.capacity?.message}
      >
        <AdmissionInput
          type="number"
          {...form.register("capacity", { valueAsNumber: true })}
          min={1}
          max={10000}
          dir="ltr"
        />
      </Field>
      {initial && (
        <Choice
          label={t("statusLabel")}
          value={form.watch("isEnabled") ? "true" : "false"}
          onChange={(v) => form.setValue("isEnabled", v === "true")}
          options={[
            { value: "true", label: t("enabled") },
            { value: "false", label: t("disabled") },
          ]}
        />
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4 sm:col-span-2 rtl:justify-start">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={form.formState.isSubmitting}
        >
          {t("close")}
        </Button>
        <Button disabled={form.formState.isSubmitting}>{t("save")}</Button>
      </div>
    </form>
  );
}
