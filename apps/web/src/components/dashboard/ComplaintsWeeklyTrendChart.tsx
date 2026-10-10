'use client';

import React, { useRef, useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity, Download, Loader2, Calendar, TrendingUp } from 'lucide-react';
import { exportElementToPng } from '@/lib/export-utils';

export interface WeeklyTrendItem {
  key: string;
  name: string;
  value: number;
}

export interface ComplaintsWeeklyTrendChartProps {
  data?: WeeklyTrendItem[];
  title?: string;
  subtitle?: string;
  isAr?: boolean;
  isLoading?: boolean;
}

export function ComplaintsWeeklyTrendChart({
  data = [],
  title,
  subtitle,
  isAr = false,
  isLoading = false,
}: ComplaintsWeeklyTrendChartProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const effectiveTitle = title ?? (isAr ? 'نشاط الشكاوى خلال 7 أيام' : '7-Day Ticket Volume');
  const effectiveSubtitle =
    subtitle ?? (isAr ? 'معدل تدفق البلاغات والشكاوى المسجلة يومياً' : 'Daily incoming tickets trend over the last week');

  const totalTickets = useMemo(() => data.reduce((acc, d) => acc + d.value, 0), [data]);
  const dailyAverage = useMemo(() => (data.length > 0 ? (totalTickets / data.length).toFixed(1) : '0'), [data, totalTickets]);
  const peakDay = useMemo(() => {
    if (!data.length) return null;
    return [...data].sort((a, b) => b.value - a.value)[0];
  }, [data]);

  const handleExportPng = async () => {
    setIsExporting(true);
    try {
      await exportElementToPng(cardRef.current, 'complaints-weekly-trend.png');
    } catch (err) {
      console.error('Failed to export weekly trend chart', err);
    } finally {
      setIsExporting(false);
    }
  };

  const isEmpty = totalTickets === 0;

  return (
    <div
      ref={cardRef}
      className="flex flex-col rounded-2xl border border-border/70 bg-card/90 shadow-[var(--shadow-glow)] backdrop-blur p-5 transition-all hover:border-primary/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-wide">{effectiveTitle}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{effectiveSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2" data-no-export="true">
          <button
            type="button"
            onClick={handleExportPng}
            disabled={isExporting}
            className="flex items-center gap-1.5 rounded-squircle border border-border bg-surface/50 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-surface hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            title="Export as PNG"
          >
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="font-mono text-[11px]">PNG</span>
          </button>
        </div>
      </div>

      <div className="h-64 w-full pt-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col h-full items-center justify-center rounded-xl border border-dashed border-border/70 bg-secondary/10 px-6 text-center text-xs text-muted-foreground gap-2">
            <Calendar className="h-7 w-7 text-muted-foreground/60" />
            <p className="font-medium text-foreground/80">
              {isAr ? 'لا توجد بلاغات مسجلة في هذا الأسبوع' : 'No tickets recorded for this week'}
            </p>
            <span className="text-[11px] text-muted-foreground">
              {isAr ? 'يتم تحديث تدفق الشكاوى تلقائياً عند ورود استفسارات جديدة.' : 'Trend updates automatically upon new inquiries.'}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ticketTrendArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(168,184,191,0.14)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="#a8b8bf"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: 'rgba(168,184,191,0.22)' }}
                dy={8}
              />
              <YAxis
                allowDecimals={false}
                stroke="#a8b8bf"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dx={-5}
              />
              <Tooltip
                cursor={{ stroke: '#06b6d4', strokeWidth: 1, strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload as WeeklyTrendItem;
                  const pct = totalTickets > 0 ? ((item.value / totalTickets) * 100).toFixed(0) : '0';
                  return (
                    <div className="rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-3 shadow-xl min-w-40">
                      <div className="flex items-center gap-2 mb-1.5 border-b border-border/60 pb-1">
                        <Calendar className="h-3.5 w-3.5 text-cyan-400" />
                        <span className="text-xs font-bold text-popover-foreground">{item.name}</span>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <span>{isAr ? 'البلاغات المسجلة:' : 'Incoming Tickets:'}</span>
                          <span className="font-mono font-bold text-cyan-400">{item.value}</span>
                        </div>
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <span>{isAr ? 'نسبة الأسبوع:' : 'Weekly Share:'}</span>
                          <span className="font-mono font-semibold text-foreground">{pct}%</span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name={isAr ? 'تذاكر' : 'Tickets'}
                stroke="#06b6d4"
                strokeWidth={2.5}
                fill="url(#ticketTrendArea)"
                dot={{ r: 3, fill: '#06b6d4', stroke: '#083344', strokeWidth: 2 }}
                activeDot={{ r: 5, fill: '#22d3ee', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Meta Indicators */}
      <div className="mt-4 pt-3 border-t border-border/50 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-secondary/30 p-2">
          <p className="text-[11px] text-muted-foreground">{isAr ? 'إجمالي الأسبوع' : 'Weekly Total'}</p>
          <p className="font-mono font-bold text-sm text-foreground mt-0.5">{totalTickets}</p>
        </div>
        <div className="rounded-xl bg-secondary/30 p-2">
          <p className="text-[11px] text-muted-foreground">{isAr ? 'المتوسط اليومي' : 'Daily Avg'}</p>
          <p className="font-mono font-bold text-sm text-cyan-400 mt-0.5">{dailyAverage}</p>
        </div>
        <div className="rounded-xl bg-secondary/30 p-2">
          <p className="text-[11px] text-muted-foreground">{isAr ? 'أعلى يوم' : 'Peak Day'}</p>
          <p className="font-mono font-bold text-sm text-foreground mt-0.5 truncate">
            {peakDay && peakDay.value > 0 ? `${peakDay.name} (${peakDay.value})` : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
