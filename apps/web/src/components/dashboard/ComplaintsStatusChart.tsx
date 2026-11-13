'use client';

import React, { useRef, useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { MessageSquareWarning, Download, Loader2, Clock } from 'lucide-react';
import { exportElementToPng } from '@/lib/export-utils';

export interface ComplaintStatusItem {
  name: string;
  value: number;
  statusKey?: string;
  color?: string;
}

export interface ComplaintsStatusChartProps {
  data?: ComplaintStatusItem[];
  title?: string;
  subtitle?: string;
  isAr?: boolean;
  isLoading?: boolean;
}

const STATUS_CONFIG: Record<string, { labelAr: string; labelEn: string; color: string }> = {
  open: { labelAr: 'مفتوحة', labelEn: 'Open', color: '#f59e0b' },
  in_progress: { labelAr: 'قيد المتابعة', labelEn: 'In Progress', color: '#06b6d4' },
  pending: { labelAr: 'قيد الانتظار', labelEn: 'Pending', color: '#a855f7' },
  resolved: { labelAr: 'تم الحل', labelEn: 'Resolved', color: '#10b981' },
  closed: { labelAr: 'مغلقة', labelEn: 'Closed', color: '#64748b' },
};

export function ComplaintsStatusChart({
  data = [],
  title,
  subtitle,
  isAr = false,
  isLoading = false,
}: ComplaintsStatusChartProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const effectiveTitle = title ?? (isAr ? 'حالات تذاكر الشكاوى' : 'Tickets by Status');
  const effectiveSubtitle =
    subtitle ?? (isAr ? 'توزيع البلاغات الحالية حسب مرحلة المتابعة والمعالجة' : 'Distribution of current support tickets by status');

  const formattedData = useMemo(() => {
    return data.map((item) => {
      const rawKey = (item.statusKey || item.name || '').toLowerCase().replace(/\s+/g, '_');
      const cfg = STATUS_CONFIG[rawKey] || {
        labelAr: item.name,
        labelEn: item.name,
        color: '#0d9488',
      };
      return {
        ...item,
        statusKey: rawKey,
        label: isAr ? cfg.labelAr : cfg.labelEn,
        color: cfg.color,
      };
    });
  }, [data, isAr]);

  const totalTickets = useMemo(() => formattedData.reduce((acc, d) => acc + d.value, 0), [formattedData]);
  const resolvedCount = useMemo(() => {
    return formattedData
      .filter((d) => d.statusKey === 'resolved' || d.statusKey === 'closed')
      .reduce((acc, d) => acc + d.value, 0);
  }, [formattedData]);
  const resolutionRate = useMemo(() => {
    return totalTickets > 0 ? Math.round((resolvedCount / totalTickets) * 100) : 0;
  }, [totalTickets, resolvedCount]);

  const handleExportPng = async () => {
    setIsExporting(true);
    try {
      await exportElementToPng(cardRef.current, 'complaints-status-chart.png');
    } catch (err) {
      console.error('Failed to export complaints status chart', err);
    } finally {
      setIsExporting(false);
    }
  };

  const isEmpty = formattedData.length === 0 || totalTickets === 0;

  return (
    <div
      ref={cardRef}
      className="flex flex-col rounded-2xl border border-border/70 bg-card/90 shadow-[var(--shadow-glow)] backdrop-blur p-5 transition-all hover:border-primary/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle bg-amber-500/15 text-amber-400 border border-amber-500/20">
            <MessageSquareWarning className="h-5 w-5" />
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
            <Clock className="h-7 w-7 text-muted-foreground/60" />
            <p className="font-medium text-foreground/80">
              {isAr ? 'لا توجد تذاكر شكاوى مسجلة حالياً' : 'No complaint tickets found'}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="rgba(168,184,191,0.14)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
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
                cursor={{ fill: 'rgba(245, 158, 11, 0.05)' }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload as typeof formattedData[0];
                  const pct = totalTickets > 0 ? ((item.value / totalTickets) * 100).toFixed(1) : '0';
                  return (
                    <div className="rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-3 shadow-xl min-w-40">
                      <div className="flex items-center gap-2 mb-1.5 border-b border-border/60 pb-1">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-xs font-bold text-popover-foreground">{item.label}</span>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <span>{isAr ? 'عدد التذاكر:' : 'Ticket Count:'}</span>
                          <span className="font-mono font-bold text-foreground">{item.value}</span>
                        </div>
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <span>{isAr ? 'النسبة:' : 'Share:'}</span>
                          <span className="font-mono font-semibold text-amber-400">{pct}%</span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" name={isAr ? 'تذاكر' : 'Tickets'} radius={[6, 6, 0, 0]}>
                {formattedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Meta Indicators */}
      <div className="mt-4 pt-3 border-t border-border/50 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-secondary/30 p-2">
          <p className="text-[11px] text-muted-foreground">{isAr ? 'إجمالي البلاغات' : 'Total Tickets'}</p>
          <p className="font-mono font-bold text-sm text-foreground mt-0.5">{totalTickets}</p>
        </div>
        <div className="rounded-xl bg-secondary/30 p-2">
          <p className="text-[11px] text-muted-foreground">{isAr ? 'نسبة الحل' : 'Resolved'}</p>
          <p className="font-mono font-bold text-sm text-emerald-400 mt-0.5">{resolutionRate}%</p>
        </div>
        <div className="rounded-xl bg-secondary/30 p-2">
          <p className="text-[11px] text-muted-foreground">{isAr ? 'قيد المتابعة' : 'Pending'}</p>
          <p className="font-mono font-bold text-sm text-amber-400 mt-0.5">
            {totalTickets - resolvedCount}
          </p>
        </div>
      </div>
    </div>
  );
}
