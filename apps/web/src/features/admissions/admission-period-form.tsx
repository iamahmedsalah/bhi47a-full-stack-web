"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import {
  admissionYearPrefix,
  isAdmissionAcademicYear,
  type AdmissionPeriodItem,
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
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { toCairoDateTimeLocal } from "@/lib/cairo-time";
import { getApiErrorDetails } from "@/lib/api";
import {
  admissionPeriodFormSchema,
  type AdmissionPeriodFormValues,
} from "./period-form";

export function AdmissionPeriodForm({
  initial,
  pending,
  close,
  save,
}: {
  initial?: AdmissionPeriodItem;
  pending: boolean;
  close: () => void;
  save: (values: AdmissionPeriodFormValues) => Promise<void>;
}) {
  const t = useTranslations("admissions");
  const locale = useLocale();
  const schema = useMemo(
    () => admissionPeriodFormSchema((key) => t(`validation.${key}`), initial),
    [t, initial],
  );
  const form = useForm<AdmissionPeriodFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: initial?.code ?? "",
      academicYear: initial?.academicYear ?? "",
      name: initial?.name ?? "",
      nameAr: initial?.nameAr ?? "",
      opensAt: toCairoDateTimeLocal(initial?.opensAt),
      closesAt: toCairoDateTimeLocal(initial?.closesAt),
      isEnabled: initial?.isEnabled ?? false,
    },
  });
  const submit = async (values: AdmissionPeriodFormValues) => {
    form.clearErrors("root");
    try {
      await save(values);
    } catch (error) {
      const { code } = getApiErrorDetails(error);
      const key =
        code === "ADMISSION_PERIOD_CHANGED"
          ? "changed"
          : code === "ADMISSION_PERIOD_CODE_TAKEN"
            ? "duplicate"
            : code === "ADMISSION_PERIOD_WINDOW"
              ? "window"
              : "failed";
      if (key === "duplicate")
        form.setError(
          "code",
          { message: t("errors.duplicate") },
          { shouldFocus: true },
        );
      form.setError("root.server", { message: t(`errors.${key}`) });
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
        className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl"
      >
        <DialogHeader className="text-start">
          <DialogTitle>{initial ? t("edit") : t("create")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(submit)}
            className="space-y-4"
          >
            {form.formState.errors.root?.server?.message && (
              <p
                role="alert"
                className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
              >
                {form.formState.errors.root.server.message}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {(["code", "academicYear", "nameAr", "name"] as const).map(
                (key) => (
                  <FormField
                    key={key}
                    control={form.control}
                    name={key}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t(`fields.${key}`)}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="rounded-squircle"
                            dir={key === "nameAr" ? "rtl" : "ltr"}
                            disabled={
                              pending ||
                              Boolean(
                                initial &&
                                (key === "code" || key === "academicYear"),
                              )
                            }
                            placeholder={
                              key === "academicYear" ? "2026-2027" : undefined
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ),
              )}
              {(["opensAt", "closesAt"] as const).map((key) => (
                <FormField
                  key={key}
                  control={form.control}
                  name={key}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t(`fields.${key}`)}</FormLabel>
                      <div role="group" aria-label={t(`fields.${key}`)}>
                        <DateTimePicker
                          value={field.value}
                          onChange={field.onChange}
                          locale={locale}
                          timeZone="Africa/Cairo"
                          placeholder={t(`fields.${key}`)}
                          disabled={pending}
                          isError={Boolean(form.formState.errors[key])}
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("cairoHint")}</p>
            {isAdmissionAcademicYear(form.watch("academicYear")) && (
              <p className="text-xs text-primary">
                {t("allocationPrefix", {
                  prefix: admissionYearPrefix(form.watch("academicYear")),
                })}
              </p>
            )}
            {initial && (
              <p className="text-xs text-muted-foreground">
                {t("immutableHint")}
              </p>
            )}
            <FormField
              control={form.control}
              name="isEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) =>
                        field.onChange(checked === true)
                      }
                      disabled={pending}
                    />
                  </FormControl>
                  <FormLabel>{t("fields.isEnabled")}</FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                {pending ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
