"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  QrCode,
  BookOpen,
  Calendar,
  Filter,
  Search,
  ChevronRight,
  Info,
  XCircle,
  HelpCircle,
  Play,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/feedback";
import {
  CustomDropdown,
  type CustomDropdownOption,
} from "@/components/ui/custom-dropdown";
import {
  attendanceApi,
  type AttendanceRecordDto,
  type CourseAttendanceSummary,
  type StudentLiveSessionItem,
} from "@/features/attendance/api/attendance-api";
import { StudentQrScannerDialog } from "@/features/attendance/components/student-qr-scanner-dialog";

export default function StudentAttendancePage() {
  const tCommon = useTranslations("common");
  const params = useParams();
  const locale = (params.locale as string) || "ar";
  const isAr = locale.startsWith("ar");

  // Filters state
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeCourseDetail, setActiveCourseDetail] =
    useState<CourseAttendanceSummary | null>(null);
  const [showScanDialog, setShowScanDialog] = useState<boolean>(false);

  // Fetch student active/live sessions
  const liveSessionsQuery = useQuery({
    queryKey: ["student-live-attendance-sessions"],
    queryFn: () => attendanceApi.getStudentLiveSessions(),
    refetchInterval: 12000,
  });

  // Fetch real-time attendance history & summaries
  const historyQuery = useQuery({
    queryKey: ["my-student-attendance-history"],
    queryFn: () => attendanceApi.getMyAttendanceHistory(),
    refetchInterval: 15000,
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
  };

  const courses = data?.courses || [];
  const records = data?.records || [];

  // Filtered session records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (selectedCourse !== "all" && r.courseCode !== selectedCourse)
        return false;
      if (selectedStatus !== "all" && r.status !== selectedStatus) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const code = r.courseCode.toLowerCase();
        const type = r.sessionType.toLowerCase();
        if (!code.includes(query) && !type.includes(query)) return false;
      }
      return true;
    });
  }, [records, selectedCourse, selectedStatus, searchQuery]);

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
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-center">
          <Button
            onClick={() => setShowScanDialog(true)}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow-sm cursor-pointer"
          >
            <QrCode className="h-4 w-4" />
            <span>{isAr ? "تسجيل الحضور (QR / كود)" : "Check In Now"}</span>
          </Button>

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

      {/* Live Attendance Sessions Section */}
      {liveSessionsQuery.data?.sessions &&
        liveSessionsQuery.data.sessions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                </span>
                <span>
                  {isAr
                    ? "محاضرات وسكاشن منعقدة الآن (حضور مباشر)"
                    : "Live Sessions in Progress"}
                </span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liveSessionsQuery.data.sessions.map((session) => (
                <Card
                  key={session._id}
                  className="p-4 bg-card border border-border/70 hover:border-primary/40 flex flex-col justify-between gap-3 shadow-sm transition-all rounded-2xl"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                          {session.courseCode}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {session.sessionType === "lecture"
                            ? isAr
                              ? "محاضرة"
                              : "Lecture"
                            : isAr
                              ? "سكشن"
                              : "Section"}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-foreground mt-1">
                        {session.courseName || session.courseCode}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isAr
                          ? `المحاضر: ${session.createdByName}`
                          : `Instructor: ${session.createdByName}`}
                      </p>
                    </div>

                    {session.alreadyCheckedIn ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{isAr ? "تم تسجيل حضورك" : "Checked In"}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {isAr
                            ? `متبقي ${Math.ceil(session.remainingSeconds / 60)} دقيقة`
                            : `${Math.ceil(session.remainingSeconds / 60)}m left`}
                        </span>
                      </span>
                    )}
                  </div>

                  {!session.alreadyCheckedIn && (
                    <Button
                      onClick={() => setShowScanDialog(true)}
                      className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow-sm cursor-pointer"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      <span>
                        {isAr
                          ? "مسح الرمز لتسجيل الحضور"
                          : "Scan QR to Check In"}
                      </span>
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

      {/* Aggregate Statistics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                    <div>
                      <span className="font-mono text-sm font-bold text-foreground">
                        {course.courseCode}
                      </span>
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
      <div className="space-y-4 pt-4 border-t border-border/60">
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
                  ...courses.map((c) => ({
                    value: c.courseCode,
                    label: c.courseName
                      ? `${c.courseCode} - ${c.courseName}`
                      : c.courseCode,
                  })),
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
            {selectedCourse !== "all" || selectedStatus !== "all" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedCourse("all");
                  setSelectedStatus("all");
                }}
                className="text-xs cursor-pointer"
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
                          isAr ? "ar-EG" : "en-US",
                          {
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
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-foreground">
                      {record.courseCode}
                    </span>
                    <AttendanceStatusBadge status={record.status} isAr={isAr} />
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                    <span className="font-sans">
                      {record.sessionType === "lecture"
                        ? isAr
                          ? "محاضرة"
                          : "Lecture"
                        : isAr
                          ? "سكشن"
                          : "Section"}
                    </span>
                    <span className="font-mono text-[11px]">
                      {new Date(record.checkedInAt).toLocaleTimeString(
                        isAr ? "ar-EG" : "en-US",
                        { hour: "2-digit", minute: "2-digit" },
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
        open={showScanDialog}
        onOpenChange={setShowScanDialog}
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
