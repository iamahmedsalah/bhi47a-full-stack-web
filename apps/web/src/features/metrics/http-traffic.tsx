"use client";

import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select as UiSelect,
  SelectContent as UiSelectContent,
  SelectItem as UiSelectItem,
  SelectTrigger as UiSelectTrigger,
  SelectValue as UiSelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { toast } from "sonner";
import { exportMetricsToCsv } from "@/lib/export-utils";
import * as Select from "@radix-ui/react-select";
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  BarChart2,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Database,
  Download,
  Radio,
  Search,
  Zap,
} from "lucide-react";
import {
  latencyTone,
  type HttpTraffic,
  type MetricsSummaryResponse,
  type TrafficWindow,
} from "./api";

const value = (number: number | null | undefined, digits = 1) =>
  number == null
    ? "—"
    : number.toLocaleString("en-GB", { maximumFractionDigits: digits });

const outcomes: Record<string, [string, string]> = {
  anonymous_probe: ["فحص جلسة مجهولة", "Anonymous session probes"],
  session_rejected: ["جلسة مرفوضة أو منتهية", "Rejected / expired sessions"],
  authentication_rejected: ["مصادقة مرفوضة", "Authentication rejected"],
  permission_denied: ["صلاحيات مرفوضة", "Permission denied"],
  validation_rejected: ["طلب غير صالح", "Invalid requests"],
  rate_limited: ["تجاوز معدل الطلبات", "Rate limited"],
  unexpected_client_error: ["أخطاء عميل تحتاج مراجعة", "Other client errors"],
  server_error: ["أخطاء الخادم", "Server errors"],
  unclassified_error: ["أخطاء غير مصنفة", "Unclassified errors"],
};

function MethodBadge({ method }: { method?: string }) {
  const m = (method || "GET").toUpperCase();
  const tones: Record<string, string> = {
    GET: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    POST: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    PUT: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    PATCH: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    DELETE: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  };
  return (
    <span
      className={cn(
        "rounded-squircle border px-1.5 py-0.5 text-[10px] font-bold font-mono uppercase tracking-wider",
        tones[m] || "bg-secondary text-muted-foreground border-border",
      )}
      dir="ltr"
    >
      {m}
    </span>
  );
}

