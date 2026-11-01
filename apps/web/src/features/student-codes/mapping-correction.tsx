"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  AdmissionDialog,
  AdmissionInput,
  Field,
  useAdmissionUI,
} from "@/features/admissions/workflow-ui";
import { getAdmissionErrorMessage } from "@/features/admissions/admission-error";

interface MappingPreview {
  items: Array<{
    academicYear: string;
    currentPrefix: string;
    expectedPrefix: string;
    nextSequence: number;
    nextCode?: string;
  }>;
  fingerprint: string;
  canApply: boolean;
  truncated: boolean;
  collision: boolean;
}
export function MappingCorrection() {
  const { t, userId } = useAdmissionUI(),
    [open, setOpen] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const form = useForm<{ reason: string }>({ defaultValues: { reason: "" } });
  const client = useQueryClient(),
    router = useRouter(),
    params = useSearchParams(),
    pathname = usePathname();
  const preview = useQuery({
    queryKey: ["code-mapping-preview", userId],
    queryFn: async () =>
      (await api.get<MappingPreview>("/admin/student-codes/mappings/preview"))
        .data,
    enabled: open,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          setConfirmed(false);
          setError("");
          void preview.refetch();
        }}
      >
        {t("mapping.preview")}
      </Button>
      <AdmissionDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("mapping.title")}
        description={t("mapping.description")}
      >
        {preview.isLoading ? (
          <p>{t("loading")}</p>
        ) : preview.isError ? (
          <div role="alert">
            <p>{getAdmissionErrorMessage(preview.error, t)}</p>
            <Button onClick={() => preview.refetch()}>{t("retry")}</Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              if (!preview.data || !confirmed) return;
              setError("");
              try {
                await api.post("/admin/student-codes/mappings/correct", {
                  fingerprint: preview.data.fingerprint,
                  reason: values.reason,
                  confirmed: true,
                });
                await client.invalidateQueries({
                  queryKey: ["student-code-audit"],
                });
                await client.invalidateQueries({
                  queryKey: ["code-mapping-preview"],
                });
                const item =
                  preview.data.items.find(
                    (row) => row.academicYear === params.get("academicYear"),
                  ) ?? preview.data.items[0];
                if (item) {
                  const next = new URLSearchParams(params);
                  next.set("academicYear", item.academicYear);
                  next.set("yearPrefix", item.expectedPrefix);
                  next.delete("page");
                  router.replace(`${pathname}?${next}`);
                }
                setOpen(false);
                form.reset();
              } catch (e) {
                setError(getAdmissionErrorMessage(e, t));
              }
            })}
          >
            {!preview.data?.items.length && <p>{t("mapping.noChanges")}</p>}
            {preview.data?.items.map((item) => (
              <article
                key={item.academicYear}
                className="grid gap-2 rounded-xl border p-4 sm:grid-cols-2"
              >
                <p>
                  {t("fields.academicYear")}: <bdi>{item.academicYear}</bdi>
                </p>
                <p>
                  {t("mapping.current")}: <bdi>{item.currentPrefix}</bdi> →{" "}
                  <bdi>{item.expectedPrefix}</bdi>
                </p>
                <p>
                  {t("mapping.next")}:{" "}
                  <bdi>{item.nextCode ?? t("mapping.exhausted")}</bdi>
                </p>
              </article>
            ))}
            {(preview.data?.truncated || preview.data?.collision) && (
              <p role="alert" className="text-danger">
                {t("mapping.blocked")}
              </p>
            )}
            {preview.data?.canApply && (
              <>
                <Field
                  label={t("reason")}
                  error={form.formState.errors.reason?.message}
                >
                  <AdmissionInput
                    {...form.register("reason", {
                      required: t("invalid"),
                      minLength: { value: 10, message: t("invalid") },
                      maxLength: { value: 1000, message: t("invalid") },
                    })}
                  />
                </Field>
                <label className="flex gap-2">
                  <Checkbox
                    checked={confirmed}
                    onCheckedChange={(value) => setConfirmed(Boolean(value))}
                  />
                  {t("mapping.confirm")}
                </label>
                <Button
                  disabled={
                    !confirmed ||
                    form.formState.isSubmitting ||
                    preview.isFetching
                  }
                >
                  {t("mapping.apply")}
                </Button>
              </>
            )}
            {error && (
              <p role="alert" className="text-danger">
                {error}
              </p>
            )}
          </form>
        )}
      </AdmissionDialog>
    </>
  );
}
