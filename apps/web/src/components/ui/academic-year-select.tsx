"use client";

import { useEffect, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { type Semester, isAdmissionAcademicYear } from "@student-portal/shared";
import { useAuth } from "@/providers/auth-provider";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AcademicYearOptions {
  items: string[];
  managedYears?: string[];
  currentYear?: string | null;
  currentSemester?: Semester | null;
}

export const academicYearOptionsKey = ["academic-year-options"] as const;

export function useAcademicYearOptions(admission = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...academicYearOptionsKey, user?._id, admission],
    queryFn: async () =>
      (
        await api.get<AcademicYearOptions>(
          admission
            ? "/admin/admissions/academic-years"
            : "/admin/academic-years/options",
        )
      ).data,
    enabled: Boolean(user?._id),
    staleTime: 60_000,
  });
}

export function AcademicYearSelect({
  value,
  onChange,
  disabled = false,
  includeAll = false,
  admission = false,
  managedOnly = false,
  defaultToCurrent = false,
  label,
  showLabel = true,
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  includeAll?: boolean;
  admission?: boolean;
  managedOnly?: boolean;
  defaultToCurrent?: boolean;
  label?: string;
  showLabel?: boolean;
  invalid?: boolean;
}) {
  const t = useTranslations("admissionWorkflow");
  const dir = useLocale() === "ar" ? "rtl" : "ltr";
  const id = useId();
  const years = useAcademicYearOptions(admission);
  const current = years.data?.currentYear;
  const available = managedOnly
    ? (years.data?.managedYears ?? years.data?.items)
    : years.data?.items;
  const values = [...new Set([...(value ? [value] : []), ...(available ?? [])])]
    .filter((year) => year === value || isAdmissionAcademicYear(year))
    .sort()
    .reverse();
  const fieldLabel = label ?? t("fields.academicYear");
  useEffect(() => {
    if (!disabled && !value && defaultToCurrent && current) onChange(current);
  }, [current, defaultToCurrent, disabled, onChange, value]);

  return (
    <div className="min-w-0 space-y-1.5">
      {showLabel && <Label htmlFor={id}>{fieldLabel}</Label>}
      <Select
        value={value || (includeAll ? "ALL" : "")}
        onValueChange={(year) => onChange(year === "ALL" ? "" : year)}
        disabled={disabled || years.isLoading}
      >
        <SelectTrigger
          id={id}
          aria-label={fieldLabel}
          aria-invalid={invalid || undefined}
          className="w-full rounded-squircle"
        >
          <SelectValue placeholder={t("chooseYear")} />
        </SelectTrigger>
        <SelectContent dir={dir}>
          {includeAll && <SelectItem value="ALL">{t("allYears")}</SelectItem>}
          {values.map((year) => (
            <SelectItem key={year} value={year}>
              <bdi dir="ltr">{year}</bdi>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
      {years.isSuccess && !values.length && (
        <p className="text-xs text-muted-foreground">{t("yearSetupHint")}</p>
      )}
    </div>
  );
}
