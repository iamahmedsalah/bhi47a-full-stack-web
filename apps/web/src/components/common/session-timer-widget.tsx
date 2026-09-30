'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { Clock } from 'lucide-react';
import { useSessionTimer } from '@/hooks/use-session-timer';
import { cn } from '@/lib/cn';

interface SessionTimerWidgetProps {
  role: 'admin' | 'student' | 'staff';
  className?: string;
}

export function SessionTimerWidget({ role, className }: SessionTimerWidgetProps) {
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const isAr = locale === 'ar';

  const { formattedTime, pct, barColor, extendSession, isExpiringSoon } =
    useSessionTimer({ role });

  return (
    <div
      onClick={extendSession}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          extendSession();
        }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'group flex items-center gap-2 bg-black/20 hover:bg-black/30 dark:bg-card/40 dark:hover:bg-card/60 px-3 py-1.5 rounded-squircle border border-border/40 cursor-pointer transition-all select-none focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-teal-500',
        isExpiringSoon && 'border-amber-500/40 bg-amber-500/10',
        className,
      )}
      title={
        isAr
          ? 'انقر لتمديد الجلسة (الحد الأقصى للجلسة 20 دقيقة)'
          : 'Click to extend session (20-min session duration)'
      }
      aria-label={
        isAr
          ? `الوقت المتبقي للجلسة ${formattedTime}، انقر للتمديد`
          : `Session time remaining ${formattedTime}, click to extend`
      }
    >
      <Clock
        className={cn(
          'w-4 h-4 transition-colors',
          isExpiringSoon
            ? 'text-amber-400 animate-pulse'
            : 'text-slate-300 dark:text-muted-foreground group-hover:text-foreground',
        )}
      />
      <div className="flex flex-col text-start">
        <span
          className="text-xs font-mono font-bold text-foreground text-center leading-none"
          dir="ltr"
        >
          <bdi>{formattedTime}</bdi>
        </span>
        <div className="w-16 h-1 bg-muted/50 rounded-full overflow-hidden mt-1">
          <div
            className={cn(
              barColor,
              'h-full rounded-full transition-all duration-1000',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
