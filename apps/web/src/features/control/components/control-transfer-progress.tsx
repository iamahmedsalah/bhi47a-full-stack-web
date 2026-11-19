"use client";

export function ControlTransferProgress({
  label,
  percent,
}: {
  label: string;
  percent: number | null;
}) {
  const value =
    percent === null ? null : Math.min(100, Math.max(0, Math.floor(percent)));
  return (
    <div
      className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <span>{label}</span>
        {value !== null && (
          <bdi className="font-mono font-bold" dir="ltr">
            {value}%
          </bdi>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        className="h-2 overflow-hidden rounded-full bg-primary/10"
      >
        <div
          className={
            value === null
              ? "h-full w-1/3 animate-pulse rounded-full bg-primary"
              : "h-full rounded-full bg-primary transition-[width]"
          }
          style={value === null ? undefined : { width: `${value}%` }}
        />
      </div>
    </div>
  );
}
