"use client";

import { Download, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScheduleExportFormat } from "./export-schedule-image";

export function ScheduleExportButtons({
  locale,
  busyFormat,
  disabled,
  onExport,
}: {
  locale: string;
  busyFormat: ScheduleExportFormat | null;
  disabled: boolean;
  onExport: (format: ScheduleExportFormat) => void;
}) {
  const ar = locale === "ar";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["png", "pdf"] as const).map((format) => {
        const busy = busyFormat === format;
        const Icon = busy ? Loader2 : format === "png" ? Download : FileDown;
        return (
          <Button
            key={format}
            type="button"
            variant="outline"
            disabled={disabled || busyFormat !== null}
            onClick={() => onExport(format)}
            aria-busy={busy}
            className="h-auto min-h-11 whitespace-normal rounded-squircle border-primary/30 bg-primary/10 px-3 py-2.5 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <Icon
              className={`size-4 shrink-0 ${busy ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>
              {busy
                ? ar
                  ? "جارٍ تجهيز الملف…"
                  : "Preparing file…"
                : format === "png"
                  ? ar
                    ? "تحميل كصورة"
                    : "Download as Image"
                  : ar
                    ? "تحميل PDF بالعرض"
                    : "Download landscape PDF"}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
