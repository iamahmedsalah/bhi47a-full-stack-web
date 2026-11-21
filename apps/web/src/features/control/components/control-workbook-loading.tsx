"use client";

import { TableProperties } from "lucide-react";
import { useTranslations } from "next-intl";

export function ControlWorkbookLoading() {
  const t = useTranslations("control");
  return (
    <div
      role="status"
      className="flex min-h-36 items-center justify-center gap-2 rounded-xl border border-border/60 bg-card text-sm text-muted-foreground"
    >
      <TableProperties aria-hidden="true" className="size-5 text-primary motion-safe:animate-pulse" />
      <span aria-hidden="true">{t("loadingShort")}</span>
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
