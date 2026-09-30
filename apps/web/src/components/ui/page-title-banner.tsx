'use client';

import React from 'react';
import { cn } from '@/lib/cn';

interface PageTitleBannerProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function PageTitleBanner({
  title,
  subtitle,
  eyebrow,
  icon,
  children,
  className,
}: PageTitleBannerProps) {
  const shouldShowSubtitle = Boolean(subtitle && subtitle !== title);

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-border/70 bg-card/90 p-5 shadow-[var(--shadow-glow)] backdrop-blur md:p-6',
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="inline-flex max-w-full items-center gap-2 rounded-squircle border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {icon && <span className="shrink-0">{icon}</span>}
            <span className="truncate">{eyebrow ?? title}</span>
          </div>
          <div className="space-y-1">
            <h1 className="text-balance text-2xl font-bold leading-tight text-foreground drop-shadow md:text-3xl">
              {title}
            </h1>
            {shouldShowSubtitle && (
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {children && (
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
