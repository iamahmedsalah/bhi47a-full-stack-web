"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  History,
  Loader2,
  MessageSquareWarning,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  executeWipe,
  getWipeSummary,
  previewWipe,
  type AttendanceWipeScope,
  type ComplaintWipeScope,
  type GradeSourceScope,
  type GradeWipeExamType,
  type QuizWipeScope,
  type WipeExecuteResponse,
  type WipePreviewPayload,
  type WipeSemester,
  type WipeTarget,
} from "../api/wipe-api";

interface DataWipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
}

type WizardStep = 1 | 2 | 3;

const EXAM_TYPE_LABELS: Record<
  GradeWipeExamType,
  { ar: string; en: string }
> = {
  midterm: { ar: "الميدتيرم", en: "Midterm" },
  final: { ar: "الفاينل", en: "Final" },
  coursework: { ar: "أعمال السنة", en: "Coursework" },
  quiz: { ar: "الكويزات (درجات)", en: "Quiz Marks" },
  practical: { ar: "العملي", en: "Practical" },
  oral: { ar: "الشفوي", en: "Oral" },
  total: { ar: "المجموع الكلي التاريخي", en: "Legacy Total" },
};

const STANDARD_EXAM_TYPES: GradeWipeExamType[] = [
  "midterm",
  "final",
  "coursework",
  "quiz",
  "practical",
  "oral",
];

const DELETED_COUNT_LABELS: Record<string, { ar: string; en: string }> = {
  grades: { ar: "الدرجات", en: "Grades" },
  quizzes: { ar: "الكويزات", en: "Quizzes" },
  quizAttempts: { ar: "محاولات الكويزات", en: "Quiz Attempts" },
  quizSubmissions: { ar: "تسليمات الكويزات", en: "Quiz Submissions" },
  courseQuizzes: { ar: "كويزات الإكسيل القديمة", en: "Legacy Course Quizzes" },
  attendanceSessions: { ar: "جلسات حضور QR", en: "QR Sessions" },
  attendanceRecords: { ar: "سجلات حضور QR", en: "QR Check-ins" },
  attendance: { ar: "سجلات الحضور القديمة", en: "Legacy Attendance" },
  complaints: { ar: "الشكاوى والتذاكر", en: "Complaints" },
  students: { ar: "حسابات الطلاب", en: "Student Accounts" },
  studentProfiles: { ar: "ملفات الطلاب", en: "Student Profiles" },
  academicProfiles: { ar: "الملفات الأكاديمية", en: "Academic Profiles" },
  registrations: { ar: "تسجيلات المقررات", en: "Course Registrations" },
  advisingCases: { ar: "حالات الإرشاد", en: "Advising Cases" },
  advisingPlans: { ar: "خطط الإرشاد", en: "Advising Plans" },
  academicEmails: { ar: "الإيميلات الأكاديمية", en: "Academic Emails" },
  studentCodeRegistry: { ar: "تخصيصات أكواد الطلاب", en: "Student Code Entries" },
  controlSheets: { ar: "شيتات الكنترول", en: "Control Sheets" },
  controlImportBatches: { ar: "دفعات استيراد الكنترول", en: "Control Imports" },
  controlPetitions: { ar: "تظلمات الكنترول", en: "Control Petitions" },
  controlEditorCheckpoints: {
    ar: "نقاط حفظ الكنترول",
    en: "Control Checkpoints",
  },
};

const TARGET_META: Record<
  WipeTarget,
  {
    ar: string;
    en: string;
    descAr: string;
    descEn: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  grades: {
    ar: "الدرجات والنتائج",
    en: "Grades & Results",
    descAr: "تصفية حسب السنة الدراسية، الفصل، الميدتيرم/الفاينل، وحماية الكنترول",
    descEn: "Filter by academic year, semester, midterm/final, with Control shield",
    icon: Award,
  },
  quizzes: {
    ar: "الكويزات والاختبارات",
    en: "Quizzes & Attempts",
    descAr: "الكويزات الإلكترونية والتسليمات والمحاولات + كويزات الإكسيل القديمة",
    descEn: "Online quizzes, submissions, attempts + legacy Excel course quizzes",
    icon: FileSpreadsheet,
  },
  attendance: {
    ar: "الحضور وجلسات QR",
    en: "Attendance & QR Sessions",
    descAr: "جلسات حضور QR وسجلات الطلاب + سجلات الحضور القديمة",
    descEn: "QR attendance sessions, student check-ins + legacy attendance records",
    icon: ClipboardCheck,
  },
  complaints: {
    ar: "شكاوى وتذاكر الطلاب",
    en: "Complaints & Tickets",
    descAr: "حذف الشكاوى المغلقة/المحلولة فقط أو الأقدم من تاريخ محدد",
    descEn: "Purge resolved/closed tickets only or tickets older than a date",
    icon: MessageSquareWarning,
  },
  students: {
    ar: "الطلاب وحساباتهم",
    en: "Students & Accounts",
    descAr: "تصفية بالفرقة الدراسية مع تنظيف السجلات التابعة لهم بالكامل",
    descEn: "Filter by academic level and clean all owned student records",
    icon: Users,
  },
  all: {
    ar: "كافة البيانات الأكاديمية",
    en: "All Academic Records",
    descAr: "تهيئة شاملة مع الإبقاء على الأدمن والستاف والمقررات وسجلات التدقيق",
    descEn: "Full academic reset preserving admins, staff, courses & audit logs",
    icon: Database,
  },
};

