'use client';

import React, { useRef, useState, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Users, Download, Loader2, ShieldAlert } from 'lucide-react';
import { exportElementToPng } from '@/lib/export-utils';
import { cn } from '@/lib/utils';

export interface EnrollmentStatusItem {
  name: string;
  value: number;
  key?: string;
  color?: string;
}

export interface EnrollmentStatusChartProps {
  data?: EnrollmentStatusItem[];
  title?: string;
  subtitle?: string;
  isAr?: boolean;
  isLoading?: boolean;
  totalStudents?: number;
  liveOnline?: number;
  liveOnlineStaff?: number;
  isAdmin?: boolean;
  onLiveOnlineClick?: () => void;
}

const STATUS_MAP: Record<string, { labelAr: string; labelEn: string; color: string }> = {
  active: { labelAr: 'منتظم / نشط', labelEn: 'Active', color: '#10b981' },
  suspended: { labelAr: 'موقوف القيد', labelEn: 'Suspended', color: '#ef4444' },
  graduated: { labelAr: 'خريج', labelEn: 'Graduated', color: '#06b6d4' },
  withdrawn: { labelAr: 'منسحب', labelEn: 'Withdrawn', color: '#f59e0b' },
};

export function EnrollmentStatusChart({
  data = [],
  title,
  subtitle,
  isAr = false,
  isLoading = false,
  totalStudents: propTotal,
  liveOnline,
  liveOnlineStaff,
  isAdmin: _isAdmin = false,
  onLiveOnlineClick,
}: EnrollmentStatusChartProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const effectiveTitle = title ?? (isAr ? 'حالة قيد الطلاب' : 'Students by Enrollment Status');
  const effectiveSubtitle =
    subtitle ?? (isAr ? 'نسبة الطلاب المنتظمين وموقوفي القيد والخريجين في النظام' : 'Active vs suspended distribution across students');

  const formattedData = useMemo(() => {
    return data.map((item) => {
      const rawKey = (item.key || item.name || '').toLowerCase().replace(/\s+/g, '_');
      const cfg = STATUS_MAP[rawKey] || {
        labelAr: item.name,
        labelEn: item.name,
        color: '#0d9488',
      };
      return {
        ...item,
        key: rawKey,
        label: isAr ? cfg.labelAr : cfg.labelEn,
        color: cfg.color,
      };
    });
  }, [data, isAr]);

  const totalCalculated = useMemo(() => formattedData.reduce((acc, d) => acc + d.value, 0), [formattedData]);
  const effectiveTotal = propTotal ?? totalCalculated;

  const handleExportPng = async () => {
    setIsExporting(true);
    try {
      await exportElementToPng(cardRef.current, 'enrollment-status-chart.png');
    } catch (err) {
      console.error('Failed to export enrollment status chart', err);
    } finally {
      setIsExporting(false);
    }
  };

  const isEmpty = formattedData.length === 0 || effectiveTotal === 0;

  return (
    <div
      ref={cardRef}
      className="flex flex-col rounded-2xl border border-border/70 bg-card/90 shadow-[var(--shadow-glow)] backdrop-blur p-5 transition-all hover:border-primary/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-wide">{effectiveTitle}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{effectiveSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2" data-no-export="true">
          {liveOnline !== undefined && (
            <button
              type="button"
              onClick={onLiveOnlineClick}
              disabled={!onLiveOnlineClick}
              className={cn(
                "hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 transition-all",
                onLiveOnlineClick
                  ? "hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:scale-105 cursor-pointer shadow-sm active:scale-95"
                  : "cursor-default"
              )}
              title={
                onLiveOnlineClick
                  ? (isAr ? 'انقر لعرض تفاصيل المتواجدين بالبوابة (طلاب وكادر)' : 'Click to view live active students & staff')
                  : undefined
              }
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-medium">
                {isAr ? 'متصل الآن:' : 'Live Online:'}
              </span>
              <span className="font-mono font-bold text-xs">
                {liveOnline.toLocaleString()} {isAr ? 'طالب' : 'students'}
              </span>
              {liveOnlineStaff !== undefined && liveOnlineStaff > 0 && (
                <span className="font-mono text-[11px] text-cyan-300 border-s border-emerald-500/30 ps-1.5 ms-0.5">
                  +{liveOnlineStaff} {isAr ? 'كادر' : 'staff'}
                </span>
              )}
            </button>
          )}
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

      <div className="relative h-64 w-full pt-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col h-full items-center justify-center rounded-xl border border-dashed border-border/70 bg-secondary/10 px-6 text-center text-xs text-muted-foreground gap-2">
            <ShieldAlert className="h-7 w-7 text-muted-foreground/60" />
            <p className="font-medium text-foreground/80">
              {isAr ? 'لا توجد بيانات قيد طلاب مسجلة حالياً' : 'No enrollment records available'}
            </p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={formattedData}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={96}
                  paddingAngle={4}
                  stroke="rgba(15, 23, 42, 0.4)"
                  strokeWidth={2}
                >
                  {formattedData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0].payload as typeof formattedData[0];
                    const pct = effectiveTotal > 0 ? ((item.value / effectiveTotal) * 100).toFixed(1) : '0';
                    return (
                      <div className="rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-3 shadow-xl min-w-40">
                        <div className="flex items-center gap-2 mb-1.5 border-b border-border/60 pb-1">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-xs font-bold text-popover-foreground">{item.label}</span>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between gap-3 text-muted-foreground">
                            <span>{isAr ? 'الطلاب:' : 'Students:'}</span>
                            <span className="font-mono font-bold text-foreground">
                              {item.value.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3 text-muted-foreground">
                            <span>{isAr ? 'النسبة:' : 'Share:'}</span>
                            <span className="font-mono font-semibold text-emerald-400">{pct}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Donut Center Label & Interactive Number Trigger */}
            <div
              onClick={onLiveOnlineClick}
              role={onLiveOnlineClick ? 'button' : undefined}
              tabIndex={onLiveOnlineClick ? 0 : undefined}
              onKeyDown={(e) => {
                if (onLiveOnlineClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onLiveOnlineClick();
                }
              }}
              className={cn(
                "absolute inset-0 flex flex-col items-center justify-center transition-all",
                onLiveOnlineClick
                  ? "cursor-pointer group select-none focus:outline-none"
                  : "pointer-events-none"
              )}
              title={
                onLiveOnlineClick
                  ? (isAr ? 'انقر على الرقم لعرض الطلاب المتصلين والأنشطة' : 'Click number to view active logged-in users & activity')
                  : undefined
              }
            >
              <span
                className={cn(
                  "font-mono text-2xl font-bold text-foreground transition-all",
                  onLiveOnlineClick && "group-hover:text-emerald-400 group-hover:scale-110"
                )}
              >
                {effectiveTotal.toLocaleString()}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground mt-0.5">
                {isAr ? 'طالب مسجل' : 'Total Students'}
              </span>
              {onLiveOnlineClick && liveOnline !== undefined && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 transition-all group-hover:bg-emerald-500/20 group-hover:scale-105">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  </span>
                  <span>
                    {liveOnline} {isAr ? 'طالب متصل' : 'students online'}
                    {liveOnlineStaff !== undefined && liveOnlineStaff > 0 ? ` • +${liveOnlineStaff}` : ''}
                  </span>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Legend & Meta Breakdown */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {formattedData.map((item) => {
            const pct = effectiveTotal > 0 ? ((item.value / effectiveTotal) * 100).toFixed(0) : '0';
            return (
              <div key={item.key} className="rounded-xl bg-secondary/30 p-2 flex flex-col justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-[11px] text-muted-foreground truncate">{item.label}</span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="font-mono font-bold text-sm text-foreground">
                    {item.value.toLocaleString()}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
