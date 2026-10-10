'use client';

import React, { useRef, useState } from 'react';
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
import { Award, Download, Loader2 } from 'lucide-react';
import { exportElementToPng } from '@/lib/export-utils';

export interface GpaBandItem {
  range: string;
  label: string;
  labelAr?: string;
  count: number;
  color: string;
}

export const DEFAULT_GPA_DATA: GpaBandItem[] = [
  { range: '< 2.0', label: 'Probation', labelAr: 'تحت الملاحظة', count: 184, color: '#ef4444' },
  { range: '2.0 – 2.49', label: 'Satisfactory', labelAr: 'مقبول', count: 420, color: '#f59e0b' },
  { range: '2.5 – 2.99', label: 'Good', labelAr: 'جيد', count: 865, color: '#06b6d4' },
  { range: '3.0 – 3.49', label: 'Very Good', labelAr: 'جيد جداً', count: 640, color: '#a855f7' },
  { range: '3.5 – 4.0', label: 'Excellent', labelAr: 'ممتاز', count: 295, color: '#10b981' },
];
export const defaultGpaData = DEFAULT_GPA_DATA;

export interface GpaDistributionChartProps {
  data?: GpaBandItem[];
  title?: string;
  subtitle?: string;
  locale?: string;
  isAr?: boolean;
}

export function GpaDistributionChart({
  data = DEFAULT_GPA_DATA,
  title,
  subtitle,
  locale = 'en',
  isAr = false,
}: GpaDistributionChartProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const isArabic = isAr || locale === 'ar';
  const effectiveTitle = title ?? (isArabic ? 'توزيع الأداء الأكاديمي والمعدل التراكمي' : 'Academic Performance & GPA Distribution');
  const effectiveSubtitle = subtitle ?? (isArabic ? 'أعداد الطلاب موزعة حسب فئات الإنذار والتميز الأكاديمي' : 'Student count across cumulative GPA academic standing bands');
  const totalStudents = data.reduce((sum, item) => sum + item.count, 0);

  const handleExportPng = async () => {
    setIsExporting(true);
    try {
      await exportElementToPng(cardRef.current, 'gpa-distribution-chart.png');
    } catch (err) {
      console.error('Failed to export GPA chart', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      ref={cardRef}
      className="flex flex-col rounded-2xl border border-border/70 bg-card/90 shadow-[var(--shadow-glow)] backdrop-blur p-5 transition-all hover:border-primary/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
            <Award className="h-5 w-5" />
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
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
            <CartesianGrid stroke="rgba(168,184,191,0.14)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="range"
              stroke="#a8b8bf"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: 'rgba(168,184,191,0.22)' }}
              dy={8}
            />
            <YAxis
              stroke="#a8b8bf"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              dx={-5}
            />
            <Tooltip
              cursor={{ fill: 'rgba(34, 211, 238, 0.05)' }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const band = payload[0].payload as GpaBandItem;
                const pct = totalStudents > 0 ? ((band.count / totalStudents) * 100).toFixed(1) : '0';
                return (
                  <div className="rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-3 shadow-xl">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: band.color }} />
                      <span className="text-xs font-semibold text-popover-foreground">
                        {isArabic && band.labelAr ? band.labelAr : band.label} ({band.range})
                      </span>
                    </div>
                    <div className="space-y-0.5 text-xs">
                      <div className="flex justify-between gap-4 text-muted-foreground">
                        <span>{isArabic ? 'عدد الطلاب:' : 'Students:'}</span>
                        <span className="font-mono font-bold text-foreground">{band.count.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-muted-foreground">
                        <span>{isArabic ? 'نسبة الدفعة:' : 'Cohort Share:'}</span>
                        <span className="font-mono font-semibold text-cyan-400">{pct}%</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2 border-t border-border/60 pt-3">
        {data.map((item) => (
          <div key={item.range} className="flex flex-col">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate">{isArabic && item.labelAr ? item.labelAr : item.label}</span>
            </div>
            <span className="text-xs font-mono font-semibold text-foreground mt-0.5">
              {item.count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
