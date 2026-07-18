'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { GlassCard } from '@/components/ui/glass-card';
import { cn } from '@/lib/cn';

interface FilterBarProps {
  /** Search input value */
  search: string;
  /** Search input change handler */
  onSearchChange: (value: string) => void;
  /** Placeholder text for the search field */
  searchPlaceholder?: string;
  /** Additional filter controls rendered inline */
  children?: React.ReactNode;
  /** Extra classNames */
  className?: string;
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  children,
  className,
}: FilterBarProps) {
  return (
    <GlassCard className={cn('p-4', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <label className="sr-only">{searchPlaceholder}</label>
          <Input
            type="text"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full min-w-0 border-border bg-surface/50 pe-4 ps-11 text-sm text-foreground placeholder:text-muted-foreground hover:bg-surface/70 focus-visible:ring-1 focus-visible:ring-primary lg:min-w-56"
          />
        </div>

        {children && (
          <div className="flex flex-row flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
            {children}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
