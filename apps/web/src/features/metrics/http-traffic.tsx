"use client";

import { Card } from "@/components/ui/card";
import * as Select from "@radix-ui/react-select";
import type { HttpTraffic, MetricsSummaryResponse, TrafficWindow } from "./api";

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
        <span className="text-xs font-bold">
          {isAr ? "حركة الطلبات" : "HTTP Traffic"}
        </span>
        <Select.Root
          dir={isAr ? "rtl" : "ltr"}
          value={window}
          onValueChange={(next) => onWindowChange(next as TrafficWindow)}
        >
          <Select.Trigger
            className="h-8 w-24 rounded-squircle border border-border bg-secondary/50 text-xs"
            aria-label={isAr ? "الفترة الزمنية" : "Traffic window"}
          >
            <Select.Value />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              dir={isAr ? "rtl" : "ltr"}
              position="popper"
              sideOffset={4}
              className="z-50 min-w-24 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
            >
              <Select.Viewport>
                {(["5m", "15m", "1h", "24h"] as const).map((period) => (
                  <Select.Item
                    className="cursor-pointer rounded-squircle px-3 py-2 text-start text-xs outline-none data-highlighted:bg-accent"
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
        <strong className="text-2xl">{value(traffic?.totalRequests, 0)}</strong>
        <span className="text-amber-400">
          {value(traffic?.requestsPerSecond, 2)} RPS
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {isAr ? "طلبات خلال الفترة المحددة" : "Requests in selected window"}
      </p>
      <p className="mt-2 text-xs font-mono" dir="ltr">
        p50 {value(traffic?.p50LatencyMs)} · p95 {value(traffic?.p95LatencyMs)}{" "}
        · p99 {value(traffic?.p99LatencyMs)} ms
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {isAr
          ? "كل الحالات · p95 للناجح فقط:"
          : "All statuses · successful p95:"}{" "}
        <bdi>{value(traffic?.successfulP95LatencyMs)} ms</bdi>
      </p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs font-mono" dir="ltr">
        <span className="text-emerald-400">
          2xx {value(traffic?.status2xx, 0)}
        </span>
        <span>3xx {value(traffic?.status3xx, 0)}</span>
        <span className="text-amber-400">
          4xx {value(traffic?.status4xx, 0)}
        </span>
        <span
          className={
            (traffic?.status5xx ?? 0) > 0
              ? "text-rose-400"
              : "text-muted-foreground"
          }
        >
          5xx {value(traffic?.status5xx, 0)}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-amber-300">
        <bdi>{value(traffic?.rawErrorRatePercent)}%</bdi>{" "}
        {isAr ? "كل استجابات 4xx/5xx" : "Raw 4xx/5xx responses"}
      </p>
      <p className="mt-1 text-[11px]">
        <bdi>{value(traffic?.actionableErrorRatePercent)}%</bdi>{" "}
        {isAr ? "أخطاء أخرى تحتاج مراجعة" : "Other errors requiring review"}
      </p>
      <p className="mt-2 text-[10px] text-muted-foreground">
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
        <p className="mt-1 text-[10px] text-muted-foreground">
          {isAr
            ? "السجل المجمّع عبر Prometheus غير متاح"
            : "Aggregated Prometheus history unavailable"}
        </p>
      )}
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
  if (!traffic) return null;
  const errors = [...traffic.routes]
    .sort(
      (a, b) =>
        (b.errorCount ?? (b.status4xx ?? 0) + (b.status5xx ?? 0)) -
        (a.errorCount ?? (a.status4xx ?? 0) + (a.status5xx ?? 0)),
    )
    .filter(
      (r) => (r.errorCount ?? (r.status4xx ?? 0) + (r.status5xx ?? 0)) > 0,
    );
  return (
    <Card className="rounded-2xl border-border p-5 space-y-4">
      <h2 className="font-bold">
        {isAr
          ? "تشخيص حركة الطلبات خلال الفترة المحددة"
          : "Traffic diagnostics in selected window"}
      </h2>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "النسبة القابلة للمراجعة تشمل أخطاء الخادم وأخطاء العميل الأخرى. تبقى استجابات الأمان والتحقق ظاهرة أدناه."
          : "The review rate includes server errors and other client errors. Security and validation responses remain visible below."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(outcomes).map(([key, labels]) => (
          <div key={key} className="rounded-xl bg-secondary/40 p-3 text-xs">
            <span className="text-muted-foreground">
              {labels[isAr ? 0 : 1]}
            </span>
            <strong className="ms-2 font-mono">
              {value(traffic.outcomes[key] ?? 0, 0)}
            </strong>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "عمليات قاعدة البيانات لكل طلب: متوسط / p95"
          : "Database operations per request: mean / p95"}{" "}
        <bdi>
          {value(traffic.avgDbQueries)} / {value(traffic.p95DbQueries)}
        </bdi>
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          {
            title: isAr ? "أبطأ المسارات حسب p95" : "Slowest routes by p95",
            rows: traffic.routes.slice(0, 5),
            latency: true,
          },
          {
            title: isAr
              ? "المسارات الأكثر استجابات 4xx/5xx"
              : "Routes with most 4xx/5xx responses",
            rows: errors.slice(0, 5),
            latency: false,
          },
        ].map((group) => (
          <div key={group.title}>
            <h3 className="mb-2 text-sm font-semibold">{group.title}</h3>
            {group.rows.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {isAr ? "لا توجد عينات" : "No samples"}
              </p>
            )}
            {group.rows.map((route) => (
              <div
                key={route.route}
                className="flex justify-between gap-2 border-b border-border/50 py-2 text-xs"
              >
                <bdi className="break-all font-mono">{route.route}</bdi>
                <bdi className="shrink-0 font-mono">
                  {group.latency
                    ? `${value(route.p95LatencyMs)} ms (${value(route.totalRequests, 0)})`
                    : value(
                        route.errorCount ??
                          (route.status4xx ?? 0) + (route.status5xx ?? 0),
                        0,
                      )}
                </bdi>
              </div>
            ))}
          </div>
        ))}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer font-semibold">
          {isAr
            ? "أحدث الطلبات البطيئة في هذه العملية — ربط مراحل الطلب"
            : "Recent slow requests on this process — stage correlation"}
        </summary>
        <p className="mt-2 text-muted-foreground">
          {isAr
            ? "مجموع زمن قاعدة البيانات قد يتداخل بين الاستعلامات المتوازية."
            : "Summed database time can overlap across concurrent queries."}
        </p>
        {(slowRequests ?? []).slice(0, 10).map((request) => (
          <div
            key={request.requestId}
            className="mt-2 rounded-xl bg-secondary/40 p-3 font-mono"
            dir="ltr"
          >
            <p>
              {request.method} {request.route} · {request.status} ·{" "}
              {value(request.durationMs)} ms · DB {request.databaseOperations}
            </p>
            <p className="break-all">{request.requestId}</p>
            <p>
              {Object.entries(request.stages)
                .map(([stage, ms]) => `${stage}: ${value(ms)} ms`)
                .join(" · ")}
            </p>
          </div>
        ))}
      </details>
    </Card>
  );
}
