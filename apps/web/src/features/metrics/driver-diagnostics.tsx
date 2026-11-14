"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  Layers,
  RotateCcw,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DataTableColumn } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ComplaintSearchInput } from "@/features/complaints/components/complaint-search-input";
import { useTableState } from "@/hooks/use-table-state";
import { exportMetricsToCsv } from "@/lib/export-utils";
import { Filter, MetricsTable, Ms } from "./unified-tables";
import {
  buildDriverCommands,
  buildDriverFailures,
  driverCategory,
  DRIVER_CATEGORIES,
  DRIVER_FILTER_DEFAULTS,
  DRIVER_KINDS,
  filterDriverCommands,
  filterDriverFailures,
  type DriverCommandRow,
  type DriverDiagnostics,
  type DriverFailureRow,
  type DriverFilters,
} from "./driver-model";

const format = (value: number | null | undefined) =>
  value == null
    ? "—"
    : value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
function Technical({ children }: { children: ReactNode }) {
  return (
    <bdi dir="ltr" className="break-words font-mono text-xs">
      {children}
    </bdi>
  );
}

export function DriverDiagnosticsPanel({
  data,
  isAr,
}: {
  data?: DriverDiagnostics;
  isAr: boolean;
}) {
  const t = useTranslations("mongoDiagnostics");
  const { filters, setFilters } = useTableState({
    defaultFilters: DRIVER_FILTER_DEFAULTS,
    shallow: true,
  });
  const [detail, setDetail] = useState<
    DriverFailureRow | DriverCommandRow | null
  >(null);
  const commandsView = filters.driverView === "commands";
  const failures = useMemo(() => buildDriverFailures(data), [data]);
  const commands = useMemo(() => buildDriverCommands(data), [data]);
  const filteredFailures = useMemo(
    () =>
      filterDriverFailures(
        failures,
        filters,
        (row) =>
          `${t(`categories.${driverCategory(row.category)}`)} ${t(`kinds.${row.kind}`)}`,
      ),
    [failures, filters, t],
  );
  const filteredCommands = useMemo(
    () => filterDriverCommands(commands, filters),
    [commands, filters],
  );
  const commandOptions = useMemo(
    () =>
      [
        ...new Set([
          ...commands.map((row) => row.command),
          ...failures.map((row) => row.command),
        ]),
      ].sort(),
    [commands, failures],
  );
  const change = (key: keyof DriverFilters, value: string) =>
    setFilters({ [key]: value, driverPage: "1" });
  const sort = commandsView
    ? ["count", "failures", "slowest"].includes(filters.driverSort)
      ? filters.driverSort
      : "count"
    : ["latest", "oldest", "slowest"].includes(filters.driverSort)
      ? filters.driverSort
      : "latest";
  const timestamp = (value: string) =>
    Number.isNaN(Date.parse(value))
      ? "—"
      : new Date(value).toLocaleString(isAr ? "ar-EG" : "en-GB", {
          timeZone: "Africa/Cairo",
        });

  const failureColumns = useMemo<DataTableColumn<DriverFailureRow>[]>(
    () => [
      {
        key: "command",
        header: t("command"),
        cell: (row) => (
          <div className="space-y-1">
            <Technical>{row.command}</Technical>
            <div>
              <span className="inline-flex rounded-squircle border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {t(`kinds.${row.kind}`)}
              </span>
            </div>
            {row.operation && row.operation !== row.command && (
              <div className="text-muted-foreground">
                <Technical>{row.operation}</Technical>
              </div>
            )}
          </div>
        ),
      },
      {
        key: "category",
        header: t("category"),
        cell: (row) => (
          <div className="max-w-56 space-y-1.5">
            <span className="inline-flex rounded-squircle border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-400">
              {t(`categories.${driverCategory(row.category)}`)}
            </span>
            <div className="text-muted-foreground">
              <Technical>
                {row.errorName}
                {row.code !== undefined ? ` (${row.code})` : ""}
              </Technical>
            </div>
          </div>
        ),
      },
      {
        key: "duration",
        header: t("duration"),
        cell: (row) => <Ms value={row.durationMs} />,
      },
      {
        key: "context",
        header: t("requestContext"),
        cell: (row) => (
          <div className="max-w-64 space-y-1">
            <div className="text-foreground">
              <Technical>{row.stage ?? "—"}</Technical>
            </div>
            {row.requestId ? (
              <div className="break-all text-muted-foreground">
                <Technical>{row.requestId}</Technical>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("uncorrelated")}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "timestamp",
        header: t("timestamp"),
        cell: (row) => (
          <time
            dateTime={row.timestamp}
            className="whitespace-nowrap text-xs text-muted-foreground"
          >
            {Number.isNaN(Date.parse(row.timestamp))
              ? "—"
              : new Date(row.timestamp).toLocaleString(
                  isAr ? "ar-EG" : "en-GB",
                  { timeZone: "Africa/Cairo" },
                )}
          </time>
        ),
      },
    ],
    [t, isAr],
  );
  const commandColumns = useMemo<DataTableColumn<DriverCommandRow>[]>(
    () => [
      {
        key: "command",
        header: t("command"),
        cell: (row) => (
          <span className="inline-flex rounded-squircle border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">
            <Technical>{row.command}</Technical>
          </span>
        ),
      },
      {
        key: "count",
        header: t("attempts"),
        cell: (row) => <Technical>{format(row.count)}</Technical>,
      },
      {
        key: "failures",
        header: t("failures"),
        cell: (row) => (
          <span
            className={
              row.failures > 0
                ? "inline-flex rounded-squircle border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-rose-400"
                : "text-muted-foreground"
            }
          >
            <Technical>{format(row.failures)}</Technical>
          </span>
        ),
      },
      {
        key: "mean",
        header: t("mean"),
        cell: (row) => <Ms value={row.avgMs} />,
      },
      {
        key: "max",
        header: t("maximum"),
        cell: (row) => <Ms value={row.maxMs} />,
      },
    ],
    [t],
  );

  const controls = (
    <>
      <ComplaintSearchInput
        value={filters.driverSearch}
        onValueChange={(value) => change("driverSearch", value)}
        placeholder={t("search")}
        className="col-span-2 w-full xl:col-span-1"
      />
      <Filter
        label={t("view")}
        value={commandsView ? "commands" : "failures"}
        options={[
          ["failures", t("recentFailures")],
          ["commands", t("commandSummary")],
        ]}
        onChange={(value) =>
          setFilters({
            driverView: value,
            driverSort: value === "commands" ? "count" : "latest",
            driverPage: "1",
          })
        }
        isAr={isAr}
      />
      <Filter
        label={t("command")}
        value={filters.driverCommand}
        options={[
          ["all", t("allCommands")],
          ...commandOptions.map((command): [string, string] => [
            command,
            command,
          ]),
        ]}
        onChange={(value) => change("driverCommand", value)}
        isAr={isAr}
      />
      {!commandsView && (
        <Filter
          label={t("category")}
          value={filters.driverCategory}
          options={[
            ["all", t("allCategories")],
            ...DRIVER_CATEGORIES.map((category): [string, string] => [
              category,
              t(`categories.${category}`),
            ]),
          ]}
          onChange={(value) => change("driverCategory", value)}
          isAr={isAr}
        />
      )}
      {!commandsView && (
        <Filter
          label={t("kind")}
          value={filters.driverKind}
          options={[
            ["all", t("allKinds")],
            ...DRIVER_KINDS.map((kind): [string, string] => [
              kind,
              t(`kinds.${kind}`),
            ]),
          ]}
          onChange={(value) => change("driverKind", value)}
          isAr={isAr}
        />
      )}
      <Filter
        label={t("durationFilter")}
        value={filters.driverThreshold}
        options={[
          ["0", t("allDurations")],
          ["100", t("atLeast", { ms: "100" })],
          ["1000", t("atLeast", { ms: "1,000" })],
          ["10000", t("atLeast", { ms: "10,000" })],
        ]}
        onChange={(value) => change("driverThreshold", value)}
        isAr={isAr}
      />
      <Filter
        label={t("sort")}
        value={sort}
        options={
          commandsView
            ? [
                ["count", t("mostAttempts")],
                ["failures", t("mostFailures")],
                ["slowest", t("slowest")],
              ]
            : [
                ["latest", t("latest")],
                ["oldest", t("oldest")],
                ["slowest", t("slowest")],
              ]
        }
        onChange={(value) => change("driverSort", value)}
        isAr={isAr}
      />
      <Button
        variant="outline"
        className="col-span-2 xl:col-span-1"
        onClick={() => setFilters(DRIVER_FILTER_DEFAULTS)}
      >
        <RotateCcw className="me-2 h-3.5 w-3.5" />
        {t("clearFilters")}
      </Button>
    </>
  );
  const cards = [
    {
      label: t("checkedOut"),
      value: data?.checkedOut,
      icon: Database,
      tone: "text-primary",
    },
    {
      label: t("waiters"),
      value: data?.waiters,
      icon: Activity,
      tone: (data?.waiters ?? 0) > 0 ? "text-amber-400" : "text-primary",
    },
    {
      label: t("meanCheckout"),
      value: data?.checkout.avgMs,
      icon: Clock,
      latency: true,
    },
    {
      label: t("maxCheckout"),
      value: data?.checkout.maxMs,
      icon: Zap,
      latency: true,
    },
    {
      label: t("checkoutFailures"),
      value: data?.checkout.failures,
      icon: AlertTriangle,
      tone:
        (data?.checkout.failures ?? 0) > 0
          ? "text-rose-400"
          : "text-foreground",
    },
    {
      label: t("poolClears"),
      value: data?.poolClears,
      icon: Layers,
      tone: (data?.poolClears ?? 0) > 0 ? "text-amber-400" : "text-foreground",
    },
  ];
  const summaryStrip = (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border/60 bg-background/35 p-3"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{card.label}</span>
              <card.icon
                className={`h-3.5 w-3.5 shrink-0 ${card.tone ?? "text-primary"}`}
              />
            </div>
            <div className="mt-1.5">
              {card.latency ? (
                <Ms value={card.value ?? null} />
              ) : (
                <bdi className={`font-mono text-lg font-bold ${card.tone}`}>
                  {format(card.value)}
                </bdi>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          {t("commandGroups")}:{" "}
          <bdi className="font-mono font-semibold text-primary">
            {commands.length}
          </bdi>
        </span>
        <span>
          {t("retainedFailures")}:{" "}
          <bdi className="font-mono font-semibold text-rose-400">
            {failures.length}
          </bdi>
        </span>
        <span>{t("scope")}</span>
      </div>
    </>
  );
  const common = {
    title: t("title"),
    description: t("description"),
    icon: <Database className="h-4 w-4" />,
    summaryStrip,
    filters: controls,
    filterGridClassName: "grid grid-cols-2 gap-2 xl:grid-cols-4",
    page: filters.driverPage,
    setPage: (page: string) => setFilters({ driverPage: page }),
    isAr,
  };
  const failureDetail = detail && "timestamp" in detail ? detail : null;
  const commandDetail = detail && "count" in detail ? detail : null;
  const relatedFailures = commandDetail
    ? failures.filter((row) => row.command === commandDetail.command)
    : [];
  return (
    <section data-testid="driver-diagnostics" className="min-w-0">
      {commandsView ? (
        <MetricsTable
          key="commands"
          {...common}
          rows={filteredCommands}
          columns={commandColumns}
          exportRows={(rows) =>
            exportMetricsToCsv(
              rows.map((row) => ({ ...row, scope: "process" })),
              "mongodb-commands.csv",
            )
          }
          open={setDetail}
          emptyMessage={
            !data
              ? t("unavailable")
              : !commands.length
                ? t("noCommands")
                : undefined
          }
        />
      ) : (
        <MetricsTable
          key="failures"
          {...common}
          rows={filteredFailures}
          columns={failureColumns}
          exportRows={(rows) =>
            exportMetricsToCsv(
              rows.map((row) => ({ ...row, scope: "process" })),
              "mongodb-failures.csv",
            )
          }
          open={setDetail}
          emptyMessage={
            !data
              ? t("unavailable")
              : !failures.length
                ? t("noFailures")
                : undefined
          }
        />
      )}
      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => !open && setDetail(null)}
      >
        <DialogContent
          dir={isAr ? "rtl" : "ltr"}
          className="max-h-[85dvh] overflow-y-auto rounded-2xl sm:max-w-3xl"
        >
          <DialogHeader className="text-start">
            <DialogTitle>
              {failureDetail ? t("failureDetails") : t("commandDetails")}
            </DialogTitle>
            <DialogDescription>{t("scope")}</DialogDescription>
          </DialogHeader>
          {failureDetail && (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              {[
                [t("timestamp"), timestamp(failureDetail.timestamp)],
                [t("command"), failureDetail.command],
                [t("operation"), failureDetail.operation ?? "—"],
                [t("kind"), t(`kinds.${failureDetail.kind}`)],
                [
                  t("category"),
                  t(`categories.${driverCategory(failureDetail.category)}`),
                ],
                [t("errorClass"), failureDetail.errorName],
                [t("code"), String(failureDetail.code ?? "—")],
                [t("stage"), failureDetail.stage ?? "—"],
                [t("requestId"), failureDetail.requestId ?? t("uncorrelated")],
                [
                  t("checkoutReason"),
                  failureDetail.checkoutReason
                    ? t(`checkoutReasons.${failureDetail.checkoutReason}`)
                    : "—",
                ],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 space-y-1">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="break-all">
                    <bdi>{value}</bdi>
                  </dd>
                </div>
              ))}
              <div>
                <dt className="mb-1 text-xs text-muted-foreground">
                  {t("duration")}
                </dt>
                <dd>
                  <Ms value={failureDetail.durationMs} />
                </dd>
              </div>
            </dl>
          )}
          {commandDetail && (
            <div className="space-y-4">
              <Technical>{commandDetail.command}</Technical>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                {[
                  [t("attempts"), commandDetail.count],
                  [t("failures"), commandDetail.failures],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>
                      <Technical>{value}</Technical>
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>{t("mean")}</dt>
                  <dd>
                    <Ms value={commandDetail.avgMs} />
                  </dd>
                </div>
                <div>
                  <dt>{t("maximum")}</dt>
                  <dd>
                    <Ms value={commandDetail.maxMs} />
                  </dd>
                </div>
              </dl>
              <h3 className="font-semibold">
                {t("relatedFailures", { count: relatedFailures.length })}
              </h3>
              {relatedFailures.map((row) => (
                <div
                  key={row._id}
                  className="space-y-1 rounded-xl border border-border/60 bg-background/25 p-3 text-xs"
                >
                  <p>
                    {t(`categories.${driverCategory(row.category)}`)} ·{" "}
                    {timestamp(row.timestamp)}
                  </p>
                  <Ms value={row.durationMs} />
                  <p className="break-all">
                    <Technical>
                      {row.requestId ?? row.stage ?? t("uncorrelated")}
                    </Technical>
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
