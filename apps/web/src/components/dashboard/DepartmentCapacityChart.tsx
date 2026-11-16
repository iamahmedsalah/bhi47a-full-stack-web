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
  Legend,
} from 'recharts';
import { BookOpen, Download, Loader2, AlertCircle } from 'lucide-react';
import { exportElementToPng } from '@/lib/export-utils';

export interface DepartmentCapacityItem {
  department: string;
  departmentAr?: string;
  code: string;
  enrolled: number;
  capacity: number;
}

export const DEFAULT_DEPT_CAPACITY: DepartmentCapacityItem[] = [
  {
    department: 'General Division',
    departmentAr: 'شعبة عامة',
    code: 'GEN',
    enrolled: 1850,
    capacity: 2200,
  },
  {
    department: 'Business Information Systems',
    departmentAr: 'نظم معلومات الأعمال',
    code: 'BIS',
    enrolled: 1240,
    capacity: 1400,
  },
  {
    department: 'Accounting and Auditing',
    departmentAr: 'المحاسبة والمراجعة',
    code: 'ACC',
    enrolled: 820,
    capacity: 1000,
  },
];
export const defaultDepartmentData = DEFAULT_DEPT_CAPACITY;

export interface DepartmentCapacityChartProps {
  data?: DepartmentCapacityItem[];
  title?: string;
  subtitle?: string;
  isAr?: boolean;
}

export function DepartmentCapacityChart({
  data = DEFAULT_DEPT_CAPACITY,
  title,
  subtitle,
  isAr = false,
}: DepartmentCapacityChartProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const effectiveTitle = title ?? (isAr ? 'طاقة الأقسام العلمية ونسب الإشغال' : 'Department Capacity & Utilization');
  const effectiveSubtitle = subtitle ?? (isAr ? 'الطلاب المسجلون مقابل الطاقة الاستيعابية القصوى لمقاعد كل قسم علمي' : 'Enrolled students vs maximum seat capacity per academic department');

  const handleExportPng = async () => {
    setIsExporting(true);
    try {
      await exportElementToPng(cardRef.current, 'department-capacity-chart.png');
    } catch (err) {
      console.error('Failed to export capacity chart', err);
    } finally {
      setIsExporting(false);
    }
  };

  const getUtilizationBadge = (utilization: number) => {
    if (utilization >= 95) {
      return { color: 'text-rose-400 bg-rose-500/10 border-rose-500/30', label: 'Critical Capacity' };
    }
    if (utilization >= 90) {
      return { color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', label: 'Near Capacity' };
    }
    if (utilization >= 75) {
      return { color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30', label: 'Optimal' };
    }
    return { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', label: 'Available' };
  };

  return (
    <div
      ref={cardRef}
      className="flex flex-col rounded-2xl border border-border/70 bg-card/90 shadow-[var(--shadow-glow)] backdrop-blur p-5 transition-all hover:border-primary/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            <BookOpen className="h-5 w-5" />
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

      {/* Horizontal Bar Chart */}
      <div className="h-56 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
          >
            <CartesianGrid stroke="rgba(168,184,191,0.14)" strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              stroke="#a8b8bf"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: 'rgba(168,184,191,0.22)' }}
            />
            <YAxis
              type="category"
              dataKey="code"
              stroke="#a8b8bf"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              dx={-5}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const item = payload[0].payload as DepartmentCapacityItem;
                const util = ((item.enrolled / item.capacity) * 100).toFixed(1);
                return (
                  <div className="rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-3 shadow-xl min-w-44">
                    <p className="text-xs font-bold text-popover-foreground mb-1.5">
                      {item.department} ({item.code})
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between gap-3 text-muted-foreground">
                        <span>{isAr ? 'المسجلون:' : 'Enrolled:'}</span>
                        <span className="font-mono font-bold text-cyan-400">
                          {item.enrolled.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 text-muted-foreground">
                        <span>{isAr ? 'الطاقة الاستيعابية:' : 'Max Capacity:'}</span>
                        <span className="font-mono text-foreground">
                          {item.capacity.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 text-muted-foreground border-t border-border/60 pt-1 mt-1">
                        <span>{isAr ? 'نسبة الإشغال:' : 'Utilization:'}</span>
                        <span className={`font-mono font-bold ${Number(util) >= 90 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {util}%
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
            <Bar
              dataKey="enrolled"
              name={isAr ? 'المسجلون' : 'Enrolled'}
              fill="#0d9488"
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
            />
            <Bar
              dataKey="capacity"
              name={isAr ? 'الطاقة الاستيعابية' : 'Capacity'}
              fill="hsl(var(--muted-foreground) / 0.25)"
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Utilization Progress Indicators */}
      <div className="mt-4 space-y-2.5 border-t border-border/60 pt-3">
        {data.map((dept) => {
          const utilPct = Math.min(100, Math.round((dept.enrolled / dept.capacity) * 100));
          const isWarning = utilPct >= 90;
          const badge = getUtilizationBadge(utilPct);
          const displayName = isAr && dept.departmentAr ? dept.departmentAr : dept.department;
          return (
            <div key={dept.code} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{displayName}</span>
                <div className="flex items-center gap-2">
                  {isWarning && <AlertCircle className="h-3 w-3 text-amber-500" />}
                  <span className={`rounded-squircle px-2 py-0.5 text-[10px] font-mono border ${badge.color}`}>
                    {utilPct}%
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    utilPct >= 95
                      ? 'bg-rose-500'
                      : utilPct >= 90
                        ? 'bg-amber-500'
                        : 'bg-teal-500'
                  }`}
                  style={{ width: `${utilPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
