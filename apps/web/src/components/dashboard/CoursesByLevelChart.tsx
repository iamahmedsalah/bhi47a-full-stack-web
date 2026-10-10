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
import { BookOpen, Download, Loader2, Library, Layers } from 'lucide-react';
import { exportElementToPng } from '@/lib/export-utils';

export interface CourseLevelItem {
  name: string;
  value: number;
}

export interface CoursesByLevelChartProps {
  data?: CourseLevelItem[];
  title?: string;
  subtitle?: string;
  isAr?: boolean;
  isLoading?: boolean;
}

const LEVEL_LABELS: Record<string, { shortAr: string; fullAr: string; shortEn: string; fullEn: string; color: string }> = {
  '1': { shortAr: 'الفرقة الأولى', fullAr: 'الفرقة الأولى (الشعبة العامة)', shortEn: 'Level 1', fullEn: 'Level 1 (General)', color: '#0d9488' },
  '2': { shortAr: 'الفرقة الثانية', fullAr: 'الفرقة الثانية (الشعبة العامة)', shortEn: 'Level 2', fullEn: 'Level 2 (General)', color: '#0284c7' },
  '3': { shortAr: 'الفرقة الثالثة', fullAr: 'الفرقة الثالثة (تخصص BIS / محاسبة)', shortEn: 'Level 3', fullEn: 'Level 3 (Specialization)', color: '#8b5cf6' },
  '4': { shortAr: 'الفرقة الرابعة', fullAr: 'الفرقة الرابعة (سنة التخرج)', shortEn: 'Level 4', fullEn: 'Level 4 (Graduation)', color: '#10b981' },
};

export function CoursesByLevelChart({
  data = [],
  title,
  subtitle,
  isAr = false,
  isLoading = false,
}: CoursesByLevelChartProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const effectiveTitle = title ?? (isAr ? 'المقررات حسب المستوى' : 'Courses by Level');
  const effectiveSubtitle =
    subtitle ?? (isAr ? 'توزيع المقررات المتاحة على الفرق والمستويات الدراسية' : 'Academic course distribution across study levels');

  const formattedData = useMemo(() => {
    // Ensure all 4 levels are represented and properly ordered
    const levels = ['1', '2', '3', '4'];
    return levels.map((lvl) => {
      const found = data.find((d) => String(d.name).trim() === lvl);
      const val = found ? found.value : 0;
      const cfg = LEVEL_LABELS[lvl];
      return {
        level: lvl,
        value: val,
        shortLabel: isAr ? cfg.shortAr : cfg.shortEn,
        fullLabel: isAr ? cfg.fullAr : cfg.fullEn,
        color: cfg.color,
      };
    });
  }, [data, isAr]);

  const totalCourses = useMemo(() => formattedData.reduce((acc, d) => acc + d.value, 0), [formattedData]);
  const avgCourses = useMemo(() => (totalCourses > 0 ? (totalCourses / 4).toFixed(1) : '0'), [totalCourses]);
  const highestLevel = useMemo(() => {
    return [...formattedData].sort((a, b) => b.value - a.value)[0];
  }, [formattedData]);

  const handleExportPng = async () => {
    setIsExporting(true);
    try {
      await exportElementToPng(cardRef.current, 'courses-by-level-chart.png');
    } catch (err) {
      console.error('Failed to export courses by level chart', err);
    } finally {
      setIsExporting(false);
    }
  };

  const isEmpty = totalCourses === 0;

  return (
    <div
      ref={cardRef}
      className="flex flex-col rounded-2xl border border-border/70 bg-card/90 shadow-[var(--shadow-glow)] backdrop-blur p-5 transition-all hover:border-primary/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle bg-teal-500/15 text-teal-400 border border-teal-500/20">
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

      <div className="h-64 w-full pt-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col h-full items-center justify-center rounded-xl border border-dashed border-border/70 bg-secondary/10 px-6 text-center text-xs text-muted-foreground gap-2">
            <Library className="h-7 w-7 text-muted-foreground/60" />
            <p className="font-medium text-foreground/80">
              {isAr ? 'لا توجد مقررات دراسية مسجلة حالياً' : 'No courses recorded'}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                {formattedData.map((d) => (
                  <linearGradient key={`grad-${d.level}`} id={`barGrad-${d.level}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={d.color} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={d.color} stopOpacity={0.35} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="rgba(168,184,191,0.14)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="shortLabel"
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
                cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload as typeof formattedData[0];
                  const pct = totalCourses > 0 ? ((item.value / totalCourses) * 100).toFixed(0) : '0';
                  return (
                    <div className="rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-3 shadow-xl min-w-44">
                      <div className="flex items-center gap-2 mb-1.5 border-b border-border/60 pb-1">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-xs font-bold text-popover-foreground">{item.fullLabel}</span>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <span>{isAr ? 'عدد المقررات:' : 'Courses:'}</span>
                          <span className="font-mono font-bold text-foreground">{item.value} مقرر</span>
                        </div>
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <span>{isAr ? 'نسبة الخطة الدراسية:' : 'Plan Share:'}</span>
                          <span className="font-mono font-semibold text-teal-400">{pct}%</span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" name={isAr ? 'المقررات' : 'Courses'} radius={[6, 6, 0, 0]}>
                {formattedData.map((entry) => (
                  <Cell key={`cell-${entry.level}`} fill={`url(#barGrad-${entry.level})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Meta Indicators */}
      <div className="mt-4 pt-3 border-t border-border/50 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-secondary/30 p-2">
          <p className="text-[11px] text-muted-foreground">{isAr ? 'إجمالي المقررات' : 'Total Courses'}</p>
          <p className="font-mono font-bold text-sm text-foreground mt-0.5">{totalCourses}</p>
        </div>
        <div className="rounded-xl bg-secondary/30 p-2">
          <p className="text-[11px] text-muted-foreground">{isAr ? 'متوسط الفرقة' : 'Avg / Level'}</p>
          <p className="font-mono font-bold text-sm text-teal-400 mt-0.5">{avgCourses}</p>
        </div>
        <div className="rounded-xl bg-secondary/30 p-2">
          <p className="text-[11px] text-muted-foreground">{isAr ? 'الأعلى كثافة' : 'Highest'}</p>
          <p className="font-mono font-bold text-sm text-foreground mt-0.5 truncate">
            {highestLevel && highestLevel.value > 0 ? `${highestLevel.shortLabel} (${highestLevel.value})` : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
