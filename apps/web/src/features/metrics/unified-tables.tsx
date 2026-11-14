"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  Copy,
  Database,
  Download,
  Layers,
  MoreVertical,
  Route,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { TableEmpty } from "@/components/ui/data-table-shell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Root as DropdownMenu,
  Content as DropdownMenuContent,
  Item as DropdownMenuItem,
  Trigger as DropdownMenuTrigger,
  Portal as DropdownMenuPortal,
} from "@radix-ui/react-dropdown-menu";
import * as Select from "@radix-ui/react-select";
import { useTableState } from "@/hooks/use-table-state";
import { exportMetricsToCsv } from "@/lib/export-utils";
import { ComplaintSearchInput } from "@/features/complaints/components/complaint-search-input";
import {
  CANONICAL_OPERATIONS,
  latencyTone,
  type MetricsSummaryResponse,
} from "./api";
import {
  buildDatabaseRows,
  buildRouteRows,
  type UnifiedDatabaseRow,
  type UnifiedRouteRow,
} from "./unified-model";

const size = 25;
const format = (value: number | null | undefined) =>
  value == null
    ? "—"
    : value.toLocaleString("en-GB", { maximumFractionDigits: 1 });

export function Ms({ value }: { value: number | null }) {
  return value == null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <bdi
      className={`inline-block rounded-squircle px-2 py-0.5 font-mono text-xs font-medium ${latencyTone(value, 100, 500)}`}
    >
      {format(value)} ms
    </bdi>
  );
}

function methodBadgeTone(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "POST":
      return "border-sky-500/30 bg-sky-500/10 text-sky-400";
    case "PUT":
    case "PATCH":
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";
    case "DELETE":
      return "border-rose-500/30 bg-rose-500/10 text-rose-400";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  }
}

function statusPillTone(status: string): string {
  if (status.startsWith("2")) {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-400";
  }
  if (status.startsWith("3")) {
    return "border-sky-500/25 bg-sky-500/10 text-sky-400";
  }
  if (status.startsWith("4")) {
    return "border-amber-500/25 bg-amber-500/10 text-amber-400";
  }
  if (status.startsWith("5")) {
    return "border-rose-500/25 bg-rose-500/10 text-rose-400";
  }
  return "border-border/60 bg-secondary/40 text-muted-foreground";
}

