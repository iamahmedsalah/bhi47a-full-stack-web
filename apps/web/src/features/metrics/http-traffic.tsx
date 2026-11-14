"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import * as Select from "@radix-ui/react-select";
import { Activity, CheckCircle2, Database, Gauge, Radio } from "lucide-react";
import {
  latencyTone,
  type HttpTraffic,
  type TrafficWindow,
} from "./api";

const value = (number: number | null | undefined, digits = 1) =>
  number == null
    ? "—"
    : number.toLocaleString("en-GB", { maximumFractionDigits: digits });

interface OutcomeMeta {
  ar: string;
  en: string;
  descAr: string;
  descEn: string;
  httpTag: string;
  tone: "cyan" | "amber" | "orange" | "rose" | "slate";
}

const OUTCOME_CATALOG: Record<string, OutcomeMeta> = {
  anonymous_probe: {
    ar: "فحص جلسة مجهولة",
    en: "Anonymous session probes",
    descAr: "طلبات تحقق أولية بدون كوكي جلسة نشطة",
    descEn: "Initial auth checks without an active session cookie",
    httpTag: "401 Probe",
    tone: "cyan",
  },
  session_rejected: {
    ar: "جلسة مرفوضة أو منتهية",
    en: "Rejected / expired sessions",
    descAr: "رموز JWT منتهية الصلاحية أو جلسات تم إبطالها",
    descEn: "Expired JWT tokens or revoked user sessions",
    httpTag: "401 Session",
    tone: "amber",
  },
  authentication_rejected: {
    ar: "مصادقة مرفوضة",
    en: "Authentication rejected",
    descAr: "محاولات تسجيل دخول ببيانات غير صحيحة",
    descEn: "Login attempts with invalid credentials",
    httpTag: "401 Auth",
    tone: "amber",
  },
  permission_denied: {
    ar: "صلاحيات مرفوضة",
    en: "Permission denied",
    descAr: "محاولة وصول لدور أو صلاحية غير مخولة (RBAC)",
    descEn: "Access blocked by role or permission guards (RBAC)",
    httpTag: "403 RBAC",
    tone: "orange",
  },
  validation_rejected: {
    ar: "طلب غير صالح",
    en: "Invalid requests",
    descAr: "رفض المدخلات عبر قواعد التحقق DTO / الفلاتر",
    descEn: "Payloads rejected by DTO validation pipes",
    httpTag: "400 / 422",
    tone: "amber",
  },
  rate_limited: {
    ar: "تجاوز معدل الطلبات",
    en: "Rate limited",
    descAr: "حظر مؤقت لتجاوز الحد المسموح للطلبات",
    descEn: "Throttled requests exceeding rate-limit quotas",
    httpTag: "429 Limit",
    tone: "orange",
  },
  unexpected_client_error: {
    ar: "أخطاء عميل تحتاج مراجعة",
    en: "Other client errors",
    descAr: "استجابات 4xx غير معتادة تستدعي المراجعة",
    descEn: "Uncommon 4xx responses requiring inspection",
    httpTag: "4xx Review",
    tone: "orange",
  },
  server_error: {
    ar: "أخطاء الخادم",
    en: "Server errors",
    descAr: "استثناءات داخلية في الخادم أو قاعدة البيانات",
    descEn: "Unhandled 5xx server or database exceptions",
    httpTag: "5xx Fault",
    tone: "rose",
  },
  unclassified_error: {
    ar: "أخطاء غير مصنفة",
    en: "Unclassified errors",
    descAr: "استجابات غير مصنفة ضمن الفئات القياسية",
    descEn: "Responses outside standard diagnostic buckets",
    httpTag: "Other",
    tone: "slate",
  },
};

