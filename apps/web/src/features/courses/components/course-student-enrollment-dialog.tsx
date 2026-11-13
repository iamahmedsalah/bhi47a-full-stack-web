"use client";

import { useId, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  UploadCloud,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { readEnrollmentSheet } from "../enrollment-sheet";
import {
  courseCurriculumSummary,
  curriculumDepartmentLabel,
  getCourseCurricula,
  type CourseCurriculum,
  type CourseEnrollmentResult,
  type Semester,
} from "@student-portal/shared";
import api, { getApiErrorMessage, type PaginatedResponse } from "@/lib/api";
import { downloadFileBlob, EXCEL_MIME_TYPE } from "@/lib/export-utils";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataUploadProgress } from "@/components/ui/data-upload-progress";
import type { BatchUploadProgressState } from "@/features/uploads/use-batch-upload";
import {
  enrollmentResultStatus,
  localizeEnrollmentError,
  matchesEnrollmentCourse,
  mergeEnrollmentResults,
} from "../enrollment-utils";
import { EnrollmentSelect } from "./enrollment-select";

interface EnrollmentCourse {
  _id: string;
  code: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  level?: string;
  academicLevel?: string;
  semester?: string;
  department?: string;
  curricula?: CourseCurriculum[];
}
export interface CourseStudentEnrollmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses?: EnrollmentCourse[];
  selectedCourseId?: string | null;
  locale: string;
  onSuccess?: () => void;
}
const initialProgress: BatchUploadProgressState = {
  isUploading: false,
  phase: "idle",
  percentage: 0,
  currentBatch: 1,
  totalBatches: 1,
  processedRows: 0,
  totalRows: 0,
  elapsedSeconds: 0,
  estimatedSecondsLeft: null,
  rowsPerSecond: 0,
  isNetworkInterrupted: false,
  retrySecondsLeft: 0,
};

const EMPTY_ENROLLMENT_COURSES: EnrollmentCourse[] = [];