export function HttpTrafficCard({
  traffic,
  isAr,
  window,
  onWindowChange,
  className,
}: {
  traffic?: HttpTraffic;
  isAr: boolean;
  window: TrafficWindow;
  onWindowChange: (window: TrafficWindow) => void;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {isAr ? "حركة الطلبات اللحظية" : "HTTP Traffic"}
          </span>
          <Radio className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
        </div>
        <Select.Root
          dir={isAr ? "rtl" : "ltr"}
          value={window}
          onValueChange={(next) => onWindowChange(next as TrafficWindow)}
        >
          <Select.Trigger
            className="h-7 w-20 rounded-squircle border border-border/70 bg-secondary/50 text-xs font-semibold hover:border-primary/40 transition-colors"
            aria-label={isAr ? "الفترة الزمنية" : "Traffic window"}
          >
            <Select.Value />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              dir={isAr ? "rtl" : "ltr"}
              position="popper"
              sideOffset={4}
              className="z-50 min-w-20 rounded-xl border border-border/70 bg-popover/95 backdrop-blur-sm p-1 text-popover-foreground shadow-lg"
            >
              <Select.Viewport>
                {(["5m", "15m", "1h", "24h"] as const).map((period) => (
                  <Select.Item
                    className="cursor-pointer rounded-squircle px-3 py-1.5 text-start text-xs font-medium outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    key={period}
                    value={period}
                  >
                    <Select.ItemText>{period}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      <div
        className="mt-3 flex items-baseline justify-between gap-2 font-mono"
        dir="ltr"
      >
        <strong className="text-2xl font-black text-foreground">
          {value(traffic?.totalRequests, 0)}
        </strong>
        <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-squircle border border-amber-500/20 text-xs">
          {value(traffic?.requestsPerSecond, 2)} RPS
        </span>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        {isAr ? "طلبات خلال الفترة المحددة" : "Requests in selected window"}
      </p>

      <div className="mt-2 rounded-lg border border-border/60 bg-secondary/20 p-2 space-y-1">
        <p className="text-xs font-mono font-medium text-foreground" dir="ltr">
          p50 <span className="text-emerald-400 font-bold">{value(traffic?.p50LatencyMs)}</span> · p95{" "}
          <span className="text-amber-400 font-bold">{value(traffic?.p95LatencyMs)}</span> · p99{" "}
          <span className="text-rose-400 font-bold">{value(traffic?.p99LatencyMs)}</span> ms
        </p>
        <p className="text-[10px] text-muted-foreground">
          {isAr
            ? "كل الحالات · p95 للناجح فقط:"
            : "All statuses · successful p95:"}{" "}
          <bdi className="font-mono text-emerald-400 font-bold">{value(traffic?.successfulP95LatencyMs)} ms</bdi>
        </p>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-xs font-mono" dir="ltr">
        <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-squircle border border-emerald-500/20 font-bold">
          2xx {value(traffic?.status2xx, 0)}
        </span>
        <span className="text-muted-foreground bg-secondary/40 px-1.5 py-0.5 rounded-squircle border border-border/50">
          3xx {value(traffic?.status3xx, 0)}
        </span>
        <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-squircle border border-amber-500/20 font-bold">
          4xx {value(traffic?.status4xx, 0)}
        </span>
        <span
          className={cn(
            "px-1.5 py-0.5 rounded-squircle font-bold border",
            (traffic?.status5xx ?? 0) > 0
              ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
              : "text-muted-foreground bg-secondary/40 border-border/50",
          )}
        >
          5xx {value(traffic?.status5xx, 0)}
        </span>
      </div>

      <div className="mt-2 space-y-1 text-[11px]">
        <p className="text-amber-300">
          <bdi className="font-mono font-bold">{value(traffic?.rawErrorRatePercent)}%</bdi>{" "}
          {isAr ? "كل استجابات 4xx/5xx" : "Raw 4xx/5xx responses"}
        </p>
        <p className="text-muted-foreground">
          <bdi className="font-mono font-bold text-foreground">{value(traffic?.actionableErrorRatePercent)}%</bdi>{" "}
          {isAr ? "أخطاء أخرى تحتاج مراجعة" : "Other errors requiring review"}
        </p>
      </div>

      <div className="mt-3 pt-2 border-t border-border/50 text-[10px] text-muted-foreground space-y-1">
        <p>
          {!traffic
            ? isAr
              ? "مقاييس الفترة غير متاحة"
              : "Window metrics unavailable"
            : traffic.source === "prometheus"
              ? "Prometheus · rate / increase"
              : isAr
                ? `هذه العملية فقط · آخر ${value(traffic.observedSeconds, 0)} ثانية · دقة دقيقة`
                : `This process only · ${value(traffic.observedSeconds, 0)}s observed · 1 min resolution`}
        </p>
        {traffic?.source === "process" && (
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/30 px-2 py-1">
            <span className="text-[10px] text-muted-foreground">
              {isAr
                ? "السجل المجمّع عبر Prometheus غير متاح (الرصد المحلي نشط)"
                : "Aggregated Prometheus history unavailable (Process telemetry active)"}
            </span>
            <span
              className="font-mono text-[9px] font-bold text-teal-400"
              title={
                isAr
                  ? "يتم قياس الحركة عبر ذاكرة هذه العملية نظراً لعدم تهيئة PROMETHEUS_URL الخارجي"
                  : "In-process telemetry active (PROMETHEUS_URL not configured)"
              }
            >
              {isAr ? "محلي VPS" : "VPS Local"}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

export function HttpTrafficDetails({
  traffic,
  slowRequests,
  isAr,
}: {
  traffic?: HttpTraffic;
  slowRequests?: MetricsSummaryResponse["recentSlowRequests"];
  isAr: boolean;
}) {
  const dir = isAr ? "rtl" : "ltr";
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Routes table filters
  const [routeSearch, setRouteSearch] = useState("");
  const [routeMethod, setRouteMethod] = useState("all");
  const [routeTraffic, setRouteTraffic] = useState<"all" | "slow" | "errors">("all");
  const [routeSort, setRouteSort] = useState<"latency" | "count" | "errors" | "route">("latency");

  // Slow requests table filters
  const [slowSearch, setSlowSearch] = useState("");
  const [slowMethod, setSlowMethod] = useState("all");
  const [slowThreshold, setSlowThreshold] = useState("0");

  const handleCopyRequestId = async (requestId: string) => {
    if (typeof window === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopiedId(requestId);
      toast.success(isAr ? "تم نسخ معرّف الطلب" : "Copied request ID");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error(isAr ? "تعذر النسخ إلى الحافظة" : "Clipboard copy failed");
    }
  };

  const availableMethods = useMemo(() => {
    if (!traffic?.routes) return [];
    const set = new Set<string>();
    traffic.routes.forEach((r) => {
      const m = r.route.split(" ")[0];
      if (m) set.add(m.toUpperCase());
    });
    return Array.from(set).sort();
  }, [traffic?.routes]);

  const filteredRoutes = useMemo(() => {
    if (!traffic?.routes) return [];
    let list = [...traffic.routes];

    if (routeSearch.trim()) {
      const q = routeSearch.trim().toLowerCase();
      list = list.filter((r) => r.route.toLowerCase().includes(q));
    }

    if (routeMethod !== "all") {
      list = list.filter((r) => {
        const m = r.route.split(" ")[0] || "GET";
        return m.toUpperCase() === routeMethod.toUpperCase();
      });
    }

    if (routeTraffic === "slow") {
      list = list.sort((a, b) => (b.p95LatencyMs ?? 0) - (a.p95LatencyMs ?? 0)).slice(0, 10);
    } else if (routeTraffic === "errors") {
      list = list.filter(
        (r) => (r.errorCount ?? (r.status4xx ?? 0) + (r.status5xx ?? 0)) > 0,
      );
    }

    if (routeTraffic !== "slow") {
      list.sort((a, b) => {
        if (routeSort === "latency") {
          return (b.p95LatencyMs ?? 0) - (a.p95LatencyMs ?? 0);
        }
        if (routeSort === "count") {
          return b.totalRequests - a.totalRequests;
        }
        if (routeSort === "errors") {
          const aErr = a.errorCount ?? (a.status4xx ?? 0) + (a.status5xx ?? 0);
          const bErr = b.errorCount ?? (b.status4xx ?? 0) + (b.status5xx ?? 0);
          return bErr - aErr;
        }
        return a.route.localeCompare(b.route);
      });
    }

    return list;
  }, [traffic?.routes, routeSearch, routeMethod, routeTraffic, routeSort]);

  const handleDownloadRoutesCsv = () => {
    exportMetricsToCsv(
      filteredRoutes.map((r) => {
        const parts = r.route.split(" ");
        const method = parts.length > 1 ? parts[0] : "GET";
        const path = parts.length > 1 ? parts.slice(1).join(" ") : r.route;
        const total = r.totalRequests || 1;
        const errs = r.errorCount ?? (r.status4xx ?? 0) + (r.status5xx ?? 0);
        return {
          method,
          path,
          totalRequests: r.totalRequests,
          p95LatencyMs: r.p95LatencyMs ?? 0,
          status4xx: r.status4xx ?? 0,
          status5xx: r.status5xx ?? 0,
          errorRatePercent: `${((errs / total) * 100).toFixed(1)}%`,
        };
      }),
      "traffic-routes-diagnostics.csv",
      [
        { key: "method", header: isAr ? "الطريقة" : "Method" },
        { key: "path", header: isAr ? "المسار" : "Path" },
        { key: "totalRequests", header: isAr ? "عدد الطلبات" : "Total Requests" },
        { key: "p95LatencyMs", header: isAr ? "تأخير p95 (ms)" : "p95 Latency (ms)" },
        { key: "status4xx", header: isAr ? "أخطاء 4xx" : "4xx Errors" },
        { key: "status5xx", header: isAr ? "أخطاء 5xx" : "5xx Errors" },
        { key: "errorRatePercent", header: isAr ? "نسبة الأخطاء" : "Error Rate" },
      ],
    );
  };

  const slowAvailableMethods = useMemo(() => {
    if (!slowRequests) return [];
    const set = new Set<string>();
    slowRequests.forEach((r) => set.add(r.method.toUpperCase()));
    return Array.from(set).sort();
  }, [slowRequests]);

  const filteredSlowRequests = useMemo(() => {
    if (!slowRequests) return [];
    const minMs = Number(slowThreshold) || 0;
    const term = slowSearch.trim().toLowerCase();

    return slowRequests.filter((r) => {
      if (slowMethod !== "all" && r.method.toUpperCase() !== slowMethod.toUpperCase()) {
        return false;
      }
      if (minMs > 0 && r.durationMs < minMs) {
        return false;
      }
      if (term) {
        const haystack = `${r.method} ${r.route} ${r.requestId} ${r.status}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [slowRequests, slowSearch, slowMethod, slowThreshold]);

  const handleDownloadSlowRequestsCsv = () => {
    exportMetricsToCsv(
      filteredSlowRequests.map((r) => ({
        timestamp: r.timestamp,
        method: r.method,
        route: r.route,
        status: r.status,
        durationMs: r.durationMs,
        databaseOperations: r.databaseOperations,
        summedDatabaseMs: r.summedDatabaseMs,
        requestId: r.requestId,
        stages: JSON.stringify(r.stages || {}),
      })),
      "slow-requests-correlation.csv",
      [
        { key: "timestamp", header: isAr ? "الوقت" : "Timestamp" },
        { key: "method", header: isAr ? "الطريقة" : "Method" },
        { key: "route", header: isAr ? "المسار" : "Route" },
        { key: "status", header: isAr ? "الحالة" : "Status" },
        { key: "durationMs", header: isAr ? "المدة الإجمالية (ms)" : "Duration (ms)" },
        { key: "databaseOperations", header: isAr ? "استعلامات DB" : "DB Operations" },
        { key: "summedDatabaseMs", header: isAr ? "زمن DB (ms)" : "DB Time (ms)" },
        { key: "requestId", header: isAr ? "معرف الطلب" : "Request ID" },
        { key: "stages", header: isAr ? "المراحل" : "Stages" },
      ],
    );
  };

  if (!traffic) return null;

  return (
    <div className="space-y-4">
      {/* ─── CARD 1: Traffic Diagnostics & Route Analysis Table ─── */}
      <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 rounded-2xl space-y-4">
        {/* Card Header */}
        <div className="flex flex-col gap-2 border-b border-border/60 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-400">
              <Activity className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                {isAr
                  ? "تشخيص حركة الطلبات خلال الفترة المحددة"
                  : "Traffic diagnostics in selected window"}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isAr
                  ? "النسبة القابلة للمراجعة تشمل أخطاء الخادم وأخطاء العميل الأخرى مع جدول تفصيلي للمسارات أدناه."
                  : "Reviewable rate includes server errors and client errors, with detailed route metrics table below."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="rounded-squircle text-[10px] text-teal-400 border-teal-500/30 font-mono"
              dir="ltr"
            >
              {traffic.window}
            </Badge>
          </div>
        </div>

        {/* Outcome Classification Grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Object.entries(outcomes).map(([key, labels]) => {
            const count = traffic.outcomes[key] ?? 0;
            const isErrorKey = key.includes("error") || key === "server_error";
            const isWarningKey =
              key === "validation_rejected" ||
              key === "rate_limited" ||
              key === "permission_denied" ||
              key === "session_rejected" ||
              key === "authentication_rejected";

            return (
              <div
                key={key}
                className="rounded-xl border border-border/70 bg-secondary/30 p-3 space-y-1 hover:border-border transition-colors"
              >
                <span className="text-muted-foreground block text-[11px] truncate" title={labels[isAr ? 0 : 1]}>
                  {labels[isAr ? 0 : 1]}
                </span>
                <div className="flex items-baseline justify-between mt-1">
                  <span
                    className={cn(
                      "font-mono text-base font-bold",
                      count > 0 && isErrorKey
                        ? "text-rose-400"
                        : count > 0 && isWarningKey
                        ? "text-amber-400"
                        : count > 0
                        ? "text-foreground font-extrabold"
                        : "text-muted-foreground",
                    )}
                    dir="ltr"
                  >
                    {value(count, 0)}
                  </span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isErrorKey
                          ? "bg-rose-400 animate-pulse"
                          : isWarningKey
                          ? "bg-amber-400"
                          : "bg-teal-400",
                      )}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Database Operations Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/25 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground font-medium">
            <Database className="h-3.5 w-3.5 text-teal-400" />
            <span>
              {isAr
                ? "عمليات قاعدة البيانات لكل طلب (Database Ops / Request):"
                : "Database operations per request:"}
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs" dir="ltr">
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">mean:</span>
              <span className="font-bold text-foreground">{value(traffic.avgDbQueries)}</span>
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">p95:</span>
              <span className="font-bold text-amber-400">{value(traffic.p95DbQueries)}</span>
            </span>
            {traffic.successfulP95LatencyMs != null && (
              <>
                <span className="text-border">·</span>
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground">p95 success:</span>
                  <span className="font-bold text-emerald-400">{value(traffic.successfulP95LatencyMs)} ms</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* ─── Route Diagnostics Table Filter Bar ─── */}
        <div className="pt-2 border-t border-border/50 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
                <BarChart2 className="h-3.5 w-3.5 text-teal-400" />
                <span>
                  {isAr
                    ? "جدول استجابة المسارات في الفترة الحالية"
                    : "Route Latency & Error Breakdown (Active Window)"}
                </span>
              </h3>
              <p className="text-[10.5px] text-muted-foreground">
                {isAr
                  ? "جميع مسارات الـ API النشطة خلال الفترة مع تحليل زمن p95 وأخطاء العميل والخادم"
                  : "All API routes recorded in window with p95 latency and client/server error counts"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">
                <bdi>{filteredRoutes.length}</bdi> / <bdi>{traffic.routes.length}</bdi>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadRoutesCsv}
                disabled={filteredRoutes.length === 0}
                className="rounded-squircle gap-1.5 text-xs border-border/70 font-semibold h-8"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{isAr ? "تصدير CSV" : "Export CSV"}</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={routeSearch}
                onChange={(e) => setRouteSearch(e.target.value)}
                placeholder={isAr ? "ابحث عن مسار..." : "Search route..."}
                className="rounded-squircle ps-9 text-xs h-8.5"
                dir="ltr"
              />
            </div>

            <UiSelect value={routeMethod} onValueChange={setRouteMethod}>
              <UiSelectTrigger className="rounded-squircle text-xs h-8.5">
                <UiSelectValue placeholder={isAr ? "كل الطرق" : "All methods"} />
              </UiSelectTrigger>
              <UiSelectContent dir={dir}>
                <UiSelectItem value="all">{isAr ? "كل الطرق" : "All methods"}</UiSelectItem>
                {availableMethods.map((m) => (
                  <UiSelectItem key={m} value={m}>{m}</UiSelectItem>
                ))}
              </UiSelectContent>
            </UiSelect>

            <UiSelect value={routeTraffic} onValueChange={(v) => setRouteTraffic(v as "all" | "slow" | "errors")}>
              <UiSelectTrigger className="rounded-squircle text-xs h-8.5">
                <UiSelectValue placeholder={isAr ? "تصفية المسارات" : "Filter routes"} />
              </UiSelectTrigger>
              <UiSelectContent dir={dir}>
                <UiSelectItem value="all">{isAr ? "كل المسارات" : "All routes"}</UiSelectItem>
                <UiSelectItem value="slow">{isAr ? "الأبطأ p95 (Top 10)" : "Slowest p95 (Top 10)"}</UiSelectItem>
                <UiSelectItem value="errors">{isAr ? "أخطاء 4xx/5xx فقط" : "Errors only (4xx/5xx)"}</UiSelectItem>
              </UiSelectContent>
            </UiSelect>

            <UiSelect value={routeSort} onValueChange={(v) => setRouteSort(v as "latency" | "count" | "errors" | "route")}>
              <UiSelectTrigger className="rounded-squircle text-xs h-8.5">
                <UiSelectValue placeholder={isAr ? "ترتيب حسب" : "Sort by"} />
              </UiSelectTrigger>
              <UiSelectContent dir={dir}>
                <UiSelectItem value="latency">{isAr ? "متوسط التأخير (p95)" : "p95 Latency"}</UiSelectItem>
                <UiSelectItem value="count">{isAr ? "عدد الطلبات" : "Call count"}</UiSelectItem>
                <UiSelectItem value="errors">{isAr ? "أكثر الأخطاء" : "Error count"}</UiSelectItem>
                <UiSelectItem value="route">{isAr ? "المسار (أبجدي)" : "Route (A-Z)"}</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>

          {/* Route Table */}
          {filteredRoutes.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground border border-border/40 rounded-xl bg-secondary/10">
              {isAr ? "لا توجد مسارات مطابقة لشروط البحث والتصفية" : "No matching routes for filter criteria"}
            </div>
          ) : (
            <div className="max-h-[380px] overflow-auto rounded-xl border border-border/60">
              <table className="w-full text-xs text-start">
                <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
                  <tr className="border-b border-border/60 text-muted-foreground text-[11px]">
                    <th className="py-2.5 px-3 text-start font-bold">{isAr ? "المسار والطريقة" : "Route & Method"}</th>
                    <th className="py-2.5 px-3 text-center font-bold">{isAr ? "عدد الطلبات" : "Calls in Window"}</th>
                    <th className="py-2.5 px-3 text-center font-bold">{isAr ? "تأخير p95" : "p95 Latency"}</th>
                    <th className="py-2.5 px-3 text-center font-bold">{isAr ? "رفض العميل 4xx" : "Client 4xx"}</th>
                    <th className="py-2.5 px-3 text-center font-bold">{isAr ? "أخطاء الخادم 5xx" : "Server 5xx"}</th>
                    <th className="py-2.5 px-3 text-center font-bold">{isAr ? "معدل الرفض" : "Error Rate"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono">
                  {filteredRoutes.map((route) => {
                    const parts = route.route.split(" ");
                    const method = parts.length > 1 ? parts[0] : "GET";
                    const path = parts.length > 1 ? parts.slice(1).join(" ") : route.route;
                    const errCount =
                      route.errorCount ?? (route.status4xx ?? 0) + (route.status5xx ?? 0);
                    const total = route.totalRequests || 1;
                    const errRate = Math.round((errCount / total) * 100);

                    return (
                      <tr key={route.route} className="hover:bg-secondary/40 transition-colors">
                        <td className="py-2.5 px-3 text-start">
                          <div className="flex items-center gap-2 truncate">
                            <MethodBadge method={method} />
                            <bdi className="truncate text-foreground font-semibold" dir="ltr" title={path}>
                              {path}
                            </bdi>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center text-foreground font-bold">
                          {value(route.totalRequests, 0)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={cn("px-2 py-0.5 rounded-squircle font-bold text-xs inline-block", latencyTone(route.p95LatencyMs ?? 0))}>
                            {value(route.p95LatencyMs)} ms
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {(route.status4xx ?? 0) > 0 ? (
                            <span className="px-2 py-0.5 rounded-squircle text-amber-300 bg-amber-500/15 border border-amber-500/30 font-bold inline-block">
                              {route.status4xx}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {(route.status5xx ?? 0) > 0 ? (
                            <span className="px-2 py-0.5 rounded-squircle text-rose-400 bg-rose-500/15 border border-rose-500/30 font-bold inline-block">
                              {route.status5xx}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {errRate > 0 ? (
                            <span className={cn(
                              "px-2 py-0.5 rounded-squircle text-[11px] font-bold border inline-block",
                              (route.status5xx ?? 0) > 0
                                ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                                : "bg-amber-500/15 text-amber-300 border-amber-500/30",
                            )}>
                              {errRate}%
                            </span>
                          ) : (
                            <span className="text-emerald-400 font-bold text-[11px]">0%</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* ─── CARD 2: Dedicated Recent Slow Requests & Stage Correlation Table ─── */}
      <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 rounded-2xl space-y-4">
        {/* Card Header */}
        <div className="flex flex-col gap-2 border-b border-border/60 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Zap className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                {isAr
                  ? "سجل الطلبات البطيئة وربط المراحل (Stage Correlation)"
                  : "Recent Slow Requests & Stage Correlation"}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isAr
                  ? "تحليل أحدث الطلبات المتأخرة وتفكيك زمن الاستجابة بين المراحل (قاعدة البيانات، التحقق، المعالج، والتقديم)."
                  : "Latest slow requests breakdown with execution stage correlation (DB ops, auth, handler, render)."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-squircle font-mono text-xs text-amber-400 border-amber-500/30">
              <bdi>{filteredSlowRequests.length}</bdi> / <bdi>{(slowRequests ?? []).length}</bdi>
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadSlowRequestsCsv}
              disabled={filteredSlowRequests.length === 0}
              className="rounded-squircle gap-1.5 text-xs border-border/70 font-semibold h-8"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isAr ? "تصدير CSV" : "Export CSV"}</span>
            </Button>
          </div>
        </div>

        {/* Slow Requests Filter Bar */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={slowSearch}
              onChange={(e) => setSlowSearch(e.target.value)}
              placeholder={isAr ? "ابحث في المسار أو معرف الطلب..." : "Search path or request ID..."}
              className="rounded-squircle ps-9 text-xs h-8.5"
              dir="ltr"
            />
          </div>

          <UiSelect value={slowMethod} onValueChange={setSlowMethod}>
            <UiSelectTrigger className="rounded-squircle text-xs h-8.5">
              <UiSelectValue placeholder={isAr ? "كل الطرق" : "All methods"} />
            </UiSelectTrigger>
            <UiSelectContent dir={dir}>
              <UiSelectItem value="all">{isAr ? "كل الطرق" : "All methods"}</UiSelectItem>
              {slowAvailableMethods.map((m) => (
                <UiSelectItem key={m} value={m}>{m}</UiSelectItem>
              ))}
            </UiSelectContent>
          </UiSelect>

          <UiSelect value={slowThreshold} onValueChange={setSlowThreshold}>
            <UiSelectTrigger className="rounded-squircle text-xs h-8.5">
              <UiSelectValue placeholder={isAr ? "الحد الأدنى للمدة" : "Duration threshold"} />
            </UiSelectTrigger>
            <UiSelectContent dir={dir}>
              <UiSelectItem value="0">{isAr ? "أي مدة زمنية" : "Any duration"}</UiSelectItem>
              <UiSelectItem value="250">≥ 250 ms</UiSelectItem>
              <UiSelectItem value="500">≥ 500 ms</UiSelectItem>
              <UiSelectItem value="1000">≥ 1000 ms (1s)</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>

        {/* Slow Requests Table */}
        {filteredSlowRequests.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground border border-border/40 rounded-xl bg-secondary/10">
            {(!slowRequests || slowRequests.length === 0)
              ? isAr
                ? "لا توجد طلبات بطيئة مسجلة في نافذة الرصد الحالية لهذه العملية (جميع الاستجابات سريعة ومستقرة)."
                : "No slow requests recorded in the active process window (all responses are fast and healthy)."
              : isAr
              ? "لا توجد طلبات بطيئة مطابقة لمعايير البحث والتصفية المحددة."
              : "No slow requests match the current filter criteria."}
          </div>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-xl border border-border/60">
            <table className="w-full text-xs text-start">
              <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
                <tr className="border-b border-border/60 text-muted-foreground text-[11px]">
                  <th className="py-2.5 px-3 text-start font-bold">{isAr ? "المسار والطريقة" : "Route & Method"}</th>
                  <th className="py-2.5 px-3 text-center font-bold">{isAr ? "الحالة" : "Status"}</th>
                  <th className="py-2.5 px-3 text-center font-bold">{isAr ? "المدة الإجمالية" : "Duration"}</th>
                  <th className="py-2.5 px-3 text-center font-bold">{isAr ? "استعلامات DB" : "DB Operations"}</th>
                  <th className="py-2.5 px-3 text-start font-bold">{isAr ? "ربط المراحل (Stage Correlation)" : "Stage Breakdown"}</th>
                  <th className="py-2.5 px-3 text-end font-bold">{isAr ? "معرّف الطلب" : "Request ID"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {filteredSlowRequests.map((req) => (
                  <tr key={req.requestId} className="hover:bg-secondary/40 transition-colors">
                    {/* Route & Method */}
                    <td className="py-2.5 px-3 text-start">
                      <div className="flex items-center gap-2 truncate">
                        <MethodBadge method={req.method} />
                        <bdi className="truncate text-foreground font-semibold" dir="ltr" title={req.route}>
                          {req.route}
                        </bdi>
                      </div>
                    </td>

                    {/* Status Code */}
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-squircle font-bold text-[11px] border inline-block",
                          req.status >= 500
                            ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                            : req.status >= 400
                            ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                            : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                        )}
                      >
                        {req.status}
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="py-2.5 px-3 text-center">
                      <span className={cn("px-2 py-0.5 rounded-squircle font-bold text-xs inline-block", latencyTone(req.durationMs, 500, 1500))}>
                        {value(req.durationMs)} ms
                      </span>
                    </td>

                    {/* DB Ops */}
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 rounded-squircle bg-teal-500/10 border border-teal-500/25 px-2 py-0.5 text-[11px] text-teal-300 font-bold">
                        <Database className="h-3 w-3" />
                        <span>{req.databaseOperations} DB</span>
                        <span className="text-muted-foreground font-normal">({value(req.summedDatabaseMs)} ms)</span>
                      </span>
                    </td>

                    {/* Stages breakdown */}
                    <td className="py-2.5 px-3 text-start">
                      {req.stages && Object.keys(req.stages).length > 0 ? (
                        <div className="flex flex-wrap gap-1.5" dir="ltr">
                          {Object.entries(req.stages).map(([stage, ms]) => (
                            <span
                              key={stage}
                              className="inline-flex items-center gap-1 rounded-squircle border border-border/60 bg-secondary/60 px-1.5 py-0.5 text-[10px]"
                            >
                              <span className="text-muted-foreground">{stage}:</span>
                              <span className="font-bold text-foreground">{value(ms)}ms</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60 text-[11px]">—</span>
                      )}
                    </td>

                    {/* Request ID with copy */}
                    <td className="py-2.5 px-3 text-end">
                      <div className="inline-flex items-center gap-1.5" dir="ltr">
                        <bdi className="font-mono text-[10.5px] text-muted-foreground truncate max-w-[110px]" title={req.requestId}>
                          {req.requestId.slice(0, 12)}...
                        </bdi>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyRequestId(req.requestId)}
                          className="h-6 w-6 p-0 rounded-squircle text-muted-foreground hover:text-foreground"
                          title={isAr ? "نسخ معرّف الطلب بالكامل" : "Copy full request ID"}
                        >
                          {copiedId === req.requestId ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
