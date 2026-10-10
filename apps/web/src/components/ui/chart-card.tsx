'use client';

import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { GlassCard } from '@/components/ui/glass-card';
import { exportElementToPng } from '@/lib/export-utils';

interface ChartCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
  className?: string;
  exportable?: boolean;
  exportFilename?: string;
  action?: React.ReactNode;
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
  exportable = false,
  exportFilename,
  action,
}: ChartCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = React.useState(false);

  const handleExportPng = async () => {
    if (!cardRef.current) return;
    setIsExporting(true);
    try {
      const filename = exportFilename || `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      await exportElementToPng(cardRef.current, filename);
    } catch (err) {
      console.error('Failed to export chart PNG', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <GlassCard ref={cardRef} className={cn('p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight text-foreground">{title}</h3>
          {description && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {exportable && (
            <button
              data-no-export="true"
              type="button"
              onClick={handleExportPng}
              disabled={isExporting}
              className="flex items-center gap-1.5 rounded-squircle border border-border bg-surface/50 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-surface hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
              title="Export as PNG"
            >
              {isExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span className="font-mono text-[11px]">PNG</span>
            </button>
          )}
          {icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle border border-primary/30 bg-primary/10 text-primary">
              {icon}
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-72 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col h-72 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 text-center text-sm text-muted-foreground gap-2">
          <p className="font-medium text-xs text-muted-foreground">
            {emptyMessage || 'No data available yet'}
          </p>
        </div>
      ) : (
        <div className="h-72 min-w-0">{children}</div>
      )}
    </GlassCard>
  );
}
