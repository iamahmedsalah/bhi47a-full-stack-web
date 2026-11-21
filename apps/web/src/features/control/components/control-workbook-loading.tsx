"use client";

import { FileSpreadsheet } from "lucide-react";
import { useTranslations } from "next-intl";

export function ControlWorkbookLoading({
  stage = "loading",
}: {
  stage?: "loading" | "loadingList" | "openingSheet" | "restoringPosition";
}) {
  const t = useTranslations("control");
  const compact = stage === "openingSheet" || stage === "restoringPosition";
  return (
    <div
      role="status"
      className={
        compact
          ? "inline-flex max-w-full items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2"
          : "flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-border/70 bg-card px-5 py-8 text-center"
      }
    >
      <span
        aria-hidden="true"
        className={`relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-primary/20 bg-primary/10 text-primary ${compact ? "size-8" : "size-14"}`}
      >
        <FileSpreadsheet className={compact ? "size-4" : "size-7"} />
        <span className="absolute inset-x-0 top-0 hidden h-px bg-primary/80 shadow-[0_0_10px_var(--color-primary)] motion-safe:block motion-safe:animate-[control-sheet-scan_1.8s_ease-in-out_infinite]" />
      </span>
      <span
        className={
          compact
            ? "text-xs font-medium text-primary"
            : "text-sm font-semibold text-foreground"
        }
      >
        {t(stage)}
      </span>
      {!compact && (
        <span
          aria-hidden="true"
          className="grid w-40 grid-cols-[1.5fr_1fr_1fr] gap-1.5"
        >
          {Array.from({ length: 6 }, (_, cell) => (
            <span
              key={cell}
              className="h-2 rounded-sm bg-primary/15 motion-safe:animate-pulse"
              style={{ animationDelay: `${cell * 110}ms` }}
            />
          ))}
        </span>
      )}
    </div>
  );
}
