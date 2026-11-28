"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getAdmissionErrorMessage } from "./admission-error";
import { AcademicYearChoice } from "./academic-year-choice";
import {
  getProvisionalPolicy,
  updateProvisionalPolicy,
  type ProvisionalPolicy,
} from "./workflow-api";
import { Choice, useAdmissionUI } from "./workflow-ui";

export function ProvisionalPolicyPanel() {
  const { t } = useAdmissionUI();
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("first");
  const policy = useQuery({
    queryKey: ["admission-provisional-policy", academicYear, semester],
    queryFn: () => getProvisionalPolicy(academicYear, semester),
    enabled: Boolean(academicYear),
  });
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="text-lg font-semibold">{t("lifecycle.policy")}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <AcademicYearChoice value={academicYear} onChange={setAcademicYear} />
        <Choice
          label={t("fields.semester")}
          value={semester}
          onChange={setSemester}
          options={[
            { value: "first", label: t("semesterNumber", { number: "1" }) },
            { value: "second", label: t("semesterNumber", { number: "2" }) },
          ]}
        />
      </div>
      {policy.isLoading && <p role="status">{t("loading")}</p>}
      {policy.isError && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void policy.refetch()}
        >
          {t("retry")}
        </Button>
      )}
      {policy.data && (
        <PolicyForm
          key={`${academicYear}:${semester}:${JSON.stringify(policy.data)}`}
          initial={policy.data}
          academicYear={academicYear}
          semester={semester}
        />
      )}
    </section>
  );
}

function PolicyForm({
  initial,
  academicYear,
  semester,
}: {
  initial: ProvisionalPolicy;
  academicYear: string;
  semester: string;
}) {
  const { t } = useAdmissionUI();
  const client = useQueryClient();
  const [settings, setSettings] = useState(initial);
  const [pending, setPending] = useState(false);
  const fields = ["midterm", "coursework", "quiz", "finalExam"] as const;
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        try {
          await updateProvisionalPolicy({
            academicYear,
            semester,
            ...settings,
          });
          await client.invalidateQueries({
            queryKey: ["admission-provisional-policy", academicYear, semester],
          });
          toast.success(t("lifecycle.policySaved"));
        } catch (error) {
          toast.error(getAdmissionErrorMessage(error, t));
        } finally {
          setPending(false);
        }
      }}
    >
      {fields.map((field) => (
        <label className="flex items-center gap-2 text-sm" key={field}>
          <Checkbox
            checked={settings[field]}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, [field]: checked === true })
            }
            disabled={pending}
          />
          {t(`lifecycle.${field}`)}
        </label>
      ))}
      <Button
        type="submit"
        disabled={
          pending || fields.every((field) => settings[field] === initial[field])
        }
      >
        <Check className="size-4" />
        {t("lifecycle.savePolicy")}
      </Button>
    </form>
  );
}
