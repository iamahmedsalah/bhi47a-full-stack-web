"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Choice, useAdmissionUI } from "./workflow-ui";

export function AcademicYearChoice({
  value,
  onChange,
  disabled = false,
  includeAll = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  includeAll?: boolean;
}) {
  const { t, userId } = useAdmissionUI();
  const years = useQuery({
    queryKey: ["admission-year-options", userId],
    queryFn: async () =>
      (await api.get<{ items: string[] }>("/admin/admissions/academic-years"))
        .data.items,
    staleTime: 60_000,
  });
  const values = [
    ...new Set([...(value ? [value] : []), ...(years.data ?? [])]),
  ]
    .sort()
    .reverse();
  return (
    <div className="min-w-0 space-y-1.5">
      <Choice
        label={t("fields.academicYear")}
        value={value || "ALL"}
        onChange={(year) => onChange(year === "ALL" ? "" : year)}
        disabled={disabled || years.isLoading}
        options={[
          ...(includeAll
            ? [{ value: "ALL", label: t("allYears") }]
            : [{ value: "ALL", label: t("chooseYear") }]),
          ...values.map((year) => ({ value: year, label: year })),
        ]}
      />
      {years.isError && (
        <div
          role="alert"
          className="flex items-center gap-2 text-xs text-danger"
        >
          <span>{t("yearsFailed")}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => years.refetch()}
          >
            {t("retry")}
          </Button>
        </div>
      )}
      {!years.isLoading && !years.isError && !values.length && (
        <p className="text-xs text-muted-foreground">{t("yearSetupHint")}</p>
      )}
    </div>
  );
}
