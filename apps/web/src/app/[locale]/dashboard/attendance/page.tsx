"use client";

import React, { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";

import { useParams } from "next/navigation";
import {
  Award,
  ClipboardList,
  CheckCircle2,
  Clock,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  QrCode,
  BookOpen,
  Calendar,
  ChevronRight,
  XCircle,
} from "lucide-react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LoadingState, ErrorState } from "@/components/ui/feedback";
import { CustomDropdown } from "@/components/ui/custom-dropdown";
import {
  attendanceApi,
  type StudentLiveSessionItem,
} from "@/features/attendance/api/attendance-api";
import { DashboardLiveAttendanceHub } from "@/features/attendance/components/dashboard-live-attendance-hub";
import { StudentAttendanceBonusShowcase } from "@/features/attendance/components/student-attendance-bonus-showcase";
import { StudentQrScannerDialog } from "@/features/attendance/components/student-qr-scanner-dialog";

export default function StudentAttendancePage() {
  const params = useParams();
  const locale = (params.locale as string) || "ar";
  const isAr = locale.startsWith("ar");

  // Filters state
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [onlyBonus, setOnlyBonus] = useState<boolean>(false);
  const [showScanDialog, setShowScanDialog] = useState<boolean>(false);
  const [selectedScanSession, setSelectedScanSession] =
    useState<StudentLiveSessionItem | null>(null);
  const bonusSectionRef = useRef<HTMLDivElement | null>(null);
  const historySectionRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const profileQuery = useQuery({
    queryKey: ["student-profile"],
    queryFn: async () => {
      const res = await api.get<
        | { isBlocked?: boolean; blockReason?: string }
        | { data: { isBlocked?: boolean; blockReason?: string } }
      >("/students/me/profile");
      return "data" in res.data ? res.data.data : res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch student active/live sessions
  const liveSessionsQuery = useQuery({
    queryKey: ["student-live-attendance-sessions"],
    queryFn: () => attendanceApi.getStudentLiveSessions(),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  // Fetch student attendance history & summaries (cached, no aggressive polling)
  const historyQuery = useQuery({
    queryKey: ["my-student-attendance-history"],
    queryFn: () => attendanceApi.getMyAttendanceHistory(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const isLoading = historyQuery.isLoading;
  const isError = historyQuery.isError;
  const data = historyQuery.data;

  const summary = data?.summary || {
    totalSessions: 0,
    presentCount: 0,
    lateCount: 0,
    excusedCount: 0,
    absentCount: 0,
    attendanceRate: 100,
    totalBonusPoints: 0,
    bonusAwardsCount: 0,
    lectureBonusPoints: 0,
    sectionBonusPoints: 0,
  };
  const totalBonusPoints = summary.totalBonusPoints ?? 0;
  const bonusAwardsCount =
    summary.bonusAwardsCount ??
    (data?.records || []).filter((r) => (r.bonusPoints ?? 0) > 0).length;
  const isStudentBlocked =
    Boolean(profileQuery.data?.isBlocked) ||
    Boolean(liveSessionsQuery.data?.isBlocked);
  const blockReason =
    profileQuery.data?.blockReason ||
    liveSessionsQuery.data?.blockReason ||
    null;

  const courses = data?.courses || [];
  const records = useMemo(() => data?.records || [], [data?.records]);

  // Filtered session records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (selectedCourse !== "all" && r.courseCode !== selectedCourse)
        return false;
      if (selectedStatus !== "all" && r.status !== selectedStatus) return false;
      if (onlyBonus && !(typeof r.bonusPoints === "number" && r.bonusPoints > 0))
        return false;
      return true;
    });
  }, [records, selectedCourse, selectedStatus, onlyBonus]);

  if (isLoading) {
    return (
      <LoadingState
        title={
          isAr ? "جاري تحميل سجلات الحضور..." : "Loading attendance records..."
        }
      />
    );
  }

  if (isError) {
    return (
      <ErrorState
        description={
          isAr
            ? "تعذر تحميل سجل الحضور. يرجى إعادة المحاولة."
            : "Failed to load attendance history."
        }
        onRetry={() => historyQuery.refetch()}
      />
    );
  }

  return (
    <div
      className="mx-auto max-w-6xl space-y-8 pb-12"
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <ClipboardList className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {isAr ? "سجل الحضور والغياب الذكي" : "Smart Attendance Dashboard"}
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {isAr
              ? "متابعة حية لنسبة الحضور وسجلات المحاضرات والسكاشن المسجلة عبر البوابة"
              : "Live overview of your lecture and lab attendance recorded via QR check-ins"}
          </p>
        </div>

        {/* Actions & Status Badge */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto self-start sm:self-center">
          {isStudentBlocked ? (
            <Button
              type="button"
              variant="outline"
              disabled
              className="w-full sm:w-auto min-h-11 rounded-squircle gap-2 border-rose-500/35 bg-rose-500/10 text-rose-300 font-bold text-xs cursor-not-allowed"
            >
              <Lock className="h-4 w-4 shrink-0" />
              <span>
                {isAr
                  ? "تسجيل الحضور موقوف (حساب محجوب)"
                  : "Check-in Blocked (Tuition Hold)"}
              </span>
            </Button>
          ) : (
            <Button
              onClick={() => {
                setSelectedScanSession(null);
                setShowScanDialog(true);
              }}
              className="w-full sm:w-auto min-h-11 rounded-squircle gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow-sm cursor-pointer"
            >
              <QrCode className="h-4 w-4" />
              <span>{isAr ? "تسجيل الحضور (QR / كود)" : "Check In Now"}</span>
            </Button>
          )}

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
              summary.attendanceRate >= 75
                ? "bg-primary/10 text-primary border-primary/20"
                : summary.attendanceRate >= 60
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/30"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                summary.attendanceRate >= 75
                  ? "bg-primary"
                  : summary.attendanceRate >= 60
                    ? "bg-amber-400"
                    : "bg-rose-400"
              }`}
            />
            {summary.attendanceRate >= 75
              ? isAr
                ? "حالة أكاديمية منتظمة"
                : "Good Academic Standing"
              : summary.attendanceRate >= 60
                ? isAr
                  ? "تنبيه: انخفاض نسبة الحضور"
                  : "Warning: Low Attendance"
                : isAr
                  ? "خطر الحرمان من الامتحانات"
                  : "At Risk: Below 75%"}
          </span>
        </div>
      </div>

      {isStudentBlocked && (
        <div className="rounded-2xl border border-rose-500/35 bg-rose-500/10 p-4 text-start flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-squircle border border-rose-500/35 bg-rose-500/15 text-rose-400">
            <ShieldAlert className="size-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-xs sm:text-sm font-bold text-rose-300">
              {isAr
                ? "تسجيل الحضور موقوف مؤقتًا لحجب الحساب ماليًا"
                : "Attendance Check-in Paused Due to Tuition Hold"}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isAr
                ? "لا يمكن تسجيل الحضور عبر مسح رمز QR أو التحضير اليدوي لحين سداد المصروفات الدراسية ومراجعة شؤون الطلاب."
                : "Neither QR scanning nor manual check-in is permitted while tuition fees remain unsettled."}
            </p>
            {blockReason && (
              <p className="text-[11px] font-semibold text-rose-300">
                {isAr ? `السبب المسجل: ${blockReason}` : `Reason: ${blockReason}`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Mobile-First Multi-Session Live Attendance Hub */}
      <DashboardLiveAttendanceHub
        sessions={liveSessionsQuery.data?.sessions || []}
        isBlocked={isStudentBlocked}
        blockReason={blockReason}
        totalBonusPoints={totalBonusPoints}
        locale={locale}
        showHistoryLink={false}
        onScanSession={(session) => {
          if (isStudentBlocked) return;
          setSelectedScanSession(session ?? null);
          setShowScanDialog(true);
        }}
      />

      {/* Aggregate Statistics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Overall Percentage */}
        <Card className="col-span-2 sm:col-span-1 p-4 bg-card/40 border-border/70 backdrop-blur-sm flex flex-col justify-between relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {isAr ? "النسبة العامة" : "Overall Rate"}
            </span>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black font-mono text-foreground tracking-tight">
                {summary.attendanceRate}
              </span>
              <span className="text-sm font-bold text-primary">%</span>
            </div>
            <Progress value={summary.attendanceRate} className="h-1.5 mt-2.5" />
          </div>
        </Card>

        {/* Present Sessions */}
        <Card className="p-4 bg-card/40 border-border/70 backdrop-blur-sm flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {isAr ? "حضور" : "Present"}
            </span>
            <div className="h-2 w-2 rounded-full bg-primary" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono text-primary">
              {summary.presentCount}
            </span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isAr ? "جلسة مؤكدة" : "Confirmed"}
            </p>
          </div>
        </Card>

        {/* Late Sessions */}
        <Card className="p-4 bg-card/40 border-border/70 backdrop-blur-sm flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {isAr ? "تأخير" : "Late"}
            </span>
            <div className="h-2 w-2 rounded-full bg-amber-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono text-amber-400">
              {summary.lateCount}
            </span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isAr ? "بعد الموعد" : "After threshold"}
            </p>
          </div>
        </Card>

        {/* Excused Sessions */}
        <Card className="p-4 bg-card/40 border-border/70 backdrop-blur-sm flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {isAr ? "غياب بعذر" : "Excused"}
            </span>
            <div className="h-2 w-2 rounded-full bg-blue-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono text-blue-400">
              {summary.excusedCount}
            </span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isAr ? "مقبول رسمياً" : "Approved"}
            </p>
          </div>
        </Card>

        {/* Absent Sessions */}
        <Card className="p-4 bg-card/40 border-border/70 backdrop-blur-sm flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {isAr ? "غياب" : "Absent"}
            </span>
            <div className="h-2 w-2 rounded-full bg-rose-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono text-rose-400">
              {summary.absentCount}
            </span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isAr ? "جلسة فائتة" : "Missed"}
            </p>
          </div>
        </Card>

        {/* Total Bonus Marks (Interactive Scroll-to-Showcase Card) */}
        <Card
          role="button"
          tabIndex={0}
          onClick={() =>
            bonusSectionRef.current?.scrollIntoView({
              behavior: prefersReducedMotion ? "auto" : "smooth",
              block: "start",
            })
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              bonusSectionRef.current?.scrollIntoView({
                behavior: prefersReducedMotion ? "auto" : "smooth",
                block: "start",
              });
            }
          }}
          className="p-4 bg-card/45 border-amber-500/35 hover:border-amber-400/60 transition-colors backdrop-blur-sm flex flex-col justify-between shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-amber-300">
              {isAr ? "البونص (Bonus)" : "Bonus"}
            </span>
            <motion.span
              animate={
                prefersReducedMotion || totalBonusPoints <= 0
                  ? undefined
                  : { rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }
              }
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="inline-flex size-6 items-center justify-center rounded-squircle bg-amber-500/15 text-amber-300"
            >
              <Award className="h-4 w-4" />
            </motion.span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono text-amber-300">
              <bdi dir="ltr">+{totalBonusPoints}</bdi>
            </span>
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Sparkles className="size-3 text-amber-300 shrink-0" />
              <span>
                {bonusAwardsCount > 0
                  ? isAr
                    ? `في ${bonusAwardsCount} جلسة — عرض التفاصيل`
                    : `${bonusAwardsCount} rewards — view`
                  : isAr
                    ? "درجة مكافأة"
                    : "Reward marks"}
              </span>
            </p>
          </div>
        </Card>
      </div>

      {/* Motivational Student Bonus Showcase */}
      <div ref={bonusSectionRef}>
        <StudentAttendanceBonusShowcase
          records={records}
          totalBonusPoints={totalBonusPoints}
          bonusAwardsCount={bonusAwardsCount}
          lectureBonusPoints={summary.lectureBonusPoints}
          sectionBonusPoints={summary.sectionBonusPoints}
          locale={locale}
          onSelectCourse={(courseCode) => {
            setSelectedCourse(courseCode);
            setOnlyBonus(true);
            historySectionRef.current?.scrollIntoView({
              behavior: prefersReducedMotion ? "auto" : "smooth",
              block: "start",
            });
          }}
        />
      </div>

      {/* Course Breakdown Section */}
      {courses.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">
                {isAr
                  ? "نسبة الحضور حسب المقررات الدراسية"
                  : "Attendance by Course"}
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {courses.length} {isAr ? "مقررات مسجلة" : "courses enrolled"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => {
              const isWarning = course.attendanceRate < 75;
              return (
                <Card
                  key={course.courseCode}
                  className={`p-4 bg-card/45 border-border/70 hover:border-primary/40 transition-all shadow-sm space-y-3 ${
                    isWarning ? "border-amber-500/30" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <span className="font-mono text-sm font-bold text-foreground">
                        <bdi dir="ltr">{course.courseCode}</bdi>
                      </span>
                      {(course.courseNameAr || course.courseName) && (
                        <p className="text-xs font-semibold text-foreground/85 truncate mt-0.5">
                          {isAr
                            ? course.courseNameAr || course.courseName
                            : course.courseName || course.courseNameAr}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {course.totalSessions}{" "}
                        {isAr ? "جلسات منعقدة" : "sessions held"}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-bold border ${
                        course.attendanceRate >= 75
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {course.attendanceRate}%
                    </span>
                  </div>

                  <Progress value={course.attendanceRate} className="h-1.5" />

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="text-primary">
                        {course.presentCount} {isAr ? "حضور" : "pres"}
                      </span>
                      <span className="text-amber-400">
                        {course.lateCount} {isAr ? "تأخير" : "late"}
                      </span>
                      <span className="text-rose-400">
                        {course.absentCount} {isAr ? "غياب" : "abs"}
                      </span>
                      {(course.totalBonusPoints ?? 0) > 0 && (
                        <span className="text-amber-300 font-bold">
                          <bdi dir="ltr">+{course.totalBonusPoints}</bdi>{" "}
                          {isAr ? "بونص" : "bonus"}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCourse(course.courseCode);
                      }}
                      className="text-primary hover:text-primary/80 font-medium flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>{isAr ? "تصفية السجل" : "Filter"}</span>
                      <ChevronRight className="h-3 w-3 rtl:rotate-180" />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Session History Log Section */}
      <div
        ref={historySectionRef}
        className="space-y-4 pt-4 border-t border-border/60"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span>
                {isAr
                  ? "سجل المحاضرات والسكاشن التفصيلي"
                  : "Session History Log"}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "تفاصيل كل جلسة وموعد المسح وحالة الحضور المسجلة"
                : "Complete list of all checked-in sessions with exact server timestamps"}
            </p>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOnlyBonus((prev) => !prev)}
              className={`h-8 rounded-squircle gap-1.5 text-xs font-semibold cursor-pointer ${
                onlyBonus
                  ? "border-amber-500/45 bg-amber-500/15 text-amber-300 hover:bg-amber-500/20"
                  : "bg-secondary/50 border-border/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Award className="size-3.5 shrink-0" />
              <span>{isAr ? "جلسات البونص فقط" : "Bonus Only"}</span>
            </Button>

            {/* Filter by course */}
            <div className="w-44">
              <CustomDropdown
                value={selectedCourse}
                onValueChange={setSelectedCourse}
                ariaLabel={isAr ? "تصفية حسب المقرر" : "Filter by course"}
                options={[
                  {
                    value: "all",
                    label: isAr ? "جميع المقررات" : "All Courses",
                  },
                  ...courses.map((c) => {
                    const name = isAr
                      ? c.courseNameAr || c.courseName
                      : c.courseName || c.courseNameAr;
                    return {
                      value: c.courseCode,
                      label: name ? `${c.courseCode} - ${name}` : c.courseCode,
                    };
                  }),
                ]}
                className="h-8 text-xs bg-secondary/50 border-border/70"
              />
            </div>

            {/* Filter by status */}
            <div className="w-36">
              <CustomDropdown
                value={selectedStatus}
                onValueChange={setSelectedStatus}
                ariaLabel={isAr ? "تصفية حسب الحالة" : "Filter by status"}
                options={[
                  {
                    value: "all",
                    label: isAr ? "كافة الحالات" : "All Statuses",
                  },
                  {
                    value: "present",
                    label: isAr ? "حاضر (في الموعد)" : "Present",
                  },
                  { value: "late", label: isAr ? "متأخر" : "Late" },
                  { value: "excused", label: isAr ? "معذور" : "Excused" },
                  { value: "absent", label: isAr ? "غائب" : "Absent" },
                ]}
                className="h-8 text-xs bg-secondary/50 border-border/70"
              />
            </div>
          </div>
        </div>

        {/* Empty State */}
        {filteredRecords.length === 0 ? (
          <Card className="p-8 text-center bg-card/35 border-border/70 space-y-3">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary">
              <QrCode className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-foreground">
                {records.length === 0
                  ? isAr
                    ? "لا توجد جلسات حضور مسجلة بعد"
                    : "No attendance sessions recorded yet"
                  : isAr
                    ? "لا توجد نتائج مطابقة للتصفية"
                    : "No records match selected filters"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                {records.length === 0
                  ? isAr
                    ? "سيتم تسجيل حضورك تلقائياً عند مسح رمز الاستجابة السريعة (QR) الذي يعرضه الدكتور أو المعيد أثناء المحاضرة أو السكشن."
                    : "Your attendance will automatically appear here when you scan the rotating QR code presented during lectures or sections."
                  : isAr
                    ? "جرب تغيير خيارات التصفية أو اختيار مقرر آخر لعرض سجلاته."
                    : "Try selecting a different course or status filter to see sessions."}
              </p>
            </div>
            {selectedCourse !== "all" || selectedStatus !== "all" || onlyBonus ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedCourse("all");
                  setSelectedStatus("all");
                  setOnlyBonus(false);
                }}
                className="rounded-squircle text-xs cursor-pointer"
              >
                {isAr ? "إعادة ضبط التصفية" : "Reset Filters"}
              </Button>
            ) : null}
          </Card>
        ) : (
          /* Responsive Table / Cards View */
          <div className="space-y-3">
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-hidden rounded-xl border border-border/70 bg-card/40 backdrop-blur-sm">
              <table className="w-full text-xs text-start">
                <thead className="bg-secondary/40 border-b border-border/60 text-muted-foreground font-semibold">
                  <tr>
                    <th className="p-3.5 text-start">
                      {isAr ? "المقرر" : "Course"}
                    </th>
                    <th className="p-3.5 text-center">
                      {isAr ? "النوع" : "Session Type"}
                    </th>
                    <th className="p-3.5 text-center">
                      {isAr ? "توقيت التسجيل" : "Check-In Time"}
                    </th>
                    <th className="p-3.5 text-center">
                      {isAr ? "وسيلة التحقق" : "Method"}
                    </th>
                    <th className="p-3.5 text-center">
                      {isAr ? "البونص" : "Bonus"}
                    </th>
                    <th className="p-3.5 text-end">
                      {isAr ? "الحالة" : "Status"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono">
                  {filteredRecords.map((record) => (
                    <tr
                      key={record._id}
                      className="hover:bg-secondary/20 transition-colors"
                    >
                      <td className="p-3.5 text-start font-bold text-foreground">
                        {record.courseCode}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-secondary/70 text-muted-foreground border border-border/50 font-sans">
                          {record.sessionType === "lecture"
                            ? isAr
                              ? "محاضرة"
                              : "Lecture"
                            : record.sessionType === "section"
                              ? isAr
                                ? "سكشن"
                                : "Section"
                              : isAr
                                ? "معمل"
                                : "Lab"}
                        </span>
                      </td>
                      <td className="p-3.5 text-center text-muted-foreground text-[11px]">
                        {new Date(record.checkedInAt).toLocaleString(
                          isAr ? "ar-EG" : "en-GB",
                          {
                            timeZone: "Africa/Cairo",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-sans">
                          {record.method === "qr" ? (
                            <>
                              <QrCode className="h-3 w-3 text-primary" />
                              <span>QR Code</span>
                            </>
                          ) : (
                            <span>{isAr ? "تسجيل يدوي" : "Manual"}</span>
                          )}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        {(record.bonusPoints ?? 0) > 0 ? (
                          <span
                            title={record.bonusReason || undefined}
                            className="inline-flex items-center gap-1 rounded-squircle border border-amber-500/35 bg-amber-500/12 px-2 py-0.5 text-[11px] font-bold text-amber-300 font-sans"
                          >
                            <Award className="h-3 w-3 shrink-0" />
                            <bdi dir="ltr">+{record.bonusPoints}</bdi>
                            <span>{isAr ? "بونص" : "Bonus"}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="p-3.5 text-end">
                        <AttendanceStatusBadge
                          status={record.status}
                          isAr={isAr}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (Visible only on phone screens) */}
            <div className="grid grid-cols-1 gap-2.5 sm:hidden">
              {filteredRecords.map((record) => (
                <Card
                  key={record._id}
                  className="p-3.5 bg-card/45 border-border/70 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-foreground">
                      {record.courseCode}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(record.bonusPoints ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-squircle border border-amber-500/35 bg-amber-500/12 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                          <Award className="h-3 w-3 shrink-0" />
                          <bdi dir="ltr">+{record.bonusPoints}</bdi>
                          <span>{isAr ? "بونص" : "Bonus"}</span>
                        </span>
                      )}
                      <AttendanceStatusBadge status={record.status} isAr={isAr} />
                    </div>
                  </div>
                  {record.bonusReason && (record.bonusPoints ?? 0) > 0 && (
                    <p className="text-[11px] text-amber-300/90">
                      {record.bonusReason}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                    <span className="font-sans">
                      {record.sessionType === "lecture"
                        ? isAr
                          ? "محاضرة"
                          : "Lecture"
                        : record.sessionType === "section"
                          ? isAr
                            ? "سكشن"
                            : "Section"
                          : isAr
                            ? "معمل"
                            : "Lab"}
                    </span>
                    <span className="font-mono text-[11px]">
                      {new Date(record.checkedInAt).toLocaleTimeString(
                        isAr ? "ar-EG" : "en-GB",
                        {
                          timeZone: "Africa/Cairo",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                    <span className="text-[11px]">
                      {record.method === "qr"
                        ? "QR Code"
                        : isAr
                          ? "يدوي"
                          : "Manual"}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Student QR Scanner Dialog */}
      <StudentQrScannerDialog
        open={showScanDialog && !isStudentBlocked}
        onOpenChange={(open) => {
          setShowScanDialog(open);
          if (!open) setSelectedScanSession(null);
        }}
        sessionContext={
          selectedScanSession
            ? {
                courseCode: selectedScanSession.courseCode,
                courseName: selectedScanSession.courseName,
                sessionType: selectedScanSession.sessionType,
              }
            : null
        }
        onSuccess={() => {
          historyQuery.refetch();
          liveSessionsQuery.refetch();
        }}
        locale={locale}
      />
    </div>
  );
}

function AttendanceStatusBadge({
  status,
  isAr,
}: {
  status: string;
  isAr: boolean;
}) {
  if (status === "present") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
        <CheckCircle2 className="h-3 w-3" />
        <span>{isAr ? "حاضر" : "Present"}</span>
      </span>
    );
  }

  if (status === "late") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <Clock className="h-3 w-3" />
        <span>{isAr ? "متأخر" : "Late"}</span>
      </span>
    );
  }

  if (status === "excused") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <ShieldCheck className="h-3 w-3" />
        <span>{isAr ? "معذور" : "Excused"}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
      <XCircle className="h-3 w-3" />
      <span>{isAr ? "غائب" : "Absent"}</span>
    </span>
  );
}
