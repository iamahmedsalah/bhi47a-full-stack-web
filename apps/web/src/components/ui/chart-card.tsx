'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { GlassCard } from '@/components/ui/glass-card';

interface ChartCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  description,
  icon,
  isLoading = false,
  isEmpty = false,
  emptyMessage = 'No data available yet.',
  children,
  className,
}: ChartCardProps) {
  return (
    <GlassCard className={cn('p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight text-foreground">{title}</h3>
          {description && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle border border-primary/30 bg-primary/10 text-primary">
            {icon}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-72 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : isEmpty ? (
        <div className="flex h-72 items-center justify-center rounded-squircle border border-dashed border-border/80 bg-surface/25 px-6 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="h-72 min-w-0">{children}</div>
      )}
    </GlassCard>
  );
}
