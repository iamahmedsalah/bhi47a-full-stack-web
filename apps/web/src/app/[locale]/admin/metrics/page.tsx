'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Activity, ArrowRight, ArrowUpDown, Cpu, Database, Server, ShieldAlert, Clock, RefreshCw, Copy, Check, AlertTriangle, GraduationCap, TrendingUp, Layers, Radio, SlidersHorizontal, Download, Terminal, Link2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

import { LoadingState, ErrorState } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/lib/api';
import { downloadFileBlob } from '@/lib/export-utils';
import {
  getMetricsSummary,
  getRawPrometheusMetrics,
  type LabelCount,
  type MetricsSummaryResponse,
} from '@/features/metrics/api';
import { LockedAccountsModal } from './locked-accounts-modal';
import { HttpTrafficCard, HttpTrafficDiagnostics } from '@/features/metrics/http-traffic';
import { DriverDiagnosticsPanel } from '@/features/metrics/driver-diagnostics';
import { UnifiedPerformanceTables } from '@/features/metrics/unified-tables';
import type { TrafficWindow } from '@/features/metrics/api';

const CARD_CLASS =
  'p-5 bg-card/45 backdrop-blur-sm border-border/70 rounded-2xl space-y-4';
const KPI_CARD_CLASS =
  'p-4 bg-card/45 backdrop-blur-sm border-border/70 relative overflow-hidden rounded-2xl shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all';
const TILE_CLASS =
  'rounded-xl border border-border/70 bg-secondary/30 p-3 space-y-1';

function StatTile({
  label,
  value,
  tone = 'text-foreground',
  ltr = true,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  ltr?: boolean;
}) {
  return (
    <div className={TILE_CLASS}>
      <span className="text-muted-foreground block text-[11px]">{label}</span>
      <span className={`font-mono text-lg font-bold ${tone}`} dir={ltr ? 'ltr' : undefined}>
        {value}
      </span>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      {badge}
    </div>
  );
}

