'use client';

import React, { useRef, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, Download, Loader2 } from 'lucide-react';
import { exportElementToPng } from '@/lib/export-utils';

export interface RetentionCohortPoint {
  semester: string;
  semesterAr?: string;
  active: number;
  probation: number;
  attrition: number;
}

export const DEFAULT_COHORT_DATA: RetentionCohortPoint[] = [
  { semester: 'Level 1', semesterAr: 'الفرقة الأولى (عام)', active: 1120, probation: 75, attrition: 22 },
  { semester: 'Level 2', semesterAr: 'الفرقة الثانية (عام)', active: 1040, probation: 62, attrition: 34 },
  { semester: 'Level 3', semesterAr: 'الفرقة الثالثة (تخصص)', active: 980, probation: 48, attrition: 18 },
  { semester: 'Level 4', semesterAr: 'الفرقة الرابعة (تخرج)', active: 940, probation: 25, attrition: 12 },
];
export const defaultCohortData = DEFAULT_COHORT_DATA;

export interface CohortRetentionChartProps {
  data?: RetentionCohortPoint[];
  title?: string;
  subtitle?: string;
  isAr?: boolean;
}

export function CohortRetentionChart({
  data = DEFAULT_COHORT_DATA,
  title,
  subtitle,
  isAr = false,
}: CohortRetentionChartProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const effectiveTitle = title ?? (isAr ? 'استبقاء الدفعات والتعثر والانسحاب الأكاديمي' : 'Cohort Retention & Academic Standing');
  const effectiveSubtitle = subtitle ?? (isAr ? 'توزيع الطلاب المنتظمين مقارنة بحالات الإنذار والتعثر والانسحاب عبر الفرق 1–4' : 'Active students vs academic probation & attrition across Levels 1–4');

  const handleExportPng = async () => {
    setIsExporting(true);
    try {
      await exportElementToPng(cardRef.current, 'cohort-retention-chart.png');
    } catch (err) {
      console.error('Failed to export retention chart', err);
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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/20">
            <TrendingUp className="h-5 w-5" />
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
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0d9488" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#0d9488" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="probationGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="attritionGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(168,184,191,0.14)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="semester"
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
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const point = payload[0].payload as RetentionCohortPoint;
                const total = point.active + point.probation + point.attrition;
                return (
                  <div className="rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-3 shadow-xl min-w-44">
                    <p className="text-xs font-bold text-popover-foreground mb-2">{label}</p>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-cyan-400" />
                          {isAr ? 'طلاب منتظمون:' : 'Active (Good):'}
                        </span>
                        <span className="font-mono font-bold text-cyan-400">
                          {point.active.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-purple-400" />
                          {isAr ? 'إنذار أكاديمي:' : 'Probation:'}
                        </span>
                        <span className="font-mono font-bold text-purple-400">
                          {point.probation.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-rose-400" />
                          {isAr ? 'انسحاب وتعثر:' : 'Attrition / W:'}
                        </span>
                        <span className="font-mono font-bold text-rose-400">
                          {point.attrition.toLocaleString()}
                        </span>
                      </div>
                      <div className="border-t border-border/60 pt-1 mt-1 flex justify-between text-[11px] text-muted-foreground">
                        <span>{isAr ? 'نسبة الاستبقاء:' : 'Cohort Retention:'}</span>
                        <span className="font-mono font-semibold text-emerald-400">
                          {total > 0 ? ((point.active / total) * 100).toFixed(1) : '0'}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ fontSize: 11, paddingBottom: 10 }}
            />
            <Area
              type="monotone"
              dataKey="active"
              name={isAr ? 'طلاب منتظمون' : 'Active'}
              stackId="1"
              stroke="#0d9488"
              strokeWidth={2}
              fill="url(#activeGrad)"
            />
            <Area
              type="monotone"
              dataKey="probation"
              name={isAr ? 'إنذار وتعثر' : 'Probation'}
              stackId="1"
              stroke="#f59e0b"
              strokeWidth={2}
              fill="url(#probationGrad)"
            />
            <Area
              type="monotone"
              dataKey="attrition"
              name={isAr ? 'انسحاب ووقف قيد' : 'Attrition'}
              stackId="1"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#attritionGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
