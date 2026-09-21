'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  LifeBuoy,
  MessageSquare,
  Wrench,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

export interface ComplaintStats {
  total: number;
  open: number;
  review: number;
  working: number;
  resolved: number;
  technical: number;
  complaints: number;
  high: number;
  avgResolution: string;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  tone: string;
}

function MetricCard({ title, value, description, icon, tone }: MetricCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="overflow-hidden border-border/80 bg-card/90 p-4 shadow-[var(--shadow-glow)] backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-squircle border',
              tone,
            )}
          >
            {icon}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export interface ComplaintKpiCardsProps {
  stats: ComplaintStats;
  total: number;
  isAr: boolean;
}

export function ComplaintKpiCards({ stats, total, isAr }: ComplaintKpiCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        title={isAr ? 'إجمالي البلاغات' : 'Total complaints'}
        value={stats.total}
        description={
          isAr
            ? `يعرض ${total} في الصفحة الحالية`
            : `Showing ${total} on current page`
        }
        icon={<ClipboardList className="h-5 w-5" />}
        tone="border-primary/30 bg-primary/10 text-primary"
      />
      <MetricCard
        title={isAr ? 'قيد الانتظار' : 'Pending'}
        value={stats.open}
        description={
          isAr ? 'بلاغات تحتاج فرز أولي' : 'Tickets needing initial triage'
        }
        icon={<Clock3 className="h-5 w-5" />}
        tone="border-amber-400/30 bg-amber-400/10 text-amber-200"
      />
      <MetricCard
        title={isAr ? 'قيد المراجعة' : 'In Review'}
        value={stats.review + stats.working}
        description={isAr ? 'تم فتحها بواسطة الفريق' : 'Opened by staff'}
        icon={<LifeBuoy className="h-5 w-5" />}
        tone="border-sky-400/30 bg-sky-400/10 text-sky-200"
      />
      <MetricCard
        title={isAr ? 'تم الحل' : 'Resolved'}
        value={stats.resolved}
        description={isAr ? 'تذاكر تم إنهاؤها' : 'Tickets solved'}
        icon={<CheckCircle2 className="h-5 w-5" />}
        tone="border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      />
      <MetricCard
        title={isAr ? 'أعطال فنية' : 'Technical Issues'}
        value={stats.technical}
        description={
          isAr ? 'بلاغات الدعم والصيانة' : 'Support & maintenance tickets'
        }
        icon={<Wrench className="h-5 w-5" />}
        tone="border-violet-400/30 bg-violet-400/10 text-violet-200"
      />
      <MetricCard
        title={isAr ? 'شكاوى' : 'General Complaints'}
        value={stats.complaints}
        description={isAr ? 'شكاوى عامة من الطلاب' : 'General student complaints'}
        icon={<MessageSquare className="h-5 w-5" />}
        tone="border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
      />
      <MetricCard
        title={isAr ? 'أولوية عالية' : 'High Priority'}
        value={stats.high}
        description={isAr ? 'تحتاج متابعة أسرع' : 'Requires faster follow-up'}
        icon={<AlertTriangle className="h-5 w-5" />}
        tone="border-red-400/30 bg-red-400/10 text-red-200"
      />
      <MetricCard
        title={isAr ? 'متوسط وقت الحل' : 'Avg Resolution Time'}
        value={stats.avgResolution}
        description={isAr ? 'حسب التذاكر المحلولة' : 'Based on resolved tickets'}
        icon={<CalendarClock className="h-5 w-5" />}
        tone="border-indigo-400/30 bg-indigo-400/10 text-indigo-200"
      />
    </div>
  );
}