function LabelBreakdown({
  title,
  items,
  emptyText,
  tone = 'bg-primary',
}: {
  title: string;
  items?: LabelCount[];
  emptyText: string;
  tone?: string;
}) {
  const max = Math.max(1, ...(items ?? []).map((i) => i.count));
  return (
    <div className="space-y-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {!items || items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 8).map((item) => (
            <li key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <bdi dir="ltr" className="truncate text-foreground">
                  {item.label}
                </bdi>
                <span className="text-muted-foreground">{item.count}</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-secondary/50">
                <div
                  className={`h-full rounded-full ${tone}`}
                  style={{ width: `${Math.round((item.count / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminMetricsPage() {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const dateLocale = isAr ? 'ar-EG' : 'en-GB';

  const [refreshInterval, setRefreshInterval] = useState<number>(5000);
  const [trafficWindow, setTrafficWindow] = useState<TrafficWindow>('5m');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Raw Prometheus exposition viewer
  const [rawOpen, setRawOpen] = useState(false);
  const [rawSearch, setRawSearch] = useState('');

  // Locked Accounts management dialog
  const [lockedAccountsOpen, setLockedAccountsOpen] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } =
    useQuery<MetricsSummaryResponse>({
      queryKey: ['admin-metrics-summary', trafficWindow],
      queryFn: () => getMetricsSummary(trafficWindow),
      refetchInterval: refreshInterval > 0 ? refreshInterval : false,
      refetchOnWindowFocus: true,
    });

  const rawQuery = useQuery<string>({
    queryKey: ['admin-metrics-raw'],
    queryFn: getRawPrometheusMetrics,
    enabled: rawOpen,
    refetchInterval: rawOpen && refreshInterval > 0 ? Math.max(refreshInterval, 15000) : false,
  });

  const rawLines = useMemo(() => {
    const text = rawQuery.data ?? '';
    const term = rawSearch.trim().toLowerCase();
    const lines = text.split('\n');
    if (!term) return lines;
    return lines.filter((line) => line.toLowerCase().includes(term));
  }, [rawQuery.data, rawSearch]);

  const getMetricsUrl = () => {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const trimmed = base.replace(/\/+$/, '');
    return `${trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`}/metrics`;
  };

  const handleCopyMetricsUrl = async () => {
    if (typeof window === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(getMetricsUrl());
      setCopiedUrl(true);
      toast.success(isAr ? 'تم نسخ رابط سحب المقاييس (Scrape URL)' : 'Copied metrics scrape URL');
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      toast.error(isAr ? 'تعذر النسخ إلى الحافظة' : 'Clipboard copy failed');
    }
  };

  const handleDownloadRaw = () => {
    if (!rawQuery.data) return;
    downloadFileBlob(
      new Blob([rawQuery.data], { type: 'text/plain;charset=utf-8' }),
      `prometheus-metrics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`,
      'text/plain;charset=utf-8',
    );
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return isAr ? `${d} يوم ${h} ساعة` : `${d}d ${h}h`;
    if (h > 0) return isAr ? `${h} ساعة ${m} دقيقة` : `${h}h ${m}m`;
    return isAr ? `${m} دقيقة ${s} ثانية` : `${m}m ${s}s`;
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale, { timeZone: 'Africa/Cairo' });

  return (
    <div className="space-y-6" dir={dir}>
      {/* ─── Top Header Banner ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-400">
              <Activity className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-black text-foreground">
                {isAr ? 'مؤشرات الأداء والخادم (APM & Metrics)' : 'Server & System Metrics (APM)'}
              </h1>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? 'مراقبة حية لاستهلاك المعالج، الذاكرة، استعلامات MongoDB، ومعدل الطلبات في الثانية'
                  : 'Real-time telemetry for CPU, Memory, MongoDB slow queries, and HTTP RPS'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-squircle bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 text-xs font-semibold text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>{isAr ? 'بث حي' : 'Live Stream'}</span>
          </span>

          {data?.timestamp && (
            <span className="inline-flex items-center gap-1 rounded-squircle border border-border/70 bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{isAr ? 'آخر تحديث:' : 'Updated:'}</span>
              <bdi className="font-mono">{formatTime(data.timestamp)}</bdi>
            </span>
          )}

          <div className="flex items-center gap-1 rounded-squircle border border-border/70 bg-card/60 p-1 text-xs font-medium">
            <span className="px-2 text-muted-foreground">{isAr ? 'التحديث:' : 'Refresh:'}</span>
            {[
              { label: isAr ? '5ث' : '5s', ms: 5000 },
              { label: isAr ? '15ث' : '15s', ms: 15000 },
              { label: isAr ? '30ث' : '30s', ms: 30000 },
              { label: isAr ? 'إيقاف' : 'Off', ms: 0 },
            ].map((opt) => (
              <button
                key={opt.ms}
                id={`metrics-refresh-${opt.ms}`}
                type="button"
                onClick={() => setRefreshInterval(opt.ms)}
                aria-pressed={refreshInterval === opt.ms}
                className={`rounded-squircle px-2.5 py-0.5 transition-colors ${
                  refreshInterval === opt.ms
                    ? 'bg-primary text-white font-bold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Button
            id="metrics-refresh-now"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-squircle gap-1.5 text-xs font-semibold border-border/70"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>{isAr ? 'تحديث فوري' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState title={isAr ? 'جاري قراءة مقاييس الخادم...' : 'Fetching system metrics...'} />
      ) : isError || !data ? (
        <ErrorState
          title={isAr ? 'تعذر جلب مقاييس الخادم' : 'Failed to fetch metrics'}
          description={getApiErrorMessage(
            error,
            isAr ? 'تأكد من تشغيل خادم الـ API وصلاحية حساب المدير' : 'Ensure API is running and you have admin role',
          )}
          onRetry={() => refetch()}
        />
      ) : (
        <div className="space-y-6">
          {/* ─── ROW 1: Executive KPI Widgets ─── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <Card className={KPI_CARD_CLASS}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {isAr ? 'قاعدة بيانات MongoDB' : 'MongoDB Database'}
                  </span>
                  <Database className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${
                        data.database.status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                      }`}
                    />
                    <span className="text-base font-extrabold text-foreground">
                      {data.database.status === 'connected' ? (isAr ? 'متصل ومستقر' : 'Connected') : (isAr ? 'منقطع' : 'Disconnected')}
                    </span>
                  </div>
                  {data.database.pingLatencyMs >= 0 && (
                    <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-squircle border border-emerald-500/20" dir="ltr">
                      {data.database.pingLatencyMs} ms
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground font-mono">
                  {isAr ? 'إجمالي الاستعلامات: ' : 'Total Queries: '}
                  <bdi>{data.database.totalQueries}</bdi>
                </p>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }}>
              <Card className={KPI_CARD_CLASS}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {isAr ? 'ذاكرة الـ Heap المستخدمة' : 'V8 Heap Memory'}
                  </span>
                  <Server className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2" dir="ltr">
                  <span className="font-mono text-2xl font-black text-foreground">{data.system.memoryHeapUsedMb}</span>
                  <span className="text-xs text-muted-foreground font-mono">/ {data.system.memoryHeapTotalMb} MB</span>
                </div>
                <div className="mt-2 w-full bg-secondary/50 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-cyan-500 h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.round((data.system.memoryHeapUsedMb / (data.system.memoryHeapTotalMb || 1)) * 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground font-mono">
                  RSS: <bdi>{data.system.memoryRssMb} MB</bdi>
                </p>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }}>
              <HttpTrafficCard traffic={data.traffic} isAr={isAr} window={trafficWindow} onWindowChange={setTrafficWindow} className={KPI_CARD_CLASS} />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.15 }}>
              <Card className={KPI_CARD_CLASS}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {isAr
                      ? `الاستعلامات البطيئة (>${data.database.slowQueryThresholdMs ?? 100}ms)`
                      : `Slow Queries (>${data.database.slowQueryThresholdMs ?? 100}ms)`}
                  </span>
                  <AlertTriangle
                    className={`h-4 w-4 ${data.database.slowQueriesCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}
                  />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className={`font-mono text-2xl font-black ${data.database.slowQueriesCount > 0 ? 'text-rose-400' : 'text-foreground'}`}>
                    {data.database.slowQueriesCount}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {data.database.slowQueriesCount === 0
                      ? isAr ? 'أداء ممتاز' : 'Optimal'
                      : isAr ? 'بحاجة لمراجعة' : 'Needs Review'}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {isAr ? 'مدة تشغيل السيرفر: ' : 'Uptime: '}
                  <bdi>{formatUptime(data.uptimeSeconds)}</bdi>
                </p>
              </Card>
            </motion.div>
          </div>

          {/* ─── ROW 2: Security & Academic Telemetry ─── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className={CARD_CLASS}>
              <SectionHeader
                icon={<ShieldAlert className="h-4 w-4 text-primary" />}
                title={isAr ? 'حماية وأمان المنظومة (Security Telemetry)' : 'Security & Threat Telemetry'}
                badge={
                  <Badge variant="outline" className="rounded-squircle text-[10px]">
                    {isAr ? 'مكافحة الهجمات نشطة' : 'Active Shields'}
                  </Badge>
                }
              />
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                <StatTile label={isAr ? 'تسجيل دخول ناجح' : 'Successful Logins'} value={data.security.successfulLogins} tone="text-emerald-400" />
                <StatTile
                  label={isAr ? 'بيانات دخول خاطئة' : 'Invalid Credentials'}
                  value={data.security.invalidCredentialLogins ?? data.security.failedLogins}
                  tone={(data.security.invalidCredentialLogins ?? data.security.failedLogins) > 0 ? 'text-amber-400' : 'text-muted-foreground'}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setLockedAccountsOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setLockedAccountsOpen(true);
                    }
                  }}
                  className={cn(
                    TILE_CLASS,
                    'group cursor-pointer transition-all duration-200 hover:border-rose-500/60 hover:bg-rose-500/10 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-500/40 relative select-none',
                  )}
                  title={
                    isAr
                      ? 'انقر لعرض الحسابات المقفلة وفك الحظر اللحظي'
                      : 'Click to view and instantly unlock locked accounts'
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground block text-[11px] group-hover:text-rose-300 transition-colors">
                      {isAr ? 'حسابات مقفلة (Brute-Force)' : 'Locked Accounts'}
                    </span>
                    <span className="text-[10px] text-rose-400 group-hover:underline flex items-center gap-1 font-medium">
                      <span>{isAr ? 'عرض وفك الحظر' : 'View & Unlock'}</span>
                      <ArrowRight className="h-3 w-3 shrink-0 rtl:rotate-180" aria-hidden="true" />
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-0.5">
                    <span
                      className={`font-mono text-lg font-bold ${(data.security.currentlyLockedAccounts ?? 0) > 0 ? 'text-rose-400' : 'text-muted-foreground'}`}
                      dir="ltr"
                    >
                      {data.security.currentlyLockedAccounts ?? 0}
                    </span>
                    {(data.security.currentlyLockedAccounts ?? 0) > 0 ? (
                      <Badge variant="destructive" className="rounded-squircle text-[9.5px] py-0 px-1.5 h-4">
                        {isAr ? 'حظر نشط' : 'Active'}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        {isAr
                          ? `${data.security.lockedLogins ?? 0} محاولات محجوبة`
                          : `${data.security.lockedLogins ?? 0} blocked tries`}
                      </span>
                    )}
                  </div>
                </div>
                <StatTile label={isAr ? 'إجمالي المحاولات الفاشلة' : 'Total Failed Logins'} value={data.security.failedLogins} />
                <StatTile label={isAr ? 'حظر معدل الطلبات (HTTP 429)' : 'Rate Limit 429 Blocks'} value={data.security.rateLimitBlocks} />
                <StatTile
                  label={isAr ? 'مخالفات الغش المسجلة' : 'Anti-Cheat Violations'}
                  value={data.security.antiCheatViolations}
                  tone={data.security.antiCheatViolations > 0 ? 'text-rose-400' : 'text-muted-foreground'}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LabelBreakdown
                  title={isAr ? 'الحظر حسب المسار' : 'Rate Limits by Endpoint'}
                  items={data.security.rateLimitByEndpoint}
                  emptyText={isAr ? 'لا يوجد حظر مسجل' : 'No blocks recorded'}
                  tone="bg-amber-400"
                />
                <LabelBreakdown
                  title={isAr ? 'مخالفات الغش حسب السبب' : 'Anti-Cheat by Reason'}
                  items={data.security.antiCheatByReason}
                  emptyText={isAr ? 'لا توجد مخالفات' : 'No violations recorded'}
                  tone="bg-rose-400"
                />
              </div>
            </Card>

            <Card className={CARD_CLASS}>
              <SectionHeader
                icon={<GraduationCap className="h-4 w-4 text-teal-400" />}
                title={isAr ? 'النشاط الأكاديمي اللحظي (Live Academic Activity)' : 'Live Academic Activity'}
                badge={
                  <Badge variant="outline" className="rounded-squircle text-[10px] text-teal-400 border-teal-500/30">
                    {isAr ? 'الحرم الجامعي الرقمي' : 'Digital Campus'}
                  </Badge>
                }
              />
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-xl border border-teal-500/25 bg-teal-500/10 p-3 space-y-1">
                  <span className="text-teal-200 block text-[11px] font-semibold">
                    {isAr ? 'طلاب يحلون كويزات الآن' : 'Students in Quizzes Now'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xl font-black text-teal-400">{data.academic.activeQuizAttempts}</span>
                    {data.academic.activeQuizAttempts > 0 && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                      </span>
                    )}
                  </div>
                </div>
                <StatTile label={isAr ? 'إجمالي الكويزات المسلّمة' : 'Quizzes Submitted'} value={data.academic.quizzesSubmitted} />
                <StatTile label={isAr ? 'كويزات ناجحة' : 'Quizzes Passed'} value={data.academic.quizzesPassed ?? 0} tone="text-emerald-400" />
                <StatTile label={isAr ? 'كويزات راسبة' : 'Quizzes Failed'} value={data.academic.quizzesFailed ?? 0} tone="text-amber-400" />
                <StatTile label={isAr ? 'صفوف Excel المستوردة' : 'Excel Rows Imported'} value={data.academic.excelRowsImported} tone="text-cyan-400" />
                <StatTile label={isAr ? 'استجابات 2xx الناجحة' : 'Successful 2xx'} value={data.http.status2xx} tone="text-emerald-400" />
                <StatTile
                  label={isAr ? 'طلبات مرفوضة (4xx)' : 'Rejected Requests (4xx)'}
                  value={data.http.status4xx}
                  tone={data.http.status4xx > 0 ? 'text-amber-400' : 'text-muted-foreground'}
                />
                <StatTile
                  label={isAr ? 'أخطاء الخادم (5xx)' : 'Server Errors (5xx)'}
                  value={data.http.status5xx}
                  tone={data.http.status5xx > 0 ? 'text-rose-400' : 'text-muted-foreground'}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {isAr
                  ? 'تشمل استجابات 4xx بيانات دخول غير صحيحة أو تحققاً من المدخلات أو قيود صلاحيات ومعدل الطلبات؛ ولا تعني وحدها وجود عطل برمجي. تشير 5xx إلى فشل في الخادم.'
                  : '4xx responses include rejected credentials, validation, permission and rate-limit checks; they do not by themselves prove a code defect. 5xx responses indicate server failures.'}
              </p>
              <LabelBreakdown
                title={isAr ? 'الاستيراد حسب النوع' : 'Imports by Type'}
                items={data.academic.excelImportsByType}
                emptyText={isAr ? 'لم يتم استيراد بيانات منذ التشغيل' : 'No imports since boot'}
                tone="bg-cyan-400"
              />
            </Card>
          </div>

          {/* ─── ROW 3: Host OS & Infrastructure ─── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-stretch">
            <Card className={cn(CARD_CLASS, 'h-full flex flex-col justify-between')}>
              <div className="space-y-4">
                <SectionHeader
                  icon={<Cpu className="h-4 w-4 text-cyan-400" />}
                  title={isAr ? 'مواصفات الخادم والنظام (Host OS & Hardware)' : 'Host OS & Hardware Telemetry'}
                  badge={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="rounded-squircle text-[10px] font-mono text-cyan-400 border-cyan-500/30" dir="ltr">
                        {data.system.platform || 'linux'} ({data.system.arch || 'x64'})
                      </Badge>
                      <Badge variant="outline" className="rounded-squircle text-[10px] font-mono text-teal-400 border-teal-500/30" dir="ltr">
                        {data.system.nodeVersion}
                      </Badge>
                      <Badge variant="outline" className="rounded-squircle text-[10px] font-mono text-emerald-400 border-emerald-500/30" dir="ltr">
                        {data.system.cpuCores || 1} {isAr ? 'أنوية' : 'Cores'}
                      </Badge>
                    </div>
                  }
                />
                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                  <StatTile
                    label={isAr ? 'نظام التشغيل والمعمارية' : 'Platform & Arch'}
                    value={<span className="text-sm">{data.system.platform || 'node'} ({data.system.arch || 'x64'})</span>}
                  />
                  <StatTile label={isAr ? 'أنوية المعالج' : 'CPU Cores'} value={data.system.cpuCores || 1} tone="text-cyan-400" />
                  <StatTile
                    label={isAr ? 'معدل الحمل (1/5/15د)' : 'Load Avg (1m/5m/15m)'}
                    value={<span className="text-xs">{data.system.loadAverage ? data.system.loadAverage.join(' / ') : '-'}</span>}
                  />
                  <StatTile
                    label={isAr ? 'ذاكرة النظام (RAM)' : 'Host System RAM'}
                    value={
                      <span className="text-xs">
                        {data.system.totalMemoryMb
                          ? `${Math.round(data.system.totalMemoryMb - (data.system.freeMemoryMb || 0))} / ${data.system.totalMemoryMb} MB`
                          : '-'}
                      </span>
                    }
                  />
                  <StatTile
                    label={isAr ? 'زمن المعالج (مستخدم/نظام)' : 'CPU Time (user/sys)'}
                    value={
                      <span className="text-xs">
                        {`${Math.round(data.system.cpuUsage.user / 1e6)}s / ${Math.round(data.system.cpuUsage.system / 1e6)}s`}
                      </span>
                    }
                  />
                  <StatTile
                    label={isAr ? 'تأخير حلقة الأحداث (p99)' : 'Event Loop Lag (p99)'}
                    value={<span className="text-xs">{data.system.eventLoop ? `${data.system.eventLoop.p99Ms} ms` : '-'}</span>}
                    tone={
                      (data.system.eventLoop?.p99Ms ?? 0) >= 100
                        ? 'text-rose-400'
                        : (data.system.eventLoop?.p99Ms ?? 0) >= 50
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }
                  />
                  <StatTile
                    label={isAr ? 'مدة تشغيل الخادم' : 'Process Uptime'}
                    value={<span className="text-xs">{formatUptime(data.uptimeSeconds)}</span>}
                    tone="text-emerald-400"
                  />
                  <StatTile
                    label={isAr ? 'نسبة إشغال الرام' : 'Host RAM Load'}
                    value={
                      <span className="text-xs">
                        {data.system.totalMemoryMb
                          ? `${Math.round(((data.system.totalMemoryMb - (data.system.freeMemoryMb || 0)) / data.system.totalMemoryMb) * 100)}%`
                          : '-'}
                      </span>
                    }
                    tone={
                      data.system.totalMemoryMb &&
                      ((data.system.totalMemoryMb - (data.system.freeMemoryMb || 0)) / data.system.totalMemoryMb) >= 0.85
                        ? 'text-rose-400'
                        : 'text-teal-400'
                    }
                  />
                </div>
              </div>

              {/* Host Runtime Environment & Capacity Summary */}
              <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-cyan-400" />
                    <span className="text-xs font-bold text-foreground">
                      {isAr ? 'بيئة تشغيل السيرفر (VPS / Server Host)' : 'VPS Host Runtime & Capacity'}
                    </span>
                  </div>
                  <Badge variant="outline" className="rounded-squircle font-mono text-[10px] text-cyan-400 border-cyan-500/30">
                    {data.system.platform || 'Linux'} VPS
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                    <span>{isAr ? 'استهلاك ذاكرة المضيف (Host RAM):' : 'Host RAM Utilization:'}</span>
                    <span>
                      <bdi>{Math.round((data.system.totalMemoryMb ?? 0) - (data.system.freeMemoryMb || 0))} MB</bdi> /{' '}
                      <bdi>{data.system.totalMemoryMb ?? 0} MB</bdi>
                      {' '}({data.system.totalMemoryMb ? Math.round((((data.system.totalMemoryMb) - (data.system.freeMemoryMb || 0)) / data.system.totalMemoryMb) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/50">
                    <div
                      className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.round((((data.system.totalMemoryMb ?? 1) - (data.system.freeMemoryMb || 0)) / (data.system.totalMemoryMb || 1)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {isAr
                    ? `تأخير حلقة أحداث Node.js: متوسط ${data.system.eventLoop?.meanMs ?? 0} ms · أقصى ${data.system.eventLoop?.maxMs ?? 0} ms. استجابة المعالج مستقرة.`
                    : `Node.js Event Loop Lag: mean ${data.system.eventLoop?.meanMs ?? 0} ms · max ${data.system.eventLoop?.maxMs ?? 0} ms.`}
                </p>
              </div>
            </Card>

            <Card className={cn(CARD_CLASS, 'h-full flex flex-col justify-between')}>
              <div className="space-y-4">
                <SectionHeader
                  icon={<Layers className="h-4 w-4 text-emerald-400" />}
                  title={isAr ? 'حالة البنية التحتية والخدمات (Infrastructure)' : 'Infrastructure & Services'}
                  badge={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="rounded-squircle text-[10px] text-emerald-400 border-emerald-500/30 font-mono">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 me-1.5" />
                        MongoDB {data.database.status === 'connected' ? (isAr ? 'متصل' : 'Ready') : (isAr ? 'منقطع' : 'Down')}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          'rounded-squircle text-[10px] font-mono',
                          data.infrastructure?.redis === 'online'
                            ? 'text-emerald-400 border-emerald-500/30'
                            : 'text-amber-400 border-amber-500/30',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-1.5 w-1.5 rounded-full me-1.5',
                            data.infrastructure?.redis === 'online' ? 'bg-emerald-400' : 'bg-amber-400',
                          )}
                        />
                        {data.infrastructure?.redis === 'online' ? 'Redis Online' : 'Inline Fallback'}
                      </Badge>
                      <Badge variant="outline" className="rounded-squircle text-[10px] text-teal-400 border-teal-500/30 font-mono">
                        {data.cache?.effectiveDriver === 'hybrid'
                          ? 'Hybrid L1+L2'
                          : data.cache?.effectiveDriver === 'redis'
                          ? 'Redis L2'
                          : isAr ? 'ذاكرة محلية' : 'Memory Cache'}
                      </Badge>
                    </div>
                  }
                />
                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                  <div className={TILE_CLASS}>
                    <span className="text-muted-foreground block text-[11px]">{isAr ? 'طوابير Redis / BullMQ' : 'Redis Queue / BullMQ'}</span>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${data.infrastructure?.redis === 'online' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span className="font-mono text-xs font-bold text-foreground">
                        {data.infrastructure?.redis === 'online'
                          ? isAr ? 'متصل (Distributed)' : 'Online (Redis)'
                          : isAr ? 'داخلي (Inline Fallback)' : 'Inline Fallback'}
                      </span>
                    </div>
                  </div>
                  <div className={TILE_CLASS}>
                    <span className="text-muted-foreground block text-[11px]">{isAr ? 'منظومة التخزين المؤقت (Cache)' : 'Cache Engine'}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          data.cache?.status === 'healthy'
                            ? 'bg-emerald-400'
                            : data.cache?.status === 'degraded'
                            ? 'bg-amber-400'
                            : 'bg-muted-foreground'
                        }`}
                      />
                      <span className="font-mono text-xs font-bold text-foreground">
                        {data.cache
                          ? data.cache.effectiveDriver === 'hybrid'
                            ? 'Hybrid L1+L2'
                            : data.cache.effectiveDriver === 'redis'
                            ? 'Redis L2'
                            : isAr ? 'ذاكرة محلية (0 Quota)' : 'In-Memory (0 Quota)'
                          : isAr ? 'محلي' : 'Memory'}
                      </span>
                    </div>
                  </div>
                  <div className={TILE_CLASS}>
                    <span className="text-muted-foreground block text-[11px]">{isAr ? 'عناصر الذاكرة المؤقتة (L1 Items)' : 'L1 Cached Objects'}</span>
                    <div className="flex items-center gap-1.5" dir="ltr">
                      <span className="font-mono text-xs font-bold text-teal-400">
                        {data.cache?.itemCount ?? 0}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {data.cache?.redisConnected ? '(Redis Connected)' : '(Quota Safe)'}
                      </span>
                    </div>
                  </div>
                  <div className={TILE_CLASS}>
                    <span className="text-muted-foreground block text-[11px]">{isAr ? 'إشعارات Firebase (FCM)' : 'Firebase Admin SDK'}</span>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${data.infrastructure?.firebase === 'online' ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                      <span className="font-mono text-xs font-bold text-foreground">
                        {data.infrastructure?.firebase === 'online'
                          ? isAr ? 'مفعّل (Active)' : 'Active FCM'
                          : isAr ? 'غير مفعّل (Disabled)' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                  <StatTile
                    label={isAr ? 'حالة الاتصال (readyState)' : 'Mongo readyState'}
                    value={<span className="text-xs">{data.database.readyState}</span>}
                    tone={data.database.readyState === 1 ? 'text-emerald-400' : 'text-rose-400'}
                  />
                  <StatTile
                    label={isAr ? 'زمن فحص الـ Ping' : 'DB Ping Latency'}
                    value={<span className="text-xs">{data.database.pingLatencyMs >= 0 ? `${data.database.pingLatencyMs} ms` : '-'}</span>}
                    tone="text-emerald-400"
                  />
                  <StatTile
                    label={isAr ? 'حجم مجمع الاتصالات (min/max)' : 'Connection Pool (min/max)'}
                    value={<span className="text-xs">{data.database.pool ? `${data.database.pool.minPoolSize} / ${data.database.pool.maxPoolSize}` : '-'}</span>}
                  />
                  <StatTile
                    label={isAr ? 'حد الاستعلام البطيء' : 'Slow Query Threshold'}
                    value={<span className="text-xs">{`${data.database.slowQueryThresholdMs ?? 100} ms`}</span>}
                  />
                </div>
              </div>

              {/* Redis provider and process-local cache activity */}
              <div className="mt-4 rounded-xl border border-teal-500/20 bg-teal-950/20 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold">
                    {({
                      'self-hosted': isAr ? 'Redis محلي على الخادم' : 'Self-hosted Redis (VPS)',
                      upstash: 'Upstash Redis',
                      external: isAr ? 'Redis خارجي' : 'External Redis',
                      none: isAr ? 'التخزين في ذاكرة التطبيق' : 'Application memory cache',
                      unknown: isAr ? 'مزود Redis غير معروف' : 'Redis provider unavailable',
                    })[data.cache?.redis?.provider ?? 'unknown']}
                  </span>
                  <Badge variant="outline" className="rounded-squircle">
                    {data.cache?.redisConnected
                      ? (isAr ? 'متصل' : 'Connected')
                      : (isAr ? 'ذاكرة التطبيق' : 'Memory fallback')}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {isAr ? 'محاولات أوامر الكاش منذ تشغيل API: ' : 'Cache command attempts since API startup: '}
                  <bdi className="font-mono text-foreground">{data.cache?.redis?.cacheCommandAttemptsSinceStart ?? 0}</bdi>
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {isAr
                    ? 'العداد خاص بكاش هذه العملية ولا يشمل الطوابير أو استهلاك الحساب. حصة المزود غير مقاسة هنا.'
                    : 'This process’s cache activity only; excludes queues and account-wide usage. Provider quotas are not measured here.'}
                </p>
              </div>
            </Card>
          </div>

          <HttpTrafficDiagnostics traffic={data.traffic} isAr={isAr} />
          <DriverDiagnosticsPanel data={data.database.driverDiagnostics} isAr={isAr} />
          <UnifiedPerformanceTables data={data} isAr={isAr} />

          {/* ─── ROW 7: Endpoints catalogue + Raw Prometheus exposition ─── */}
          <Card className={CARD_CLASS}>
            <SectionHeader
              icon={<Link2 className="h-4 w-4 text-primary" />}
              title={isAr ? 'نقاط نهاية المقاييس (Metrics Endpoints)' : 'Metrics Endpoints'}
              badge={
                <Badge variant="outline" className="rounded-squircle text-[10px]">
                  {isAr ? 'للمدير فقط' : 'Admin only'}
                </Badge>
              }
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-xs">
              {[
                {
                  path: 'GET /api/metrics/summary',
                  desc: isAr ? 'ملخص JSON لهذه اللوحة (JWT + دور مدير)' : 'JSON summary powering this dashboard (JWT + admin role)',
                },
                {
                  path: 'GET /api/admin/metrics',
                  desc: isAr ? 'اسم بديل لنفس ملخص JSON' : 'Alias of the JSON summary',
                },
                {
                  path: 'GET /api/metrics',
                  desc: isAr
                    ? 'صيغة Prometheus الخام (جلسة مدير أو METRICS_SCRAPE_SECRET)'
                    : 'Raw Prometheus exposition (admin session or METRICS_SCRAPE_SECRET)',
                },
              ].map((ep) => (
                <div key={ep.path} className={TILE_CLASS}>
                  <code className="block font-mono text-[11px] font-bold text-primary" dir="ltr">{ep.path}</code>
                  <span className="block text-[11px] text-muted-foreground">{ep.desc}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-secondary/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-bold text-foreground">
                    {isAr ? 'الربط المباشر مع Grafana Cloud & Prometheus' : 'Grafana Cloud & Prometheus Integration'}
                  </h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? 'اربط المسار بـ Grafana أو Datadog لسحب المقاييس كل 15 ثانية باستخدام الترويسة x-metrics-secret.'
                    : 'Scrape time-series metrics into Grafana Cloud or Datadog every 15s using the x-metrics-secret header.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  id="metrics-copy-url"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyMetricsUrl}
                  className="rounded-squircle gap-2 font-semibold text-xs border-primary/30 text-primary hover:bg-primary/10 shrink-0"
                >
                  {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedUrl ? (isAr ? 'تم النسخ!' : 'Copied!') : (isAr ? 'نسخ رابط /api/metrics' : 'Copy /api/metrics URL')}</span>
                </Button>
                <Button
                  id="metrics-toggle-raw"
                  variant="outline"
                  size="sm"
                  onClick={() => setRawOpen((v) => !v)}
                  aria-expanded={rawOpen}
                  className="rounded-squircle gap-2 font-semibold text-xs border-border/70 shrink-0"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>{rawOpen ? (isAr ? 'إخفاء المقاييس الخام' : 'Hide raw metrics') : (isAr ? 'عرض المقاييس الخام' : 'View raw metrics')}</span>
                </Button>
              </div>
            </div>

            {rawOpen && (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <SlidersHorizontal className="pointer-events-none absolute inset-s-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="metrics-raw-search"
                      value={rawSearch}
                      onChange={(e) => setRawSearch(e.target.value)}
                      placeholder={isAr ? 'فلترة الأسطر (مثال: mongodb_slow)' : 'Filter lines (e.g. mongodb_slow)'}
                      className="rounded-squircle ps-9 text-xs font-mono"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      id="metrics-raw-refresh"
                      variant="outline"
                      size="sm"
                      onClick={() => rawQuery.refetch()}
                      disabled={rawQuery.isFetching}
                      className="rounded-squircle gap-1.5 text-xs"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${rawQuery.isFetching ? 'animate-spin' : ''}`} />
                      <span>{isAr ? 'تحديث' : 'Reload'}</span>
                    </Button>
                    <Button
                      id="metrics-raw-download"
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadRaw}
                      disabled={!rawQuery.data}
                      className="rounded-squircle gap-1.5 text-xs"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{isAr ? 'تنزيل' : 'Download'}</span>
                    </Button>
                  </div>
                </div>

                {rawQuery.isLoading ? (
                  <LoadingState title={isAr ? 'جاري تحميل المقاييس الخام...' : 'Loading raw metrics...'} />
                ) : rawQuery.isError ? (
                  <ErrorState
                    title={isAr ? 'تعذر تحميل المقاييس الخام' : 'Failed to load raw metrics'}
                    description={getApiErrorMessage(rawQuery.error, isAr ? 'تحقق من صلاحيات المدير' : 'Check admin permissions')}
                    onRetry={() => rawQuery.refetch()}
                  />
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Radio className="h-3 w-3" />
                      <span>
                        {isAr ? 'عدد الأسطر: ' : 'Lines: '}
                        <bdi>{rawLines.length}</bdi>
                      </span>
                      <ArrowUpDown className="ms-2 h-3 w-3" />
                      <span>{isAr ? 'قابل للتمرير' : 'Scrollable'}</span>
                    </div>
                    <pre
                      dir="ltr"
                      className="max-h-105 overflow-auto rounded-xl border border-border/70 bg-background/70 p-3 text-start font-mono text-[10.5px] leading-relaxed text-muted-foreground"
                    >
                      {rawLines.map((line, idx) => (
                        <div key={idx} className={line.startsWith('#') ? 'text-sky-300/70' : 'text-foreground/90'}>
                          {line || '\u00A0'}
                        </div>
                      ))}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Instant Unlock & Locked Accounts Management Modal */}
      <LockedAccountsModal
        open={lockedAccountsOpen}
        onOpenChange={setLockedAccountsOpen}
      />
    </div>
  );
}
