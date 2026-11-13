"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import api, { getApiErrorMessage } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listControlCourses } from "@/features/control/api";
import { publishGradesBulk } from "../api";
import type { Semester } from "@student-portal/shared";

interface Preview {
  sheets: Array<{
    sheetId: string;
    courseCode: string;
    component: string;
    students: number;
    activeReleaseId: string | null;
  }>;
  releaseDigests: Record<string, string>;
}
interface Policy {
  version: number;
  rules: {
    passPercentage: number;
    finalMinimumPercentage: number;
    retake: "latest" | "best";
  };
}
interface History {
  releases: Array<{ _id: string; createdAt: string; digest: string }>;
  activeReleaseId: string | null;
  pendingJobs: number;
}

/** Publication stays on Grades. A visible preview is bound to the activation request. */
export function ControlReleasePanel({ locale }: { locale: string }) {
  const router = useRouter();
  const t = useTranslations("controlRelease");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canPublish =
    user?.role === "admin" ||
    Boolean(user?.permissions?.includes("grades.publish"));
  const [year, setYear] = useState("2026-2027");
  const [semester, setSemester] = useState<Semester>("first");
  const [courseId, setCourseId] = useState("");
  const [component, setComponent] = useState("midterm");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const courses = useQuery({
    queryKey: ["release-courses", year, semester],
    queryFn: () => listControlCourses({ academicYear: year, semester }),
    enabled: canPublish && /^\d{4}-\d{4}$/.test(year),
  });
  const course = courses.data?.items.find((c) => c.courseId === courseId);
  const selectedComp = course?.components.find((c) => c.key === component);
  const sheetId = selectedComp?.sheetId;
  const sheetSlug = selectedComp?.slug || sheetId;
  const scope = {
    academicYear: year,
    semester,
    courseCode: course?.code,
    examType: component,
  };
  const reset = () => {
    setPreview(null);
    setPolicy(null);
    setHistory(null);
    setError("");
  };
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (!canPublish) return null;
  return (
    <section
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="rounded-2xl border border-border bg-card p-5 space-y-4"
    >
      <h3 className="font-bold">{t("title")}</h3>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Label>
          {t("year")}
          <Input
            aria-label={t("year")}
            dir="ltr"
            value={year}
            disabled={busy}
            onChange={(e) => {
              setYear(e.target.value);
              reset();
            }}
          />
        </Label>
        <Select
          value={semester}
          disabled={busy}
          onValueChange={(v) => {
            setSemester(v as Semester);
            reset();
          }}
        >
          <SelectTrigger aria-label={t("term")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
            {["first", "second", "summer"].map((v) => (
              <SelectItem key={v} value={v}>
                {t(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={courseId}
          disabled={busy}
          onValueChange={(v) => {
            setCourseId(v);
            reset();
          }}
        >
          <SelectTrigger aria-label={t("course")}>
            <SelectValue placeholder={t("course")} />
          </SelectTrigger>
          <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
            <SelectItem value="all">
              {locale === "ar"
                ? "كل المقررات في العام والفصل المحددين"
                : "All courses in this year and term"}
            </SelectItem>
            {courses.data?.items.map((c) => (
              <SelectItem key={c.courseId} value={c.courseId}>
                {c.code} —{" "}
                {locale === "ar" ? c.nameAr || c.name : c.nameEn || c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={component}
          disabled={busy}
          onValueChange={(v) => {
            setComponent(v);
            reset();
          }}
        >
          <SelectTrigger aria-label={t("component")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
            {["midterm", "coursework", "final"].map((v) => (
              <SelectItem key={v} value={v}>
                {t(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {courses.error && <p role="alert">{getApiErrorMessage(courses.error)}</p>}
      {course && !sheetId && <p className="text-sm">{t("openFirst")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!canPublish || (!sheetId && courseId !== "all") || busy}
          onClick={() =>
            void run(async () => {
              const res = await api.post<Preview>(
                "/admin/grades/release-preview",
                { ...scope, isPublished: true },
              );
              setPreview(res.data);
            })
          }
        >
          {t("preview")}
        </Button>
        <Button
          variant="outline"
          disabled={!canPublish || !preview?.sheets.length || busy}
          onClick={() =>
            void run(async () => {
              await publishGradesBulk({
                ...scope,
                isPublished: true,
                releaseDigests: preview!.releaseDigests,
              });
              setPreview(null);
              toast.success(t("activated"));
              void queryClient.invalidateQueries({
                queryKey: ["admin-grades"],
              });
            })
          }
        >
          {t("activate")}
        </Button>
        <Button
          variant="outline"
          disabled={!canPublish || (!sheetId && courseId !== "all") || busy}
          onClick={() =>
            void run(async () => {
              await publishGradesBulk({ ...scope, isPublished: false });
              setPreview(null);
              toast.success(t("withdrawn"));
              void queryClient.invalidateQueries({
                queryKey: ["admin-grades"],
              });
            })
          }
        >
          {t("withdraw")}
        </Button>
        {user?.role === "admin" && (
          <Button
            variant="outline"
            disabled={!sheetId || busy}
            onClick={() =>
              void run(async () => {
                const res = await api.get<Policy>(
                  `/admin/grades/control-policy/${sheetId}`,
                );
                setPolicy(res.data);
              })
            }
          >
            {t("policy")}
          </Button>
        )}
        {sheetId && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const res = await api.get<History>(
                  `/admin/grades/control-release-history/${sheetId}`,
                );
                setHistory(res.data);
              })
            }
          >
            {t("history")}
          </Button>
        )}
        {sheetId && (
          <Button
            variant="outline"
            onClick={() => {
              router.push(`/${locale}/admin/control/${sheetSlug}`);
            }}
          >
            {t("openSheet")}
          </Button>
        )}
      </div>
      {history && (
        <div className="rounded-xl border p-3 text-sm space-y-2">
          <p>{t("pendingJobs", { count: history.pendingJobs })}</p>
          {history.pendingJobs > 0 && user?.role === "admin" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.post("/admin/grades/control-jobs/retry");
                  const res = await api.get<History>(
                    `/admin/grades/control-release-history/${sheetId}`,
                  );
                  setHistory(res.data);
                })
              }
            >
              {t("retryJobs")}
            </Button>
          )}
          {history.releases.map((r) => (
            <p key={r._id}>
              <bdi>{r._id.slice(-8)}</bdi> ·{" "}
              {new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Africa/Cairo",
              }).format(new Date(r.createdAt))}{" "}
              ·{" "}
              {history.activeReleaseId === r._id ? t("active") : t("archived")}
            </p>
          ))}
        </div>
      )}
      {preview && (
        <div role="status" className="rounded-xl border p-3 text-sm space-y-1">
          {preview.sheets.map((s) => (
            <p key={s.sheetId}>
              <bdi>{s.courseCode}</bdi> · {t(s.component)} ·{" "}
              {t("students", { count: s.students })} ·{" "}
              {s.activeReleaseId ? t("replacement") : t("newRelease")}
            </p>
          ))}
          <p>{t("windowNote")}</p>
        </div>
      )}
      {policy && (
        <div className="rounded-xl border p-3 grid gap-3 sm:grid-cols-3">
          <Label>
            {t("pass")}
            <Input
              type="number"
              min={0}
              max={100}
              value={policy.rules.passPercentage}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  rules: {
                    ...policy.rules,
                    passPercentage: Number(e.target.value),
                  },
                })
              }
            />
          </Label>
          <Label>
            {t("finalMinimum")}
            <Input
              type="number"
              min={0}
              max={100}
              value={policy.rules.finalMinimumPercentage}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  rules: {
                    ...policy.rules,
                    finalMinimumPercentage: Number(e.target.value),
                  },
                })
              }
            />
          </Label>
          <Select
            value={policy.rules.retake}
            onValueChange={(v) =>
              setPolicy({
                ...policy,
                rules: { ...policy.rules, retake: v as "latest" | "best" },
              })
            }
          >
            <SelectTrigger aria-label={t("retake")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir={locale === "ar" ? "rtl" : "ltr"}>
              <SelectItem value="latest">{t("latest")}</SelectItem>
              <SelectItem value="best">{t("best")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm sm:col-span-3">{t("policyNote")}</p>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const res = await api.patch<Policy>(
                  `/admin/grades/control-policy/${sheetId}`,
                  { ...policy.rules, version: policy.version },
                );
                setPolicy(res.data);
                setPreview(null);
                toast.success(t("saved"));
              })
            }
          >
            {t("savePolicy")}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
