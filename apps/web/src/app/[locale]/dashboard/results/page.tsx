"use client";
import { useState } from "react";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import api, { getApiErrorMessage } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/feedback";
import {
  Award,
  FileSpreadsheet,
  CheckSquare,
  Printer,
  Download,
  GraduationCap,
  BookOpen,
  Percent,
  AlertTriangle,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  downloadResultCertificatePdf,
  openResultCertificate,
  type ResultCertificateData,
} from "@/lib/result-certificate";
import {
  calculateGradeScale,
  getGpaScale,
  type GradeStatus,
} from "@student-portal/shared";
import { getStudentResultsStatus } from "@/features/grades/api";

interface Grade {
  _id: string;
  courseCode: string;
  courseName: string;
  examType: "midterm" | "final" | "coursework";
  officialResult?: {
    official: boolean;
    total: number | null;
    totalMax: number;
    percentage: number | null;
    passed: boolean;
    gradePoints: number | null;
    letterGrade: string;
  };
  grade: number;
  maxGrade: number;
  status: GradeStatus;
  academicYear: string;
  semester: string;
  isPublished: boolean;
  creditHours?: number;
  academicLevel: "1" | "2" | "3" | "4";
  courseNameAr?: string;
  courseNameEn?: string;
}

interface CourseGradesGroup {
  courseCode: string;
  courseName: string;
  academicYear: string;
  semester: string;
  creditHours: number;
  academicLevel: "1" | "2" | "3" | "4";
  officialResult?: Grade["officialResult"];
  coursework?: { grade: number; maxGrade: number; status: string };
  midterm?: { grade: number; maxGrade: number; status: string };
  final?: { grade: number; maxGrade: number; status: string };
}

interface StudentAcademicSummary {
  academicWarnings?: number;
  level: string;
  gpa?: number;
  completedCreditHours?: number;
  completedCoursesCount?: number;
}

function calculateGroupStats(groups: CourseGradesGroup[]) {
  let acquired = 0;
  let maximum = 0;
  let passed = 0;
  let weightedPoints = 0;
  let credits = 0;

  for (const group of groups) {
    const midterm =
      group.midterm?.status === "present" ? group.midterm.grade : 0;
    const final = group.final?.status === "present" ? group.final.grade : 0;
    const maxMidterm = group.midterm?.maxGrade ?? 0;
    const maxFinal = group.final?.maxGrade ?? 0;
    const maxTotal =
      group.officialResult?.totalMax ??
      maxMidterm + maxFinal + (group.coursework?.maxGrade ?? 0);
    const total =
      group.officialResult?.total ??
      midterm + final + (group.coursework?.grade ?? 0);
    const percentage = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
    if (group.officialResult?.official) {
      acquired += total;
      maximum += maxTotal;
    }
    const scale = calculateGradeScale(percentage, group.final?.status);
    if (group.officialResult?.official && group.officialResult.passed)
      passed += 1;
    if (group.officialResult?.official) {
      weightedPoints +=
        (group.officialResult?.gradePoints ?? scale.points) * group.creditHours;
      credits += group.creditHours;
    }
  }

  return {
    acquired,
    maximum,
    passed,
    percentage: maximum > 0 ? Math.round((acquired / maximum) * 100) : 0,
    gpa: credits > 0 ? Math.round((weightedPoints / credits) * 100) / 100 : 0,
  };
}

