"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PERMISSIONS } from "@student-portal/shared";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import api from "@/lib/api";
import { getAdmissionErrorMessage } from "./admission-error";
import { AdmissionInput, Choice, Field, useAdmissionUI } from "./workflow-ui";

export function LegacyEnrollmentPanel() {
  const { t, locale } = useAdmissionUI();
  const client = useQueryClient();
  const [studentCode, setStudentCode] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [enrollmentEffectiveDate, setDate] = useState("");
  const [admissionType, setAdmissionType] = useState("UNKNOWN");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const canSave = Boolean(
    confirmed &&
    studentCode.trim() &&
    evidenceReference.trim() &&
    enrollmentEffectiveDate &&
    !pending,
  );
  return (
    <form
      className="max-w-2xl space-y-4 rounded-xl border bg-card p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSave) return;
        setPending(true);
        try {
          await api.post("/admin/admissions/legacy-enrollment", {
            studentCode,
            evidenceReference,
            enrollmentEffectiveDate,
            confirmed,
            admissionType:
              admissionType === "UNKNOWN" ? undefined : admissionType,
          });
          setConfirmed(false);
          setStudentCode("");
          setEvidenceReference("");
          await client.invalidateQueries({
            queryKey: ["admission-enrollment-summary"],
          });
          toast.success(t("lifecycle.enrolled"));
        } catch (error) {
          toast.error(getAdmissionErrorMessage(error, t));
        } finally {
          setPending(false);
        }
      }}
    >
      <h2 className="text-lg font-semibold">{t("lifecycle.verifyLegacy")}</h2>
      <Field label={t("studentCode")}>
        <AdmissionInput
          value={studentCode}
          onChange={(event) => setStudentCode(event.currentTarget.value)}
          dir="ltr"
          maxLength={64}
        />
      </Field>
      <Field label={t("lifecycle.reference")}>
        <AdmissionInput
          value={evidenceReference}
          onChange={(event) => setEvidenceReference(event.currentTarget.value)}
          maxLength={160}
        />
      </Field>
      <Field label={t("lifecycle.effectiveDate")}>
        <DatePicker
          locale={locale}
          value={enrollmentEffectiveDate}
          onChange={setDate}
          placeholder={t("lifecycle.effectiveDate")}
        />
      </Field>
      <Choice
        label={t("fields.studentType")}
        value={admissionType}
        onChange={setAdmissionType}
        options={[
          { value: "UNKNOWN", label: t("lifecycle.unknownType") },
          { value: "COORDINATION", label: t("lifecycle.coordination") },
          { value: "TRANSFER", label: t("lifecycle.transfer") },
        ]}
      />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={confirmed}
          onCheckedChange={(checked) => setConfirmed(checked === true)}
        />
        {t("lifecycle.confirm")}
      </label>
      <Button type="submit" disabled={!canSave}>
        {t("lifecycle.action.CONFIRM_ENROLLMENT")}
      </Button>
    </form>
  );
}

interface Followup {
  _id: string;
  studentCode?: string;
  fullName?: string;
  phone?: string;
}

export function AdmissionFollowupsPanel({
  kind,
}: {
  kind: "contact" | "settlement";
}) {
  const { t, can, userId } = useAdmissionUI();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string>();
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const key = ["admission-followups", kind, userId];
  const query = useQuery({
    queryKey: [...key, page],
    queryFn: async () =>
      (
        await api.get<{ items: Followup[]; total: number }>(
          `/admin/admissions/followups/${kind}`,
          { params: { page, limit: 20 } },
        )
      ).data,
  });
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="text-lg font-semibold">{t(`lifecycle.${kind}`)}</h2>
      {query.isLoading && <p role="status">{t("loading")}</p>}
      {query.isError && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void query.refetch()}
        >
          {t("retry")}
        </Button>
      )}
      {query.data?.items.length === 0 && <p>{t("lifecycle.noFollowups")}</p>}
      {query.data?.items.map((item) => (
        <article key={item._id} className="space-y-2 rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-3">
            <bdi>{item.studentCode}</bdi>
            {item.fullName && <span>{item.fullName}</span>}
            {item.phone && <bdi>{item.phone}</bdi>}
            {(kind === "contact" || can(PERMISSIONS.TUITION_WRITE)) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setReference("");
                  setSelected(item._id);
                }}
              >
                {t("lifecycle.completeFollowup")}
              </Button>
            )}
          </div>
          {selected === item._id && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (pending || !reference.trim()) return;
                setPending(true);
                try {
                  await api.patch(
                    `/admin/admissions/followups/${kind}/${item._id}`,
                    { reference },
                  );
                  setSelected(undefined);
                  await client.invalidateQueries({ queryKey: key });
                  toast.success(t("lifecycle.followupCompleted"));
                } catch (error) {
                  toast.error(getAdmissionErrorMessage(error, t));
                } finally {
                  setPending(false);
                }
              }}
            >
              <Field label={t("lifecycle.followupReference")}>
                <AdmissionInput
                  value={reference}
                  onChange={(event) => setReference(event.currentTarget.value)}
                  maxLength={160}
                />
              </Field>
              <Button
                type="submit"
                disabled={pending || reference.trim().length < 2}
              >
                {t("lifecycle.completeFollowup")}
              </Button>
            </form>
          )}
        </article>
      ))}
      {(page > 1 || (query.data?.total ?? 0) > 20) && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            {t("lifecycle.previous")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={page * 20 >= (query.data?.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            {t("lifecycle.next")}
          </Button>
        </div>
      )}
    </section>
  );
}
