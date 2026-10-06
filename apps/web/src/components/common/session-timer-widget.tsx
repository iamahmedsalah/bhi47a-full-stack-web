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
        'group flex items-center gap-1.5 sm:gap-2 bg-black/20 hover:bg-black/30 dark:bg-card/40 dark:hover:bg-card/60 px-2 py-1 sm:px-3 sm:py-1.5 rounded-squircle border border-border/40 cursor-pointer transition-all select-none focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-teal-500 shrink-0',
        isExpiringSoon && 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_10px_rgba(245,158,11,0.2)]',
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
          'w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-colors',
          isExpiringSoon
            ? 'text-amber-400 animate-pulse'
            : 'text-slate-300 dark:text-muted-foreground group-hover:text-foreground',
        )}
      />
      <div className="flex flex-col text-start">
        <span
          className="text-[11px] sm:text-xs font-mono font-bold text-foreground text-center leading-none"
          dir="ltr"
        >
          <bdi>{formattedTime}</bdi>
        </span>
        <div className="w-10 sm:w-16 h-1 bg-muted/50 rounded-full overflow-hidden mt-1">
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
