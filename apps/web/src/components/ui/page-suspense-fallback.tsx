'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface PageSuspenseFallbackProps {
  className?: string;
}

/**
 * Full-page Suspense fallback with centered spinner.
 * Used as the fallback for React.lazy / dynamic imports.
 */
export function PageSuspenseFallback({ className }: PageSuspenseFallbackProps) {
  return (
    <div
      className={cn(
        'flex min-h-[60vh] flex-col items-center justify-center space-y-4',
        className,
      )}
    >
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-border">
        <div className="h-full animate-pulse rounded-full bg-primary/60" style={{ width: '60%' }} />
      </div>
    </div>
  );
}

/**
 * Skeleton block for page content loading.
 * Shows a skeleton with pulsing lines mimicking table/card content.
 */
export function PageSkeletonLoader() {
  return (
    <div className="animate-fade-in space-y-6 p-6">
      {/* Title skeleton */}
      <div className="flex justify-center">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-surface" />
      </div>
      {/* Subtitle + button skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-surface" />
        <div className="h-10 w-32 animate-pulse rounded-lg bg-surface" />
      </div>
      {/* Filter bar skeleton */}
      <div className="h-14 w-full animate-pulse rounded-xl bg-surface" />
      {/* Table skeleton */}
      <div className="space-y-2 rounded-xl border border-border bg-card/50 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-surface" />
        ))}
      </div>
    </div>
  );
}
