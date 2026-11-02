"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import * as SelectPrimitive from "@radix-ui/react-select";
import {
  ANALYTICS_REPORT_SHEETS,
  curriculumDepartmentLabel,
  isAdmissionAcademicYear,
  type AnalyticsReportSheet,
  type AnalyticsLocale,
} from "@student-portal/shared";
import {
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Layers,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { getApiErrorMessage } from "@/lib/api";
import {
  downloadComprehensiveAnalyticsExcel,
  type ExportReportParams,
} from "../api";

interface AnalyticsExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale?: string;
}

export function AnalyticsExportModal({
  open,
  onOpenChange,
  locale = "ar",
}: AnalyticsExportModalProps) {
  const t = useTranslations("analyticsExport");
  const dir = locale === "ar" ? "rtl" : "ltr";
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"all" | "selected">("all");
  const [selectedSheets, setSelectedSheets] = useState<AnalyticsReportSheet[]>([
    "quizzes",
  ]);
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("all");
  const [level, setLevel] = useState("all");
  const [department, setDepartment] = useState("all");
  const [reportLocale, setReportLocale] = useState<AnalyticsLocale>(
    locale === "en" ? "en" : "ar",
  );
  const [includeSubmissions, setIncludeSubmissions] = useState(false);
  const specialized = level === "3" || level === "4";
  const year = academicYear.trim();
  const validYear = !year || isAdmissionAcademicYear(year);
  const included = ANALYTICS_REPORT_SHEETS.filter((sheet) =>
    mode === "selected"
      ? selectedSheets.includes(sheet)
      : sheet !== "submissions" || includeSubmissions,
  );

  const renderSelect = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { value: string; label: string }[],
  ) => (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">
        {label}
      </Label>
      <SelectPrimitive.Root
        value={value}
        onValueChange={onChange}
        disabled={busy}
        dir={dir}
      >
        <SelectPrimitive.Trigger
          id={id}
          aria-label={label}
          className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-squircle border border-border bg-surface/50 px-3 py-2 text-start text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 [&>span]:truncate"
        >
          <SelectPrimitive.Value />
          <SelectPrimitive.Icon asChild>
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            dir={dir}
            position="popper"
            sideOffset={4}
            align="start"
            className="z-[200] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
          >
            <SelectPrimitive.Viewport className="p-1">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="relative flex cursor-pointer select-none items-center rounded-lg py-2 pe-3 ps-8 text-start text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  <SelectPrimitive.ItemIndicator className="absolute start-2">
                    <Check className="size-4" aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                  <SelectPrimitive.ItemText>
                    {option.label}
                  </SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );

  const handleExport = async () => {
    if (inFlight.current || !included.length || !validYear) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const params: ExportReportParams = {
      locale: reportLocale,
      includeSubmissions: mode === "all" && includeSubmissions,
      ...(mode === "selected" ? { sheets: included } : {}),
      ...(year ? { academicYear: year } : {}),
      ...(level !== "all" ? { level } : {}),
      ...(level === "1" || level === "2"
        ? { department: "GENERAL" }
        : specialized && department !== "all"
          ? { department }
          : {}),
    };
    if (semester === "first" || semester === "second" || semester === "summer")
      params.semester = semester;
    try {
      await downloadComprehensiveAnalyticsExcel(params);
      toast.success(t("success"));
      onOpenChange(false);
    } catch (cause) {
      const message = getApiErrorMessage(cause, t("failed"));
      setError(message);
      toast.error(message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!inFlight.current) onOpenChange(next);
      }}
    >
      <DialogContent
        dir={dir}
        className="w-[calc(100%-2rem)] max-w-xl rounded-2xl"
      >
        <DialogHeader className="text-start pe-6 rtl:sm:text-right">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet
              className="size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            {t("title")}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-4">
          {renderSelect(
            "analytics-export-mode",
            t("mode"),
            mode,
            (value) => setMode(value === "selected" ? "selected" : "all"),
            [
              { value: "all", label: t("all") },
              { value: "selected", label: t("selected") },
            ],
          )}
          {mode === "selected" && (
            <fieldset
              className="min-w-0 space-y-2 rounded-xl border border-border p-3"
              disabled={busy}
            >
              <legend className="px-1 text-xs font-semibold">
                {t("chooseSheets")}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {ANALYTICS_REPORT_SHEETS.map((sheet) => (
                  <Label
                    key={sheet}
                    htmlFor={`analytics-sheet-${sheet}`}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/60 p-2 text-xs font-normal leading-relaxed"
                  >
                    <Checkbox
                      id={`analytics-sheet-${sheet}`}
                      className="mt-0.5"
                      checked={selectedSheets.includes(sheet)}
                      disabled={busy}
                      onCheckedChange={(checked) =>
                        setSelectedSheets((current) =>
                          checked === true
                            ? [
                                ...current.filter((value) => value !== sheet),
                                sheet,
                              ]
                            : current.filter((value) => value !== sheet),
                        )
                      }
                    />
                    <span>{t(`sheets.${sheet}`)}</span>
                  </Label>
                ))}
              </div>
              {!included.length && (
                <p role="status" className="text-xs text-destructive">
                  {t("selectAtLeastOne")}
                </p>
              )}
            </fieldset>
          )}
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="analytics-export-year"
                className="text-xs font-semibold"
              >
                {t("academicYear")}
              </Label>
              <Input
                id="analytics-export-year"
                dir="ltr"
                className="text-left"
                value={academicYear}
                placeholder="2026-2027"
                maxLength={9}
                disabled={busy}
                aria-invalid={!validYear}
                aria-describedby="analytics-year-hint"
                onChange={(event) => setAcademicYear(event.target.value)}
              />
              <p
                id="analytics-year-hint"
                className={`text-xs ${validYear ? "text-muted-foreground" : "text-destructive"}`}
              >
                {t(validYear ? "allYearsHint" : "invalidYear")}
              </p>
            </div>
            {renderSelect(
              "analytics-export-semester",
              t("semester"),
              semester,
              setSemester,
              [
                { value: "all", label: t("allSemesters") },
                ...["first", "second", "summer"].map((value) => ({
                  value,
                  label: t(`semesters.${value}`),
                })),
              ],
            )}
            {renderSelect(
              "analytics-export-level",
              t("level"),
              level,
              (value) => {
                setLevel(value);
                if (value !== "3" && value !== "4") setDepartment("all");
              },
              [
                { value: "all", label: t("allLevels") },
                ...["1", "2", "3", "4"].map((value) => ({
                  value,
                  label: t("levelValue", { level: value }),
                })),
              ],
            )}
            {specialized &&
              renderSelect(
                "analytics-export-department",
                t("department"),
                department,
                setDepartment,
                [
                  { value: "all", label: t("allDepartments") },
                  ...["BIS", "ACCOUNTING"].map((value) => ({
                    value,
                    label: curriculumDepartmentLabel(value, locale),
                  })),
                ],
              )}
            {renderSelect(
              "analytics-export-language",
              t("language"),
              reportLocale,
              (value) => setReportLocale(value === "en" ? "en" : "ar"),
              [
                { value: "ar", label: "العربية" },
                { value: "en", label: "English" },
              ],
            )}
          </div>
          {(level === "1" || level === "2") && (
            <p className="text-xs text-muted-foreground">
              {t("generalLevels")}
            </p>
          )}
          {mode === "all" && (
            <Label
              htmlFor="analytics-include-submissions"
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/20 p-3 text-xs leading-relaxed"
            >
              <Checkbox
                id="analytics-include-submissions"
                checked={includeSubmissions}
                disabled={busy}
                onCheckedChange={(checked) =>
                  setIncludeSubmissions(checked === true)
                }
              />
              <span>
                {t("includeSubmissions")}
                <span className="mt-1 block font-normal text-muted-foreground">
                  {t("submissionsHint")}
                </span>
              </span>
            </Label>
          )}
          <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-primary">
              <Layers className="size-4" aria-hidden="true" />
              {t("included", { count: included.length })}
            </p>
            <div className="flex flex-wrap gap-1">
              {included.map((sheet) => (
                <span
                  key={sheet}
                  className="rounded-squircle border border-border/60 bg-card px-2 py-1 text-[11px] text-muted-foreground"
                >
                  {t(`sheets.${sheet}`)}
                </span>
              ))}
            </div>
          </div>
          {(included.includes("kpis") || included.includes("complaints")) && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("globalMetricsHint")}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 rtl:sm:justify-start">
          <Button
            type="button"
            onClick={() => void handleExport()}
            disabled={busy || !included.length || !validYear}
            className="rounded-squircle gap-2 whitespace-normal"
          >
            {busy ? (
              <Loader2
                className="size-4 shrink-0 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Download className="size-4 shrink-0" aria-hidden="true" />
            )}
            {t(
              busy
                ? "working"
                : mode === "all"
                  ? "downloadAll"
                  : "downloadSelected",
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="rounded-squircle"
          >
            {t("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
