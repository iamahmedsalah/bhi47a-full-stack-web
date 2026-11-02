"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocale, useTranslations } from "next-intl";
import {
  isAdmissionAcademicYear,
  admissionYearPrefix,
  type StudentCodeAuditResult,
  type StudentCodeFinding,
} from "@student-portal/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getApiErrorDetails } from "@/lib/api";
import type { CodeAuditScope } from "./api";
import { AcademicYearChoice } from "@/features/admissions/academic-year-choice";

export function CodeScopeForm({
  initial,
  pending,
  scan,
  configuredYears = false,
}: {
  initial: CodeAuditScope;
  pending: boolean;
  scan: (scope: CodeAuditScope) => void;
  configuredYears?: boolean;
}) {
  const t = useTranslations("studentCodes");
  const [manualYear, setManualYear] = useState(false);
  const schema = useMemo(
    () =>
      z.object({
        academicYear: z
          .string()
          .trim()
          .refine(isAdmissionAcademicYear, t("validation.year")),
        yearPrefix: z.string().regex(/^\d{2}$/, t("validation.prefix")),
      }),
    [t],
  );
  const form = useForm<CodeAuditScope>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  });
  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(scan)}
        className="flex flex-wrap items-start gap-3"
      >
        {(["academicYear", "yearPrefix"] as const).map((key) => (
          <FormField
            key={key}
            control={form.control}
            name={key}
            render={({ field }) => (
              <FormItem className="w-56">
                {!(
                  key === "academicYear" &&
                  configuredYears &&
                  !manualYear
                ) && <FormLabel>{t(`fields.${key}`)}</FormLabel>}
                {key === "academicYear" && configuredYears && !manualYear ? (
                  <AcademicYearChoice
                    value={field.value}
                    disabled={pending}
                    onChange={(year) => {
                      field.onChange(year);
                      if (isAdmissionAcademicYear(year))
                        form.setValue("yearPrefix", admissionYearPrefix(year), {
                          shouldValidate: true,
                        });
                    }}
                  />
                ) : (
                  <FormControl>
                    <Input
                      {...field}
                      dir="ltr"
                      className="text-left rounded-squircle"
                      maxLength={key === "academicYear" ? 9 : 2}
                      placeholder={key === "academicYear" ? "2026-2027" : "26"}
                      disabled={pending}
                    />
                  </FormControl>
                )}
                {key === "academicYear" && configuredYears && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setManualYear((value) => !value)}
                  >
                    {t(manualYear ? "configuredYear" : "manualYear")}
                  </Button>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        <Button type="submit" className="mt-8" disabled={pending}>
          {t("scan")}
        </Button>
      </form>
    </Form>
  );
}

export interface CodeWriteIntent {
  hold?: boolean;
  snapshot: StudentCodeAuditResult;
  row?: StudentCodeFinding;
}
export interface CodeConfirmationValues {
  reason: string;
  confirmed: boolean;
  neverAssignedConfirmed: boolean;
}
const errorKeys: Record<string, string> = {
  CODE_PREVIEW_CHANGED: "changed",
  CODE_LEGACY_REVIEW_REQUIRED: "review",
  CODE_YEAR_CONFLICT: "mapping",
  CODE_YEAR_NOT_READY: "notReady",
  CODE_RECOVERY_UNSAFE: "unsafe",
  CODE_WRITE_CONFLICT: "changed",
  ADMISSION_TRANSACTIONS_REQUIRED: "replica",
  CODE_IDENTITY_INDEXES_REQUIRED: "indexes",
};

export function CodeWriteDialog({
  intent,
  pending,
  close,
  save,
}: {
  intent: CodeWriteIntent;
  pending: boolean;
  close: () => void;
  save: (values: CodeConfirmationValues) => Promise<void>;
}) {
  const t = useTranslations("studentCodes");
  const locale = useLocale();
  const recovery = Boolean(intent.row) && !intent.hold;
  const schema = useMemo(
    () =>
      z.object({
        reason: z
          .string()
          .trim()
          .min(10, t("validation.reason"))
          .max(1000, t("validation.reason")),
        confirmed: z.boolean().refine(Boolean, t("validation.confirm")),
        neverAssignedConfirmed: z
          .boolean()
          .refine((value) => !recovery || value, t("validation.attest")),
      }),
    [t, recovery],
  );
  const form = useForm<CodeConfirmationValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      reason: "",
      confirmed: false,
      neverAssignedConfirmed: false,
    },
  });
  const submit = async (values: CodeConfirmationValues) => {
    form.clearErrors("root");
    try {
      await save(values);
    } catch (error) {
      const { code } = getApiErrorDetails(error);
      form.setError("root.server", {
        message: t(`errors.${errorKeys[code ?? ""] ?? "save"}`),
      });
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <DialogContent
        dir={locale === "ar" ? "rtl" : "ltr"}
        className="max-h-[90vh] overflow-y-auto rounded-2xl"
      >
        <DialogHeader className="text-start">
          <DialogTitle>
            {intent.hold
              ? t("hold")
              : recovery
                ? t("recover")
                : t("initialize")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {intent.hold
            ? t("holdHint")
            : recovery
              ? t("recoverHint")
              : t("initializeHint")}
        </p>
        <p className="text-sm">
          <bdi>{intent.snapshot.academicYear}</bdi> /{" "}
          <bdi>{intent.row?.studentCode ?? intent.snapshot.yearPrefix}</bdi>
        </p>
        <Form {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(submit)}
            className="space-y-4"
          >
            {form.formState.errors.root?.server?.message && (
              <p
                role="alert"
                className="rounded-xl border border-danger/30 p-3 text-sm text-danger"
              >
                {form.formState.errors.root.server.message}
              </p>
            )}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.reason")}</FormLabel>
                  <FormControl>
                    <Textarea {...field} disabled={pending} maxLength={1000} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {(
              [
                "confirmed",
                ...(recovery ? ["neverAssignedConfirmed"] : []),
              ] as const
            ).map((key) => (
              <FormField
                key={key}
                control={form.control}
                name={key as "confirmed" | "neverAssignedConfirmed"}
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <div className="flex items-start gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(value) =>
                            field.onChange(value === true)
                          }
                          disabled={pending}
                        />
                      </FormControl>
                      <FormLabel className="text-sm leading-5">
                        {t(key)}
                      </FormLabel>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <DialogFooter className="gap-2 rtl:sm:justify-start">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={close}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? t("saving") : t("confirmAction")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