function getToneClasses(tone: OutcomeMeta["tone"], count: number) {
  if (count === 0) {
    return {
      card: "border-border/60 bg-secondary/20 hover:border-border",
      badge: "border-border/60 bg-secondary/50 text-muted-foreground",
      count: "text-foreground",
      bar: "bg-muted-foreground/30",
    };
  }
  switch (tone) {
    case "rose":
      return {
        card: "border-rose-500/35 bg-rose-500/10 hover:border-rose-500/50",
        badge: "border-rose-500/30 bg-rose-500/15 text-rose-300",
        count: "text-rose-400",
        bar: "bg-rose-500",
      };
    case "orange":
      return {
        card: "border-orange-500/30 bg-orange-500/10 hover:border-orange-500/45",
        badge: "border-orange-500/30 bg-orange-500/15 text-orange-300",
        count: "text-orange-300",
        bar: "bg-orange-400",
      };
    case "amber":
      return {
        card: "border-amber-500/30 bg-amber-500/10 hover:border-amber-500/45",
        badge: "border-amber-500/30 bg-amber-500/15 text-amber-300",
        count: "text-amber-300",
        bar: "bg-amber-400",
      };
    case "cyan":
      return {
        card: "border-cyan-500/30 bg-cyan-500/10 hover:border-cyan-500/45",
        badge: "border-cyan-500/30 bg-cyan-500/15 text-cyan-300",
        count: "text-cyan-300",
        bar: "bg-cyan-400",
      };
    default:
      return {
        card: "border-border/70 bg-secondary/30 hover:border-border",
        badge: "border-border/60 bg-secondary/60 text-muted-foreground",
        count: "text-foreground",
        bar: "bg-teal-400",
      };
  }
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

      <p className="mt-2 text-[10px] text-muted-foreground">
        {isAr ? 'المئينات تقديرات من المدرج التكراري. طلبات تتجاوز 10 ثوانٍ:' : 'Percentiles are histogram estimates. Requests over 10 seconds:'}{' '}
        <bdi>{value(traffic?.overTenSeconds, 0)}</bdi>
      </p>
      {(traffic?.latencyOverflowRequests ?? 0) > 0 && <p role="status" className="text-xs text-amber-400">
        {isAr ? 'توجد طلبات تتجاوز نطاق القياس؛ المئينات خارج النطاق غير متاحة:' : 'Requests exceed the histogram range; overflowing percentiles are unavailable:'}{' '}
        <bdi>{value(traffic?.latencyOverflowRequests, 0)} &gt; {value((traffic?.latencyUpperBoundMs ?? 0) / 1000)} s</bdi>
      </p>}

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

export function HttpTrafficDiagnostics({
  traffic,
  isAr,
}: {
  traffic?: HttpTraffic;
  isAr: boolean;
}) {
  if (!traffic) return null;

  const totalNon2xx = Object.values(traffic.outcomes ?? {}).reduce(
    (sum, n) => sum + (Number(n) || 0),
    0,
  );
  const statusEntries = Object.entries(traffic.statusCounts ?? {}).sort(
    ([a], [b]) => Number(a) - Number(b),
  );

  return (
    <Card
      className="space-y-4 rounded-2xl border-border/70 bg-card/45 p-5 shadow-lg backdrop-blur-sm"
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-teal-400 shrink-0" />
            <h2 className="text-sm font-bold text-foreground">
              {isAr
                ? "تشخيص حركة الطلبات وتصنيف الاستجابات خلال الفترة المحددة"
                : "HTTP Traffic & Response Diagnostics in Selected Window"}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "تحليل تفصيلي لأسباب استجابات 4xx/5xx وفصل فحوصات الجلسة المعتادة عن الأخطاء الفعلية ومعدل استعلامات قاعدة البيانات لكل طلب."
              : "Detailed breakdown of 4xx/5xx response classifications, separating routine session probes from actionable errors and per-request database load."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="rounded-squircle border-teal-500/30 bg-teal-500/10 text-teal-300 font-mono text-[11px]"
          >
            {isAr ? "النافذة الزمنية:" : "Window:"}{" "}
            <bdi dir="ltr" className="ms-1 font-bold">
              {traffic.window}
            </bdi>
          </Badge>
          <Badge
            variant="outline"
            className="rounded-squircle border-border/70 bg-secondary/40 text-foreground font-mono text-[11px]"
          >
            {isAr ? "إجمالي الطلبات:" : "Total:"}{" "}
            <bdi dir="ltr" className="ms-1 font-bold">
              {value(traffic.totalRequests, 0)}
            </bdi>
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "rounded-squircle font-mono text-[11px]",
              (traffic.status5xx ?? 0) > 0
                ? "border-rose-500/35 bg-rose-500/15 text-rose-300"
                : totalNon2xx > 0
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
            )}
          >
            {isAr ? "الاستجابات المصنفة:" : "Classified outcomes:"}{" "}
            <bdi dir="ltr" className="ms-1 font-bold">
              {value(totalNon2xx, 0)}
            </bdi>
          </Badge>
        </div>
      </div>

      {/* 9 Diagnostic Outcome Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(OUTCOME_CATALOG).map(([key, meta]) => {
          const count = traffic.outcomes?.[key] ?? 0;
          const sharePercent =
            traffic.totalRequests > 0
              ? Math.min(100, (count / traffic.totalRequests) * 100)
              : 0;
          const styles = getToneClasses(meta.tone, count);

          return (
            <div
              key={key}
              className={cn(
                "rounded-xl border p-3.5 text-xs transition-colors flex flex-col justify-between gap-2.5",
                styles.card,
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <span className="font-bold text-foreground block truncate">
                    {isAr ? meta.ar : meta.en}
                  </span>
                  <span className="text-[11px] text-muted-foreground block line-clamp-1">
                    {isAr ? meta.descAr : meta.descEn}
                  </span>
                </div>
                <span
                  dir="ltr"
                  className={cn(
                    "shrink-0 rounded-squircle border px-2 py-0.5 font-mono text-[10px] font-semibold",
                    styles.badge,
                  )}
                >
                  {meta.httpTag}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <bdi
                    dir="ltr"
                    className={cn("font-mono text-lg font-black", styles.count)}
                  >
                    {value(count, 0)}
                  </bdi>
                  <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                    {value(sharePercent, 1)}%{" "}
                    {isAr ? "من الطلبات" : "of requests"}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-secondary/60">
                  <div
                    className={cn("h-full rounded-full transition-all duration-300", styles.bar)}
                    style={{ width: `${Math.max(count > 0 ? 4 : 0, sharePercent)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Telemetry Strip: DB Queries / Request, Latency Summary & HTTP Status Codes */}
      <div className="grid gap-3 pt-1 lg:grid-cols-3">
        {/* 1. Database Operations per Request */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/30 p-3.5 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="rounded-squircle bg-teal-500/15 p-2 text-teal-400 shrink-0">
              <Database className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="font-semibold text-foreground block truncate">
                {isAr
                  ? "معدل عمليات قاعدة البيانات لكل طلب"
                  : "Database operations per request"}
              </span>
              <span className="text-[11px] text-muted-foreground block">
                {isAr
                  ? "متوسط وأعلى 95% من الاستعلامات لكل طلب HTTP"
                  : "Mean and p95 MongoDB queries executed per HTTP call"}
              </span>
            </div>
          </div>
          <bdi
            dir="ltr"
            className="shrink-0 rounded-squircle border border-teal-500/25 bg-teal-500/10 px-2.5 py-1.5 font-mono text-xs font-bold text-teal-300"
          >
            mean: {value(traffic.avgDbQueries)} · p95: {value(traffic.p95DbQueries)}
          </bdi>
        </div>

        {/* 2. Window Latency Summary */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/30 p-3.5 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="rounded-squircle bg-cyan-500/15 p-2 text-cyan-400 shrink-0">
              <Gauge className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="font-semibold text-foreground block truncate">
                {isAr
                  ? "ملخص زمن الاستجابة خلال الفترة"
                  : "Window latency distribution"}
              </span>
              <span className="text-[11px] text-muted-foreground block">
                {isAr
                  ? "المتوسط الحسابي ومؤشرات p50 / p95 / p99"
                  : "Mean response time and p50 / p95 / p99 percentiles"}
              </span>
            </div>
          </div>
          <bdi
            dir="ltr"
            className={cn(
              "shrink-0 rounded-squircle px-2.5 py-1.5 font-mono text-xs font-bold",
              latencyTone(traffic.p95LatencyMs ?? 0, 100, 500),
            )}
          >
            avg: {value(traffic.avgLatencyMs)} · p95: {value(traffic.p95LatencyMs)} ms
          </bdi>
        </div>

        {/* 3. Active HTTP Status Codes */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/30 p-3.5 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="font-semibold text-foreground">
              {isAr ? "توزيع رموز HTTP:" : "HTTP Statuses:"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-mono" dir="ltr">
            {statusEntries.length > 0 ? (
              statusEntries.map(([code, cnt]) => {
                const statusNum = Number(code);
                const toneClass =
                  statusNum >= 500
                    ? "border-rose-500/30 bg-rose-500/15 text-rose-300"
                    : statusNum >= 400
                      ? "border-amber-500/30 bg-amber-500/15 text-amber-300"
                      : statusNum >= 300
                        ? "border-cyan-500/30 bg-cyan-500/15 text-cyan-300"
                        : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
                return (
                  <span
                    key={code}
                    className={cn(
                      "rounded-squircle border px-2 py-0.5 text-[11px] font-bold",
                      toneClass,
                    )}
                  >
                    {code}: {value(cnt, 0)}
                  </span>
                );
              })
            ) : (
              <span className="text-muted-foreground text-[11px]">
                2xx: {value(traffic.status2xx, 0)} · 4xx: {value(traffic.status4xx, 0)} · 5xx:{" "}
                {value(traffic.status5xx, 0)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
