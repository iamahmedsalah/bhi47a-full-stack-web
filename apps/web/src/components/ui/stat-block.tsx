import React, { ReactNode } from 'react';
import { GlassCard } from './glass-card';
import { cn } from '@/lib/cn';

interface StatBlockProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  description?: string;
  color?: string;
  className?: string;
  loading?: boolean;
}

export function StatBlock({
  title,
  value,
  icon,
  description,
  color = 'var(--primary)',
  className,
  loading = false,
}: StatBlockProps) {
  if (loading) {
    return (
      <GlassCard className={cn('animate-pulse', className)}>
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 rounded-xl bg-surface-hover/80" />
        </div>
        <div className="h-4 bg-surface-hover/80 rounded w-1/3 mb-2" />
        <div className="h-8 bg-surface-hover/80 rounded w-2/3" />
      </GlassCard>
    );
  }

  return (
    <GlassCard className={cn('card-glow', className)}>
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {icon}
        </div>
      </div>
      <h3 className="text-muted text-sm font-semibold mb-1">{title}</h3>
      <div className="text-2xl font-bold text-foreground mb-1">{value}</div>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </GlassCard>
  );
}