export function Filter({
  label,
  value,
  options,
  onChange,
  isAr,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
  isAr: boolean;
}) {
  return (
    <Select.Root
      value={value}
      onValueChange={onChange}
      dir={isAr ? "rtl" : "ltr"}
    >
      <Select.Trigger
        aria-label={label}
        className="min-w-36 rounded-squircle border border-border bg-card px-3 py-2 text-start text-xs transition-colors hover:border-primary/40"
      >
        <Select.Value placeholder={label} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          dir={isAr ? "rtl" : "ltr"}
          position="popper"
          sideOffset={4}
          className="z-50 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <Select.Viewport>
            {options.map(([key, title]) => (
              <Select.Item
                className="cursor-pointer rounded-squircle px-3 py-2 text-start text-xs outline-none data-highlighted:bg-accent"
                key={key}
                value={key}
              >
                <Select.ItemText>{title}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function MetricsTable<T extends { _id: string }>({
  title,
  description,
  icon,
  summaryStrip,
  rows,
  columns,
  filters,
  page,
  setPage,
  isAr,
  exportRows,
  open,
  emptyMessage,
  filterGridClassName,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  summaryStrip?: React.ReactNode;
  rows: T[];
  columns: DataTableColumn<T>[];
  filters: React.ReactNode;
  page: string;
  setPage: (page: string) => void;
  isAr: boolean;
  exportRows: (rows: T[]) => void;
  open: (row: T) => void;
  emptyMessage?: string;
  filterGridClassName?: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.max(1, Math.min(pages, Number(page) || 1));
  const visible = rows.slice((current - 1) * size, current * size);
  const selectedRows = rows.filter((row) => selected.includes(row._id));
  const all =
    visible.length > 0 && visible.every((row) => selected.includes(row._id));
  const some = visible.some((row) => selected.includes(row._id));
  const selection: DataTableColumn<T> = {
    key: "selection",
    className: "w-8 text-center",
    header: (
      <Checkbox
        aria-label={isAr ? "تحديد الصفحة" : "Select page"}
        checked={all ? true : some ? "indeterminate" : false}
        onCheckedChange={() =>
          setSelected(
            all
              ? selected.filter(
                  (key) => !visible.some((row) => row._id === key),
                )
              : [...new Set([...selected, ...visible.map((row) => row._id)])],
          )
        }
      />
    ),
    cell: (row) => (
      <Checkbox
        aria-label={`${isAr ? "تحديد" : "Select"} ${row._id}`}
        checked={selected.includes(row._id)}
        onCheckedChange={() =>
          setSelected(
            selected.includes(row._id)
              ? selected.filter((key) => key !== row._id)
              : [...selected, row._id],
          )
        }
      />
    ),
  };
  const actions: DataTableColumn<T> = {
    key: "actions",
    header: isAr ? "التفاصيل" : "Details",
    cell: (row) => (
      <DropdownMenu dir={isAr ? "rtl" : "ltr"}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${isAr ? "إجراءات" : "Actions"} ${row._id}`}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <div dir={isAr ? "rtl" : "ltr"}>
            {/* This Radix version inherits direction from the explicit root. */}
            <DropdownMenuContent
              align="end"
              className="z-50 space-y-1 rounded-xl border border-border bg-popover p-2 text-xs text-popover-foreground shadow-lg [&_[role=menuitem]]:flex [&_[role=menuitem]]:cursor-pointer [&_[role=menuitem]]:items-center [&_[role=menuitem]]:gap-2 [&_[role=menuitem]]:rounded-squircle [&_[role=menuitem]]:p-2 [&_[role=menuitem]]:outline-none [&_[data-highlighted]]:bg-accent"
            >
              <DropdownMenuItem onSelect={() => open(row)}>
                {isAr ? "عرض التفاصيل والعينات" : "View details and samples"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard
                    .writeText(row._id)
                    .then(() => toast.success(isAr ? "تم النسخ" : "Copied"))
                    .catch(() =>
                      toast.error(isAr ? "تعذر النسخ" : "Copy failed"),
                    );
                }}
              >
                <Copy className="h-4 w-4" />
                {isAr ? "نسخ الاسم" : "Copy name"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportRows([row])}>
                <Download className="h-4 w-4" />
                {isAr ? "تصدير CSV" : "Export CSV"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </div>
        </DropdownMenuPortal>
      </DropdownMenu>
    ),
  };
  return (
    <Card
      className="min-w-0 space-y-4 rounded-2xl border-border/70 bg-card/45 p-5 shadow-xs"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-4">
        <div className="flex min-w-0 basis-full items-start gap-3 sm:basis-0 sm:flex-1">
          {icon ? (
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
              {icon}
            </div>
          ) : null}
          <div>
            <h2 className="text-base font-bold text-foreground">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!rows.length}
          onClick={() => exportRows(selectedRows.length ? selectedRows : rows)}
        >
          <Download className="me-2 h-4 w-4" />
          {isAr ? "تصدير CSV" : "Export CSV"}
          {selectedRows.length > 0 && ` (${selectedRows.length})`}
        </Button>
      </div>

      {summaryStrip}

      <div className={filterGridClassName ?? "grid gap-2 sm:grid-cols-2 xl:grid-cols-5"}>{filters}</div>
      {selectedRows.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/10 p-3 text-xs">
          <span className="font-semibold text-primary">
            {selectedRows.length} {isAr ? "محدد" : "selected"}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            {isAr ? "إلغاء التحديد" : "Clear selection"}
          </Button>
        </div>
      )}
      <div className="max-h-[600px] overflow-auto rounded-xl border border-border/60 bg-background/25">
        {rows.length ? (
          <DataTable
            rows={visible}
            columns={[selection, ...columns, actions]}
          />
        ) : (
          <TableEmpty
            message={
              emptyMessage ?? (isAr
                ? "لا توجد نتائج مطابقة. جرّب تغيير المرشحات."
                : "No matching results. Try changing the filters.")
            }
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          <bdi className="font-semibold text-foreground">
            {format(rows.length)}
          </bdi>{" "}
          {isAr ? "نتيجة" : "results"} · {isAr ? "صفحة" : "Page"}{" "}
          <bdi className="font-mono text-foreground">{current}</bdi> /{" "}
          <bdi className="font-mono text-foreground">{pages}</bdi>
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={current <= 1}
            onClick={() => setPage(String(current - 1))}
          >
            {isAr ? "السابق" : "Previous"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={current >= pages}
            onClick={() => setPage(String(current + 1))}
          >
            {isAr ? "التالي" : "Next"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function UnifiedPerformanceTables({
  data,
  isAr,
}: {
  data: MetricsSummaryResponse;
  isAr: boolean;
}) {
  const { filters, setFilter } = useTableState({
    defaultFilters: {
      routeSearch: "",
      routeMethod: "all",
      routeScope: "all",
      routeSort: "p95",
      routePage: "1",
      dbSearch: "",
      dbCollection: "all",
      dbOperation: "all",
      dbPhase: "all",
      dbThreshold: "0",
      dbPage: "1",
    },
  });
  const [detail, setDetail] = useState<
    UnifiedRouteRow | UnifiedDatabaseRow | null
  >(null);
  const routes = useMemo(() => buildRouteRows(data), [data]);
  const database = useMemo(() => buildDatabaseRows(data), [data]);
  const text = useCallback((ar: string, en: string) => (isAr ? ar : en), [isAr]);

  const routeStats = useMemo(() => {
    const activeInWindow = routes.filter((r) => r.windowCalls > 0).length;
    const uncalled = routes.filter(
      (r) => !r.lifetimeCalls && !r.windowCalls,
    ).length;
    const withErrors = routes.filter((r) => r.windowErrors > 0).length;
    const withSlowTraces = routes.filter((r) => r.traces.length > 0).length;
    const totalWindowCalls = routes.reduce((s, r) => s + r.windowCalls, 0);
    const totalTraces = routes.reduce((s, r) => s + r.traces.length, 0);
    return {
      total: routes.length,
      activeInWindow,
      uncalled,
      withErrors,
      withSlowTraces,
      totalWindowCalls,
      totalTraces,
    };
  }, [routes]);

  const dbStats = useMemo(() => {
    const totalSlow = database.reduce((s, r) => s + r.count, 0);
    const totalCold = database.reduce((s, r) => s + r.coldStartCount, 0);
    const totalSamples = database.reduce((s, r) => s + r.samples.length, 0);
    const peakMaxMs = database.reduce((m, r) => Math.max(m, r.maxMs || 0), 0);
    return {
      totalShapes: database.length,
      totalSlow,
      totalCold,
      steadyState: Math.max(0, totalSlow - totalCold),
      totalSamples,
      peakMaxMs,
    };
  }, [database]);

  const methods = [
    ...new Set([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
      ...(data.http.availableMethods ?? []),
      ...routes.map((row) => row.method),
    ]),
  ].sort();
  const collections = [
    ...new Set([
      ...(data.database.availableCollections ?? []),
      ...database.map((row) => row.collection),
    ]),
  ].sort();
  const operations = [
    ...new Set([
      ...CANONICAL_OPERATIONS,
      ...(data.database.availableOperations ?? []),
      ...database.map((row) => row.operation),
    ]),
  ].sort();
  const filteredRoutes = useMemo(
    () =>
      routes
        .filter((row) => {
          if (
            !row.route.toLowerCase().includes(filters.routeSearch.toLowerCase())
          )
            return false;
          if (
            filters.routeMethod !== "all" &&
            row.method !== filters.routeMethod
          )
            return false;
          return filters.routeScope === "active"
            ? row.windowCalls > 0
            : filters.routeScope === "uncalled"
              ? !row.lifetimeCalls && !row.windowCalls
              : filters.routeScope === "slow"
                ? row.traces.length > 0
                : filters.routeScope === "errors"
                  ? row.windowErrors > 0
                  : true;
        })
        .sort((a, b) =>
          filters.routeSort === "route"
            ? a.route.localeCompare(b.route)
            : filters.routeSort === "calls"
              ? b.windowCalls - a.windowCalls
              : filters.routeSort === "lifetime"
                ? (b.avgMs ?? -1) - (a.avgMs ?? -1)
                : (b.p95Ms ?? -1) - (a.p95Ms ?? -1) ||
                  b.lifetimeCalls - a.lifetimeCalls ||
                  a.route.localeCompare(b.route),
        ),
    [
      routes,
      filters.routeSearch,
      filters.routeMethod,
      filters.routeScope,
      filters.routeSort,
    ],
  );
  const filteredDatabase = useMemo(
    () =>
      database
        .filter((row) => {
          if (
            filters.dbCollection !== "all" &&
            row.collection !== filters.dbCollection
          )
            return false;
          if (
            filters.dbOperation !== "all" &&
            row.operation !== filters.dbOperation
          )
            return false;
          const search = filters.dbSearch.toLowerCase();
          return (
            (!search ||
              `${row.collection} ${row.operation}`
                .toLowerCase()
                .includes(search) ||
              row.samples.some((sample) =>
                `${sample.filter} ${sample.options}`
                  .toLowerCase()
                  .includes(search),
              )) &&
            row.maxMs >= Number(filters.dbThreshold) &&
            (filters.dbPhase === "all" ||
              row.samples.some((sample) =>
                filters.dbPhase === "cold"
                  ? sample.isColdStart
                  : !sample.isColdStart,
              ))
          );
        })
        .sort((a, b) => b.maxMs - a.maxMs),
    [
      database,
      filters.dbCollection,
      filters.dbOperation,
      filters.dbSearch,
      filters.dbThreshold,
      filters.dbPhase,
    ],
  );
  const exportRoutes = (rows: UnifiedRouteRow[]) =>
    exportMetricsToCsv(
      rows.map(({ traces, statuses, ...row }) => ({
        ...row,
        window: data.traffic?.window ?? "",
        statuses: JSON.stringify(statuses),
        traces: JSON.stringify(traces),
      })),
      "unified-routes.csv",
    );
  const exportDatabase = (rows: UnifiedDatabaseRow[]) =>
    exportMetricsToCsv(
      rows.map(({ samples, ...row }) => ({
        ...row,
        samples: JSON.stringify(samples),
      })),
      "unified-database.csv",
    );
  const routeColumns = useMemo<DataTableColumn<UnifiedRouteRow>[]>(
    () => [
      {
        key: "route",
        header: text("المسار والطريقة", "Route and method"),
        cell: (row) => {
          const cleanPath = row.route.startsWith(`${row.method} `)
            ? row.route.slice(row.method.length + 1)
            : row.route;
          return (
            <div className="flex flex-col gap-1 py-0.5">
              <div className="flex items-center gap-2" dir="ltr">
                <span
                  className={`inline-flex shrink-0 items-center rounded-squircle border px-2 py-0.5 font-mono text-[10px] font-bold ${methodBadgeTone(row.method)}`}
                >
                  {row.method}
                </span>
                <bdi
                  dir="ltr"
                  className="max-w-72 break-all font-mono text-xs font-medium text-foreground"
                >
                  {cleanPath}
                </bdi>
              </div>
              <span className="sr-only">{row.route}</span>
            </div>
          );
        },
      },
      {
        key: "window",
        header: text("طلبات الفترة / p95", "Window calls / p95"),
        cell: (row) => (
          <div className="space-y-1.5">
            <div className="font-mono text-xs font-semibold text-foreground">
              {format(row.windowCalls)}
            </div>
            <Ms value={row.p95Ms} />
            {(row.overTenSeconds ?? 0) > 0 && <div className="text-xs text-amber-400"><bdi>&gt;10s: {format(row.overTenSeconds)}</bdi></div>}
            {row.latencyOverflowRequests > 0 && <div className="text-xs text-amber-400">{text('خارج نطاق القياس', 'Histogram overflow')}: <bdi>{format(row.latencyOverflowRequests)} &gt; {format((row.latencyUpperBoundMs ?? 0) / 1000)}s</bdi></div>}
          </div>
        ),
      },
      {
        key: "lifetime",
        header: text(
          "منذ التشغيل: العدد / المتوسط / الأقصى",
          "Lifetime: calls / mean / max",
        ),
        cell: (row) => (
          <div className="space-y-1.5">
            <div className="font-mono text-xs font-semibold text-foreground">
              {format(row.lifetimeCalls)}
            </div>
            <div className="flex flex-wrap items-center gap-1 whitespace-nowrap">
              <Ms value={row.avgMs} />
              <span className="text-muted-foreground">/</span>
              <Ms value={row.maxMs} />
            </div>
          </div>
        ),
      },
      {
        key: "errors",
        header: text("الفترة: 4xx / 5xx", "Window: 4xx / 5xx"),
        cell: (row) => (
          <bdi dir="ltr" className="inline-flex items-center gap-1.5 font-mono text-xs">
            <span
              className={
                (row.window4xx ?? 0) > 0
                  ? "rounded-squircle border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-semibold text-amber-400"
                  : "text-muted-foreground"
              }
            >
              {format(row.window4xx)}
            </span>
            <span className="text-muted-foreground">/</span>
            <span
              className={
                (row.window5xx ?? 0) > 0
                  ? "rounded-squircle border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 font-semibold text-rose-400"
                  : "text-muted-foreground"
              }
            >
              {format(row.window5xx)}
            </span>
          </bdi>
        ),
      },
      {
        key: "statuses",
        header: text("رموز الاستجابة منذ التشغيل", "Lifetime status codes"),
        cell: (row) => {
          const entries = Object.entries(row.statuses);
          if (!entries.length) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <bdi dir="ltr" className="flex flex-wrap gap-1 text-xs">
              {entries.map(([status, count]) => (
                <span
                  key={status}
                  className={`inline-flex items-center gap-1 rounded-squircle border px-2 py-0.5 font-mono text-[11px] ${statusPillTone(status)}`}
                >
                  <span className="font-bold">{status}:</span>
                  <span>{format(count)}</span>
                </span>
              ))}
            </bdi>
          );
        },
      },
      {
        key: "traces",
        header: text("عينات بطيئة / DB", "Slow samples / DB"),
        cell: (row) => (
          <div className="space-y-1 text-xs">
            <div className="font-mono font-semibold text-foreground">
              {row.traces.length}
            </div>
            <bdi dir="ltr" className="block font-mono text-[11px] text-muted-foreground">
              {row.traces.length
                ? `${row.traces[0].databaseOperations} ops / ${format(row.traces[0].summedDatabaseMs)} ms`
                : "—"}
            </bdi>
          </div>
        ),
      },
      // Locale is the only dependency of the labels.

    ],
    [text],
  );
  const dbColumns = useMemo<DataTableColumn<UnifiedDatabaseRow>[]>(
    () => [
      {
        key: "collection",
        header: text("المجموعة / العملية", "Collection / operation"),
        cell: (row) => (
          <div className="flex flex-col gap-1 font-mono text-xs" dir="ltr">
            <div className="font-semibold text-foreground">{row.collection}</div>
            <div>
              <span className="inline-flex items-center rounded-squircle border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {row.operation}
              </span>
            </div>
          </div>
        ),
      },
      {
        key: "count",
        header: text("البطيئة منذ التشغيل", "Lifetime slow count"),
        cell: (row) => (
          <span className="font-mono text-xs font-semibold text-foreground">
            {format(row.count)}
          </span>
        ),
      },
      {
        key: "mean",
        header: text("المتوسط", "Mean"),
        cell: (row) => <Ms value={row.avgMs} />,
      },
      {
        key: "max",
        header: text("الأقصى", "Maximum"),
        cell: (row) => <Ms value={row.maxMs} />,
      },
      {
        key: "cold",
        header: text("الإقلاع البارد", "Cold start"),
        cell: (row) => (
          <span
            className={`inline-flex items-center rounded-squircle px-2 py-0.5 font-mono text-xs ${
              row.coldStartCount > 0
                ? "border border-amber-500/30 bg-amber-500/10 font-semibold text-amber-400"
                : "text-muted-foreground"
            }`}
          >
            {format(row.coldStartCount)}
          </span>
        ),
      },
      {
        key: "samples",
        header: text("العينات المحتفظ بها", "Retained samples"),
        cell: (row) => (
          <span className="font-mono text-xs font-medium text-foreground">
            {row.samples.length}
          </span>
        ),
      },
      {
        key: "latest",
        header: text("أحدث فلتر وشكل استعلام", "Latest filter and query shape"),
        cell: (row) => (
          <div
            dir="ltr"
            className="max-w-64 space-y-0.5 break-words rounded-lg border border-border/50 bg-background/40 p-2 font-mono text-[10px]"
          >
            <div className="text-foreground">{row.samples[0]?.filter || "—"}</div>
            {row.samples[0]?.options ? (
              <div className="text-muted-foreground">
                {row.samples[0].options}
              </div>
            ) : null}
          </div>
        ),
      },

    ],
    [text],
  );
  return (
    <>
      <MetricsTable
        title={text("جدول أداء جميع المسارات", "All routes performance")}
        description={text(
          "جميع المسارات المسجلة، حتى غير المستدعاة. p95 للفترة المحددة؛ المتوسط والأقصى منذ التشغيل. التفاصيل تشمل مراحل الطلب.",
          "Every registered route, including uncalled routes. p95 uses the selected window; mean and max use process lifetime. Details include request stages.",
        )}
        icon={<Route className="h-4 w-4" />}
        summaryStrip={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-background/35 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{text("إجمالي المسارات المسجلة", "Registered routes")}</span>
                <Layers className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <bdi className="font-mono text-lg font-bold text-foreground">
                  {format(routeStats.total)}
                </bdi>
                <span className="text-[11px] text-muted-foreground">
                  {format(routeStats.uncalled)}{" "}
                  {text("غير مستدعى", "uncalled")}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/35 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{text("مسارات نشطة في الفترة", "Active in window")}</span>
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <bdi className="font-mono text-lg font-bold text-emerald-400">
                  {format(routeStats.activeInWindow)}
                </bdi>
                <span className="text-[11px] text-muted-foreground">
                  <bdi>{format(routeStats.totalWindowCalls)}</bdi>{" "}
                  {text("طلب", "calls")}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/35 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{text("مسارات بأخطاء في الفترة", "Routes with errors")}</span>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <bdi
                  className={`font-mono text-lg font-bold ${
                    routeStats.withErrors > 0
                      ? "text-amber-400"
                      : "text-foreground"
                  }`}
                >
                  {format(routeStats.withErrors)}
                </bdi>
                <span className="text-[11px] text-muted-foreground">
                  {text("خلال النافذة النشطة", "in active window")}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/35 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{text("مسارات بعينات بطيئة", "With slow traces")}</span>
                <Clock className="h-3.5 w-3.5 text-sky-400" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <bdi className="font-mono text-lg font-bold text-sky-400">
                  {format(routeStats.withSlowTraces)}
                </bdi>
                <span className="text-[11px] text-muted-foreground">
                  <bdi>{format(routeStats.totalTraces)}</bdi>{" "}
                  {text("عينة", "traces")}
                </span>
              </div>
            </div>
          </div>
        }
        rows={filteredRoutes}
        columns={routeColumns}
        page={filters.routePage}
        setPage={(value) => setFilter("routePage", value)}
        isAr={isAr}
        exportRows={exportRoutes}
        open={setDetail}
        filters={
          <>
            <ComplaintSearchInput
              value={filters.routeSearch}
              onValueChange={(value) => setFilter("routeSearch", value)}
              placeholder={text("بحث عن مسار", "Search routes")}
            />
            <Filter
              label={text("الطريقة", "Method")}
              value={filters.routeMethod}
              options={[
                ["all", text("كل الطرق", "All methods")],
                ...methods.map((method): [string, string] => [method, method]),
              ]}
              onChange={(value) => setFilter("routeMethod", value)}
              isAr={isAr}
            />
            <Filter
              label={text("حركة المسارات", "Route traffic")}
              value={filters.routeScope}
              options={[
                ["all", text("جميع المسارات", "All routes")],
                ["active", text("نشطة خلال الفترة", "Active in window")],
                ["uncalled", text("غير مستدعاة", "Uncalled")],
                ["slow", text("بعينات بطيئة", "With slow samples")],
                ["errors", text("أخطاء خلال الفترة", "Errors in window")],
              ]}
              onChange={(value) => setFilter("routeScope", value)}
              isAr={isAr}
            />
            <Filter
              label={text("الترتيب", "Sort")}
              value={filters.routeSort}
              options={[
                ["p95", text("الأبطأ p95", "Slowest p95")],
                ["lifetime", text("متوسط منذ التشغيل", "Lifetime mean")],
                ["calls", text("طلبات الفترة", "Window calls")],
                ["route", text("المسار", "Route")],
              ]}
              onChange={(value) => setFilter("routeSort", value)}
              isAr={isAr}
            />
          </>
        }
      />
      <MetricsTable
        title={text("جدول أداء قاعدة البيانات", "Database performance")}
        description={text(
          `ملخص منذ التشغيل مع عينات بطيئة محدودة (>${data.database.slowQueryThresholdMs ?? 100} ms). مرشحات المدة والمرحلة تخص العينات؛ التفاصيل تعرض الفلاتر والوقت.`,
          `Lifetime slow-query totals with bounded samples (>${data.database.slowQueryThresholdMs ?? 100} ms). Duration and phase filters use retained samples; details include filters and timestamps.`,
        )}
        icon={<Database className="h-4 w-4" />}
        summaryStrip={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-background/35 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{text("أشكال العمليات المرصودة", "Monitored DB ops")}</span>
                <Database className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <bdi className="font-mono text-lg font-bold text-foreground">
                  {format(dbStats.totalShapes)}
                </bdi>
                <span className="text-[11px] text-muted-foreground">
                  {format(collections.length)}{" "}
                  {text("مجموعة", "collections")}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/35 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{text("إجمالي الاستعلامات البطيئة", "Total slow queries")}</span>
                <Clock className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <bdi className="font-mono text-lg font-bold text-amber-400">
                  {format(dbStats.totalSlow)}
                </bdi>
                <span className="text-[11px] text-muted-foreground">
                  <bdi>{format(dbStats.totalSamples)}</bdi>{" "}
                  {text("عينة محتفظ بها", "retained")}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/35 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{text("إقلاع بارد مقابل مستقر", "Cold vs steady state")}</span>
                <Zap className="h-3.5 w-3.5 text-sky-400" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <bdi dir="ltr" className="font-mono text-lg font-bold text-foreground">
                  {format(dbStats.totalCold)} / {format(dbStats.steadyState)}
                </bdi>
                <span className="text-[11px] text-muted-foreground">
                  {text("بارد / مستقر", "cold / steady")}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/35 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{text("أقصى زمن استعلام", "Peak slow query")}</span>
                <Activity className="h-3.5 w-3.5 text-rose-400" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <Ms value={dbStats.peakMaxMs || null} />
                <span className="text-[11px] text-muted-foreground">
                  {text("الحد", "Threshold")} &gt;
                  <bdi>{data.database.slowQueryThresholdMs ?? 100}</bdi> ms
                </span>
              </div>
            </div>
          </div>
        }
        rows={filteredDatabase}
        columns={dbColumns}
        page={filters.dbPage}
        setPage={(value) => setFilter("dbPage", value)}
        isAr={isAr}
        exportRows={exportDatabase}
        open={setDetail}
        filters={
          <>
            <ComplaintSearchInput
              value={filters.dbSearch}
              onValueChange={(value) => setFilter("dbSearch", value)}
              placeholder={text("بحث في الاستعلامات", "Search queries")}
            />
            <Filter
              label={text("المجموعة", "Collection")}
              value={filters.dbCollection}
              options={[
                ["all", text("كل المجموعات", "All collections")],
                ...collections.map((value): [string, string] => [value, value]),
              ]}
              onChange={(value) => setFilter("dbCollection", value)}
              isAr={isAr}
            />
            <Filter
              label={text("العملية", "Operation")}
              value={filters.dbOperation}
              options={[
                ["all", text("كل العمليات", "All operations")],
                ...operations.map((value): [string, string] => [value, value]),
              ]}
              onChange={(value) => setFilter("dbOperation", value)}
              isAr={isAr}
            />
            <Filter
              label={text("المدة", "Duration")}
              value={filters.dbThreshold}
              options={[
                ["0", text("أي مدة", "Any duration")],
                ["250", "≥ 250 ms"],
                ["500", "≥ 500 ms"],
                ["1000", "≥ 1000 ms"],
              ]}
              onChange={(value) => setFilter("dbThreshold", value)}
              isAr={isAr}
            />
            <Filter
              label={text("المرحلة", "Phase")}
              value={filters.dbPhase}
              options={[
                ["all", text("كل المراحل", "All phases")],
                ["cold", text("إقلاع بارد", "Cold start")],
                ["steady", text("تشغيل مستقر", "Steady state")],
              ]}
              onChange={(value) => setFilter("dbPhase", value)}
              isAr={isAr}
            />
          </>
        }
      />
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent
          dir={isAr ? "rtl" : "ltr"}
          className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"
        >
          <DialogHeader>
            <DialogTitle className="break-all text-start font-mono text-sm">
              <bdi dir="ltr">{detail?._id}</bdi>
            </DialogTitle>
          </DialogHeader>
          {detail && "traces" in detail ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {text(
                  "أحدث العينات البطيئة منذ التشغيل. مجموع DB قد يتجاوز مدة الطلب بسبب التوازي.",
                  "Recent process-lifetime slow samples. Summed DB time may exceed request duration because operations overlap.",
                )}
              </p>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs">
                  <div className="text-muted-foreground">
                    {text("إجمالي الطلبات (منذ التشغيل)", "Lifetime calls")}
                  </div>
                  <div className="mt-1 font-mono text-base font-bold text-foreground">
                    {format(detail.lifetimeCalls)}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs">
                  <div className="text-muted-foreground">
                    {text("المتوسط / الأقصى", "Mean / Max latency")}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Ms value={detail.avgMs} />
                    <span>/</span>
                    <Ms value={detail.maxMs} />
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs">
                  <div className="text-muted-foreground">
                    {text(
                      "أخطاء منذ التشغيل 4xx / 5xx:",
                      "Lifetime errors 4xx / 5xx:",
                    )}
                  </div>
                  <div className="mt-1 font-mono text-base font-bold text-foreground">
                    <bdi dir="ltr">
                      {detail.lifetime4xx} / {detail.lifetime5xx}
                    </bdi>
                  </div>
                </div>
              </div>
              {detail.traces.length === 0 && (
                <p className="rounded-xl border border-border/60 bg-background/30 p-4 text-center text-xs text-muted-foreground">
                  {text(
                    "لا توجد عينات بطيئة محتفظ بها.",
                    "No retained slow samples.",
                  )}
                </p>
              )}
              {detail.traces.map((trace) => (
                <div
                  key={trace.requestId}
                  className="space-y-2.5 rounded-xl border border-border bg-card/60 p-3.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                    <bdi
                      dir="ltr"
                      className="break-all font-mono text-[11px] font-semibold text-primary"
                    >
                      {trace.requestId}
                    </bdi>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(trace.timestamp).toLocaleString(
                        isAr ? "ar-EG" : "en-GB",
                        { timeZone: "Africa/Cairo" },
                      )}
                    </span>
                  </div>
                  <div className="font-mono font-medium text-foreground">
                    <bdi dir="ltr">
                      HTTP {trace.status} · {format(trace.durationMs)} ms · DB{" "}
                      {trace.databaseOperations} /{" "}
                      {format(trace.summedDatabaseMs)} ms
                    </bdi>
                  </div>
                  <div className="flex flex-wrap gap-2" dir="ltr">
                    {Object.entries(trace.stages).map(([stage, ms]) => (
                      <span
                        key={stage}
                        className="rounded-squircle border border-border/60 bg-secondary/70 px-2.5 py-1 font-mono text-[11px]"
                      >
                        <span className="text-muted-foreground">{stage}:</span>{" "}
                        <span className="font-semibold text-foreground">
                          {format(ms)} ms
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : detail && "samples" in detail ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {text(
                  "العينات محتفظ بها في ذاكرة العملية؛ العدد الإجمالي قد يتجاوز العينات المعروضة.",
                  "Samples are retained in process memory; lifetime totals can exceed the samples shown.",
                )}
              </p>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs">
                  <div className="text-muted-foreground">
                    {text("البطيئة منذ التشغيل", "Lifetime slow count")}
                  </div>
                  <div className="mt-1 font-mono text-base font-bold text-foreground">
                    {format(detail.count)}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs">
                  <div className="text-muted-foreground">
                    {text("المتوسط / الأقصى", "Mean / Max latency")}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Ms value={detail.avgMs} />
                    <span>/</span>
                    <Ms value={detail.maxMs} />
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs">
                  <div className="text-muted-foreground">
                    {text("الإقلاع البارد", "Cold start count")}
                  </div>
                  <div className="mt-1 font-mono text-base font-bold text-amber-400">
                    {format(detail.coldStartCount)}
                  </div>
                </div>
              </div>
              {detail.samples.map((sample) => (
                <div
                  key={sample.id}
                  className="space-y-2 rounded-xl border border-border bg-card/60 p-3.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {new Date(sample.timestamp).toLocaleString(
                        isAr ? "ar-EG" : "en-GB",
                        { timeZone: "Africa/Cairo" },
                      )}{" "}
                      ·{" "}
                      <span
                        className={
                          sample.isColdStart
                            ? "font-semibold text-amber-400"
                            : "font-medium text-emerald-400"
                        }
                      >
                        {sample.isColdStart
                          ? text("إقلاع بارد", "Cold start")
                          : text("تشغيل مستقر", "Steady state")}
                      </span>
                    </span>
                    <Ms value={sample.durationMs} />
                  </div>
                  <pre
                    dir="ltr"
                    className="whitespace-pre-wrap break-all rounded-lg border border-border/50 bg-background/50 p-2.5 font-mono text-[11px]"
                  >
                    {sample.filter}
                    {"\n"}
                    {sample.options}
                  </pre>
                </div>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