export function DataWipeDialog({
  open,
  onOpenChange,
  locale,
}: DataWipeDialogProps) {
  const isAr = locale === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>(1);
  const [target, setTarget] = useState<WipeTarget>("grades");

  // Shared term filters
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [semester, setSemester] = useState<WipeSemester>("all");

  // Grades-specific filters
  const [selectedExamTypes, setSelectedExamTypes] = useState<
    GradeWipeExamType[]
  >([]);
  const [sourceScope, setSourceScope] = useState<GradeSourceScope>("all");
  const [includeApprovedControl, setIncludeApprovedControl] = useState(false);

  // Quizzes-specific filters
  const [quizScope, setQuizScope] = useState<QuizWipeScope>("everything");

  // Attendance-specific filters
  const [attendanceScope, setAttendanceScope] =
    useState<AttendanceWipeScope>("everything");
  const [includeOpenAttendanceSessions, setIncludeOpenAttendanceSessions] =
    useState(false);

  // Complaints-specific filters
  const [complaintScope, setComplaintScope] =
    useState<ComplaintWipeScope>("resolved_and_closed");
  const [olderThan, setOlderThan] = useState("");

  // Students-specific filters
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);

  // Step 3 confirmation & result
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [completedResult, setCompletedResult] =
    useState<WipeExecuteResponse | null>(null);

  const fmtNum = useMemo(
    () => new Intl.NumberFormat(isAr ? "ar-EG" : "en-US"),
    [isAr],
  );

  const resetFiltersForTarget = (nextTarget: WipeTarget) => {
    setTarget(nextTarget);
    setSelectedYears([]);
    setSemester("all");
    setSelectedExamTypes([]);
    setSourceScope("all");
    setIncludeApprovedControl(false);
    setQuizScope("everything");
    setAttendanceScope("everything");
    setIncludeOpenAttendanceSessions(false);
    setComplaintScope("resolved_and_closed");
    setOlderThan("");
    setSelectedLevels([]);
    setConfirmText("");
    setReason("");
    setCompletedResult(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStep(1);
      setConfirmText("");
      setReason("");
      setCompletedResult(null);
    }
    onOpenChange(nextOpen);
  };

  const summaryQuery = useQuery({
    queryKey: ["admin-uploads-wipe-summary"],
    queryFn: getWipeSummary,
    enabled: open,
    staleTime: 15_000,
  });

  const summary = summaryQuery.data;

  const previewPayload = useMemo<WipePreviewPayload>(() => {
    if (target === "grades") {
      return {
        target: "grades",
        academicYears: selectedYears.length > 0 ? selectedYears : undefined,
        semester,
        examTypes:
          selectedExamTypes.length > 0 ? selectedExamTypes : undefined,
        sourceScope,
        includeApprovedControl,
      };
    }
    if (target === "quizzes") {
      return {
        target: "quizzes",
        quizScope,
        academicYears: selectedYears.length > 0 ? selectedYears : undefined,
        semester,
      };
    }
    if (target === "attendance") {
      return {
        target: "attendance",
        attendanceScope,
        academicYears: selectedYears.length > 0 ? selectedYears : undefined,
        semester,
        includeOpenAttendanceSessions,
      };
    }
    if (target === "complaints") {
      return {
        target: "complaints",
        complaintScope,
        olderThan: olderThan || undefined,
      };
    }
    if (target === "students") {
      return {
        target: "students",
        levels: selectedLevels.length > 0 ? selectedLevels : undefined,
      };
    }
    return { target: "all" };
  }, [
    target,
    selectedYears,
    semester,
    selectedExamTypes,
    sourceScope,
    includeApprovedControl,
    quizScope,
    attendanceScope,
    includeOpenAttendanceSessions,
    complaintScope,
    olderThan,
    selectedLevels,
  ]);

  const previewQuery = useQuery({
    queryKey: ["admin-uploads-wipe-preview", previewPayload],
    queryFn: () => previewWipe(previewPayload),
    enabled: open && step >= 2 && !completedResult,
    staleTime: 5_000,
  });

  const wipeMutation = useMutation({
    mutationFn: () =>
      executeWipe({
        ...previewPayload,
        reason: reason.trim() || undefined,
      }),
    onSuccess: (res) => {
      setCompletedResult(res);
      setConfirmText("");
      void queryClient.invalidateQueries({
        queryKey: ["admin-uploads-wipe-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin-uploads-wipe-preview"],
      });
      toast.success(
        isAr
          ? `تم مسح ${fmtNum.format(res.totalDeleted)} سجل بنجاح`
          : `Successfully wiped ${fmtNum.format(res.totalDeleted)} records`,
      );
    },
    onError: (err: unknown) => {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? "فشل تنفيذ عملية المسح" : "Failed to wipe data",
        ),
      );
    },
  });

  const availableExamTypes = useMemo<GradeWipeExamType[]>(() => {
    const hasLegacyTotal = (summary?.gradesByExamType?.total ?? 0) > 0;
    return hasLegacyTotal
      ? [...STANDARD_EXAM_TYPES, "total"]
      : STANDARD_EXAM_TYPES;
  }, [summary]);

  const toggleYear = (year: string) => {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year],
    );
  };

  const toggleExamType = (type: GradeWipeExamType) => {
    setSelectedExamTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const toggleLevel = (lvl: string) => {
    setSelectedLevels((prev) =>
      prev.includes(lvl) ? prev.filter((l) => l !== lvl) : [...prev, lvl],
    );
  };

  const oldestGradeYear = useMemo(() => {
    const years = summary?.gradesByYear ?? [];
    if (years.length === 0) return null;
    return years[years.length - 1]?.academicYear ?? null;
  }, [summary]);

  const isConfirmMatch = isAr
    ? confirmText.trim() === "مسح"
    : confirmText.trim().toUpperCase() === "DELETE";

  const preview = previewQuery.data;
  const targetMeta = TARGET_META[target];
  const TargetIcon = targetMeta.icon;

  const stepItems = [
    { num: 1 as const, ar: "اختيار القسم", en: "Select Section" },
    { num: 2 as const, ar: "النطاق والمعاينة", en: "Scope & Preview" },
    { num: 3 as const, ar: "التأكيد والتنفيذ", en: "Confirm & Execute" },
  ];

  const getCategoryCardStats = (id: WipeTarget) => {
    if (!summary) return { count: null, sub: "" };
    switch (id) {
      case "grades":
        return {
          count: summary.gradesCount,
          sub:
            summary.gradesByYear.length > 0
              ? isAr
                ? `${fmtNum.format(summary.gradesByYear.length)} سنوات دراسية`
                : `${fmtNum.format(summary.gradesByYear.length)} academic years`
              : "",
        };
      case "quizzes":
        return {
          count: summary.quizzesCount,
          sub: isAr
            ? `${fmtNum.format(summary.quizzesBreakdown.quizzes)} كويز · ${fmtNum.format(summary.quizzesBreakdown.quizSubmissions)} تسليم · ${fmtNum.format(summary.quizzesBreakdown.legacyCourseQuizzes)} قديم`
            : `${fmtNum.format(summary.quizzesBreakdown.quizzes)} quizzes · ${fmtNum.format(summary.quizzesBreakdown.quizSubmissions)} submissions`,
        };
      case "attendance":
        return {
          count: summary.attendanceCount,
          sub: isAr
            ? `${fmtNum.format(summary.attendanceBreakdown.sessions)} جلسة QR · ${fmtNum.format(summary.attendanceBreakdown.records)} حضور · ${fmtNum.format(summary.attendanceBreakdown.legacyAttendance)} قديم`
            : `${fmtNum.format(summary.attendanceBreakdown.sessions)} QR sessions · ${fmtNum.format(summary.attendanceBreakdown.records)} check-ins`,
        };
      case "complaints":
        return {
          count: summary.complaintsCount,
          sub: isAr
            ? `${fmtNum.format(summary.resolvedClosedComplaintsCount)} محلولة أو مغلقة`
            : `${fmtNum.format(summary.resolvedClosedComplaintsCount)} resolved or closed`,
        };
      case "students":
        return {
          count: summary.studentsCount,
          sub:
            summary.availableLevels.length > 0
              ? isAr
                ? `${fmtNum.format(summary.availableLevels.length)} فرق دراسية`
                : `${fmtNum.format(summary.availableLevels.length)} levels`
              : "",
        };
      case "all":
        return {
          count:
            summary.studentsCount +
            summary.gradesCount +
            summary.quizzesCount +
            summary.attendanceCount +
            summary.complaintsCount,
          sub: isAr
            ? "يحفظ الأدمن والستاف والمقررات وسجلات التدقيق"
            : "Preserves admins, staff, courses & audit logs",
        };
    }
  };

  const activeFilterSummaryChips = useMemo(() => {
    const chips: string[] = [];
    if (target === "grades") {
      chips.push(
        selectedYears.length > 0
          ? isAr
            ? `السنوات: ${selectedYears.join("، ")}`
            : `Years: ${selectedYears.join(", ")}`
          : isAr
            ? "كل السنوات الدراسية"
            : "All academic years",
      );
      if (semester !== "all") {
        const semMap = {
          first: isAr ? "الترم الأول" : "First Semester",
          second: isAr ? "الترم الثاني" : "Second Semester",
          summer: isAr ? "الترم الصيفي" : "Summer Semester",
        };
        chips.push(semMap[semester]);
      }
      chips.push(
        selectedExamTypes.length > 0
          ? selectedExamTypes
              .map((t) => (isAr ? EXAM_TYPE_LABELS[t].ar : EXAM_TYPE_LABELS[t].en))
              .join(" · ")
          : isAr
            ? "كل أنواع الامتحانات"
            : "All exam types",
      );
      chips.push(
        includeApprovedControl
          ? isAr
            ? "شامل شيتات الكنترول المعتمدة"
            : "Includes approved Control sheets"
          : isAr
            ? "شيتات الكنترول المعتمدة محمية"
            : "Approved Control sheets protected",
      );
    } else if (target === "quizzes") {
      const scopeLabels: Record<QuizWipeScope, { ar: string; en: string }> = {
        everything: { ar: "الكل (جديد + قديم)", en: "Everything (New + Legacy)" },
        attempts_and_submissions: {
          ar: "المحاولات والتسليمات فقط",
          en: "Attempts & Submissions Only",
        },
        all_quizzes_and_submissions: {
          ar: "الكويزات الإلكترونية وتسليماتها",
          en: "Online Quizzes & Submissions",
        },
        legacy_course_quizzes: {
          ar: "كويزات الإكسيل القديمة فقط",
          en: "Legacy Excel Quizzes Only",
        },
      };
      chips.push(isAr ? scopeLabels[quizScope].ar : scopeLabels[quizScope].en);
      if (selectedYears.length > 0) {
        chips.push(selectedYears.join("، "));
      }
    } else if (target === "attendance") {
      const scopeLabels: Record<
        AttendanceWipeScope,
        { ar: string; en: string }
      > = {
        everything: { ar: "الكل (QR + قديم)", en: "Everything (QR + Legacy)" },
        qr_sessions_and_records: {
          ar: "جلسات وسجلات QR فقط",
          en: "QR Sessions & Check-ins Only",
        },
        legacy_attendance: {
          ar: "سجلات الحضور القديمة فقط",
          en: "Legacy Attendance Only",
        },
      };
      chips.push(
        isAr ? scopeLabels[attendanceScope].ar : scopeLabels[attendanceScope].en,
      );
      if (selectedYears.length > 0) {
        chips.push(selectedYears.join("، "));
      }
    } else if (target === "complaints") {
      chips.push(
        complaintScope === "resolved_and_closed"
          ? isAr
            ? "المحلولة والمغلقة فقط"
            : "Resolved & Closed Only"
          : isAr
            ? "جميع الشكاوى"
            : "All Complaints",
      );
      if (olderThan) {
        chips.push(isAr ? `الأقدم من ${olderThan}` : `Older than ${olderThan}`);
      }
    } else if (target === "students") {
      chips.push(
        selectedLevels.length > 0
          ? isAr
            ? `الفرق: ${selectedLevels.join("، ")}`
            : `Levels: ${selectedLevels.join(", ")}`
          : isAr
            ? "جميع الفرق الدراسية"
            : "All student levels",
      );
    }
    return chips;
  }, [
    target,
    selectedYears,
    semester,
    selectedExamTypes,
    includeApprovedControl,
    quizScope,
    attendanceScope,
    complaintScope,
    olderThan,
    selectedLevels,
    isAr,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent flush dir={dir} className="sm:max-w-2xl">
        <DialogHeader className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-squircle border border-rose-500/30 bg-rose-500/15 text-rose-400">
              <AlertOctagon className="size-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1 text-start">
              <DialogTitle className="text-base font-extrabold text-foreground">
                {isAr
                  ? "منطقة الخطر: مسح وتهيئة البيانات"
                  : "Danger Zone: Scoped Data Wipe & Reset"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                {isAr
                  ? "اختر القسم وحدد السنة الدراسية ونوع السجلات مع معاينة فورية قبل الحذف، مع حماية تلقائية لشيتات الكنترول المعتمدة."
                  : "Select a dataset, narrow by year/semester/type with a live dry-run preview, and keep approved Control sheets protected by default."}
              </DialogDescription>
            </div>
          </div>

          {/* 3-Step Guided Stepper */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {stepItems.map((item) => {
              const isActive = step === item.num;
              const isDone = step > item.num || Boolean(completedResult);
              const canJumpBack = item.num < step && !completedResult;
              return (
                <button
                  key={item.num}
                  type="button"
                  disabled={!canJumpBack}
                  onClick={() => canJumpBack && setStep(item.num)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-start text-xs transition-colors",
                    isActive
                      ? "border-primary/45 bg-primary/12 text-foreground font-bold"
                      : isDone
                        ? "border-border/70 bg-secondary/25 text-foreground/90 hover:border-primary/35 cursor-pointer"
                        : "border-border/50 bg-card/50 text-muted-foreground cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isDone
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isDone && !isActive ? "✓" : item.num}
                  </span>
                  <span className="min-w-0 leading-snug break-words">
                    {isAr ? item.ar : item.en}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogHeader>

        <DialogBody>
          {/* STEP 1: Select Target Section */}
          {step === 1 && (
            <div className="space-y-3">
              {summaryQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-secondary/20 py-10 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span>
                    {isAr
                      ? "جاري حساب أعداد السجلات الحقيقية من قاعدة البيانات..."
                      : "Calculating live collection counts..."}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(Object.keys(TARGET_META) as WipeTarget[]).map((id) => {
                    const meta = TARGET_META[id];
                    const Icon = meta.icon;
                    const stats = getCategoryCardStats(id);
                    const isSelected = target === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          resetFiltersForTarget(id);
                          setStep(2);
                        }}
                        className={cn(
                          "group flex flex-col justify-between gap-2.5 rounded-xl border p-3.5 text-start transition-all cursor-pointer",
                          isSelected
                            ? "border-rose-500/50 bg-rose-500/[0.08]"
                            : "border-border/65 bg-secondary/20 hover:border-primary/40 hover:bg-secondary/30",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2.5 w-full">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <span
                              className={cn(
                                "flex size-9 shrink-0 items-center justify-center rounded-squircle border",
                                id === "all"
                                  ? "border-rose-500/35 bg-rose-500/15 text-rose-400"
                                  : "border-primary/25 bg-primary/12 text-primary",
                              )}
                            >
                              <Icon className="size-4" />
                            </span>
                            <div className="min-w-0 space-y-0.5">
                              <div className="text-xs sm:text-sm font-bold text-foreground">
                                {isAr ? meta.ar : meta.en}
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {isAr ? meta.descAr : meta.descEn}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-border/50 pt-2 w-full">
                          <span className="inline-flex items-center gap-1 rounded-squircle border border-border/70 bg-card/85 px-2 py-0.5 text-[11px] font-bold text-foreground">
                            <bdi className="font-mono tabular-nums">
                              {stats.count !== null
                                ? fmtNum.format(stats.count)
                                : "—"}
                            </bdi>
                            <span className="font-normal text-muted-foreground">
                              {isAr ? "سجل" : "records"}
                            </span>
                          </span>
                          {stats.sub && (
                            <span className="text-[10px] text-muted-foreground">
                              {stats.sub}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Scope Filters + Live Dry-Run Preview */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Active Category Header Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/20 px-3.5 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-squircle border border-primary/30 bg-primary/15 text-primary">
                    <TargetIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-foreground">
                      {isAr ? targetMeta.ar : targetMeta.en}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {isAr ? targetMeta.descAr : targetMeta.descEn}
                    </div>
                  </div>
                </div>
                {target === "grades" && oldestGradeYear && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedYears([oldestGradeYear]);
                      setSemester("all");
                      setSelectedExamTypes([]);
                    }}
                    className="h-auto min-h-8 whitespace-normal rounded-squircle border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 gap-1.5"
                  >
                    <History className="size-3.5 shrink-0" />
                    <span>
                      {isAr
                        ? `تحديد أقدم سنة (${oldestGradeYear})`
                        : `Select oldest year (${oldestGradeYear})`}
                    </span>
                  </Button>
                )}
              </div>

              {/* GRADES FILTERS */}
              {target === "grades" && (
                <div className="space-y-3.5 rounded-xl border border-border/60 bg-secondary/20 p-4">
                  {/* Academic Years */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-foreground">
                        {isAr ? "السنة الدراسية" : "Academic Year"}
                      </span>
                      {selectedYears.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedYears([])}
                          className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                        >
                          {isAr ? "تحديد كل السنوات" : "All years"}
                        </button>
                      )}
                    </div>
                    {(summary?.gradesByYear.length ?? 0) > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedYears([])}
                          className={cn(
                            "rounded-squircle border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer",
                            selectedYears.length === 0
                              ? "border-primary/50 bg-primary/15 text-primary"
                              : "border-border/70 bg-card/85 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {isAr ? "كل السنوات" : "All Years"}
                        </button>
                        {summary?.gradesByYear.map((item) => {
                          const active = selectedYears.includes(
                            item.academicYear,
                          );
                          return (
                            <button
                              key={item.academicYear}
                              type="button"
                              onClick={() => toggleYear(item.academicYear)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-squircle border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer",
                                active
                                  ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
                                  : "border-border/70 bg-card/85 text-foreground hover:border-primary/40",
                              )}
                            >
                              <bdi className="font-mono">
                                {item.academicYear}
                              </bdi>
                              <span className="text-[10px] opacity-75">
                                (<bdi>{fmtNum.format(item.count)}</bdi>)
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {isAr
                          ? "لا توجد سنوات دراسية مسجلة في جدول الدرجات."
                          : "No academic years found in grades."}
                      </p>
                    )}
                  </div>

                  {/* Semester + Source Scope */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-foreground">
                        {isAr ? "الفصل الدراسي" : "Semester"}
                      </label>
                      <Select
                        value={semester}
                        onValueChange={(v) => setSemester(v as WipeSemester)}
                      >
                        <SelectTrigger className="h-9 rounded-squircle bg-card/85 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir={dir}>
                          <SelectItem value="all">
                            {isAr ? "كل الفصول الدراسية" : "All Semesters"}
                          </SelectItem>
                          <SelectItem value="first">
                            {isAr ? "الفصل الدراسي الأول" : "First Semester"}
                          </SelectItem>
                          <SelectItem value="second">
                            {isAr ? "الفصل الدراسي الثاني" : "Second Semester"}
                          </SelectItem>
                          <SelectItem value="summer">
                            {isAr ? "الفصل الصيفي" : "Summer Semester"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-foreground">
                        {isAr ? "مصدر الدرجات" : "Grade Source"}
                      </label>
                      <Select
                        value={sourceScope}
                        onValueChange={(v) =>
                          setSourceScope(v as GradeSourceScope)
                        }
                      >
                        <SelectTrigger className="h-9 rounded-squircle bg-card/85 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir={dir}>
                          <SelectItem value="all">
                            {isAr ? "جميع المصادر" : "All Sources"}
                          </SelectItem>
                          <SelectItem value="historical_only">
                            {isAr
                              ? "الدرجات التاريخية المستوردة فقط"
                              : "Historical Imports Only"}
                          </SelectItem>
                          <SelectItem value="non_control_only">
                            {isAr
                              ? "الدرجات العادية (خارج الكنترول)"
                              : "Non-Control Grades Only"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Exam Types Checkboxes + Quick Presets */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-foreground">
                        {isAr
                          ? "نوع الامتحان / الدرجة"
                          : "Exam / Grade Type"}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          {
                            label: isAr ? "ميدتيرم فقط" : "Midterm Only",
                            types: ["midterm"] as GradeWipeExamType[],
                          },
                          {
                            label: isAr ? "فاينل فقط" : "Final Only",
                            types: ["final"] as GradeWipeExamType[],
                          },
                          {
                            label: isAr ? "ميدتيرم + فاينل" : "Midterm + Final",
                            types: ["midterm", "final"] as GradeWipeExamType[],
                          },
                          {
                            label: isAr ? "الكل" : "All",
                            types: [] as GradeWipeExamType[],
                          },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setSelectedExamTypes(preset.types)}
                            className="rounded-squircle border border-border/70 bg-card/85 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground cursor-pointer"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {availableExamTypes.map((examType) => {
                        const checked = selectedExamTypes.includes(examType);
                        const label = isAr
                          ? EXAM_TYPE_LABELS[examType].ar
                          : EXAM_TYPE_LABELS[examType].en;
                        const totalForType =
                          summary?.gradesByExamType?.[examType] ?? 0;
                        return (
                          <label
                            key={examType}
                            className={cn(
                              "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs cursor-pointer transition-colors",
                              checked
                                ? "border-rose-500/45 bg-rose-500/[0.08] text-foreground font-semibold"
                                : "border-border/60 bg-card/85 text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleExamType(examType)}
                            />
                            <span className="min-w-0 flex-1 leading-snug break-words">
                              {label}
                            </span>
                            <span className="text-[10px] font-mono opacity-75">
                              <bdi>{fmtNum.format(totalForType)}</bdi>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedExamTypes.length === 0
                        ? isAr
                          ? "عند عدم تحديد نوع بعينه سيتم شمول جميع أنواع الدرجات في السنة المختارة."
                          : "Leaving all unchecked matches every exam type in the selected scope."
                        : isAr
                          ? `محدد حاليًا: ${selectedExamTypes.map((t) => EXAM_TYPE_LABELS[t].ar).join("، ")}.`
                          : `Selected: ${selectedExamTypes.map((t) => EXAM_TYPE_LABELS[t].en).join(", ")}.`}
                    </p>
                  </div>

                  {/* Control Shield Panel */}
                  <div
                    className={cn(
                      "rounded-xl border p-3 space-y-2 transition-colors",
                      includeApprovedControl
                        ? "border-amber-500/45 bg-amber-500/[0.09]"
                        : "border-primary/35 bg-primary/[0.08]",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <ShieldCheck
                        className={cn(
                          "size-4 shrink-0 mt-0.5",
                          includeApprovedControl
                            ? "text-amber-400"
                            : "text-primary",
                        )}
                      />
                      <div className="min-w-0 flex-1 space-y-1 text-xs">
                        <div className="font-bold text-foreground">
                          {isAr
                            ? "درع حماية الكنترول المعتمد (مفعّل افتراضيًا)"
                            : "Approved Control Shield (Enabled by Default)"}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {isAr
                            ? "الدرجات المرتبطة بشيتات كنترول معتمدة أو مقفولة أو قيد المراجعة محمية تلقائيًا من المسح. كما لا يُحذف سجل التدقيق (grade_audit_logs) أبدًا."
                            : "Grades tied to IN_REVIEW, PENDING_APPROVAL, APPROVED, or locked Control sheets are protected automatically. Audit logs are never deleted."}
                        </p>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-foreground cursor-pointer">
                      <Checkbox
                        checked={includeApprovedControl}
                        onCheckedChange={(val) =>
                          setIncludeApprovedControl(Boolean(val))
                        }
                      />
                      <span>
                        {isAr
                          ? "تضمين درجات وشيتات الكنترول المعتمدة ضمن المسح (إجراء متقدم)"
                          : "Include approved Control grades & linked sheets in wipe (advanced)"}
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* QUIZZES FILTERS */}
              {target === "quizzes" && (
                <div className="space-y-3.5 rounded-xl border border-border/60 bg-secondary/20 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-foreground">
                        {isAr ? "نطاق مسح الكويزات" : "Quizzes Scope"}
                      </label>
                      <Select
                        value={quizScope}
                        onValueChange={(v) => setQuizScope(v as QuizWipeScope)}
                      >
                        <SelectTrigger className="h-9 rounded-squircle bg-card/85 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir={dir}>
                          <SelectItem value="everything">
                            {isAr
                              ? "الكل (الكويزات + التسليمات + القديم)"
                              : "Everything (New + Legacy)"}
                          </SelectItem>
                          <SelectItem value="attempts_and_submissions">
                            {isAr
                              ? "تسليمات ومحاولات الطلاب فقط (إبقاء الأسئلة)"
                              : "Attempts & Submissions Only (Keep Quizzes)"}
                          </SelectItem>
                          <SelectItem value="all_quizzes_and_submissions">
                            {isAr
                              ? "الكويزات الإلكترونية وتسليماتها بالكامل"
                              : "Online Quizzes + Attempts + Submissions"}
                          </SelectItem>
                          <SelectItem value="legacy_course_quizzes">
                            {isAr
                              ? "كويزات شيتات الإكسيل القديمة فقط"
                              : "Legacy Excel Course Quizzes Only"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-foreground">
                        {isAr ? "الفصل الدراسي" : "Semester"}
                      </label>
                      <Select
                        value={semester}
                        onValueChange={(v) => setSemester(v as WipeSemester)}
                      >
                        <SelectTrigger className="h-9 rounded-squircle bg-card/85 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir={dir}>
                          <SelectItem value="all">
                            {isAr ? "كل الفصول" : "All Semesters"}
                          </SelectItem>
                          <SelectItem value="first">
                            {isAr ? "الترم الأول" : "First Semester"}
                          </SelectItem>
                          <SelectItem value="second">
                            {isAr ? "الترم الثاني" : "Second Semester"}
                          </SelectItem>
                          <SelectItem value="summer">
                            {isAr ? "الصيفي" : "Summer Semester"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {(summary?.quizAcademicYears.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <span className="block text-xs font-bold text-foreground">
                        {isAr ? "تصفية بالسنة الدراسية" : "Filter by Academic Year"}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedYears([])}
                          className={cn(
                            "rounded-squircle border px-2.5 py-1 text-xs font-semibold cursor-pointer",
                            selectedYears.length === 0
                              ? "border-primary/50 bg-primary/15 text-primary"
                              : "border-border/70 bg-card/85 text-muted-foreground",
                          )}
                        >
                          {isAr ? "كل السنوات" : "All Years"}
                        </button>
                        {summary?.quizAcademicYears.map((year) => {
                          const active = selectedYears.includes(year);
                          return (
                            <button
                              key={year}
                              type="button"
                              onClick={() => toggleYear(year)}
                              className={cn(
                                "rounded-squircle border px-2.5 py-1 font-mono text-xs font-semibold cursor-pointer",
                                active
                                  ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
                                  : "border-border/70 bg-card/85 text-foreground",
                              )}
                            >
                              <bdi>{year}</bdi>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ATTENDANCE FILTERS */}
              {target === "attendance" && (
                <div className="space-y-3.5 rounded-xl border border-border/60 bg-secondary/20 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-foreground">
                        {isAr ? "نطاق مسح الحضور" : "Attendance Scope"}
                      </label>
                      <Select
                        value={attendanceScope}
                        onValueChange={(v) =>
                          setAttendanceScope(v as AttendanceWipeScope)
                        }
                      >
                        <SelectTrigger className="h-9 rounded-squircle bg-card/85 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir={dir}>
                          <SelectItem value="everything">
                            {isAr
                              ? "الكل (جلسات QR + السجلات القديمة)"
                              : "Everything (QR + Legacy)"}
                          </SelectItem>
                          <SelectItem value="qr_sessions_and_records">
                            {isAr
                              ? "جلسات وسجلات حضور QR فقط"
                              : "QR Sessions & Check-ins Only"}
                          </SelectItem>
                          <SelectItem value="legacy_attendance">
                            {isAr
                              ? "سجلات الحضور القديمة (إكسيل) فقط"
                              : "Legacy Excel Attendance Only"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-foreground">
                        {isAr ? "الفصل الدراسي" : "Semester"}
                      </label>
                      <Select
                        value={semester}
                        onValueChange={(v) => setSemester(v as WipeSemester)}
                      >
                        <SelectTrigger className="h-9 rounded-squircle bg-card/85 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir={dir}>
                          <SelectItem value="all">
                            {isAr ? "كل الفصول" : "All Semesters"}
                          </SelectItem>
                          <SelectItem value="first">
                            {isAr ? "الترم الأول" : "First Semester"}
                          </SelectItem>
                          <SelectItem value="second">
                            {isAr ? "الترم الثاني" : "Second Semester"}
                          </SelectItem>
                          <SelectItem value="summer">
                            {isAr ? "الصيفي" : "Summer Semester"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {(summary?.attendanceAcademicYears.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <span className="block text-xs font-bold text-foreground">
                        {isAr ? "تصفية بالسنة الدراسية" : "Filter by Academic Year"}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedYears([])}
                          className={cn(
                            "rounded-squircle border px-2.5 py-1 text-xs font-semibold cursor-pointer",
                            selectedYears.length === 0
                              ? "border-primary/50 bg-primary/15 text-primary"
                              : "border-border/70 bg-card/85 text-muted-foreground",
                          )}
                        >
                          {isAr ? "كل السنوات" : "All Years"}
                        </button>
                        {summary?.attendanceAcademicYears.map((year) => {
                          const active = selectedYears.includes(year);
                          return (
                            <button
                              key={year}
                              type="button"
                              onClick={() => toggleYear(year)}
                              className={cn(
                                "rounded-squircle border px-2.5 py-1 font-mono text-xs font-semibold cursor-pointer",
                                active
                                  ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
                                  : "border-border/70 bg-card/85 text-foreground",
                              )}
                            >
                              <bdi>{year}</bdi>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/85 p-3 text-xs font-semibold text-foreground cursor-pointer">
                    <Checkbox
                      checked={includeOpenAttendanceSessions}
                      onCheckedChange={(v) =>
                        setIncludeOpenAttendanceSessions(Boolean(v))
                      }
                    />
                    <span>
                      {isAr
                        ? "تضمين جلسات حضور QR المفتوحة حاليًا (محمية افتراضيًا)"
                        : "Include currently OPEN live QR sessions (protected by default)"}
                    </span>
                  </label>
                </div>
              )}

              {/* COMPLAINTS FILTERS */}
              {target === "complaints" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border/60 bg-secondary/20 p-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-foreground">
                      {isAr ? "حالة الشكاوى" : "Ticket Status Scope"}
                    </label>
                    <Select
                      value={complaintScope}
                      onValueChange={(v) =>
                        setComplaintScope(v as ComplaintWipeScope)
                      }
                    >
                      <SelectTrigger className="h-9 rounded-squircle bg-card/85 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir={dir}>
                        <SelectItem value="resolved_and_closed">
                          {isAr
                            ? "المحلولة والمغلقة فقط"
                            : "Resolved & Closed Only"}
                        </SelectItem>
                        <SelectItem value="all">
                          {isAr
                            ? "جميع الشكاوى (شامل المفتوحة)"
                            : "All Complaints (Including Open)"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-foreground">
                      {isAr
                        ? "الأقدم من تاريخ (اختياري)"
                        : "Created Before Date (Optional)"}
                    </label>
                    <DatePicker
                      value={olderThan}
                      onChange={setOlderThan}
                      locale={locale}
                      className="h-9 bg-card/85"
                    />
                  </div>
                </div>
              )}

              {/* STUDENTS FILTERS */}
              {target === "students" && (
                <div className="space-y-2.5 rounded-xl border border-border/60 bg-secondary/20 p-4">
                  <span className="block text-xs font-bold text-foreground">
                    {isAr
                      ? "تصفية بالفرقة الدراسية (أو الكل)"
                      : "Filter by Academic Level (or All)"}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedLevels([])}
                      className={cn(
                        "rounded-squircle border px-2.5 py-1 text-xs font-semibold cursor-pointer",
                        selectedLevels.length === 0
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : "border-border/70 bg-card/85 text-muted-foreground",
                      )}
                    >
                      {isAr ? "جميع الفرق" : "All Levels"}
                    </button>
                    {summary?.availableLevels.map((lvl) => {
                      const active = selectedLevels.includes(lvl.level);
                      return (
                        <button
                          key={lvl.level}
                          type="button"
                          onClick={() => toggleLevel(lvl.level)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-squircle border px-2.5 py-1 text-xs font-semibold cursor-pointer",
                            active
                              ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
                              : "border-border/70 bg-card/85 text-foreground",
                          )}
                        >
                          <span>
                            {isAr
                              ? `الفرقة ${lvl.level}`
                              : `Level ${lvl.level}`}
                          </span>
                          <span className="text-[10px] opacity-75">
                            (<bdi>{fmtNum.format(lvl.count)}</bdi>)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ALL DATA WARNING */}
              {target === "all" && (
                <div className="rounded-xl border border-rose-500/35 bg-rose-500/[0.08] p-4 space-y-1.5 text-xs">
                  <div className="font-bold text-rose-300 flex items-center gap-1.5">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>
                      {isAr
                        ? "تهيئة شاملة لجميع البيانات الأكاديمية"
                        : "Full Academic Dataset Reset"}
                    </span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    {isAr
                      ? "سيتم مسح حسابات الطلاب، الدرجات، الكويزات وتسليماتها، جلسات وسجلات الحضور، الشكاوى، وشيتات الكنترول. سيظل الأدمن والستاف والمقررات وإعدادات النظام وسجلات التدقيق التاريخية آمنة دون مساس."
                      : "Removes student accounts, grades, quizzes & submissions, QR/legacy attendance, complaints, and Control sheets. Admins, staff, courses, settings, and append-only audit logs remain untouched."}
                  </p>
                </div>
              )}

              {/* LIVE DRY-RUN PREVIEW PANEL */}
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-foreground">
                    {isAr
                      ? "المعاينة المباشرة قبل المسح (Dry-Run)"
                      : "Live Dry-Run Preview"}
                  </span>
                  {previewQuery.isFetching && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-primary">
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>{isAr ? "جاري الحساب..." : "Calculating..."}</span>
                    </span>
                  )}
                </div>

                {preview ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="rounded-xl border border-rose-500/35 bg-rose-500/[0.08] p-3 text-center">
                        <div className="text-[11px] font-semibold text-rose-300">
                          {isAr ? "سيتم مسحه" : "Will Be Deleted"}
                        </div>
                        <div className="mt-1 font-mono text-xl font-extrabold tabular-nums text-rose-300">
                          <bdi>{fmtNum.format(preview.totalToDelete)}</bdi>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/60 bg-card/85 p-3 text-center">
                        <div className="text-[11px] font-semibold text-muted-foreground">
                          {isAr ? "الطلاب المتأثرون" : "Affected Students"}
                        </div>
                        <div className="mt-1 font-mono text-xl font-extrabold tabular-nums text-primary">
                          <bdi>
                            {fmtNum.format(preview.affectedStudentsCount)}
                          </bdi>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/60 bg-card/85 p-3 text-center">
                        <div className="text-[11px] font-semibold text-muted-foreground">
                          {isAr ? "سيبقى آمنًا" : "Remaining Safe"}
                        </div>
                        <div className="mt-1 font-mono text-xl font-extrabold tabular-nums text-foreground">
                          <bdi>{fmtNum.format(preview.remainingSafeCount)}</bdi>
                        </div>
                      </div>
                    </div>

                    {/* Protection Notice */}
                    {preview.protectedControlGradesCount > 0 &&
                      !includeApprovedControl && (
                        <div className="flex items-center gap-2 rounded-xl border border-primary/35 bg-primary/[0.08] px-3 py-2 text-xs text-primary">
                          <ShieldCheck className="size-4 shrink-0" />
                          <span>
                            {isAr
                              ? `تمت حماية ${fmtNum.format(preview.protectedControlGradesCount)} درجة (${fmtNum.format(preview.protectedControlSheetsCount)} شيت كنترول معتمد/مقفول) ولن تُمسح.`
                              : `Protected ${fmtNum.format(preview.protectedControlGradesCount)} grades (${fmtNum.format(preview.protectedControlSheetsCount)} Control sheets) — excluded from wipe.`}
                          </span>
                        </div>
                      )}

                    {preview.protectedOpenSessionsCount > 0 &&
                      !includeOpenAttendanceSessions && (
                        <div className="flex items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-300">
                          <ShieldCheck className="size-4 shrink-0" />
                          <span>
                            {isAr
                              ? `تم استثناء ${fmtNum.format(preview.protectedOpenSessionsCount)} جلسة حضور QR مفتوحة حاليًا لحمايتها.`
                              : `Protected ${fmtNum.format(preview.protectedOpenSessionsCount)} currently OPEN QR attendance sessions.`}
                          </span>
                        </div>
                      )}

                    {/* Detailed Breakdown */}
                    <div className="flex flex-wrap gap-1.5">
                      {preview.breakdown.map((item) => (
                        <span
                          key={item.key}
                          className="inline-flex items-center gap-1.5 rounded-squircle border border-border/65 bg-card/85 px-2.5 py-1 text-[11px]"
                        >
                          <span className="text-muted-foreground">
                            {isAr ? item.labelAr : item.labelEn}:
                          </span>
                          <bdi className="font-mono font-bold text-foreground">
                            {fmtNum.format(item.count)}
                          </bdi>
                        </span>
                      ))}
                      {preview.examTypeBreakdown?.map((item) => {
                        const meta =
                          EXAM_TYPE_LABELS[item.examType as GradeWipeExamType];
                        return (
                          <span
                            key={`type-${item.examType}`}
                            className="inline-flex items-center gap-1.5 rounded-squircle border border-rose-500/25 bg-rose-500/[0.06] px-2.5 py-1 text-[11px]"
                          >
                            <span className="text-rose-300">
                              {meta ? (isAr ? meta.ar : meta.en) : item.examType}
                              :
                            </span>
                            <bdi className="font-mono font-bold text-foreground">
                              {fmtNum.format(item.count)}
                            </bdi>
                          </span>
                        );
                      })}
                    </div>
                  </>
                ) : previewQuery.isError ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/35 bg-rose-500/[0.08] px-3 py-2.5 text-xs text-rose-300">
                    <span>
                      {getApiErrorMessage(
                        previewQuery.error,
                        isAr
                          ? "تعذر حساب معاينة المسح. يرجى المحاولة مرة أخرى."
                          : "Failed to load dry-run preview. Please try again.",
                      )}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void previewQuery.refetch()}
                      className="h-auto min-h-8 rounded-squircle px-2.5 py-1 text-[11px]"
                    >
                      {isAr ? "إعادة المحاولة" : "Retry"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* STEP 3: Final Confirmation or Completion Summary */}
          {step === 3 && !completedResult && (
            <div className="space-y-4">
              <div className="rounded-xl border border-rose-500/35 bg-rose-500/[0.08] p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="size-5 shrink-0 text-rose-400 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <div className="font-extrabold text-rose-300">
                      {isAr
                        ? "تحذير نهائي — لا يمكن التراجع عن هذا الإجراء"
                        : "Final Warning — Irreversible Action"}
                    </div>
                    <p className="text-muted-foreground leading-relaxed">
                      {isAr
                        ? `سيتم حذف ${fmtNum.format(preview?.totalToDelete ?? 0)} سجل بشكل دائم ضمن قسم «${targetMeta.ar}».`
                        : `${fmtNum.format(preview?.totalToDelete ?? 0)} records under "${targetMeta.en}" will be permanently deleted.`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {activeFilterSummaryChips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-squircle border border-border/70 bg-card/85 px-2.5 py-1 text-[11px] font-semibold text-foreground"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border/60 bg-secondary/20 p-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="wipe-audit-reason"
                    className="block text-xs font-bold text-foreground"
                  >
                    {isAr
                      ? "سبب عملية المسح (اختياري — يُحفظ في سجل النظام)"
                      : "Audit Reason (Optional — Recorded in Server Logs)"}
                  </label>
                  <Input
                    id="wipe-audit-reason"
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={
                      isAr
                        ? "مثال: تفريغ درجات سنة 2023-2024 القديمة قبل إعادة الاستيراد..."
                        : "e.g. Clearing legacy 2023-2024 grades before clean import..."
                    }
                    className="h-10 rounded-squircle bg-card/85 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="wipe-confirm-input"
                    className="block text-xs font-bold text-foreground"
                  >
                    {isAr
                      ? 'لتأكيد المسح الدائم، اكتب كلمة "مسح" بالأسفل:'
                      : 'Type "DELETE" below to confirm permanent deletion:'}
                  </label>
                  <Input
                    id="wipe-confirm-input"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={
                      isAr ? 'اكتب "مسح" للتأكيد' : 'Type "DELETE" to confirm'
                    }
                    className="h-10 rounded-squircle bg-card/85 text-center text-xs font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* COMPLETION SUMMARY */}
          {step === 3 && completedResult && (
            <div className="rounded-xl border border-primary/35 bg-secondary/20 p-5 text-center space-y-3">
              <div className="mx-auto flex size-12 items-center justify-center rounded-squircle border border-primary/35 bg-primary/15 text-primary">
                <CheckCircle2 className="size-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-foreground">
                  {isAr
                    ? "تم تنفيذ المسح والتهيئة بنجاح"
                    : "Data Wipe Completed Successfully"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? `تم حذف ${fmtNum.format(completedResult.totalDeleted)} سجل وتحديث الكاش تلقائيًا.`
                    : `Removed ${fmtNum.format(completedResult.totalDeleted)} records and invalidated caches.`}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                {Object.entries(completedResult.deletedCounts)
                  .filter(([, count]) => count > 0)
                  .map(([key, count]) => {
                    const labelMeta = DELETED_COUNT_LABELS[key];
                    const labelText = labelMeta
                      ? isAr
                        ? labelMeta.ar
                        : labelMeta.en
                      : key;
                    return (
                      <span
                        key={key}
                        className="rounded-squircle border border-border/70 bg-card/85 px-2.5 py-1 text-[11px]"
                      >
                        <span className="text-muted-foreground">
                          {labelText}:{" "}
                        </span>
                        <bdi className="font-mono font-bold text-foreground">
                          {fmtNum.format(count)}
                        </bdi>
                      </span>
                    );
                  })}
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {completedResult ? (
            <Button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="h-auto min-h-9 whitespace-normal rounded-squircle px-4 py-2 text-xs font-bold cursor-pointer"
            >
              {isAr ? "إغلاق" : "Done"}
            </Button>
          ) : step === 1 ? (
            <>
              <Button
                type="button"
                disabled={summaryQuery.isLoading}
                onClick={() => setStep(2)}
                className="h-auto min-h-9 whitespace-normal rounded-squircle px-4 py-2 text-xs font-bold gap-1.5 cursor-pointer"
              >
                <span>{isAr ? "تخصيص النطاق" : "Configure Scope"}</span>
                {isAr ? (
                  <ArrowLeft className="size-3.5 shrink-0" />
                ) : (
                  <ArrowRight className="size-3.5 shrink-0" />
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="h-auto min-h-9 whitespace-normal rounded-squircle px-4 py-2 text-xs cursor-pointer"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            </>
          ) : step === 2 ? (
            <>
              <Button
                type="button"
                disabled={
                  previewQuery.isFetching || (preview?.totalToDelete ?? 0) === 0
                }
                onClick={() => setStep(3)}
                className="h-auto min-h-9 whitespace-normal rounded-squircle bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 text-xs font-bold gap-1.5 cursor-pointer"
              >
                <span>
                  {isAr ? "متابعة للتأكيد النهائي" : "Continue to Confirmation"}
                </span>
                {isAr ? (
                  <ArrowLeft className="size-3.5 shrink-0" />
                ) : (
                  <ArrowRight className="size-3.5 shrink-0" />
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="h-auto min-h-9 whitespace-normal rounded-squircle px-4 py-2 text-xs gap-1.5 cursor-pointer"
              >
                {isAr ? (
                  <ArrowRight className="size-3.5 shrink-0" />
                ) : (
                  <ArrowLeft className="size-3.5 shrink-0" />
                )}
                <span>{isAr ? "رجوع للأقسام" : "Back"}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                className="h-auto min-h-9 whitespace-normal rounded-squircle px-3 py-2 text-xs cursor-pointer"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                disabled={
                  wipeMutation.isPending ||
                  !isConfirmMatch ||
                  (preview?.totalToDelete ?? 0) === 0
                }
                onClick={() => wipeMutation.mutate()}
                className="h-auto min-h-9 whitespace-normal rounded-squircle bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 text-xs font-bold gap-1.5 cursor-pointer"
              >
                {wipeMutation.isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin shrink-0" />
                    <span>{isAr ? "جاري المسح..." : "Wiping..."}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="size-3.5 shrink-0" />
                    <span>
                      {isAr ? "تأكيد مسح البيانات" : "Confirm Wipe"}
                    </span>
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={wipeMutation.isPending}
                onClick={() => setStep(2)}
                className="h-auto min-h-9 whitespace-normal rounded-squircle px-4 py-2 text-xs gap-1.5 cursor-pointer"
              >
                {isAr ? (
                  <ArrowRight className="size-3.5 shrink-0" />
                ) : (
                  <ArrowLeft className="size-3.5 shrink-0" />
                )}
                <span>{isAr ? "تعديل النطاق" : "Edit Scope"}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={wipeMutation.isPending}
                onClick={() => handleOpenChange(false)}
                className="h-auto min-h-9 whitespace-normal rounded-squircle px-3 py-2 text-xs cursor-pointer"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
