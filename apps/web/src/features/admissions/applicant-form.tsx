"use client";
import { getAdmissionErrorMessage } from "./admission-error";
import { useState, type ReactNode } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ADMISSION_MOBILE,
  isAdmissionNationalId,
  type AdmissionApplicant,
} from "@student-portal/shared";
import { Button } from "@/components/ui/button";

import { Choice, Field, AdmissionInput, useAdmissionUI } from "./workflow-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, UserPlus, Users } from "lucide-react";

const STANDARD_RELATIONSHIPS = [
  { value: "الأب", labelAr: "الأب", labelEn: "Father" },
  { value: "الأم", labelAr: "الأم", labelEn: "Mother" },
  { value: "الأخ", labelAr: "الأخ", labelEn: "Brother" },
  { value: "الأخت", labelAr: "الأخت", labelEn: "Sister" },
  { value: "العم", labelAr: "العم", labelEn: "Paternal Uncle" },
  { value: "الخال", labelAr: "الخال", labelEn: "Maternal Uncle" },
  { value: "الجد / الجدة", labelAr: "الجد / الجدة", labelEn: "Grandparent" },
  {
    value: "other",
    labelAr: "صلة قرابة أخرى...",
    labelEn: "Other relationship...",
  },
];

export function applicantSchema(
  message: string,
  publicForm: boolean,
  messages?: { guardianPhone: string; addressArabic: string },
) {
  return z
    .object({
      fullName: z.string().trim().min(2, message).max(160, message),
      fullNameAr: z.string().trim().max(160, message).optional(),
      nationalId: z
        .string()
        .optional()
        .refine(
          (value) =>
            !publicForm || Boolean(value && isAdmissionNationalId(value)),
          message,
        ),
      address: z
        .string()
        .trim()
        .min(5, message)
        .max(500, message)
        .refine(
          (value) => !publicForm || /[\u0600-\u06FF]/.test(value),
          messages?.addressArabic ?? message,
        ),
      phone: z.string().regex(ADMISSION_MOBILE, message),
      studentType: z.enum(["NEW", "TRANSFER"]),
      previousInstitution: z.string().trim().max(160, message).optional(),
      previousFaculty: z.string().trim().max(160, message).optional(),
      transferNotes: z.string().max(1000, message).optional(),
      guardians: z
        .array(
          z.object({
            name: z.string().trim().min(2, message).max(160, message),
            phone: z.string().regex(ADMISSION_MOBILE, message),
            relationship: z.string().trim().min(2, message).max(40, message),
          }),
        )
        .min(1, message)
        .max(3, message),
    })
    .refine(
      (value) =>
        value.studentType !== "TRANSFER" || Boolean(value.previousInstitution),
      { message, path: ["previousInstitution"] },
    )
    .superRefine((value, context) => {
      value.guardians.forEach((guardian, index) => {
        if (guardian.phone && guardian.phone === value.phone)
          context.addIssue({
            code: "custom",
            path: ["guardians", index, "phone"],
            message: messages?.guardianPhone ?? message,
          });
      });
    });
}
export type ApplicantValues = z.infer<ReturnType<typeof applicantSchema>>;
export function ApplicantForm({
  initial,
  publicForm = false,
  onSave,
  children,
  disabled,
}: {
  initial?: AdmissionApplicant;
  publicForm?: boolean;
  onSave: (values: ApplicantValues) => Promise<void>;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const { t, locale } = useAdmissionUI(),
    [error, setError] = useState("");
  const form = useForm<ApplicantValues>({
    resolver: zodResolver(
      applicantSchema(t("invalid"), publicForm, {
        guardianPhone: t("validationMessages.guardianPhone"),
        addressArabic: t("validationMessages.addressArabic"),
      }),
    ),
    defaultValues: {
      fullName: "",
      fullNameAr: "",
      address: "",
      phone: "",
      studentType: "NEW",
      previousInstitution: "",
      previousFaculty: "",
      transferNotes: "",
      guardians: [{ name: "", phone: "", relationship: "" }],
      ...initial,
    },
  });
  const guardians = useFieldArray({ control: form.control, name: "guardians" });
  const transfer = form.watch("studentType") === "TRANSFER";
  return (
    <form
      className="space-y-5"
      onSubmit={form.handleSubmit(async (values) => {
        setError("");
        try {
          await onSave(values);
        } catch (e) {
          setError(getAdmissionErrorMessage(e, t));
        }
      })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {(["fullName", "fullNameAr", "address", "phone"] as const).map(
          (name) => (
            <Field
              key={name}
              label={t(`fields.${name}`)}
              error={form.formState.errors[name]?.message}
            >
              <AdmissionInput
                {...form.register(name)}
                dir={
                  name === "phone" || name === "fullName"
                    ? "ltr"
                    : name === "fullNameAr"
                      ? "rtl"
                      : undefined
                }
                className={
                  name === "phone" || name === "fullName" ? "text-left" : ""
                }
                maxLength={
                  name === "address" ? 500 : name === "phone" ? 11 : 160
                }
                autoComplete={name === "phone" ? "tel" : "off"}
              />
            </Field>
          ),
        )}
        {publicForm && (
          <Field
            label={t("fields.nationalId")}
            error={form.formState.errors.nationalId?.message}
          >
            <AdmissionInput
              {...form.register("nationalId")}
              dir="ltr"
              className="text-left"
              inputMode="numeric"
              maxLength={14}
              autoComplete="off"
            />
          </Field>
        )}
        <Choice
          label={t("fields.studentType")}
          value={form.watch("studentType")}
          onChange={(value) =>
            form.setValue("studentType", value as "NEW" | "TRANSFER", {
              shouldValidate: true,
            })
          }
          options={["NEW", "TRANSFER"].map((value) => ({
            value,
            label: t(`types.${value}`),
          }))}
        />
        {transfer &&
          (
            ["previousInstitution", "previousFaculty", "transferNotes"] as const
          ).map((name) => (
            <Field
              key={name}
              label={t(`fields.${name}`)}
              error={form.formState.errors[name]?.message}
            >
              <AdmissionInput
                {...form.register(name)}
                maxLength={name === "transferNotes" ? 1000 : 160}
              />
            </Field>
          ))}
      </div>
      <div className="flex items-center justify-between pt-2">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span>{t("guardians")}</span>
        </h3>
        {guardians.fields.length < 3 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-squircle text-xs h-9"
            onClick={() =>
              guardians.append({ name: "", phone: "", relationship: "الأب" })
            }
          >
            <UserPlus className="h-3.5 w-3.5 text-primary" />
            <span>{t("addGuardian")}</span>
          </Button>
        )}
      </div>

      {guardians.fields.map((field, index) => {
        const currentRel = form.watch(`guardians.${index}.relationship`);
        const isStandard = STANDARD_RELATIONSHIPS.some(
          (r) => r.value === currentRel,
        );
        const isOther =
          (!isStandard && Boolean(currentRel)) || currentRel === "other";

        return (
          <fieldset
            className="rounded-2xl border border-border/70 bg-surface/30 p-4 space-y-3"
            key={field.id}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <legend className="px-1 text-xs font-bold text-primary tracking-wide">
                {t("guardian", { number: index + 1 })}
              </legend>
              {guardians.fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10 rounded-squircle"
                  onClick={() => guardians.remove(index)}
                  title={t("removeGuardian")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label={t("fields.name")}
                error={form.formState.errors.guardians?.[index]?.name?.message}
              >
                <AdmissionInput
                  {...form.register(`guardians.${index}.name`)}
                  maxLength={160}
                />
              </Field>

              <Field
                label={t("fields.phone")}
                error={form.formState.errors.guardians?.[index]?.phone?.message}
              >
                <AdmissionInput
                  {...form.register(`guardians.${index}.phone`)}
                  dir="ltr"
                  className="text-left"
                  maxLength={11}
                  placeholder="01XXXXXXXXX"
                />
              </Field>

              <div className="space-y-1.5">
                <Field
                  label={t("fields.relationship")}
                  error={
                    form.formState.errors.guardians?.[index]?.relationship
                      ?.message
                  }
                >
                  <Select
                    value={isStandard ? currentRel : "other"}
                    onValueChange={(val) => {
                      if (val === "other") {
                        form.setValue(`guardians.${index}.relationship`, "", {
                          shouldValidate: true,
                        });
                      } else {
                        form.setValue(`guardians.${index}.relationship`, val, {
                          shouldValidate: true,
                        });
                      }
                    }}
                  >
                    <SelectTrigger
                      className="h-10 rounded-squircle bg-card"
                      dir={locale === "ar" ? "rtl" : "ltr"}
                    >
                      <SelectValue placeholder={t("fields.relationship")} />
                    </SelectTrigger>
                    <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
                      {STANDARD_RELATIONSHIPS.map((rel) => (
                        <SelectItem key={rel.value} value={rel.value}>
                          {locale === "ar" ? rel.labelAr : rel.labelEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {isOther && (
                  <AdmissionInput
                    {...form.register(`guardians.${index}.relationship`)}
                    placeholder={
                      locale === "ar"
                        ? "حدد صلة القرابة..."
                        : "Specify relationship..."
                    }
                    className="h-9 text-xs mt-1"
                    maxLength={40}
                  />
                )}
              </div>
            </div>
          </fieldset>
        );
      })}
      {children}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end rtl:justify-start">
        <Button
          type="submit"
          disabled={disabled || form.formState.isSubmitting}
        >
          {form.formState.isSubmitting
            ? t("saving")
            : publicForm
              ? t("submit")
              : t("save")}
        </Button>
      </div>
    </form>
  );
}
