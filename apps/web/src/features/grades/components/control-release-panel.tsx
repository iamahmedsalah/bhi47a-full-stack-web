"use client";

import { useMemo, useState } from "react";
import {
  ClipboardCheck,
  Eye,
  Send,
  Undo2,
  History as HistoryIcon,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import api, { getApiErrorMessage } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HelpNote } from "@/components/ui/help-note";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DataTableShell,
  type ColumnDef,
} from "@/components/ui/data-table-shell";
import { TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { AcademicYearSelect, useAcademicYearOptions } from "@/components/ui/academic-year-select";
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
  releases: Array<{
    _id: string;
    createdAt: string;
    digest: string;
    pendingJobs?: number;
  }>;
  activeReleaseId: string | null;
  pendingJobs: number;
}

/** Publication stays on Grades. A visible preview is bound to the activation request. */
export function ControlReleasePanel({ locale }: { locale: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("controlRelease");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canPublish =
    user?.role === "admin" ||
    Boolean(user?.permissions?.includes("grades.publish"));
  const years = useAcademicYearOptions();
  const [selectedYear, setYear] = useState(searchParams.get("releaseYear") ?? "");
  const [selectedSemester, setSemester] = useState<Semester | undefined>(() => {
    const value = searchParams.get("releaseSemester");
    return value === "first" || value === "second" || value === "summer" ? value : undefined;
  });
  const year = selectedYear || years.data?.currentYear || "";
  const semester = selectedSemester ?? years.data?.currentSemester ?? "first";
  const [courseId, setCourseId] = useState(
    searchParams.get("releaseCourse") || "",
  );
  const [component, setComponent] = useState(() => {
    const value = searchParams.get("releaseComponent");
    return value === "midterm" || value === "coursework" ? value : "final";
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [resetReason, setResetReason] = useState("");
  const [resetError, setResetError] = useState("");
  const historyColumns = useMemo<ColumnDef<History["releases"][number]>[]>(
    () => [
      {
        key: "version",
        header: locale === "ar" ? "الإصدار" : "Release",
        render: (row) => (
          <TableCell className="p-2">
            <bdi className="font-mono text-xs">{row._id.slice(-8)}</bdi>
          </TableCell>
        ),
      },
      {
        key: "date",
        header: locale === "ar" ? "تاريخ إنشاء النسخة" : "Snapshot created",
        render: (row) => (
          <TableCell className="p-2 text-xs">
            {new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Africa/Cairo",
            }).format(new Date(row.createdAt))}
          </TableCell>
        ),
      },
      {
        key: "status",
        header: locale === "ar" ? "حالة النشر" : "Publication",
        render: (row) => (
          <TableCell className="p-2 text-xs">
            <span
              className={
                history?.activeReleaseId === row._id
                  ? "text-emerald-400"
                  : "text-muted-foreground"
              }
            >
              {history?.activeReleaseId === row._id
                ? t("active")
                : t("archived")}
            </span>
          </TableCell>
        ),
      },
      {
        key: "jobs",
        header: locale === "ar" ? "مهام متبقية" : "Pending jobs",
        render: (row) => (
          <TableCell className="p-2 font-mono text-xs">
            {row.pendingJobs ?? "—"}
          </TableCell>
        ),
      },
    ],
    [locale, history?.activeReleaseId, t],
  );
  const courses = useQuery({
    queryKey: ["release-courses", year, semester],
    queryFn: () => listControlCourses({ academicYear: year, semester }),
    enabled: canPublish && /^\d{4}-\d{4}$/.test(year),
    staleTime: 30_000,
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
      <h3 className="flex items-center gap-2 font-bold">
        <ClipboardCheck className="h-5 w-5 text-cyan-400" />
        {t("title")}
      </h3>
      <HelpNote
        title={
          locale === "ar"
            ? "كيف تعتمد وتنشر النتيجة؟"
            : "How approval and publication work"
        }
      >
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <ol className="grid gap-2 sm:grid-cols-3 text-xs leading-6">
          {(["reviewHelp", "publishHelp", "visibilityHelp"] as const).map(
            (key, index) => (
              <li
                key={key}
                className="rounded-xl border border-primary/20 bg-primary/5 p-3"
              >
                <span className="mb-1 flex items-center gap-2 font-bold text-primary">
                  {index === 0 ? (
                    <ClipboardCheck className="h-4 w-4" />
                  ) : index === 1 ? (
                    <Send className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  {t(`step${index + 1}`)}
                </span>
                {t(key)}
              </li>
            ),
          )}
        </ol>
      </HelpNote>
      <div className="grid items-end gap-2 sm:grid-cols-4 [&_input]:h-9 [&_button[aria-haspopup=listbox]]:h-9">
        <AcademicYearSelect
          label={t("year")}
          value={year}
          disabled={busy}
          onChange={(value) => {
            setYear(value);
            reset();
          }}
        />
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
      {user?.role === "admin" && course && (
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive"
          disabled={busy}
          onClick={() => {
            setResetCode("");
            setResetReason("");
            setResetError("");
            setResetOpen(true);
          }}
        >
          {locale === "ar"
            ? `تصفير كنترول المقرر ${course.code}`
            : `Reset Control for course ${course.code}`}
        </Button>
      )}
      <Dialog
        open={resetOpen}
        onOpenChange={(value) => {
          if (!busy) setResetOpen(value);
        }}
      >
        <DialogContent
          dir={locale === "ar" ? "rtl" : "ltr"}
          className="max-w-md"
        >
          <DialogHeader>
            <DialogTitle>
              {locale === "ar"
                ? "تصفير بيانات الكنترول للمقرر"
                : "Reset course Control data"}
            </DialogTitle>
            <DialogDescription>
              <bdi>
                {course?.code} · {year}
              </bdi>{" "}
              · {t(semester)}.
              {locale === "ar"
                ? " يمسح درجات المكونات الثلاثة ويسحب نشرها ويعيد الكشوف للمسودة وتوزيع الدرجات والسياسة للوضع الافتراضي لهذا العام والفصل فقط. يبقى المقرر وتسجيل الطلاب والكويزات وسجل التدقيق والإصدارات السابقة محفوظًا. ستُعاد تسوية الآثار الأكاديمية في الخلفية."
                : " Clears all three component marks, withdraws publication, returns sheets to draft and restores default grading scheme/policy for this year and term only. The course, enrolments, instructor quizzes, audit and old snapshots remain saved. Academic effects are reconciled in the background."}
            </DialogDescription>
          </DialogHeader>
          <Label className="space-y-1">
            {locale === "ar"
              ? "اكتب كود المقرر للتأكيد"
              : "Type the course code to confirm"}
            <Input
              dir="ltr"
              value={resetCode}
              onChange={(event) => setResetCode(event.target.value)}
              disabled={busy}
            />
          </Label>
          <Label className="space-y-1">
            {locale === "ar" ? "سبب التصفير" : "Reset reason"}
            <Input
              value={resetReason}
              onChange={(event) => setResetReason(event.target.value)}
              maxLength={500}
              disabled={busy}
            />
          </Label>
          {resetError && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {resetError}
            </p>
          )}
          <DialogFooter className="rtl:sm:justify-start">
            <Button
              disabled={
                busy ||
                !course ||
                resetCode.trim().toUpperCase() !== course.code.toUpperCase() ||
                !resetReason.trim()
              }
              className="bg-destructive text-destructive-foreground"
              onClick={() =>
                void run(async () => {
                  setResetError("");
                  try {
                    await api.post("/admin/grades/control-course/reset", {
                      courseCode: course!.code,
                      academicYear: year,
                      semester,
                      confirmation: resetCode,
                      reason: resetReason,
                    });
                  } catch (error) {
                    setResetError(getApiErrorMessage(error));
                    throw error;
                  }
                  setResetOpen(false);
                  reset();
                  for (const key of [
                    "release-courses",
                    "control",
                    "admin-grades",
                    "student-results",
                    "student-profile",
                  ])
                    void queryClient.invalidateQueries({ queryKey: [key] });
                  toast.success(
                    locale === "ar"
                      ? "تم تصفير الكنترول للمقرر والفصل المحددين"
                      : "Control reset for the selected course and term",
                  );
                })
              }
            >
              {locale === "ar" ? "تأكيد التصفير" : "Confirm reset"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setResetOpen(false)}
            >
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {course && (
        <div
          className="grid gap-2 sm:grid-cols-3"
          aria-label={
            locale === "ar"
              ? "حالة اعتماد ونشر المكونات"
              : "Component approval and publication"
          }
        >
          {course.components.map((item) => (
            <Button
              key={item.key}
              variant={component === item.key ? "default" : "outline"}
              className="h-auto min-h-10 justify-start whitespace-normal px-3 py-2 text-start text-xs"
              disabled={busy}
              onClick={() => {
                setComponent(item.key);
                reset();
              }}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${item.releaseActive ? "bg-emerald-400" : item.workflowState === "APPROVED" ? "bg-sky-400" : "bg-rose-400"}`}
                aria-hidden="true"
              />
              <span>
                {t(item.key)} ·{" "}
                {item.releaseActive
                  ? locale === "ar"
                    ? "منشور"
                    : "Published"
                  : item.workflowState === "APPROVED"
                    ? locale === "ar"
                      ? "معتمد، لم يُنشر"
                      : "Approved, unpublished"
                    : locale === "ar"
                      ? "بانتظار الاعتماد"
                      : "Awaiting approval"}
              </span>
            </Button>
          ))}
        </div>
      )}
      {component !== "final" && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-6">
          {locale === "ar"
            ? "أنت تنشر هذا المكوّن فقط. لإظهار النهائي والمجموع والتقدير الرسمي، اختر «النهائي ونتيجة المقرر» ثم عاين وانشر نسخته المعتمدة."
            : "You are publishing only this component. To show the final mark, official total and course grade, select Final and course result, then preview and publish its approved release."}
        </p>
      )}
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
          <Eye className="h-4 w-4" />
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
                queryKey: ["release-courses"],
              });
              void queryClient.invalidateQueries({ queryKey: ["control", "dashboard"] });
              void queryClient.invalidateQueries({
                queryKey: ["student-results"],
              });
              void queryClient.invalidateQueries({
                queryKey: ["admin-grades"],
              });
            })
          }
        >
          {t("activate")}
          <Send className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          disabled={!canPublish || (!sheetId && courseId !== "all") || busy}
          onClick={() => setConfirmWithdrawal(true)}
        >
          {t("withdraw")}
          <Undo2 className="h-4 w-4" />
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
            <ShieldCheck className="h-4 w-4" />
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
            <HistoryIcon className="h-4 w-4" />
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
            <BookOpen className="h-4 w-4" />
          </Button>
        )}
      </div>
      <HelpNote
        title={
          locale === "ar"
            ? "إرشادات التصحيح والسحب ومهلة الاتصال"
            : "Correction, withdrawal and timeout guidance"
        }
      >
        <p className="text-xs leading-6 text-muted-foreground">
          {t("actionHelp")}
        </p>
        <p className="text-xs leading-6 text-muted-foreground">
          {locale === "ar"
            ? "إذا انتهى طلب النشر بمهلة اتصال (504)، حدّث سجل الإصدارات أولًا للتحقق من النسخة المفعّلة؛ قد يكون الحفظ اكتمل رغم انقطاع الرد. لا تسحب النسخة لمجرد ظهور المهام المنتظرة."
            : "If publication times out (504), refresh release history first to check the active snapshot: the commit may have succeeded before the response was lost. Pending jobs alone do not require withdrawal."}
        </p>
      </HelpNote>
      <ConfirmDialog
        dir={locale === "ar" ? "rtl" : "ltr"}
        open={confirmWithdrawal}
        onOpenChange={setConfirmWithdrawal}
        title={t("withdraw")}
        description={t("withdrawHelp")}
        confirmLabel={t("confirmWithdraw")}
        cancelLabel={locale === "ar" ? "إلغاء" : "Cancel"}
        disabled={busy}
        onConfirm={() =>
          run(async () => {
            await publishGradesBulk({ ...scope, isPublished: false });
            setPreview(null);
            setConfirmWithdrawal(false);
            toast.success(t("withdrawn"));
            void queryClient.invalidateQueries({ queryKey: ["admin-grades"] });
            void queryClient.invalidateQueries({ queryKey: ["control", "dashboard"] });
          })
        }
      />
      {history && (
        <div className="rounded-xl border p-3 text-sm space-y-2">
          <HelpNote
            title={
              locale === "ar"
                ? "كيف تقرأ سجل الإصدارات والمهام؟"
                : "How to read releases and pending jobs"
            }
          >
            <p className="text-xs leading-6 text-muted-foreground">
              {locale === "ar"
                ? "هذا سجل آخر 50 نسخة منشورة للمكوّن المحدد. «مفعّل» هي النسخة التي يقرأها الطالب عند السماح بعرضها. المهام المتبقية لتحديث السجل الأكاديمي وإرسال الإشعارات؛ لا يلزم سحب النسخة لتعديل الدرجات: أعد فتح كشف الكنترول، صحّح واعتمد ثم انشر نسخة بديلة، وتبقى السابقة ظاهرة حتى تفعيل البديل."
                : "This lists the latest 50 published snapshots for the selected component. Active is the snapshot students read when viewing is allowed. Pending jobs update academic records and notifications. To correct marks, reopen Control, edit, approve and publish a replacement; the previous snapshot stays visible until replacement. Withdrawal is not required for corrections."}
            </p>
          </HelpNote>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const response = await api.get<History>(
                  `/admin/grades/control-release-history/${sheetId}`,
                );
                setHistory(response.data);
              })
            }
          >
            {locale === "ar"
              ? "تحديث سجل النشر والمهام"
              : "Refresh releases and jobs"}
          </Button>
          <p>{t("pendingJobs", { count: history.pendingJobs })}</p>
          {history.pendingJobs > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-6 text-muted-foreground">
              <HistoryIcon className="h-4 w-4 shrink-0 text-amber-400" />
              {locale === "ar"
                ? "هذه مهام تسوية السجل الأكاديمي والإشعارات. ظهور الميدترم للطالب يعتمد على الإصدار المفعّل وإعدادات الإتاحة أعلاه، ولا يتطلب اكتمال درجات النهائي."
                : "These jobs reconcile academic records and notifications. Midterm viewing depends on an active release and visibility settings above; it does not require final marks."}
            </p>
          )}
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
          <DataTableShell
            columns={historyColumns}
            data={history.releases}
            keyExtractor={(row) => row._id}
            emptyMessage={
              locale === "ar"
                ? "لا توجد نسخ منشورة لهذا المكوّن بعد"
                : "No published snapshots for this component yet"
            }
          />
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
            value="best"
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
              <SelectItem value="best">{t("best")}</SelectItem>
            </SelectContent>
          </Select>
          <HelpNote
            className="sm:col-span-3"
            title={
              locale === "ar" ? "حدود سياسة النتيجة" : "Result policy rules"
            }
          >
            {t("policyNote")}
          </HelpNote>
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