export default function StudentResultsPage() {
  const t = useTranslations("studentPortal");
  const tCommon = useTranslations("common");
  const tRelease = useTranslations("controlRelease");
  const tControl = useTranslations("control");
  const params = useParams();
  const locale = params.locale === "en" ? "en" : "ar";
  const isEnglish = locale === "en";
  const { user } = useAuth();
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [selectedLevel, setSelectedLevel] = React.useState("");

  const resultsQuery = useQuery({
    queryKey: ["student-results"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await api.get<Grade[]>("/students/me/results");
      return res.data;
    },
  });

  const profileQuery = useQuery({
    queryKey: ["student-profile"],
    queryFn: async () => {
      const res = await api.get<StudentAcademicSummary>("/students/me/profile");
      return res.data;
    },
  });

  const statusQuery = useQuery({
    queryKey: ["student-results-status"],
    queryFn: getStudentResultsStatus,
    refetchInterval: 60_000,
  });

  const [visibilityNow, setVisibilityNow] = useState(() => Date.now());
  const statusRefetch = statusQuery.refetch;
  const resultsRefetch = resultsQuery.refetch;
  const previousVisibilityVersion = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const version = statusQuery.data?.visibilityVersion;
    if (!version) return;
    if (
      previousVisibilityVersion.current &&
      previousVisibilityVersion.current !== version
    ) {
      void resultsRefetch();
    }
    previousVisibilityVersion.current = version;
  }, [statusQuery.data?.visibilityVersion, resultsRefetch]);
  React.useEffect(() => {
    const next = [statusQuery.data?.openAt, statusQuery.data?.closeAt]
      .filter((value): value is string => Boolean(value))
      .map((value) => Date.parse(value))
      .filter((value) => value > visibilityNow)
      .sort((a, b) => a - b)[0];
    if (!next) return;
    const timer = setTimeout(
      () => {
        setVisibilityNow(Date.now());
        void statusRefetch();
        void resultsRefetch();
      },
      Math.min(Math.max(0, next - Date.now()), 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [
    statusQuery.data?.openAt,
    statusQuery.data?.closeAt,
    visibilityNow,
    statusRefetch,
    resultsRefetch,
  ]);

  const resultLevels = React.useMemo(
    () =>
      [
        ...new Set(
          (resultsQuery.data ?? []).map((grade) => grade.academicLevel),
        ),
      ].sort((a, b) => Number(a) - Number(b)),
    [resultsQuery.data],
  );
  const availableLevels = React.useMemo(() => {
    const levels = new Set(resultLevels);
    if (profileQuery.data?.level)
      levels.add(profileQuery.data.level as Grade["academicLevel"]);
    return [...levels].sort((a, b) => Number(a) - Number(b));
  }, [profileQuery.data?.level, resultLevels]);

  const [previousLevelInputs, setPreviousLevelInputs] = useState<
    unknown[] | null
  >(null);
  if (
    previousLevelInputs === null ||
    previousLevelInputs.some(
      (value, index) =>
        !Object.is(
          value,
          [
            availableLevels,
            profileQuery.data?.level,
            resultLevels,
            selectedLevel,
            resultsQuery.isLoading,
            profileQuery.isLoading,
          ][index],
        ),
    )
  ) {
    setPreviousLevelInputs([
      availableLevels,
      profileQuery.data?.level,
      resultLevels,
      selectedLevel,
      resultsQuery.isLoading,
      profileQuery.isLoading,
    ]);
    (() => {
      // Choose the initial result level only after both sources have settled.
      // A profile-first response must not pin a student to an empty current level.
      if (resultsQuery.isLoading || profileQuery.isLoading) return;
      if (
        selectedLevel &&
        availableLevels.includes(selectedLevel as Grade["academicLevel"])
      )
        return;
      const current = profileQuery.data?.level;
      const targetLevel =
        resultLevels.length > 0 &&
        current &&
        resultLevels.includes(current as Grade["academicLevel"])
          ? current
          : resultLevels.at(-1) || current || availableLevels.at(-1) || "1";
      setSelectedLevel(targetLevel);
    })();
  }

  if (
    resultsQuery.isLoading ||
    statusQuery.isLoading ||
    profileQuery.isLoading
  ) {
    return <LoadingState title={tCommon("loading")} />;
  }

  if (resultsQuery.isError) {
    return (
      <ErrorState
        description={getApiErrorMessage(resultsQuery.error)}
        error={resultsQuery.error}
        onRetry={() => resultsQuery.refetch()}
      />
    );
  }

  const deadlineEnded = Boolean(
    statusQuery.data?.closeAt &&
    visibilityNow >= Date.parse(statusQuery.data.closeAt),
  );
  const statusData =
    deadlineEnded && statusQuery.data
      ? { ...statusQuery.data, isOpen: false, reason: "ended" as const }
      : statusQuery.data;
  const grades = statusData?.isOpen
    ? (resultsQuery.data ?? []).filter(
        (grade) => grade.examType === "midterm" || grade.examType === "final",
      )
    : [];

  if (grades.length === 0) {
    let emptyTitle = isEnglish ? "No published results" : "النتائج لم تعلن بعد";
    let emptyDesc = isEnglish
      ? "Your semester results have not been published by the administration yet."
      : "لم يتم نشر نتائج الفصل الدراسي الخاصة بك من قبل الإدارة بعد.";

    if (statusData?.reason === "not_started" && statusData.openAt) {
      const openDate = new Date(statusData.openAt).toLocaleString(
        isEnglish ? "en-US" : "ar-EG",
      );
      emptyTitle = isEnglish
        ? "Results Schedule: Opening Soon"
        : "إعلان النتائج: سيبدأ قريباً";
      emptyDesc = isEnglish
        ? `Results portal is scheduled to open on: ${openDate}`
        : `من المقرر فتح بوابة استعلام النتائج في: ${openDate}`;
    } else if (statusData?.reason === "ended" && statusData.closeAt) {
      const closeDate = new Date(statusData.closeAt).toLocaleString(
        isEnglish ? "en-US" : "ar-EG",
      );
      emptyTitle = isEnglish
        ? "Results Inquiry Window Closed"
        : "انتهت فترة استعلام النتائج";
      emptyDesc = isEnglish
        ? `The official viewing period concluded on: ${closeDate}`
        : `انتهت الفترة الرسمية المحددة لعرض النتائج في: ${closeDate}`;
    } else if (statusData?.reason === "tuition_blocked") {
      emptyTitle = isEnglish
        ? "Results withheld due to unpaid tuition fees"
        : "النتيجة محجوبة بسبب عدم سداد المصروفات الدراسية";
      emptyDesc = isEnglish
        ? "Please contact Student Affairs about payment and removal of the hold. Once the hold is removed, published results will be available during the viewing window."
        : "يرجى مراجعة شؤون الطلاب لسداد المصروفات ورفع الحجب. بعد رفع الحجب، تظهر النتائج المنشورة خلال فترة إتاحتها.";
    } else if (statusData?.reason === "student_blocked") {
      emptyTitle = isEnglish ? "Results withheld" : "النتيجة محجوبة";
      emptyDesc = isEnglish
        ? "Please contact Student Affairs to review and remove the hold on your account."
        : "يرجى مراجعة شؤون الطلاب لمعرفة سبب الحجب ورفعه عن حسابك.";
    } else if (statusData?.reason === "level_not_published") {
      emptyTitle = isEnglish
        ? "Results hidden for your current level"
        : "عرض النتائج غير متاح لمستواك الحالي";
      emptyDesc = isEnglish
        ? `The administration has not enabled viewing for your current level (${statusData.studentLevel}). This setting is separate from course approval.`
        : `إعدادات الإتاحة لا تسمح بعرض النتائج لمستواك الحالي (${statusData.studentLevel}). هذا الإعداد منفصل عن اعتماد درجات المقرر.`;
    } else if (statusData?.reason === "system_closed") {
      emptyTitle = isEnglish
        ? "Results Portal Offline"
        : "نظام النتائج مغلق حالياً";
      emptyDesc = isEnglish
        ? "The academic administration has temporarily closed results inquiry."
        : "تم إيقاف عرض نتائج الطلاب مؤقتاً بقرار من الشؤون الأكاديمية.";
    }

    return (
      <div
        className="mx-auto max-w-4xl space-y-6"
        dir={isEnglish ? "ltr" : "rtl"}
      >
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Award className="h-6 w-6 text-primary" />
            <span>{t("results")}</span>
          </h2>
        </div>
        <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
          <EmptyState title={emptyTitle} description={emptyDesc} />
        </Card>
      </div>
    );
  }

  // Group grades by course code
  const groups: Record<string, CourseGradesGroup> = {};
  grades.forEach((g) => {
    const groupKey = `${g.academicLevel}:${g.academicYear}:${g.semester}:${g.courseCode}`;
    if (!groups[groupKey]) {
      groups[groupKey] = {
        courseCode: g.courseCode,
        courseName:
          (isEnglish ? g.courseNameEn : g.courseNameAr) || g.courseName,
        academicYear: g.academicYear,
        semester: g.semester,
        creditHours: g.creditHours ?? 1,
        academicLevel: g.academicLevel,
      };
    }
    if (g.examType === "midterm") {
      groups[groupKey].midterm = {
        grade: g.grade,
        maxGrade: g.maxGrade,
        status: g.status,
      };
    } else if (g.examType === "coursework") {
      groups[groupKey].coursework = {
        grade: g.grade,
        maxGrade: g.maxGrade,
        status: g.status,
      };
    } else if (g.examType === "final") {
      groups[groupKey].officialResult = g.officialResult;
      groups[groupKey].final = {
        grade: g.grade,
        maxGrade: g.maxGrade,
        status: g.status,
      };
    }
  });

  const groupedList = Object.values(groups);

  const cumulativeStats = calculateGroupStats(groupedList);
  const totalAcquired = cumulativeStats.acquired;
  const totalMax = cumulativeStats.maximum;
  const passedCourses = cumulativeStats.passed;
  const cumulativePercentage = cumulativeStats.percentage;
  const officialGpa =
    typeof profileQuery.data?.gpa === "number" ? profileQuery.data.gpa : 0;
  const officialGpaScale = getGpaScale(officialGpa);
  const officialCompletedCredits =
    typeof profileQuery.data?.completedCreditHours === "number"
      ? profileQuery.data.completedCreditHours
      : passedCourses * 3;
  const selectedLevelGroups = groupedList.filter(
    (group) => group.academicLevel === selectedLevel,
  );
  const selectedLevelStats = calculateGroupStats(selectedLevelGroups);
  // Keep the selected columns even when that component has no published release
  // yet. Existing rows also cover authorized course/student visibility overrides.
  const showMidterm =
    Boolean(statusData?.visibleExamTypes?.includes("midterm")) ||
    selectedLevelGroups.some((course) => Boolean(course.midterm));
  const showFinal =
    Boolean(statusData?.visibleExamTypes?.includes("final")) ||
    selectedLevelGroups.some((course) => Boolean(course.final));
  const showTotal = true;
  const columnCount =
    2 + Number(showMidterm) + Number(showFinal) + Number(showTotal);
  const semesterSections = (["first", "second", "summer"] as const)
    .map((semester) => {
      const semesterGroups = selectedLevelGroups
        .filter((group) => group.semester === semester)
        .sort((a, b) =>
          a.academicYear === b.academicYear
            ? a.courseCode.localeCompare(b.courseCode)
            : a.academicYear.localeCompare(b.academicYear),
        );
      return {
        semester,
        groups: semesterGroups,
        stats: calculateGroupStats(semesterGroups),
        academicYears: [
          ...new Set(semesterGroups.map((group) => group.academicYear)),
        ],
      };
    })
    .filter((section) => section.groups.length > 0);

  const semesterName = (semester: string) => {
    if (isEnglish) {
      if (semester === "first") return "First Semester";
      if (semester === "second") return "Second Semester";
      return "Summer Semester";
    }
    if (semester === "first") return "الفصل الدراسي الأول";
    if (semester === "second") return "الفصل الدراسي الثاني";
    return "الفصل الدراسي الصيفي";
  };

  const semesterValue = groupedList[0]?.semester ?? "";
  const semesterLabel = isEnglish
    ? semesterValue === "first"
      ? "First Semester"
      : semesterValue === "second"
        ? "Second Semester"
        : "Summer Semester"
    : semesterValue === "first"
      ? "الفصل الدراسي الأول"
      : semesterValue === "second"
        ? "الفصل الدراسي الثاني"
        : "الفصل الدراسي الصيفي";

  const certificateData: ResultCertificateData = {
    locale,
    studentName: user?.name ?? (isEnglish ? "Student" : "الطالب"),
    studentCode: user?.studentCode ?? "—",
    academicYear: groupedList[0]?.academicYear ?? "—",
    semester: semesterLabel,
    totalAcquired,
    totalMax,
    percentage: cumulativePercentage,
    gpa: officialGpa,
    overallGradeLetter: officialGpaScale.letter,
    overallGradeName: isEnglish
      ? officialGpaScale.nameEn
      : officialGpaScale.nameAr,
    passedCourses,
    issuedAt: new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
      dateStyle: "long",
    }).format(new Date()),
    visibleComponents: {
      midterm:
        Boolean(statusData?.visibleExamTypes?.includes("midterm")) ||
        groupedList.some((course) => Boolean(course.midterm)),
      final:
        Boolean(statusData?.visibleExamTypes?.includes("final")) ||
        groupedList.some((course) => Boolean(course.final)),
      total: true,
    },
    courses: groupedList.map((course) => {
      const midtermGrade =
        course.midterm?.status === "present" ? course.midterm.grade : 0;
      const finalGrade =
        course.final?.status === "present" ? course.final.grade : 0;
      const maxMidterm = course.midterm?.maxGrade ?? 0;
      const maxFinal = course.final?.maxGrade ?? 0;
      const total =
        course.officialResult?.total ??
        midtermGrade + finalGrade + (course.coursework?.grade ?? 0);
      const maxTotal =
        course.officialResult?.totalMax ??
        maxMidterm + maxFinal + (course.coursework?.maxGrade ?? 0);
      const isBanned =
        (course.final?.status ?? course.midterm?.status) === "banned";
      const isAbsent =
        (course.final?.status ?? course.midterm?.status) === "absent";
      const isPassed =
        course.officialResult?.passed ??
        (total >= maxTotal / 2 && course.final?.status === "present");
      const coursePct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
      const courseScale = calculateGradeScale(
        coursePct,
        course.final?.status === "banned"
          ? "banned"
          : course.officialResult?.official && !course.officialResult.passed
            ? "absent"
            : (course.final?.status ?? course.midterm?.status),
      );
      const status =
        course.final?.status === "incomplete" ||
        course.final?.status === "excused"
          ? tControl(`states.${course.final.status}`)
          : !course.final && !isAbsent && !isBanned
            ? tControl("midterm")
            : course.final?.status === "present" &&
                !course.officialResult?.official
              ? tRelease("pendingResult")
              : isBanned
                ? isEnglish
                  ? "Banned"
                  : "محروم"
                : isAbsent
                  ? isEnglish
                    ? "Absent"
                    : "غائب"
                  : isPassed
                    ? isEnglish
                      ? "Pass"
                      : "ناجح"
                    : isEnglish
                      ? "Fail"
                      : "راسب";

      return {
        code: course.courseCode,
        name: course.courseName,
        midterm:
          course.midterm?.status === "present"
            ? `${course.midterm.grade} / ${course.midterm.maxGrade}`
            : course.midterm
              ? tControl(`states.${course.midterm.status}`)
              : "—",
        final:
          course.final?.status === "present"
            ? `${course.final.grade} / ${course.final.maxGrade}`
            : course.final
              ? tControl(`states.${course.final.status}`)
              : "—",

        total: course.officialResult?.official ? `${total} / ${maxTotal}` : "-",
        status,
        creditHours: course.creditHours,
        letterGrade:
          course.officialResult?.official ||
          course.final?.status === "incomplete" ||
          course.final?.status === "banned"
            ? course.final?.status === "incomplete"
              ? "IC"
              : course.final?.status === "banned"
                ? "FX"
                : (course.officialResult?.letterGrade ?? courseScale.letter)
            : undefined,
      };
    }),
  };

  const handlePrint = () => {
    if (!openResultCertificate(certificateData)) {
      toast.error(
        isEnglish
          ? "Allow pop-ups to open the certificate."
          : "يرجى السماح بالنوافذ المنبثقة لفتح الشهادة.",
      );
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const downloaded = await downloadResultCertificatePdf(certificateData);
      if (!downloaded) throw new Error("Certificate generation failed");
    } catch {
      toast.error(
        isEnglish
          ? "The certificate PDF could not be generated."
          : "تعذر إنشاء ملف PDF للشهادة.",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className="mx-auto max-w-5xl space-y-6 print:p-0 print:m-0"
      dir={isEnglish ? "ltr" : "rtl"}
    >
      {/* Title */}
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Award className="h-6 w-6 text-primary" />
            <span>{t("results")}</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEnglish
              ? showMidterm && showFinal
                ? "Published midterm and final results"
                : showMidterm
                  ? "Published midterm results"
                  : "Published final results"
              : showMidterm && showFinal
                ? "نتائج الميدتيرم والنهائي المنشورة"
                : showMidterm
                  ? "نتائج الميدتيرم المنشورة"
                  : "نتائج النهائي المنشورة"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-xl border border-border bg-card hover:bg-secondary px-4 py-2.5 text-xs font-semibold text-foreground transition-all cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>{isEnglish ? "Print certificate" : "طباعة الشهادة"}</span>
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/85 disabled:opacity-60 px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-all cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>
              {isDownloading
                ? isEnglish
                  ? "Preparing PDF..."
                  : "جارٍ تجهيز PDF..."
                : isEnglish
                  ? "Download PDF"
                  : "تنزيل PDF"}
            </span>
          </button>
        </div>
      </div>

      {showFinal && !selectedLevelGroups.some((course) => course.final) && (
        <p
          role="note"
          className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm leading-6 text-muted-foreground"
        >
          <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-amber-500" />
          {isEnglish
            ? "The final column is enabled. Final marks will appear after the administration publishes an approved final release. The official total includes coursework, which remains hidden."
            : "عمود النهائي متاح. تظهر درجاته بعد نشر الإدارة لنسخة نهائي معتمدة. يشمل المجموع الرسمي أعمال السنة، مع بقاء عمودها مخفيًا."}
        </p>
      )}
      {selectedLevelGroups.some(
        (course) => course.officialResult?.official,
      ) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5 print:grid-cols-5">
          {/* Total Cumulative Letter Grade Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="p-4 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/40 transition-all duration-300">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black uppercase text-muted-foreground">
                  {isEnglish ? "Cumulative Grade" : "التقدير العام التراكمي"}
                </span>
                <Award className="h-4.5 w-4.5 text-amber-400" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black font-mono text-primary">
                  {officialGpaScale.letter}
                </span>
                <span className="text-xs font-bold text-muted-foreground">
                  (
                  {isEnglish
                    ? officialGpaScale.nameEn
                    : officialGpaScale.nameAr}
                  )
                </span>
              </div>
            </Card>
          </motion.div>

          {/* Cumulative GPA */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.03 }}
          >
            <Card className="p-4 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black uppercase text-muted-foreground">
                  {isEnglish ? "Cumulative GPA" : "المعدل التراكمي"}
                </span>
                <GraduationCap className="h-4.5 w-4.5 text-violet-400" />
              </div>
              <span className="text-2xl font-black font-mono text-foreground">
                <bdi
                  dir="ltr"
                  className="whitespace-nowrap text-xl sm:text-2xl"
                >
                  {officialGpa.toFixed(2)} / 4.00
                </bdi>
              </span>
            </Card>
          </motion.div>

          {/* Completed Credit Hours */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.05 }}
          >
            <Card className="p-4 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black uppercase text-muted-foreground">
                  {isEnglish ? "Completed Credits" : "الساعات المكتملة"}
                </span>
                <CheckSquare className="h-4.5 w-4.5 text-teal-400" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono text-foreground">
                  {officialCompletedCredits}
                </span>
                <span className="text-xs font-bold text-muted-foreground">
                  {isEnglish ? "credits" : "ساعة"}
                </span>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="p-4 bg-card/45 border-border/70 flex flex-col justify-between h-28">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-muted-foreground">
                  {isEnglish ? "Academic warnings" : "عدد الإنذارات الأكاديمية"}
                </span>
                <AlertTriangle className="h-4.5 w-4.5 text-amber-400" />
              </div>
              <span className="text-2xl font-black font-mono">
                {profileQuery.data?.academicWarnings ?? 0}
              </span>
            </Card>
          </motion.div>

          {/* Passed courses */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.11 }}
          >
            <Card className="p-4 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black uppercase text-muted-foreground">
                  {isEnglish ? "Passed Courses" : "المواد الناجح بها"}
                </span>
                <Award className="h-4.5 w-4.5 text-primary" />
              </div>
              <span className="text-2xl font-black font-mono text-foreground">
                <bdi dir="ltr">
                  {selectedLevelStats.passed} / {selectedLevelGroups.length}
                </bdi>
              </span>
            </Card>
          </motion.div>
        </div>
      )}
      <Tabs
        value={selectedLevel}
        onValueChange={setSelectedLevel}
        dir={isEnglish ? "ltr" : "rtl"}
        className="print:hidden"
      >
        <TabsList
          dir={isEnglish ? "ltr" : "rtl"}
          className="h-auto w-full justify-start rtl:justify-start gap-2 overflow-x-auto rounded-2xl border border-border bg-card/45 p-2"
        >
          {availableLevels.map((level) => {
            const currentLevel = profileQuery.data?.level ?? selectedLevel;
            const isPast = Number(level) < Number(currentLevel);
            const isCurrent = level === currentLevel;
            return (
              <TabsTrigger
                key={level}
                value={level}
                className="gap-2 rounded-xl border border-transparent px-4 py-2 data-[state=active]:border-primary/40 data-[state=active]:bg-primary/10"
              >
                <span>{isEnglish ? `Level ${level}` : `المستوى ${level}`}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
                  {isCurrent
                    ? isEnglish
                      ? "Current"
                      : "الحالي"
                    : isPast
                      ? isEnglish
                        ? "Past"
                        : "سابق"
                      : isEnglish
                        ? "Upcoming"
                        : "قادم"}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Transcript Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <Card className="bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 overflow-hidden p-0 print:border-none print:shadow-none relative">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-primary" />
              {isEnglish
                ? `Level ${selectedLevel} Academic Transcript`
                : `بيان درجات المستوى ${selectedLevel}`}
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start text-xs">
              <thead>
                <tr className="border-b border-border/80 bg-secondary/20 text-muted-foreground font-bold text-start">
                  <th className="p-4 text-start">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-primary" />
                      {isEnglish ? "Course" : "المادة والمقرر"}
                    </span>
                  </th>
                  {showMidterm && (
                    <th className="p-4 text-center">
                      <span className="flex items-center justify-center gap-1.5">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground" />
                        {isEnglish ? "Midterm Exam" : "الميدتيرم"}
                      </span>
                    </th>
                  )}

                  {showFinal && (
                    <th className="p-4 text-center">
                      <span className="flex items-center justify-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-muted-foreground" />
                        {isEnglish ? "Final Exam" : "الامتحان النهائي"}
                      </span>
                    </th>
                  )}
                  {showTotal && (
                    <th className="p-4 text-center">
                      <span className="flex items-center justify-center gap-1.5">
                        <Percent className="w-3.5 h-3.5 text-muted-foreground" />
                        {isEnglish ? "Total Grade" : "المجموع الكلي"}
                      </span>
                    </th>
                  )}
                  <th className="p-4 text-end">
                    <span className="flex items-center justify-end gap-1.5">
                      <Award className="w-3.5 h-3.5 text-primary" />
                      {isEnglish ? "Grade & Status" : "التقدير والحالة"}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {semesterSections.length === 0 && (
                  <tr>
                    <td
                      colSpan={columnCount}
                      className="px-6 py-12 text-center text-sm text-muted-foreground"
                    >
                      {isEnglish
                        ? `No published results are available for Level ${selectedLevel} yet.`
                        : `لا توجد نتائج منشورة للمستوى ${selectedLevel} حتى الآن.`}
                    </td>
                  </tr>
                )}
                {semesterSections.map((section) => (
                  <React.Fragment key={section.semester}>
                    <tr className="border-y border-primary/25 bg-primary/5">
                      <td colSpan={columnCount} className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="h-5 w-1 rounded-full bg-primary" />
                            <span className="font-black text-foreground text-sm">
                              {semesterName(section.semester)}
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {section.academicYears.join(", ")}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 font-mono text-xs font-bold">
                            <span className="text-muted-foreground text-[11px]">
                              {section.stats.passed}/{section.groups.length}{" "}
                              {isEnglish ? "passed" : "ناجح"}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {section.groups.map((course) => {
                      const midVal =
                        course.midterm?.status === "present"
                          ? course.midterm.grade
                          : 0;
                      const finalVal =
                        course.final?.status === "present"
                          ? course.final.grade
                          : 0;
                      const total =
                        course.officialResult?.total ??
                        midVal + finalVal + (course.coursework?.grade ?? 0);

                      const maxMid = course.midterm?.maxGrade ?? 0;
                      const maxFin = course.final?.maxGrade ?? 0;
                      const maxTotal =
                        course.officialResult?.totalMax ??
                        maxMid + maxFin + (course.coursework?.maxGrade ?? 0);

                      const isPass =
                        course.officialResult?.passed ??
                        (total >= maxTotal / 2 &&
                          course.final?.status === "present");
                      const isAbsent =
                        (course.final?.status ?? course.midterm?.status) ===
                        "absent";
                      const isBanned =
                        (course.final?.status ?? course.midterm?.status) ===
                        "banned";

                      let statusText = "—";
                      let statusBadgeClass =
                        "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";

                      if (!course.final && !isAbsent && !isBanned) {
                        statusText = isEnglish
                          ? "Midterm result"
                          : "نتيجة الميدترم";
                        statusBadgeClass =
                          "bg-muted text-muted-foreground border-border";
                      } else if (isBanned) {
                        statusText = isEnglish ? "Banned" : "محروم";
                        statusBadgeClass =
                          "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30";
                      } else if (isAbsent) {
                        statusText = isEnglish ? "Absent" : "غائب";
                        statusBadgeClass =
                          "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30";
                      } else if (
                        course.final?.status === "incomplete" ||
                        course.final?.status === "excused"
                      ) {
                        statusText = tControl(`states.${course.final.status}`);
                        statusBadgeClass =
                          "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
                      } else if (!course.officialResult?.official) {
                        statusText = tRelease("pendingResult");
                        statusBadgeClass =
                          "bg-muted text-muted-foreground border-border";
                      } else if (isPass) {
                        statusText = isEnglish ? "Pass" : "ناجح";
                        statusBadgeClass =
                          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
                      } else {
                        statusText = isEnglish ? "Fail" : "راسب";
                        statusBadgeClass =
                          "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
                      }

                      const percentage =
                        maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                      const scale = calculateGradeScale(
                        percentage,
                        course.final?.status === "banned"
                          ? "banned"
                          : course.officialResult?.official &&
                              !course.officialResult.passed
                            ? "absent"
                            : (course.final?.status ?? course.midterm?.status),
                      );

                      let letterColor =
                        "bg-secondary text-foreground border-border";
                      if (scale.letter.startsWith("A")) {
                        letterColor =
                          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-black";
                      } else if (scale.letter.startsWith("B")) {
                        letterColor =
                          "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30 font-bold";
                      } else if (scale.letter.startsWith("C")) {
                        letterColor =
                          "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-bold";
                      } else if (scale.letter.startsWith("D")) {
                        letterColor =
                          "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 font-bold";
                      } else if (
                        scale.letter === "F" ||
                        scale.letter === "FX"
                      ) {
                        letterColor =
                          "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 font-black";
                      }

                      return (
                        <tr
                          key={`${course.academicYear}:${course.semester}:${course.courseCode}`}
                          className="hover:bg-muted/40 transition-colors text-foreground"
                        >
                          <td className="p-4 text-start">
                            <span className="font-bold block text-sm text-foreground">
                              {course.courseName}
                            </span>
                            <div className="flex items-center gap-2 mt-1">
                              <bdi className="text-[11px] font-mono text-muted-foreground font-semibold px-1.5 py-0.5 rounded bg-muted/60 border border-border/50">
                                {course.courseCode}
                              </bdi>
                              {course.creditHours ? (
                                <span className="text-[10px] text-muted-foreground">
                                  {course.creditHours}{" "}
                                  {isEnglish ? "hrs" : "ساعات"}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          {showMidterm && (
                            <td className="p-4 text-center">
                              {course.midterm ? (
                                course.midterm.status === "present" ? (
                                  <span className="inline-flex items-center justify-center font-mono font-bold text-xs text-foreground px-2.5 py-1 rounded-squircle bg-muted/50 border border-border/60">
                                    <bdi>
                                      {course.midterm.grade} /{" "}
                                      {course.midterm.maxGrade}
                                    </bdi>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-squircle text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                    {tControl(
                                      `states.${course.midterm.status}`,
                                    )}
                                  </span>
                                )
                              ) : (
                                <span className="text-muted-foreground font-mono">
                                  —
                                </span>
                              )}
                            </td>
                          )}

                          {showFinal && (
                            <td className="p-4 text-center">
                              {course.final ? (
                                course.final.status === "present" ? (
                                  <span className="inline-flex items-center justify-center font-mono font-bold text-xs text-foreground px-2.5 py-1 rounded-squircle bg-muted/50 border border-border/60">
                                    <bdi>
                                      {course.final.grade} /{" "}
                                      {course.final.maxGrade}
                                    </bdi>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-squircle text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                    {tControl(`states.${course.final.status}`)}
                                  </span>
                                )
                              ) : (
                                <span className="text-muted-foreground font-mono">
                                  —
                                </span>
                              )}
                            </td>
                          )}
                          {showTotal && (
                            <td className="p-4 text-center">
                              {course.officialResult?.official ? (
                                <div className="inline-flex flex-col items-center gap-1">
                                  <span className="font-mono font-black text-sm text-foreground">
                                    <bdi>
                                      {course.officialResult?.official
                                        ? `${percentage.toFixed(1)}%`
                                        : "-"}
                                    </bdi>
                                  </span>
                                  <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        isPass ? "bg-emerald-500" : "bg-red-500"
                                      }`}
                                      style={{
                                        width: `${Math.min(100, Math.max(0, percentage))}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          )}
                          <td className="p-4 text-end">
                            <div className="flex items-center justify-end gap-2">
                              {(course.officialResult?.official ||
                                course.final?.status === "incomplete" ||
                                course.final?.status === "banned") && (
                                <span
                                  className={`font-mono text-xs px-2.5 py-1 rounded-squircle border shadow-xs ${letterColor}`}
                                >
                                  {course.final?.status === "incomplete"
                                    ? "IC"
                                    : course.final?.status === "banned"
                                      ? "FX"
                                      : (course.officialResult?.letterGrade ??
                                        scale.letter)}
                                </span>
                              )}
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-squircle text-xs font-bold border shadow-xs ${statusBadgeClass}`}
                              >
                                {statusText}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="absolute -right-20 -top-20 w-40 h-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        </Card>
      </motion.div>
    </div>
  );
}
