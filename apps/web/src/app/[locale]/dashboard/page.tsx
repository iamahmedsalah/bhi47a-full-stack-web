"use client";

import React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import api, { apiBaseUrl } from "@/lib/api";
import {
  ClipboardList,
  BookOpenCheck,
  FileText,
  Award,
  Mail,
  Calendar,
  MapPin,
  User,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  MessageCircle,
  QrCode,
  Building2,
  Globe,
  CalendarClock,
  Layers,
  UserCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/cn";

import dynamic from "next/dynamic";
import { useAuth } from "@/providers/auth-provider";
import { attendanceApi } from "@/features/attendance/api/attendance-api";

const StudentQrScannerDialog = dynamic(
  () =>
    import("@/features/attendance/components/student-qr-scanner-dialog").then(
      (m) => m.StudentQrScannerDialog,
    ),
  { ssr: false },
);

interface StudentProfile {
  _id: string;
  fullName: string;
  studentCode: string;
  level: string;
  department?: string;
  group?: string;
  section?: string;
  academicYear: string;
  semester: string;
  seatNumber?: string;
  examRoom?: string;
  examFloor?: string;
  examBuilding?: string;
  academicWarnings?: number;
  isBlocked?: boolean;
  tuitionFeesStatus?: 'paid' | 'unpaid' | 'exempt';
  blockReason?: string;
}

interface Eligibility {
  canRegisterDirectly: boolean;
  maxCreditHours: number;
  requiresAdvisor: boolean;
  gpa: number;
}

export default function StudentDashboard() {
  const params = useParams();
  const locale = params.locale as string;
  const { user } = useAuth();

  // 1. Profile Query (immutable within session)
  const profileQuery = useQuery({
    queryKey: ["student-profile"],
    queryFn: async () => {
      const res = await api.get<any>("/students/me/profile");
      return (res.data?.data ?? res.data) as StudentProfile;
    },
    staleTime: 5 * 60 * 1000,
  });

  // 2. Attendance History Query (infrequent change)
  const attendanceQuery = useQuery({
    queryKey: ["my-student-attendance-history"],
    queryFn: () => attendanceApi.getMyAttendanceHistory(),
    staleTime: 60 * 1000,
  });

  // 3. Eligibility/GPA Query (static across semester registration)
  const eligibilityQuery = useQuery({
    queryKey: ["registration-eligibility"],
    queryFn: async () => {
      const res = await api.get<any>("/registration/eligibility");
      return (res.data?.data ?? res.data) as Eligibility;
    },
    staleTime: 10 * 60 * 1000,
  });

  // 4. Live Attendance Sessions Query (adaptive 45s interval, never in background)
  const [showScanDialog, setShowScanDialog] = React.useState(false);
  const liveSessionsQuery = useQuery({
    queryKey: ["student-live-attendance-sessions"],
    queryFn: () => attendanceApi.getStudentLiveSessions(),
    staleTime: 30 * 1000,
    refetchInterval: 45 * 1000,
    refetchIntervalInBackground: false,
  });

  // 5. Course Syllabi & Curriculum Query (static)
  const syllabiQuery = useQuery({
    queryKey: ["student-syllabi"],
    queryFn: async () => {
      const res = await api.get<any>("/students/me/syllabi");
      return res.data;
    },
    staleTime: 15 * 60 * 1000,
  });

  // 6. Academic Email Query (rarely changes)
  const academicEmailQuery = useQuery({
    queryKey: ["student-academic-email"],
    queryFn: async () => {
      try {
        const res = await api.get<{
          _id: string;
          studentCode: string;
          studentName: string;
          academicEmail: string;
          status: "active" | "inactive";
        } | null>("/students/me/academic-email");
        return res.data;
      } catch {
        return null;
      }
    },
    staleTime: 30 * 60 * 1000,
  });

  // 7. Exam Assignment & Schedules Query (cached 10 min)
  const examAssignmentQuery = useQuery({
    queryKey: ["student-exam-assignment"],
    queryFn: async () => {
      try {
        const res = await api.get<{
          seatNumber: string | null;
          examRoom: string | null;
          examFloor: string | null;
          examBuilding: string | null;
          schedules: Array<{
            _id: string;
            title: string;
            examType: "midterm" | "final";
            academicYear: string;
            semester: string;
            fileUrl: string;
            isPublished: boolean;
          }>;
        }>("/students/me/exam-assignment");
        return res.data;
      } catch {
        return null;
      }
    },
    staleTime: 10 * 60 * 1000,
  });

  // 8. Quizzes Query (detecting open quizzes)
  const quizzesQuery = useQuery({
    queryKey: ["student-quizzes-dashboard"],
    queryFn: async () => {
      try {
        const res = await api.get<any[]>("/students/me/quizzes");
        return res.data || [];
      } catch {
        return [];
      }
    },
    refetchInterval: 30000,
  });

  const profile = profileQuery.data ?? null;
  const attendance = attendanceQuery.data
    ? {
        totalLectures: attendanceQuery.data.summary.totalSessions,
        attendedLectures:
          attendanceQuery.data.summary.presentCount +
          attendanceQuery.data.summary.lateCount,
        absenceLectures: attendanceQuery.data.summary.absentCount,
        attendancePercentage: attendanceQuery.data.summary.attendanceRate,
      }
    : null;
  const eligibility = eligibilityQuery.data ?? null;
  const liveSessions = liveSessionsQuery.data?.sessions || [];
  const activeLiveSession =
    liveSessions.find((s) => !s.alreadyCheckedIn && s.remainingSeconds > 0) ||
    liveSessions[0];
  const openQuizzes = (quizzesQuery.data || []).filter(
    (q: any) => q.isOpen && !q.isSubmitted,
  );
  const activeQuiz = openQuizzes[0] || null;
  const publishedSchedules = examAssignmentQuery.data?.schedules || [];
  const activeSchedule = publishedSchedules[0] || null;
  const displayName = profile?.fullName || user?.name || "";

  // Parse seat number to get a mock position in the seating grid for dashboard preview
  const seatNumberStr = profile?.seatNumber || "";
  const seatInt = parseInt(seatNumberStr.replace(/\D/g, ""), 10) || 1112;
  const totalRows = 4;
  const totalCols = 5;
  const targetIndex = seatInt % (totalRows * totalCols) || 7;
  const startSeatNumber = seatInt - targetIndex;

  const gridCells = [];
  for (let r = 1; r <= totalRows; r++) {
    for (let c = 1; c <= totalCols; c++) {
      const idx = (r - 1) * totalCols + (c - 1);
      const cellSeatNum = startSeatNumber + idx;
      const isTarget = idx === targetIndex;
      gridCells.push({ row: r, col: c, seatNum: cellSeatNum, isTarget });
    }
  }

  const quickLinks = [
    {
      title: locale === "ar" ? "الاختبارات الأسبوعية" : "Course Quizzes",
      icon: <BookOpenCheck className="w-5 h-5" />,
      color: "#8b5cf6",
      href: `/${locale}/dashboard/quizzes`,
    },
    {
      title: locale === "ar" ? "نتائج المقررات" : "Academic Results",
      icon: <Award className="w-5 h-5" />,
      color: "#f59e0b",
      href: `/${locale}/dashboard/results`,
    },
    {
      title: locale === "ar" ? "جدول الامتحانات" : "Exam Schedule",
      icon: <Calendar className="w-5 h-5" />,
      color: "#10b981",
      href: `/${locale}/dashboard/exam-schedule`,
    },
    {
      title: locale === "ar" ? "مكان ورقم اللجنة" : "Exam Seating",
      icon: <MapPin className="w-5 h-5" />,
      color: "#06b6d4",
      href: `/${locale}/dashboard/exam-place`,
    },
    {
      title: locale === "ar" ? "الشكاوى والدعم" : "Student Support",
      icon: <MessageCircle className="w-5 h-5" />,
      color: "#ec4899",
      href: `/${locale}/dashboard/complaints`,
    },
  ];

  return (
    <div
      className="space-y-6 animate-fade-in pb-8"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      {/* Blocked Account / Tuition Fees Alert Banner */}
      {profile?.isBlocked && (
        <div className="rounded-2xl border-2 border-rose-500/40 bg-gradient-to-r from-rose-500/15 via-rose-500/10 to-rose-500/5 p-4 md:p-5 text-start shadow-lg shadow-rose-950/20 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-500 border border-rose-500/30">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="space-y-1 flex-1">
              <h3 className="text-sm md:text-base font-bold text-rose-600 dark:text-rose-400">
                {locale === 'ar'
                  ? '⚠️ تنبيه هام: الحساب محجوب مؤقتاً لعدم سداد المصروفات الدراسية'
                  : 'Important Notice: Account Withheld due to Outstanding Tuition Fees'}
              </h3>
              <p className="text-xs md:text-sm text-foreground/90 leading-relaxed">
                {locale === 'ar'
                  ? 'تم حجب بعض الخدمات الأكاديمية (مثل خوض الكويزات وتحميل مناهج المواد) نظراً لعدم سداد المصروفات الدراسية المقررة. يرجى مراجعة خزينة المعهد وشؤون الطلاب لتسوية الرسوم وإعادة تفعيل كافة الخدمات.'
                  : 'Certain portal features (including quiz attempts and syllabus PDF downloads) are restricted due to unpaid tuition fees. Please visit the institute treasury and student affairs office to settle fees and restore full access.'}
              </p>
              {profile.blockReason && (
                <div className="pt-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  {locale === 'ar' ? `السبب المسجل: ${profile.blockReason}` : `Notice: ${profile.blockReason}`}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Welcome Widget */}
      <div className="relative overflow-hidden bg-card/45 backdrop-blur-sm border border-border/70 shadow-[var(--shadow-glow)] rounded-2xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-primary/30 transition-all duration-300">
        <div className="space-y-2.5 z-10 text-start">
          <div className="inline-flex max-w-full items-center gap-2 rounded-squircle border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <GraduationCap className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {locale === "ar"
                ? "البوابة الأكاديمية الموحدة"
                : "Unified Academic Portal"}
            </span>
          </div>
          <div className="space-y-1">
            <h1 className="text-balance text-2xl font-bold leading-tight text-foreground drop-shadow md:text-3xl">
              {locale === "ar"
                ? `مرحباً بك، ${displayName || "..."}`
                : `Welcome, ${displayName || "..."}`}
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {locale === "ar"
                ? "مرحباً بك في لوحة التحكم الخاصة بك. يمكنك متابعة أدائك الأكاديمي، جدول امتحاناتك، والتقديم على طلبات الإرشاد والتسجيل."
                : "Welcome back to your workspace. Monitor your grades, track lectures, request advising, and view exam committees."}
            </p>
          </div>
        </div>
        <div className="flex gap-3 z-10 shrink-0">
          <Link href={`/${locale}/dashboard/profile`}>
            <button className="h-11 px-5 text-sm font-semibold rounded-squircle bg-primary hover:bg-primary/80 text-primary-foreground transition-all cursor-pointer">
              {locale === "ar" ? "الملف الشخصي" : "View Profile"}
            </button>
          </Link>
        </div>
      </div>

      {/* Academic Warning Alert Banner */}
      {(profile?.academicWarnings ?? 0) > 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-amber-500/10 backdrop-blur-sm p-4 sm:p-5 shadow-[0_0_25px_rgba(245,158,11,0.15)] animate-fade-in flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 z-10 text-start">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-squircle bg-amber-500/20 border border-amber-500/30 text-amber-400">
              <ShieldAlert className="h-6 w-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-squircle bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/30">
                  {locale === "ar"
                    ? `إنذار أكاديمي رقم ${profile?.academicWarnings}`
                    : `Academic Warning #${profile?.academicWarnings}`}
                </span>
                <span className="text-xs text-amber-200/80 font-medium">
                  {locale === "ar"
                    ? "المعدل التراكمي أقل من 2.00 (CGPA < 2.00)"
                    : "Cumulative GPA is below 2.00 threshold"}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-foreground/90">
                {locale === "ar"
                  ? "وفقاً للائحة الساعات المعتمدة، تم تحديد الحد الأقصى لساعات تسجيلك بـ 12 ساعة معتمدة. يلزم مراجعة واعتماد المرشد الأكاديمي."
                  : "Under Credit Hour regulations, your maximum course registration is capped at 12 credit hours. Academic advisor approval is mandatory."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 z-10">
            <Link href={`/${locale}/dashboard/academic-advising`}>
              <button className="h-9 px-4 text-xs font-semibold rounded-squircle bg-amber-500 text-slate-950 hover:bg-amber-400 transition-all cursor-pointer">
                {locale === "ar" ? "الإرشاد الأكاديمي" : "Academic Advising"}
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* Live Attendance Session Alert Banner */}
      {activeLiveSession &&
        !activeLiveSession.alreadyCheckedIn &&
        activeLiveSession.remainingSeconds > 0 && (
          <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-sm p-4 sm:p-5 shadow-[var(--shadow-glow)] animate-fade-in flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3.5 z-10">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
                <QrCode className="h-5 w-5" />
                <span className="absolute -top-1 -end-1 flex h-3 w-3 items-center justify-center">
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              </div>
              <div className="space-y-0.5 text-start">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary border border-primary/25">
                    {locale === "ar"
                      ? "جلسة حضور مباشرة مفتوحة الآن"
                      : "Live Attendance Session Open"}
                  </span>
                  <span className="font-mono text-xs font-bold text-foreground">
                    {activeLiveSession.courseCode}
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {activeLiveSession.courseName || activeLiveSession.courseCode}{" "}
                  —{" "}
                  <span className="font-normal text-muted-foreground">
                    {activeLiveSession.sessionType === "lecture"
                      ? locale === "ar"
                        ? "محاضرة"
                        : "Lecture"
                      : locale === "ar"
                        ? "سكشن"
                        : "Section"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {locale === "ar"
                    ? `بواسطة: ${activeLiveSession.createdByName || "المحاضر"} · متبقي ${Math.ceil(activeLiveSession.remainingSeconds / 60)} دقيقة`
                    : `By: ${activeLiveSession.createdByName || "Instructor"} · ${Math.ceil(activeLiveSession.remainingSeconds / 60)} min remaining`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 z-10 self-end sm:self-center">
              <button
                onClick={() => setShowScanDialog(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-squircle bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow-sm transition-all cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                <span>
                  {locale === "ar"
                    ? "مسح الرمز / توثيق الحضور"
                    : "Scan QR / Check In"}
                </span>
              </button>
            </div>
          </div>
        )}

      {/* Active/Open Quiz Alert Banner */}
      {activeQuiz && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-r from-primary/15 via-primary/10 to-transparent backdrop-blur-sm p-4 sm:p-5 shadow-[0_0_25px_rgba(14,165,233,0.15)] animate-fade-in flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 z-10 text-start">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-squircle bg-primary/20 border border-primary/30 text-primary">
              <FileText className="h-6 w-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-squircle bg-primary/25 px-2.5 py-0.5 text-xs font-bold text-primary border border-primary/35">
                  {locale === "ar" ? "اختبار متاح للتقديم الآن!" : "Quiz Open Now!"}
                </span>
                <span className="text-xs font-mono font-bold text-foreground">
                  {activeQuiz.courseCode} · {activeQuiz.courseName}
                </span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {activeQuiz.title}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  {activeQuiz.durationMinutes} {locale === "ar" ? "دقيقة" : "min"}
                </span>
                <span>•</span>
                <span>
                  {activeQuiz.totalMarks} {locale === "ar" ? "درجة" : "marks"}
                </span>
                {activeQuiz.endsAt && (
                  <>
                    <span>•</span>
                    <span className="text-amber-400 font-medium">
                      {locale === "ar" ? "ينتهي في:" : "Closes:"}{" "}
                      {new Date(activeQuiz.endsAt).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 z-10">
            <Link href={`/${locale}/dashboard/quizzes`}>
              <button className="h-10 px-5 text-xs sm:text-sm font-bold rounded-squircle bg-primary hover:bg-primary/85 text-primary-foreground shadow-md transition-all cursor-pointer flex items-center gap-2">
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{locale === "ar" ? "بدء الاختبار الآن" : "Start Quiz Now"}</span>
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* Quick Academic Services (Placed immediately after welcome header & alerts) */}
      <Card className="p-5 bg-card/60 backdrop-blur-sm border-border/80 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 rounded-2xl">
        <div className="flex items-center justify-between mb-4 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Layers className="w-5 h-5" />
            </div>
            <div className="text-start">
              <h3 className="font-bold text-base text-foreground">
                {locale === "ar" ? "الخدمات الأكاديمية السريعة" : "Quick Academic Services"}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {locale === "ar"
                  ? "الوصول المباشر للاختبارات الأسبوعية، النتائج، تسجيل الحضور، والخدمات الطلابية"
                  : "Instant access to weekly quizzes, grades, attendance check-in, and services"}
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {quickLinks.map((link, idx) => (
            <Link key={idx} href={link.href}>
              <div className="flex flex-col items-center gap-2.5 p-3.5 rounded-squircle border border-border/70 bg-card hover:bg-secondary/40 hover:border-primary/40 transition-all cursor-pointer text-center group h-full justify-center shadow-xs">
                <div
                  className="w-10 h-10 rounded-squircle flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                  style={{
                    backgroundColor: `${link.color}15`,
                    color: link.color,
                  }}
                >
                  {link.icon}
                </div>
                <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                  {link.title}
                </span>
              </div>
            </Link>
          ))}
          {/* Smart Attendance Check-in Direct Access */}
          <button
            type="button"
            onClick={() => setShowScanDialog(true)}
            className="flex flex-col items-center gap-2.5 p-3.5 rounded-squircle border border-border/70 bg-card hover:bg-secondary/40 hover:border-primary/40 transition-all cursor-pointer text-center group justify-center shadow-xs"
          >
            <div className="w-10 h-10 rounded-squircle flex items-center justify-center transition-transform duration-300 group-hover:scale-110 bg-cyan-500/15 text-cyan-400">
              <QrCode className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
              {locale === "ar" ? "تسجيل الحضور" : "Scan Attendance"}
            </span>
          </button>
          {/* Registration Direct Access */}
          <Link href={`/${locale}/dashboard/registration`}>
            <div className="flex flex-col items-center gap-2.5 p-3.5 rounded-squircle border border-border/70 bg-card hover:bg-secondary/40 hover:border-primary/40 transition-all cursor-pointer text-center group justify-center h-full shadow-xs">
              <div className="w-10 h-10 rounded-squircle bg-emerald-500/15 text-emerald-400 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                <GraduationCap className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {locale === "ar" ? "تسجيل المقررات" : "Course Registration"}
              </span>
            </div>
          </Link>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* GPA & Advising Widget */}
        <Card className="col-span-12 lg:col-span-4 p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between gap-4 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-primary" />
                {locale === "ar" ? "المعدل والجيل الأكاديمي" : "GPA & Advising"}
              </h3>
            </div>
            <div className="flex items-center gap-6 my-4">
              <div className="relative flex items-center justify-center shrink-0">
                <svg className="w-24 h-24 transform -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-secondary"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={251.2}
                    strokeDashoffset={
                      251.2 - (251.2 * (eligibility?.gpa ?? 0)) / 4.0
                    }
                    className="text-primary transition-all duration-1000"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-xl font-bold font-mono text-foreground">
                    {eligibility?.gpa !== undefined
                      ? eligibility.gpa.toFixed(2)
                      : "0.00"}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                    GPA
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {locale === "ar"
                    ? "أقصى ساعات أسبوعية:"
                    : "Max Credit Hours:"}
                </p>
                <p className="text-2xl font-bold text-foreground font-mono">
                  {eligibility?.maxCreditHours ?? 12}
                </p>
              </div>
            </div>
          </div>
          <div>
            {eligibility?.requiresAdvisor ? (
              <div className="flex items-start gap-2.5 p-3 rounded-squircle bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">
                    {locale === "ar"
                      ? "إرشاد أكاديمي مطلوب"
                      : "Advising Required"}
                  </p>
                  <p className="mt-0.5 text-muted-foreground leading-normal">
                    {locale === "ar"
                      ? "معدلك الأكاديمي يتطلب مراجعة المرشد الأكاديمي لتسجيل المواد."
                      : "Your current GPA requires academic advisor approval to complete registration."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 p-3 rounded-squircle bg-primary/10 border border-primary/20 text-primary text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-semibold">
                  {locale === "ar"
                    ? "حالة أكاديمية مستقرة - تسجيل مباشر"
                    : "Clear Academic Standing - Direct Registration"}
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Academic Profile Widget */}
        <Card className="col-span-12 lg:col-span-4 p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between gap-4 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                {locale === "ar" ? "الملخص الدراسي" : "Academic Profile"}
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm border-b border-border/50 pb-2">
                <span className="text-muted-foreground">
                  {locale === "ar" ? "الكود الأكاديمي" : "Student Code"}
                </span>
                <span className="font-mono font-bold text-foreground">
                  {profile?.studentCode || user?.studentCode || "N/A"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-border/50 pb-2">
                <span className="text-muted-foreground">
                  {locale === "ar" ? "المستوى" : "Level"}
                </span>
                <span className="font-semibold text-foreground">
                  {profile?.level
                    ? locale === "ar"
                      ? `المستوى ${profile.level}`
                      : `Level ${profile.level}`
                    : locale === "ar"
                      ? "المستوى 1"
                      : "Level 1"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-border/50 pb-2">
                <span className="text-muted-foreground">
                  {locale === "ar" ? "التخصص" : "Department"}
                </span>
                <span className="font-semibold text-foreground">
                  {profile?.department || "General"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">
                  {locale === "ar"
                    ? "المجموعة / الفصل الدراسي"
                    : "Group & Semester"}
                </span>
                <span className="font-semibold text-foreground">
                  {profile
                    ? `${profile.group || "-"} / ${profile.semester || "-"}`
                    : "..."}
                </span>
              </div>
            </div>
          </div>
          <Link href={`/${locale}/dashboard/profile`} className="w-full">
            <button className="w-full h-10 text-xs font-semibold rounded-squircle bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1">
              {locale === "ar" ? "تعديل بيانات التواصل" : "Edit Contact Info"}
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </Link>
        </Card>

        {/* Attendance Widget */}
        <Card className="col-span-12 lg:col-span-4 p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between gap-4 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                {locale === "ar"
                  ? "نسبة الحضور الإجمالية"
                  : "Attendance Summary"}
              </h3>
            </div>
            <div className="space-y-4 my-2">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-black font-mono text-foreground">
                  {attendance
                    ? `${attendance.attendancePercentage.toFixed(1)}%`
                    : "..."}
                </span>
                <span className="text-xs text-muted-foreground">
                  {locale === "ar"
                    ? "مطلوب 75% لتجنب الحظر"
                    : "75% minimum required"}
                </span>
              </div>
              <Progress
                value={attendance?.attendancePercentage ?? 0}
                className={`h-2.5 ${(attendance?.attendancePercentage ?? 0) < 75 ? "bg-red-500/20 text-red-500" : "text-primary"}`}
              />
              <div className="grid grid-cols-2 gap-4 text-center mt-2">
                <div className="bg-secondary/40 p-2.5 rounded-squircle border border-border/50">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">
                    {locale === "ar" ? "المحاضرات المقبولة" : "Attended"}
                  </p>
                  <p className="text-lg font-bold font-mono text-foreground mt-0.5">
                    {attendance?.attendedLectures ?? 0}
                  </p>
                </div>
                <div className="bg-secondary/40 p-2.5 rounded-squircle border border-border/50">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">
                    {locale === "ar" ? "الغياب" : "Absent"}
                  </p>
                  <p className="text-lg font-bold font-mono text-red-500 mt-0.5">
                    {attendance?.absenceLectures ?? 0}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <button
              type="button"
              onClick={() => setShowScanDialog(true)}
              className="w-full sm:w-1/2 h-10 text-xs font-bold rounded-squircle bg-primary hover:bg-primary/90 text-primary-foreground transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>{locale === "ar" ? "مسح الحضور (QR)" : "Scan QR"}</span>
            </button>
            <Link
              href={`/${locale}/dashboard/attendance`}
              className="w-full sm:w-1/2"
            >
              <button className="w-full h-10 text-xs font-semibold rounded-squircle bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1">
                {locale === "ar" ? "سجل المحاضرات" : "Detailed Logs"}
                <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            </Link>
          </div>
        </Card>

        {/* Academic Email Card */}
        <Card className="col-span-12 lg:col-span-6 p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between gap-4 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground leading-tight">
                    {locale === "ar" ? "البريد الأكاديمي الرسمي" : "Institutional Webmail"}
                  </h3>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Globe className="w-3 h-3 text-primary" />
                    Google Workspace
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                  academicEmailQuery.data?.status === "active"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-muted text-muted-foreground border-border",
                )}
              >
                {academicEmailQuery.data?.status === "active"
                  ? locale === "ar" ? "نشط ومفعل" : "Active"
                  : locale === "ar" ? "قيد الإعداد" : "Pending"}
              </span>
            </div>

            {academicEmailQuery.data?.academicEmail ? (
              <div className="space-y-3.5">
                <div className="space-y-1 text-start">
                  <label className="text-[11px] font-bold text-muted-foreground">
                    {locale === "ar" ? "عنوان البريد الأكاديمي" : "Your Academic Email"}
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      readOnly
                      value={academicEmailQuery.data.academicEmail}
                      dir="ltr"
                      style={{ paddingRight: '5.5rem', paddingLeft: '0.875rem', textAlign: 'left' }}
                      className="w-full rounded-xl border border-border bg-secondary/50 py-2.5 font-mono text-xs sm:text-sm font-semibold text-foreground outline-none text-left"
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 z-10"
                      style={{ right: '0.5rem', left: 'auto' }}
                    >
                      <CopyButton
                        value={academicEmailQuery.data.academicEmail}
                        label={locale === "ar" ? "نسخ" : "Copy"}
                        successMessage={locale === "ar" ? "تم نسخ البريد الأكاديمي" : "Email copied"}
                        className="h-7 rounded-md bg-card border border-border/80 px-2.5 text-xs font-semibold text-foreground shadow-xs hover:border-primary/50"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-squircle bg-secondary/30 border border-border/60 text-xs text-muted-foreground space-y-1 text-start">
                  <p className="font-semibold text-foreground text-[11px]">
                    {locale === "ar" ? "🔑 كلمة المرور الافتراضية:" : "🔑 Initial Login Password:"}
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    {locale === "ar"
                      ? "رقمك القومي كاملاً (14 رقماً) المسجل بملفك الرسمي، مع وصول كامل لخدمات Google Workspace (Gmail, Drive, Meet, Classroom)."
                      : "Your 14-digit National ID number as registered in your official file. Grants full Google Workspace access (Gmail, Drive, Meet, Classroom)."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground space-y-1">
                <Mail className="w-8 h-8 mx-auto text-muted mb-2" />
                <p className="font-semibold text-foreground">
                  {locale === "ar" ? "البريد الأكاديمي قيد التجهيز" : "Academic Email Being Provisioned"}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  {locale === "ar"
                    ? "يرجى مراجعة إدارة شؤون الطلاب أو مركز تكنولوجيا المعلومات لتفعيل بريدك."
                    : "Please check with student affairs or the IT department to activate your webmail."}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-border/50">
            <a
              href="https://mail.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-10 px-3 text-xs font-bold rounded-squircle bg-gradient-to-r from-teal-700 via-teal-600 to-teal-700 hover:from-teal-600 hover:to-teal-500 text-white shadow-md hover:shadow-teal-900/30 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 border border-teal-500/30 whitespace-nowrap"
            >
              <Mail className="w-4 h-4 text-teal-100 shrink-0" />
              <span className="font-bold">{locale === "ar" ? "دخول بريد Google (Gmail)" : "Sign In to Google Mail"}</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80 shrink-0" />
            </a>
            <Link href={`/${locale}/dashboard/profile`}>
              <button className="h-10 px-4 text-xs font-semibold rounded-squircle bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1">
                <User className="w-3.5 h-3.5" />
                <span>{locale === "ar" ? "الملف الشخصي" : "Profile"}</span>
              </button>
            </Link>
          </div>
        </Card>

        {/* Exam Schedule Thumbnail Widget */}
        <Card className="col-span-12 lg:col-span-6 p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between gap-4 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground leading-tight">
                    {locale === "ar" ? "جدول الامتحانات المعتمد" : "Exam Timetable"}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "ar" ? "معاينة الجدول الدراسي الرسمي" : "Official schedule preview"}
                  </p>
                </div>
              </div>
              <Link href={`/${locale}/dashboard/exam-schedule`}>
                <span className="text-xs font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1">
                  {locale === "ar" ? "عرض بالكامل" : "View All"}
                  <ChevronRight className="w-3 h-3 rtl:rotate-180" />
                </span>
              </Link>
            </div>

            {activeSchedule ? (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-xl border border-border bg-secondary/30 h-36 flex items-center justify-center group">
                  {activeSchedule.fileUrl.toLowerCase().endsWith('.pdf') ? (
                    <div className="flex flex-col items-center justify-center gap-2 text-center p-4">
                      <FileText className="w-10 h-10 text-primary" />
                      <span className="text-xs font-bold text-foreground">
                        {activeSchedule.title} (PDF)
                      </span>
                    </div>
                  ) : (
                    <>
                      <img
                        src={activeSchedule.fileUrl}
                        alt={activeSchedule.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-end p-3">
                        <div className="text-white text-xs font-bold drop-shadow">
                          {activeSchedule.title}
                        </div>
                      </div>
                    </>
                  )}
                  <Link
                    href={`/${locale}/dashboard/exam-schedule`}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold flex items-center gap-1.5 shadow-lg">
                      <Eye className="w-3.5 h-3.5" />
                      {locale === "ar" ? "تكبير الجدول" : "View Full"}
                    </span>
                  </Link>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span className="font-semibold text-foreground">{activeSchedule.title}</span>
                  <span className="font-mono">{activeSchedule.academicYear}</span>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground space-y-1">
                <Calendar className="w-8 h-8 mx-auto text-muted mb-2" />
                <p className="font-semibold text-foreground">
                  {locale === "ar" ? "جدول الامتحانات قيد الإعداد" : "Exam Schedule Pending"}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  {locale === "ar"
                    ? "سيتم رفع واعتماد جداول الامتحانات رسمياً فور إعلانها من إدارة شؤون الطلاب."
                    : "The official exam schedule will appear here as soon as published by the administration."}
                </p>
              </div>
            )}
          </div>

          <Link href={`/${locale}/dashboard/exam-schedule`} className="w-full">
            <button className="w-full h-10 text-xs font-semibold rounded-squircle bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1">
              {locale === "ar" ? "فتح صفحة جدول الامتحانات" : "Open Exam Schedule Page"}
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </Link>
        </Card>

        {/* Exam Seat / Place Widget */}
        <Card className="col-span-12 lg:col-span-6 p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between gap-4 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground leading-tight">
                    {locale === "ar"
                      ? "مكان ورقم لجنة الامتحان"
                      : "Exam Seating & Placement"}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "ar"
                      ? "توزيع المقاعد وأرقام الجلوس الرسمية"
                      : "Official desk assignment"}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                  profile?.seatNumber
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-muted text-muted-foreground border-border",
                )}
              >
                {profile?.seatNumber
                  ? locale === "ar" ? "معتمد" : "Allocated"
                  : locale === "ar" ? "قيد التوزيع" : "Pending"}
              </span>
            </div>

            {profile?.seatNumber ? (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 my-2">
                {/* Details Section */}
                <div className="md:col-span-5 space-y-3.5 flex flex-col justify-center">
                  <div className="p-3.5 rounded-squircle bg-primary/5 border border-primary/15 flex items-center gap-3.5 text-start">
                    <div className="w-10 h-10 rounded-squircle bg-primary/15 flex items-center justify-center text-primary shrink-0">
                      <span className="font-mono font-black text-sm">#</span>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase">
                        {locale === "ar" ? "رقم الجلوس" : "Seat Number"}
                      </p>
                      <p className="text-xl font-bold font-mono text-primary drop-shadow-[0_0_8px_rgba(14,165,233,0.3)] mt-0.5">
                        {profile.seatNumber}
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-squircle bg-secondary/35 border border-border/60 flex items-center gap-3.5 text-start">
                    <div className="w-10 h-10 rounded-squircle bg-secondary flex items-center justify-center text-muted-foreground shrink-0">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground font-bold uppercase">
                        {locale === "ar" ? "اللجنة والمبنى" : "Building & Room"}
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-foreground mt-0.5 truncate">
                        {profile.examBuilding ? `${profile.examBuilding} · ` : ""}
                        {profile.examRoom
                          ? `${locale === "ar" ? "مدرج" : "Hall"} ${profile.examRoom}`
                          : locale === "ar" ? "مدرج رئيسي" : "Main Hall"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Seating Mini-Map Section */}
                <div className="md:col-span-7 flex flex-col justify-center items-center">
                  <div className="w-full max-w-[280px] bg-secondary/20 border border-border/60 rounded-xl p-3 text-center relative shadow-sm">
                    {/* Front representation */}
                    <div className="w-full bg-secondary/70 border border-border/40 py-1 rounded text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                      {locale === "ar"
                        ? "السبورة والمنصة الرئيسية"
                        : "Stage & Front Board"}
                    </div>

                    {/* Desks Grid */}
                    <div className="grid grid-cols-5 gap-1.5 justify-center mb-2.5">
                      {gridCells.map((cell, index) => (
                        <div
                          key={index}
                          className={cn(
                            "h-8 rounded-md flex flex-col items-center justify-center text-[9px] font-mono font-black transition-all select-none border",
                            cell.isTarget
                              ? "bg-primary border-primary text-white shadow-[0_0_10px_rgba(14,165,233,0.4)]"
                              : "bg-muted/10 border-border/30 text-muted-foreground/35",
                          )}
                          title={
                            cell.isTarget
                              ? locale === "ar"
                                ? `مقعدك (${cell.seatNum})`
                                : `Your Seat (${cell.seatNum})`
                              : undefined
                          }
                        >
                          <span className="text-[6.5px] text-muted-foreground/50 scale-90 block">
                            {cell.isTarget
                              ? (locale === "ar" ? "أنت" : "YOU")
                              : (locale === "ar" ? "مقعد" : "Seat")}
                          </span>
                          <span
                            className={cn(
                              "text-[9px] font-bold",
                              cell.isTarget
                                ? "text-white"
                                : "text-muted-foreground/50",
                            )}
                          >
                            {cell.seatNum}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Simple Legend */}
                    <div className="flex items-center justify-between text-[8px] text-muted-foreground/80 border-t border-border/30 pt-1.5 mt-0.5">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded bg-muted/20 border border-border/40" />
                        <span>{locale === "ar" ? "باقي الطلاب" : "Other"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded bg-primary shadow-[0_0_4px_rgba(14,165,233,0.5)]" />
                        <span className="font-bold text-primary">{locale === "ar" ? "مكان جلوسك" : "Your Seat"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <CalendarClock className="w-9 h-9 text-muted mb-2.5 opacity-60" />
                <p className="text-sm font-semibold text-foreground">
                  {locale === "ar"
                    ? "أماكن اللجان قيد الإعداد"
                    : "Exam Seating Not Allocated"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  {locale === "ar"
                    ? "سيتم نشر تفاصيل اللجان وتوزيع المقاعد وأرقام الجلوس فور صدور جدول الامتحانات رسمياً."
                    : "Room allocations and seat numbers will be posted as soon as exam timetables are published."}
                </p>
              </div>
            )}
          </div>
          <Link href={`/${locale}/dashboard/exam-place`} className="w-full">
            <button className="w-full h-10 text-xs font-semibold rounded-squircle bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1">
              {locale === "ar"
                ? "عرض تفاصيل وخريطة اللجنة"
                : "View Full Seating Details"}
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </Link>
        </Card>

        {/* Course Syllabi & Curriculum Card (Side-by-side with Exam Seating in 2 columns) */}
        <Card className="col-span-12 lg:col-span-6 p-5 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4 border-b border-border pb-3 text-start">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground leading-tight">
                    {locale === "ar"
                      ? "المناهج ومحتوى المقررات الدراسية (PDF)"
                      : "Course Curriculum & Syllabi (PDF)"}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {locale === "ar"
                      ? "تحميل واستعراض المنهج الأكاديمي المعتمد لمقرراتك"
                      : "Download official syllabi for registered courses"}
                  </p>
                </div>
              </div>
              {syllabiQuery.data?.registeredCount !== undefined && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-squircle bg-primary/10 text-primary border border-primary/20 shrink-0">
                  {locale === "ar"
                    ? `${syllabiQuery.data.registeredCount} مسجل`
                    : `${syllabiQuery.data.registeredCount} Enrolled`}
                </span>
              )}
            </div>

            {syllabiQuery.isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pe-1 scrollbar-thin">
                {(
                  syllabiQuery.data?.registeredCourses?.length
                    ? syllabiQuery.data.registeredCourses
                    : (syllabiQuery.data?.availableLevelCourses || []).slice(0, 6)
                ).map((course: any) => (
                  <div
                    key={course.code}
                    className="rounded-xl border border-border/70 bg-card/80 p-3 flex items-center justify-between gap-3 text-start hover:border-primary/40 hover:bg-card/95 transition-all group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Cover thumbnail or academic textbook spine preview */}
                      {course.coverImageUrl ? (
                        <div className="w-12 h-16 rounded-md overflow-hidden shrink-0 border border-border/60 shadow-sm bg-secondary/40 group-hover:scale-105 transition-transform duration-300">
                          <img
                            src={course.coverImageUrl}
                            alt={course.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-16 rounded-md bg-gradient-to-b from-primary/20 via-primary/10 to-primary/5 border border-primary/25 flex flex-col items-center justify-between p-1.5 shrink-0 text-primary group-hover:border-primary/45 transition-colors shadow-xs">
                          <BookOpen className="w-4 h-4 opacity-80 mt-1" />
                          <span className="text-[8px] font-mono font-bold leading-none">{course.code}</span>
                          <span className="w-4 h-0.5 rounded-full bg-primary/40 mb-0.5" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <bdi className="font-mono text-xs font-bold text-primary">
                            {course.code}
                          </bdi>
                          {course.isRegistered && (
                            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.2 text-[9px] font-semibold text-emerald-400">
                              {locale === "ar" ? "مسجل" : "Enrolled"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-foreground line-clamp-1 leading-snug">
                          {locale === "ar"
                            ? course.nameAr || course.name
                            : course.nameEn || course.name}
                        </p>
                        {course.doctorName && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                            <UserCheck className="w-3 h-3 text-primary shrink-0" />
                            <span className="truncate">
                              {locale === "ar"
                                ? course.doctorNameAr || course.doctorName
                                : course.doctorName}
                            </span>
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {locale === "ar" ? `المستوى ${course.level}` : `Level ${course.level}`} · {course.creditHours ?? 3} {locale === "ar" ? "ساعات" : "cr"}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {course.syllabusPdfUrl ? (
                        <a
                          href={course._id ? `${apiBaseUrl}/courses/${course._id}/syllabus/download` : course.syllabusPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-squircle bg-primary hover:bg-primary/85 text-primary-foreground text-xs font-semibold transition-all shadow-xs"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{locale === "ar" ? "تحميل PDF" : "PDF"}</span>
                        </a>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/70 italic px-2 py-1 rounded bg-secondary/30">
                          {locale === "ar" ? "قيد الإعداد" : "Pending"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Link href={`/${locale}/dashboard/registration`} className="w-full">
            <button className="w-full h-10 text-xs font-semibold rounded-squircle bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1">
              <span>{locale === "ar" ? "عرض الخطة الدراسية والمقررات" : "View Curriculum & Study Plan"}</span>
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </Link>
        </Card>
      </div>

      {/* Student QR Scanner Dialog */}
      <StudentQrScannerDialog
        open={showScanDialog}
        onOpenChange={setShowScanDialog}
        onSuccess={() => {
          attendanceQuery.refetch();
          liveSessionsQuery.refetch();
        }}
        locale={locale}
      />
    </div>
  );
}