export function CourseStudentEnrollmentDialog({
  open,
  onOpenChange,
  courses: initialCourses = EMPTY_ENROLLMENT_COURSES,
  selectedCourseId,
  locale,
  onSuccess,
}: CourseStudentEnrollmentDialogProps) {
  const isAr = locale === "ar";
  const text = (ar: string, en: string) => (isAr ? ar : en);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fileInputId = useId();
  const [initialized, setInitialized] = useState("");
  const [courseId, setCourseId] = useState("");
  const [academicYear, setAcademicYear] = useState("2026-2027");
  const [semester, setSemester] = useState<Semester>("first");
  const [level, setLevel] = useState("all");
  const [department, setDepartment] = useState("all");
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [result, setResult] = useState<CourseEnrollmentResult | null>(null);
  const [progress, setProgress] = useState(initialProgress);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmOverride, setConfirmOverride] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const coursesQuery = useQuery({
    queryKey: ["admin-all-courses-for-enrollment"],
    enabled: open,
    queryFn: async () => {
      const items: EnrollmentCourse[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await api.get<PaginatedResponse<EnrollmentCourse>>(
          "/admin/courses",
          { params: { page, limit: 100 } },
        );
        items.push(...response.data.items);
        totalPages = response.data.totalPages;
        page++;
      } while (page <= totalPages);
      return items;
    },
    staleTime: 60_000,
  });
  const courses = coursesQuery.data ?? initialCourses;
  const selected = courses.find((course) => course._id === courseId);
  const filtered = courses.filter(
    (course) =>
      matchesEnrollmentCourse(course, { level, department, semester }) &&
      `${course.code} ${course.name} ${course.nameAr ?? ""} ${course.nameEn ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const validCourse = Boolean(
    selected &&
    matchesEnrollmentCourse(selected, { level, department, semester }),
  );
  const countQuery = useQuery({
    queryKey: ["course-enrollments-count", courseId, academicYear, semester],
    enabled: open && validCourse,
    queryFn: async () =>
      (
        await api.get<{ enrolledCount: number }>(
          `/admin/courses/${courseId}/enrollments/count`,
          { params: { academicYear, semester } },
        )
      ).data,
  });
  const [previousCourseInputs, setpreviousCourseInputs] = useState<unknown[] | null>(null);
  if (!previousCourseInputs || previousCourseInputs.some((value,i) => !Object.is(value, [open, selectedCourseId, courses][i]))) {
    setpreviousCourseInputs([open, selectedCourseId, courses]);
    (() => {
    if (!open) {
      setInitialized("");
      setFile(null);
      setResult(null);
      setOverride(false);
      setReason("");
      setProgress(initialProgress);
      return;
    }
    if (
      selectedCourseId &&
      courses.length &&
      initialized !== selectedCourseId
    ) {
      const course = courses.find((item) => item._id === selectedCourseId);
      if (course) {
        setInitialized(selectedCourseId);
        setDepartment("all");
        setSearch("");
        setCourseId(course._id);
        setLevel(course.academicLevel ?? course.level ?? "all");
        const terms = [
          ...new Set(getCourseCurricula(course).map((item) => item.semester)),
        ];
        if (terms.length === 1) setSemester(terms[0]);
      }
    }
    // Initialize only when opening or when the requested course becomes available.

    })();
  }

  function changeFilter(change: () => void) {
    change();
    setCourseId("");
    setResult(null);
  }
  function chooseFile(next?: File) {
    if (!next) return;
    if (!/\.(xlsx|xls|csv)$/i.test(next.name) || next.size > 10 * 1024 * 1024) {
      toast.error(
        text(
          "اختر ملف Excel أو CSV بحجم لا يتجاوز 10 ميجابايت.",
          "Choose an Excel or CSV file up to 10MB.",
        ),
      );
      return;
    }
    setFile(next);
    setResult(null);
    setProgress(initialProgress);
  }
  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
    event.target.value = "";
  }
  async function downloadTemplate() {
    setTemplateLoading(true);
    try {
      const blob = await api.get("/admin/courses/enrollment-template", {
        params: { format: "xlsx" },
        responseType: "blob",
      });
      await downloadFileBlob(
        blob,
        "course-students-enrollment-template.xlsx",
        EXCEL_MIME_TYPE,
      );
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          text("تعذر تنزيل النموذج.", "Could not download the template."),
        ),
      );
    } finally {
      setTemplateLoading(false);
    }
  }
  function notify(summary: CourseEnrollmentResult) {
    const status = enrollmentResultStatus(summary);
    if (status === "failed")
      toast.error(
        text(
          `لم يتم تسجيل طلاب؛ تعذر تنفيذ ${summary.errorCount} صفًا. راجع التفاصيل.`,
          `No students enrolled; ${summary.errorCount} rows failed. Review the details.`,
        ),
      );
    else if (status === "partial")
      toast.warning(
        text(
          `تم تسجيل ${summary.enrolledCount} طالب وتعذر ${summary.errorCount} صفًا.`,
          `${summary.enrolledCount} enrolled; ${summary.errorCount} rows failed.`,
        ),
      );
    else if (status === "unchanged")
      toast.info(
        text(
          "لا توجد تسجيلات جديدة؛ راجع نتيجة الملف.",
          "No new enrollments. Review the results.",
        ),
      );
    else
      toast.success(
        text(
          `تم تسجيل ${summary.enrolledCount} طالب بنجاح.`,
          `${summary.enrolledCount} students enrolled.`,
        ),
      );
  }
  async function upload() {
    if (!file || !validCourse || uploading) return;
    if (override && (user?.role !== "admin" || reason.trim().length < 10)) {
      toast.error(
        text(
          "اكتب سبب الاستثناء في 10 أحرف على الأقل.",
          "Enter an exception reason of at least 10 characters.",
        ),
      );
      return;
    }
    setUploading(true);
    setResult(null);
    setConfirmOverride(false);
    const started = Date.now();
    let aggregate: CourseEnrollmentResult | null = null;
    const options = {
      academicYear,
      semester,
      ...(override
        ? { overrideRegistrationLimits: true, overrideReason: reason.trim() }
        : {}),
    };
    setProgress({
      ...initialProgress,
      isUploading: true,
      phase: "inspecting",
      percentage: 5,
    });
    const timer = setInterval(
      () =>
        setProgress((value) => ({
          ...value,
          elapsedSeconds: Math.floor((Date.now() - started) / 1000),
        })),
      1000,
    );
    try {
      const rows = await readEnrollmentSheet(file);
      if (rows.length) {
        const batchSize = 150;
        const totalBatches = Math.ceil(rows.length / batchSize);
        for (let offset = 0; offset < rows.length; offset += batchSize) {
          const response = await api.post<CourseEnrollmentResult>(
            `/admin/courses/${courseId}/enroll-students-batch`,
            { ...options, rows: rows.slice(offset, offset + batchSize) },
          );
          aggregate = mergeEnrollmentResults(aggregate, response.data, offset);
          const processed = Math.min(offset + batchSize, rows.length);
          setProgress((value) => ({
            ...value,
            phase: "uploading",
            percentage: Math.min(
              99,
              Math.round((processed / rows.length) * 100),
            ),
            processedRows: processed,
            totalRows: rows.length,
            currentBatch: Math.floor(offset / batchSize) + 1,
            totalBatches,
          }));
        }
      } else {
        const body = new FormData();
        body.append("file", file);
        const response = await api.post<CourseEnrollmentResult>(
          `/admin/courses/${courseId}/enroll-students-excel`,
          body,
          {
            params: options,
            onUploadProgress: (event) =>
              setProgress((value) => ({
                ...value,
                phase: "uploading",
                percentage: event.total
                  ? Math.min(95, Math.round((event.loaded / event.total) * 95))
                  : 20,
              })),
          },
        );
        aggregate = response.data;
      }
      if (aggregate) {
        setResult(aggregate);
        notify(aggregate);
        setProgress((value) => ({
          ...value,
          percentage: 100,
          phase: "completed",
          totalRows: aggregate!.totalRows,
          processedRows: aggregate!.totalRows,
        }));
      }
      await countQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["registration"] });
      void queryClient.invalidateQueries({ queryKey: ["student-syllabi"] });
      onSuccess?.();
    } catch (error) {
      if (aggregate) setResult(aggregate);
      toast.error(
        getApiErrorMessage(
          error,
          text(
            "تعذر إكمال التسجيل. التسجيلات السابقة في هذه العملية محفوظة.",
            "Enrollment could not finish. Earlier completed batches were preserved.",
          ),
        ),
      );
    } finally {
      clearInterval(timer);
      setUploading(false);
      setProgress((value) => ({ ...value, isUploading: false }));
    }
  }
  async function reset() {
    setResetting(true);
    try {
      await api.delete(`/admin/courses/${courseId}/enrollments`, {
        params: { academicYear, semester },
      });
      await countQuery.refetch();
      setConfirmReset(false);
      toast.success(
        text(
          "تم حذف تسجيلات هذا المقرر للفصل المحدد.",
          "Course enrollments reset for the selected term.",
        ),
      );
      onSuccess?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setResetting(false);
    }
  }
  const state = result ? enrollmentResultStatus(result) : null;
  const summary = result
    ? ([
        [text("إجمالي الصفوف", "Total rows"), result.totalRows],
        [text("تسجيل جديد", "Newly enrolled"), result.enrolledCount],
        [text("مسجل مسبقًا", "Already enrolled"), result.alreadyEnrolledCount],
        [text("تعذر تسجيلهم", "Failed rows"), result.errorCount],
      ] as const)
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!uploading && !resetting) onOpenChange(value);
      }}
    >
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="flex max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border-border bg-card p-0 text-start"
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-5 pe-12 text-start">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <UserCheck className="h-5 w-5 text-primary" />
            {text("تسجيل طلاب بمقرر", "Enroll students in a course")}
          </DialogTitle>
          <DialogDescription>
            {text(
              "حدد القسم والفصل، ثم أرفق شيت الطلاب وراجع نتيجة التسجيل.",
              "Choose the programme and term, upload the student sheet, then review the results.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section
            className="space-y-4"
            aria-label={text("خيارات التسجيل", "Enrollment settings")}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                {
                  label: text("العام الأكاديمي", "Academic year"),
                  value: academicYear,
                  options: ["2026-2027", "2025-2026", "2024-2025"].map(
                    (value) => ({ value, label: value }),
                  ),
                  change: (value: string) =>
                    changeFilter(() => setAcademicYear(value)),
                },
                {
                  label: text("القسم", "Department"),
                  value: department,
                  options: [
                    {
                      value: "all",
                      label: text("كل الأقسام", "All departments"),
                    },
                    ...["GENERAL", "ACCOUNTING", "BIS"].map((value) => ({
                      value,
                      label: curriculumDepartmentLabel(value, locale),
                    })),
                  ],
                  change: (value: string) =>
                    changeFilter(() => setDepartment(value)),
                },
                {
                  label: text("المستوى الدراسي", "Academic level"),
                  value: level,
                  options: [
                    { value: "all", label: text("كل المستويات", "All levels") },
                    ...["1", "2", "3", "4"].map((value) => ({
                      value,
                      label: text(`المستوى ${value}`, `Level ${value}`),
                    })),
                  ],
                  change: (value: string) =>
                    changeFilter(() => setLevel(value)),
                },
                {
                  label: text("الفصل الدراسي", "Semester"),
                  value: semester,
                  options: [
                    {
                      value: "first",
                      label: text("الفصل الأول", "First semester"),
                    },
                    {
                      value: "second",
                      label: text("الفصل الثاني", "Second semester"),
                    },
                    { value: "summer", label: text("الفصل الصيفي", "Summer") },
                  ],
                  change: (value: string) =>
                    changeFilter(() => setSemester(value as Semester)),
                },
              ].map((field) => (
                <label
                  key={field.label}
                  className="space-y-1.5 text-xs font-medium"
                >
                  <span>{field.label}</span>
                  <EnrollmentSelect
                    label={field.label}
                    locale={locale}
                    value={field.value}
                    options={field.options}
                    onValueChange={field.change}
                    disabled={uploading}
                  />
                </label>
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-primary" />
                  {text("المقرر الدراسي", "Course")}
                </span>
                <span className="text-muted-foreground">
                  {filtered.length} {text("متاح", "available")}
                </span>
              </div>
              <Input
                aria-label={text("بحث المقررات", "Search courses")}
                placeholder={text(
                  "بحث باسم أو كود المقرر",
                  "Search by course name or code",
                )}
                value={search}
              onChange={(event) => changeFilter(() => setSearch(event.target.value))}
                disabled={uploading}
              />
              <EnrollmentSelect
                label={text("المقرر الدراسي", "Course")}
                locale={locale}
                value={validCourse ? courseId : ""}
                onValueChange={(value) => {
                  setCourseId(value);
                  setResult(null);
                }}
                options={filtered.map((course) => ({
                  value: course._id,
                  label: `${course.code} · ${isAr ? course.nameAr || course.name : course.nameEn || course.name}`,
                }))}
                placeholder={
                  coursesQuery.isLoading
                    ? text("جارٍ تحميل المقررات…", "Loading courses…")
                    : text("اختر مقررًا", "Select a course")
                }
                disabled={
                  uploading || coursesQuery.isLoading || !filtered.length
                }
              />
              {coursesQuery.isError && (
                <p role="alert" className="text-xs text-danger">
                  {text("تعذر تحميل المقررات.", "Could not load courses.")}{" "}
                  <button
                    className="underline"
                    onClick={() => coursesQuery.refetch()}
                  >
                    {text("إعادة المحاولة", "Retry")}
                  </button>
                </p>
              )}
            </div>
            {validCourse && selected && (
              <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-3 text-xs">
                <p className="font-medium">
                  {courseCurriculumSummary(selected, locale)}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {text(
                    "المسجلون في الفصل المحدد:",
                    "Enrolled in this term:",
                  )}{" "}
                  {countQuery.isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <bdi className="font-bold text-foreground">
                      {countQuery.data?.enrolledCount ?? 0}
                    </bdi>
                  )}
                </p>
                {(countQuery.data?.enrolledCount ?? 0) > 0 && (
                  <details>
                    <summary className="cursor-pointer text-danger">
                      {text(
                        "إدارة التسجيلات السابقة",
                        "Manage existing enrollments",
                      )}
                    </summary>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 text-danger"
                      disabled={uploading || resetting}
                      onClick={() => setConfirmReset(true)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      {text("تصفير تسجيلات المقرر", "Reset course enrollments")}
                    </Button>
                  </details>
                )}
              </div>
            )}
          </section>

          <section
            className="space-y-3 border-t border-border pt-4"
            aria-label={text("شيت الطلاب", "Student sheet")}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold">
                  {text("شيت الطلاب", "Student sheet")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {text(
                    "كود الطالب · المستوى · الحالة · الاسم (اختياري)",
                    "Student code · Level · Status · Name (optional)",
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={downloadTemplate}
                disabled={templateLoading || uploading}
              >
                {templateLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {text("النموذج", "Template")}
              </Button>
            </div>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                if (!uploading) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (!uploading) chooseFile(event.dataTransfer.files[0]);
              }}
              className={`rounded-xl border-2 border-dashed p-5 text-center ${dragging ? "border-primary bg-primary/10" : "border-border bg-secondary/10"}`}
            >
              <input
                id={fileInputId}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                disabled={uploading}
                onChange={onFileChange}
              />
              {file ? (
                <div className="flex items-start gap-3 text-start">
                  <FileSpreadsheet className="mt-1 h-6 w-6 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <bdi>{(file.size / 1024).toFixed(1)} KB</bdi>
                    </p>
                  </div>
                  <Button
                    aria-label={text("إزالة الملف", "Remove file")}
                    variant="ghost"
                    size="sm"
                    disabled={uploading}
                    onClick={() => setFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label
                  htmlFor={fileInputId}
                  className="flex cursor-pointer flex-col items-center gap-2"
                >
                  <UploadCloud className="h-7 w-7 text-primary" />
                  <span className="text-sm font-medium">
                    {text(
                      "اسحب الشيت هنا أو اضغط لاختياره",
                      "Drop the sheet here or choose a file",
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Excel / CSV · {text("حتى 10 ميجابايت", "Up to 10MB")}
                  </span>
                </label>
              )}
            </div>
          </section>

          {user?.role === "admin" && (
            <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs">
              <label className="flex items-center gap-2 font-medium">
                <Checkbox
                  checked={override}
                  disabled={uploading}
                  onCheckedChange={(value) => setOverride(value === true)}
                />
                {text(
                  "السماح باستثناء حد المقررات والساعات",
                  "Allow a course/credit limit exception",
                )}
              </label>
              {override && (
                <div className="mt-3 space-y-2">
                  <p className="text-muted-foreground">
                    {text(
                      "يتطلب تأكيدًا إداريًا ويُحفظ السبب مع التسجيل. لا يتجاوز شروط القسم أو الفصل أو المتطلبات السابقة.",
                      "Requires administrative confirmation. The reason is saved with the registration. Department, term and prerequisite checks remain in force.",
                    )}
                  </p>
                  <Textarea
                    aria-label={text("سبب الاستثناء", "Exception reason")}
                    placeholder={text(
                      "سبب الاستثناء (10 أحرف على الأقل)",
                      "Exception reason (at least 10 characters)",
                    )}
                    minLength={10}
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={uploading}
                  />
                </div>
              )}
            </section>
          )}
          {uploading && <DataUploadProgress state={progress} locale={locale} />}
          {result && (
            <section
              aria-live="polite"
              className={`space-y-3 rounded-xl border p-4 ${state === "failed" ? "border-danger/30 bg-danger/5" : state === "partial" ? "border-amber-500/30 bg-amber-500/5" : "border-primary/25 bg-primary/5"}`}
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                {state === "failed" || state === "partial" ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {state === "failed"
                  ? text("لم يتم تسجيل طلاب", "No students enrolled")
                  : state === "partial"
                    ? text(
                        "اكتمل التسجيل مع ملاحظات",
                        "Enrollment completed with issues",
                      )
                    : state === "unchanged"
                      ? text("لا توجد تسجيلات جديدة", "No new enrollments")
                      : text("اكتمل تسجيل الطلاب", "Enrollment completed")}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {summary.map(([label, count]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-border bg-card p-2 text-center"
                  >
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <bdi className="text-lg font-bold">{count}</bdi>
                  </div>
                ))}
              </div>
              {(result.overriddenCount ?? 0) > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {text(
                    `تم تسجيل ${result.overriddenCount} طالب باستثناء إداري موثّق.`,
                    `${result.overriddenCount} students enrolled with a recorded administrative exception.`,
                  )}
                </p>
              )}
              {result.skippedBlockedCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {text(
                    `استُبعد ${result.skippedBlockedCount} طالب محجوب.`,
                    `${result.skippedBlockedCount} blocked students skipped.`,
                  )}
                </p>
              )}
              {result.errorCount > 0 && (
                <div className="space-y-2 text-xs">
                  <p className="font-medium text-danger">
                    {text(
                      `عرض ${result.errors.length} من ${result.errorCount} أخطاء`,
                      `Showing ${result.errors.length} of ${result.errorCount} errors`,
                    )}
                  </p>
                  <ul className="max-h-52 space-y-2 overflow-y-auto pe-1">
                    {result.errors.map((message, index) => {
                      const issue = result.issues?.[index];
                      return (
                        <li
                          key={index}
                          className="rounded-lg border border-danger/15 bg-card p-2 leading-relaxed text-danger"
                        >
                          {issue?.limits ? (
                            <>
                              <p>
                                {text(
                                  `السطر ${issue.row}: تجاوز حد التسجيل`,
                                  `Row ${issue.row}: Registration limit exceeded`,
                                )}
                              </p>
                              <p className="text-muted-foreground">
                                {text(
                                  `بعد الإضافة: ${issue.limits.proposedCourseCount} مقررات / الحد ${issue.limits.maxCourses}، و${issue.limits.proposedCreditHours} ساعة / الحد ${issue.limits.maxCreditHours}.`,
                                  `After adding: ${issue.limits.proposedCourseCount}/${issue.limits.maxCourses} courses and ${issue.limits.proposedCreditHours}/${issue.limits.maxCreditHours} credits.`,
                                )}
                              </p>
                            </>
                          ) : (
                            localizeEnrollmentError(message, locale)
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>
        <DialogFooter className="shrink-0 flex-row gap-2 border-t border-border bg-card px-5 py-4 rtl:sm:justify-start">
          <Button
            disabled={
              uploading ||
              !file ||
              !validCourse ||
              (override && reason.trim().length < 10)
            }
            onClick={() =>
              override ? setConfirmOverride(true) : void upload()
            }
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="h-4 w-4" />
            )}
            {uploading
              ? text("جارٍ التسجيل…", "Enrolling…")
              : text("تسجيل الطلاب", "Enroll students")}
          </Button>
          <Button
            variant="outline"
            disabled={uploading || resetting}
            onClick={() => onOpenChange(false)}
          >
            {text("إغلاق", "Close")}
          </Button>
        </DialogFooter>
        <ConfirmDialog
          dir={isAr ? "rtl" : "ltr"}
          destructive={false}
          open={confirmOverride}
          onOpenChange={setConfirmOverride}
          title={text(
            "تأكيد الاستثناء الإداري",
            "Confirm administrative exception",
          )}
          description={
            <span className="block space-y-2">
              <span className="block">
                {text(
                  "سيُسمح بتجاوز حد المقررات والساعات فقط للطلاب المستوفين باقي الشروط، وستُحفظ هوية المسؤول وسبب الاستثناء.",
                  "Only course/credit limits may be exceeded for otherwise eligible students. The administrator and reason will be recorded.",
                )}
              </span>
              <span className="block rounded-lg border border-border p-2 text-sm">
                {reason}
              </span>
            </span>
          }
          confirmLabel={text("تأكيد وبدء التسجيل", "Confirm and enroll")}
          cancelLabel={text("رجوع", "Back")}
          onConfirm={upload}
        />
        <ConfirmDialog
          dir={isAr ? "rtl" : "ltr"}
          open={confirmReset}
          onOpenChange={setConfirmReset}
          title={text("تصفير تسجيلات المقرر؟", "Reset course enrollments?")}
          description={
            <span>
              {text(
                "سيُحذف هذا المقرر من تسجيلات الفصل المحدد وتُحدّث الساعات.",
                "This course will be removed from registrations in the selected term and credit totals updated.",
              )}{" "}
              <bdi>
                {selected?.code} · {academicYear}
              </bdi>
            </span>
          }
          destructive
          disabled={resetting}
          confirmLabel={text("تصفير التسجيلات", "Reset enrollments")}
          cancelLabel={text("إلغاء", "Cancel")}
          onConfirm={reset}
        />
      </DialogContent>
    </Dialog>
  );
}
