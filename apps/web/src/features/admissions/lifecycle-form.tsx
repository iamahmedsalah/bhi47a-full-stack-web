"use client";

import { useRef, useState } from "react";
import { PERMISSIONS, type AdmissionRequestItem } from "@student-portal/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getAdmissionErrorMessage } from "./admission-error";
import { admissionAction, uploadAdmissionDecision } from "./workflow-api";
import { AdmissionInput, Field, useAdmissionUI } from "./workflow-ui";

export interface EvidenceInput {
  reference: string;
  decisionDate: string;
  file?: File;
}

export function MinistryEvidenceFields({
  value,
  onChange,
}: {
  value: EvidenceInput;
  onChange: (value: EvidenceInput) => void;
}) {
  const { t, locale } = useAdmissionUI();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("lifecycle.reference")}>
        <AdmissionInput
          value={value.reference}
          onChange={(event) =>
            onChange({ ...value, reference: event.currentTarget.value })
          }
          maxLength={160}
        />
      </Field>
      <Field label={t("lifecycle.decisionDate")}>
        <DatePicker
          value={value.decisionDate}
          onChange={(decisionDate) => onChange({ ...value, decisionDate })}
          locale={locale}
          placeholder={t("lifecycle.decisionDate")}
        />
      </Field>
      <Field label={t("lifecycle.document")}>
        <AdmissionInput
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) =>
            onChange({ ...value, file: event.currentTarget.files?.[0] })
          }
        />
      </Field>
    </div>
  );
}

export function AdmissionLifecycleForm({
  item,
  action,
  onSaved,
}: {
  item: AdmissionRequestItem;
  action: string;
  onSaved: () => Promise<void>;
}) {
  const { t, can, locale } = useAdmissionUI();
  const [evidence, setEvidence] = useState<EvidenceInput>({
    reference: "",
    decisionDate: "",
  });
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef<string | null>(null);
  const uploaded = useRef<{ file: File; documentId: string } | null>(null);
  const correction = action === "request-correction";
  const confirms = action === "CONFIRM_ENROLLMENT";
  const needsDocument = !correction && !confirms;
  const showEffective =
    confirms ||
    (Boolean(item.studentId) &&
      action !== "REJECT_MINISTRY" &&
      !correction &&
      can(PERMISSIONS.ADMISSIONS_ENROLLMENT_CONFIRM));
  const disabled =
    pending ||
    !confirmed ||
    (confirms && !effectiveDate) ||
    ((correction || action === "CORRECT_MINISTRY") && !reason.trim()) ||
    (needsDocument &&
      (!evidence.file ||
        evidence.reference.trim().length < 2 ||
        !evidence.decisionDate));
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled) return;
        setPending(true);
        setError("");
        try {
          if (correction)
            await admissionAction(item._id, "request-correction", {
              revision: item.revision,
              confirmed: true,
              reason,
            });
          else {
            if (
              needsDocument &&
              evidence.file &&
              uploaded.current?.file !== evidence.file
            ) {
              const result = await uploadAdmissionDecision(
                item._id,
                evidence.file,
              );
              uploaded.current = {
                file: evidence.file,
                documentId: result.documentId,
              };
            }
            operation.current ??= crypto.randomUUID();
            await admissionAction(item._id, "transition", {
              transition: action,
              revision: item.revision,
              confirmed: true,
              operationId: operation.current,
              reason: reason.trim() || undefined,
              enrollmentEffectiveDate: effectiveDate || undefined,
              ministryEvidence:
                needsDocument && uploaded.current
                  ? {
                      reference: evidence.reference,
                      decisionDate: evidence.decisionDate,
                      documentId: uploaded.current.documentId,
                    }
                  : undefined,
            });
          }
          await onSaved();
        } catch (error) {
          setError(getAdmissionErrorMessage(error, t));
        } finally {
          setPending(false);
        }
      }}
    >
      <p className="rounded-xl border p-3 text-sm">
        {t(`lifecycle.impact.${action}`)}
      </p>
      {needsDocument && (
        <MinistryEvidenceFields value={evidence} onChange={setEvidence} />
      )}
      {showEffective && (
        <Field label={t("lifecycle.effectiveDate")}>
          <DatePicker
            value={effectiveDate}
            onChange={setEffectiveDate}
            locale={locale}
            placeholder={t("lifecycle.effectiveDate")}
          />
        </Field>
      )}
      <Field
        label={t(correction ? "lifecycle.instructions" : "lifecycle.reason")}
      >
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          maxLength={1000}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={confirmed}
          onCheckedChange={(value) => setConfirmed(value === true)}
        />
        {t("lifecycle.confirm")}
      </label>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={disabled}>
          {t(`lifecycle.action.${action}`)}
        </Button>
      </DialogFooter>
    </form>
  );
}
