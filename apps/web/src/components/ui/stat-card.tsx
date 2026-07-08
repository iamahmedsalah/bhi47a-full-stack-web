'use client';

import React from 'react';
import { cn } from '@/lib/cn';

interface StatCardProps {
  /** Card title */
  title: string;
  /** Main value to display */
  value: string | number;
  /** Lucide icon */
  icon: React.ReactNode;
  /** Accent color (hex) */
  color: string;
  /** Optional trend / subtitle text */
  subtitle?: string;
  /** Extra classNames */
  className?: string;
}

/**
 * Reusable stat card with icon, value, and accent color.
 * Used for dashboard overview, complaint stats, etc.
 */
export function StatCard({
  title,
  value,
  icon,
  color,
  subtitle,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/70 bg-card/90 p-4 shadow-[var(--shadow-glow)] backdrop-blur transition-all duration-300 hover:border-primary/40 hover:bg-card-hover/70',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <p className="truncate text-xs font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold leading-tight text-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs leading-5 text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-squircle border"
          style={{
            backgroundColor: `${color}20`,
            borderColor: `${color}70`,
            color,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ─── StatCardRow ─────────────────────────────────────── */
interface StatCardRowProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Grid wrapper for StatCards — auto-responsive columns.
 */
export function StatCardRow({ children, className }: StatCardRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
