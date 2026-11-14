"use client";

import React, { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/cn";

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
  /** Let longer feature filters wrap without shrinking their labels. */
  wrapFilters?: boolean;
  compact?: boolean;
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  children,
  className,
  wrapFilters = false,
  compact = false,
}: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(search);

  // Synchronize internal state with incoming prop
  const [previousSearch, setPreviousSearch] = useState<unknown[] | null>(null);
  if (
    previousSearch === null ||
    previousSearch.some((value, index) => !Object.is(value, [search][index]))
  ) {
    setPreviousSearch([search]);
    (() => {
      setLocalSearch(search);
    })();
  }

  // Debounce notification back to parent
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== search) {
        onSearchChange(localSearch);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [localSearch, onSearchChange, search]);

  const handleClear = () => {
    setLocalSearch("");
    onSearchChange("");
  };

  return (
    <GlassCard
      className={cn(
        compact ? "p-3" : "p-4",
        compact && "[&_input]:h-9 [&_button[aria-haspopup=listbox]]:h-9",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-3 lg:flex-row",
          compact ? "lg:items-start" : "lg:items-center",
        )}
      >
        <div
          className={cn(
            "relative min-w-0 shrink-0",
            compact
              ? "w-full lg:w-56"
              : "flex-1 max-w-sm lg:max-w-xs xl:max-w-sm",
          )}
        >
          <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <label className="sr-only">{searchPlaceholder}</label>
          <Input
            type="text"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full min-w-0 border-border bg-surface/50 pe-10 ps-11 text-sm text-foreground placeholder:text-muted-foreground hover:bg-surface/70 focus-visible:ring-1 focus-visible:ring-primary lg:min-w-56"
          />
          {localSearch && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer rounded-full hover:bg-secondary/80 transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {children && (
          <div
            className={cn(
              compact
                ? "grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] items-start gap-2 [&>*]:w-full [&>*]:min-w-0"
                : "flex flex-row flex-wrap items-center gap-2 lg:justify-end",
              !compact && (wrapFilters ? "min-w-0 flex-1" : "lg:flex-nowrap"),
            )}
          >
            {children}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
