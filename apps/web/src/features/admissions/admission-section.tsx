"use client";
import type { ReactNode } from "react";

/** Shared hierarchy for admission tabs; actions stay separate from table filters. */
export function AdmissionSection({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/80 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}
