"use client";
import type { TimetableEntry } from '@/features/course-schedules/timetable-model';

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Users,
  BookOpen,
  MessageSquareWarning,
  TrendingUp,
  UserPlus,
  Upload,
  Calendar,
  ArrowUpRight,
  CircleAlert,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  FileSpreadsheet,
  Download,
  GraduationCap,
  Award,
  ClipboardCheck,
  FileText,
  CalendarDays,
  MapPin,
  Clock,
  Eye,
  Maximize2,
  FileImage,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import {
  formatStaffDisplayName,
  getStaffRoleLabel,
} from "@student-portal/shared";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api, { getApiErrorMessage, PaginatedResponse } from "@/lib/api";
import { PageTitleBanner } from "@/components/ui/page-title-banner";
import {
  GpaDistributionChart,
  defaultGpaData,
} from "@/components/dashboard/GpaDistributionChart";
import {
  CohortRetentionChart,
  defaultCohortData,
} from "@/components/dashboard/CohortRetentionChart";
import {
  DepartmentCapacityChart,
  defaultDepartmentData,
} from "@/components/dashboard/DepartmentCapacityChart";
import { ComplaintsWeeklyTrendChart } from "@/components/dashboard/ComplaintsWeeklyTrendChart";
import { ComplaintsStatusChart } from "@/components/dashboard/ComplaintsStatusChart";
import { EnrollmentStatusChart } from "@/components/dashboard/EnrollmentStatusChart";

import { CoursesByLevelChart } from "@/components/dashboard/CoursesByLevelChart";

import {
  DeferredAnalyticsSummary,
  DeferredDashboardSection,
} from "@/features/analytics/components/deferred-analytics-summary";

import { StatCard, StatCardRow } from "@/components/ui/stat-card";

import { createStudent } from "@/features/students/api";

import { saveGrade } from "@/features/grades/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const ActiveSessionsDialog = dynamic(() =>
  import("@/components/dashboard/ActiveSessionsDialog").then(
    (module) => module.ActiveSessionsDialog,
  ),
);
const AnalyticsExportModal = dynamic(() =>
  import("@/features/analytics/components/analytics-export-modal").then(
    (module) => module.AnalyticsExportModal,
  ),
);
const StudentFormDialog = dynamic(() =>
  import("@/features/students/components/student-form-dialog").then(
    (module) => module.StudentFormDialog,
  ),
);
const DataUploadDialog = dynamic(() =>
  import("@/components/ui/data-upload-dialog").then(
    (module) => module.DataUploadDialog,
  ),
);
const GradeFormDialog = dynamic(() =>
  import("@/features/grades/components/grade-form-dialog").then(
    (module) => module.GradeFormDialog,
  ),
);

interface DashboardCourse {
  _id: string;
  code?: string;
  name?: string;
  nameAr?: string;
  nameEn?: string;
  level?: string;
  academicLevel?: string;
  isActive?: boolean;
}

interface AssignedCourse {
  _id: string;
  code: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  credits?: number;
  level?: number | string;
  semester?: number | string;
  department?: string;
  syllabusUrl?: string;
  syllabusFileName?: string;
  enrolledStudentsCount?: number;
}

interface DashboardComplaint {
  _id: string;
  status: "open" | "in_review" | "in_progress" | "resolved" | "closed";
  priority?: "low" | "medium" | "high" | "urgent";
  type?: string;
  createdAt?: string;
}

function formatCourseLevel(lvl: string | number | undefined, isAr: boolean) {
  const l = String(lvl ?? "");
  if (isAr) {
    if (l === "1") return "المستوى الأول";
    if (l === "2") return "المستوى الثاني";
    if (l === "3") return "المستوى الثالث";
    if (l === "4") return "المستوى الرابع";
    return l ? `المستوى ${l}` : "—";
  }
  return l ? `Level ${l}` : "—";
}

function formatCourseSemester(sem: string | number | undefined, isAr: boolean) {
  const s = String(sem ?? "").toLowerCase();
  if (isAr) {
    if (s === "first" || s === "1") return "الترم الأول";
    if (s === "second" || s === "2") return "الترم الثاني";
    if (s === "summer") return "الفصل الصيفي";
    return s || "—";
  }
  if (s === "first" || s === "1") return "First Term";
  if (s === "second" || s === "2") return "Second Term";
  if (s === "summer") return "Summer Term";
  return s || "—";
}

function getLastSevenDayTrend(
  complaints: DashboardComplaint[],
  locale: string,
) {
  const formatter = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-EG" : "en-US",
    {
      month: "short",
      day: "numeric",
    },
  );
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return {
      key: date.toISOString().slice(0, 10),
      name: formatter.format(date),
      value: 0,
    };
  });
  const counts = new Map(days.map((day) => [day.key, day]));

  complaints.forEach((complaint) => {
    if (!complaint.createdAt) return;
    const key = new Date(complaint.createdAt).toISOString().slice(0, 10);
    const day = counts.get(key);
    if (day) {
      day.value += 1;
    }
  });

  return days;
}

interface QuickActionProps {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
}

function QuickAction({ title, icon, onClick }: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-16 w-full text-start items-center gap-3 rounded-xl border border-border/70 bg-card/90 p-4 shadow-[var(--shadow-glow)] backdrop-blur transition-all duration-300 hover:border-primary/40 hover:bg-card-hover/70 cursor-pointer"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle border border-primary/30 bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-white">
        {icon}
      </div>
      <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
        {title}
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </button>
  );
}

function InsightCard({
  label,
  value,
  helper,
  icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  helper: string;
  icon?: React.ReactNode;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    primary: "border-primary/30 bg-primary/10 text-primary",
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning",
    danger: "border-danger/30 bg-danger/10 text-danger",
  }[tone];

  return (
    <div className="rounded-xl border border-border/70 bg-card/90 p-4 shadow-[var(--shadow-glow)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold leading-tight text-foreground">
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
        <div className={`rounded-squircle border p-2.5 ${toneClass}`}>
          {icon ?? <CircleAlert className="h-5 w-5" />}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const t = useTranslations("dashboard");
  const tNav = useTranslations("nav");
  const tStudents = useTranslations("students");
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = (params?.locale as string) || "ar";
  const isAr = locale === "ar";
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isStaff = user?.role === "staff";
  const isDoctor = isStaff && user?.staffType === "doctor";
  const isTeachingAssistant =
    isStaff && user?.staffType === "teaching_assistant";
  const isAdministrative =
    isStaff && (user?.staffType === "administrative" || !user?.staffType);

  const assignedCoursesQuery = useQuery({
    queryKey: ["staff-assigned-courses", user?._id],
    queryFn: async () => {
      const res = await api.get<AssignedCourse[]>("/staff/me/assigned-courses");
      return res.data ?? [];
    },
    enabled: isStaff,
  });
  const assignedCourses = React.useMemo(() => assignedCoursesQuery.data ?? [], [assignedCoursesQuery.data]);

  const staffTotalEnrolledStudents = React.useMemo(() => {
    return assignedCourses.reduce(
      (sum, c) => sum + (c.enrolledStudentsCount || 0),
      0,
    );
  }, [assignedCourses]);

  const staffTotalCredits = React.useMemo(() => {
    return assignedCourses.reduce((sum, c) => sum + (c.credits || 0), 0);
  }, [assignedCourses]);

  const doctorCourseEnrollmentData = React.useMemo(() => {
    return assignedCourses.map((c) => ({
      code: c.code,
      name: isAr ? c.nameAr || c.name : c.nameEn || c.name,
      students: c.enrolledStudentsCount || 0,
      credits: c.credits || 0,
    }));
  }, [assignedCourses, isAr]);

  const doctorLevelDistributionData = React.useMemo(() => {
    const counts = new Map<
      string,
      { level: string; courses: number; students: number }
    >();
    assignedCourses.forEach((c) => {
      const lvl = String(c.level ?? "1");
      const existing = counts.get(lvl) || {
        level: isAr ? `المستوى ${lvl}` : `Level ${lvl}`,
        courses: 0,
        students: 0,
      };
      existing.courses += 1;
      existing.students += c.enrolledStudentsCount || 0;
      counts.set(lvl, existing);
    });
    return Array.from(counts.values());
  }, [assignedCourses, isAr]);

  const myScheduleQuery = useQuery({
    queryKey: ["staff-my-schedule", user?._id],
    queryFn: async () => {
      const res = await api.get<Array<TimetableEntry & { notes?: string }>>("/staff/me/schedule");
      return res.data ?? [];
    },
    enabled: isStaff,
  });
  const mySchedules = React.useMemo(() => myScheduleQuery.data ?? [], [myScheduleQuery.data]);
  const [doctorScheduleDayFilter, setDoctorScheduleDayFilter] = useState("all");

  const filteredDoctorSchedules = React.useMemo(() => {
    if (doctorScheduleDayFilter === "all") return mySchedules;
    return mySchedules.filter(
      (s) => s.dayOfWeek === doctorScheduleDayFilter,
    );
  }, [mySchedules, doctorScheduleDayFilter]);

  const [previewExamSchedule, setPreviewExamSchedule] = useState<{
    _id: string;
    title: string;
    examType: string;
    academicYear: string;
    semester: string;
    fileUrl: string;
  } | null>(null);

  const doctorExamSchedulesQuery = useQuery({
    queryKey: ["doctor-dashboard-exam-schedules"],
    queryFn: async () => {
      try {
        const res = await api.get<Array<{ _id: string; title: string; fileUrl: string; academicYear: string; semester: string; examType: string }>>("/admin/exam-schedules");
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
    },
    enabled: isStaff,
  });
  const doctorExamSchedules = doctorExamSchedulesQuery.data ?? [];

  const hasPerm = (p: string) =>
    isAdmin || Boolean(user?.permissions?.includes(p));

  // Modal State for Quick Actions
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAddGradeOpen, setIsAddGradeOpen] = useState(false);
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const [isComplaintLookupOpen, setIsComplaintLookupOpen] = useState(false);
  const [isAddScheduleOpen, setIsAddScheduleOpen] = useState(false);
  const [isActiveSessionsOpen, setIsActiveSessionsOpen] = useState(false);
  const [isSubmittingStudent, setIsSubmittingStudent] = useState(false);
  const [isSubmittingGrade, setIsSubmittingGrade] = useState(false);
  const [isSubmittingCourse, setIsSubmittingCourse] = useState(false);

  // New course form state
  const [courseForm, setCourseForm] = useState({
    code: "",
    name: "",
    nameAr: "",
    nameEn: "",
    level: "1",
    semester: "first",
    creditHours: 3,
    department: "نظم معلومات الأعمال",
    type: "required",
  });

  // Complaint quick lookup
  const [complaintSearch, setComplaintSearch] = useState("");

  // Fetch counts
  const studentsStatsQuery = useQuery({
    queryKey: ["admin-stats-students-overview"],
    enabled: hasPerm("students.read"),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get<{
        total: number;
        active: number;
        suspended: number;
        graduated: number;
        withdrawn: number;
        liveOnline?: number;
        liveOnlineStaff?: number;
        byLevel: { level: string; count: number }[];
        departments?: {
          department: string;
          nameAr: string;
          nameEn: string;
          levels: string[];
          enrolled: number;
        }[];
        cohortRetention?: {
          level: string;
          total: number;
          active: number;
          probation: number;
          attrition: number;
          retentionRate: number;
        }[];
        gpaDistribution?: {
          label: string;
          labelAr: string;
          range: string;
          count: number;
        }[];
      }>("/admin/students-stats");
      return res.data;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const coursesCountQuery = useQuery({
    queryKey: ["admin-stats-courses"],
    enabled: hasPerm("courses.read"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<unknown>>("/admin/courses", {
        params: { limit: 1 },
      });
      return res.data?.total || 0;
    },
  });

  const complaintsCountQuery = useQuery({
    queryKey: ["admin-stats-complaints"],
    enabled: hasPerm("complaints.read"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<unknown>>(
        "/admin/complaints",
        { params: { limit: 1, view: "summary" } },
      );
      return res.data?.total || 0;
    },
  });

  const coursesAnalyticsQuery = useQuery({
    queryKey: ["admin-analytics-courses"],
    enabled: hasPerm("courses.read"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<DashboardCourse>>(
        "/admin/courses",
        {
          params: { limit: 100 },
        },
      );
      return res.data.items;
    },
  });

  const complaintsAnalyticsQuery = useQuery({
    queryKey: ["admin-analytics-complaints"],
    enabled: hasPerm("complaints.read"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<DashboardComplaint>>(
        "/admin/complaints",
        {
          params: { limit: 100, view: "summary" },
        },
      );
      return res.data.items;
    },
  });

  const coursesListForGrades = React.useMemo(() => {
    return (coursesAnalyticsQuery.data ?? []).map((c) => ({
      _id: c._id,
      code: c.code || "",
      name: c.name || c.nameAr || c.nameEn || "",
      nameAr: c.nameAr,
      nameEn: c.nameEn,
    }));
  }, [coursesAnalyticsQuery.data]);

  const totalStudents = studentsStatsQuery.isLoading
    ? "..."
    : String(studentsStatsQuery.data?.total ?? 0);
  const totalCourses = coursesCountQuery.isLoading
    ? "..."
    : String(coursesCountQuery.data ?? 0);
  const activeComplaints = complaintsCountQuery.isLoading
    ? "..."
    : String(complaintsCountQuery.data ?? 0);
  const courses = React.useMemo(
    () => coursesAnalyticsQuery.data ?? [],
    [coursesAnalyticsQuery.data],
  );
  const complaints = React.useMemo(
    () => complaintsAnalyticsQuery.data ?? [],
    [complaintsAnalyticsQuery.data],
  );

  const enrollmentStatusData = React.useMemo(() => {
    if (studentsStatsQuery.data) {
      const s = studentsStatsQuery.data;
      return [
        { name: "active", key: "active", value: s.active },
        { name: "suspended", key: "suspended", value: s.suspended },
        { name: "graduated", key: "graduated", value: s.graduated },
        { name: "withdrawn", key: "withdrawn", value: s.withdrawn },
      ].filter((d) => d.value > 0);
    }
    return [];
  }, [studentsStatsQuery.data]);

  const courseLevelData = React.useMemo(() => {
    const counts = new Map<string, number>();
    courses.forEach((c) => {
      const lvl = String(c.level ?? c.academicLevel ?? "1").trim();
      counts.set(lvl, (counts.get(lvl) ?? 0) + 1);
    });
    return ["1", "2", "3", "4"].map((lvl) => ({
      name: lvl,
      value: counts.get(lvl) ?? 0,
    }));
  }, [courses]);

  const complaintStatusData = React.useMemo(() => {
    const counts = new Map<string, number>();
    complaints.forEach((c) => {
      const key = (c.status || "open").toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const allStatuses = ["open", "in_progress", "resolved", "closed"];
    return allStatuses.map((st) => ({
      name: st,
      statusKey: st,
      value: counts.get(st) ?? 0,
    }));
  }, [complaints]);

  const weeklyTrendData = React.useMemo(
    () => getLastSevenDayTrend(complaints, locale),
    [complaints, locale],
  );

  const urgentComplaints = complaints.filter(
    (item) => item.priority === "urgent" || item.priority === "high",
  ).length;
  const totalStudentsCountNum = Number(studentsStatsQuery.data?.total ?? 0);
  const activeStudents = studentsStatsQuery.data?.active ?? 0;
  const activeStudentRate =
    totalStudentsCountNum > 0
      ? Math.round((activeStudents / totalStudentsCountNum) * 100)
      : 0;
  const resolvedComplaints = complaints.filter(
    (item) => item.status === "resolved" || item.status === "closed",
  ).length;
  const resolutionRate = complaints.length
    ? Math.round((resolvedComplaints / complaints.length) * 100)
    : 0;

  const dashboardContainerRef = React.useRef<HTMLDivElement>(null);

  const [isAnalyticsExportModalOpen, setIsAnalyticsExportModalOpen] =
    useState(false);

  const departmentChartData = React.useMemo(() => {
    if (
      studentsStatsQuery.data?.departments &&
      studentsStatsQuery.data.departments.length > 0
    ) {
      return studentsStatsQuery.data.departments.map((d) => {
        const capacity =
          d.department === "General"
            ? 2200
            : d.department === "BIS"
              ? 1400
              : 1000;
        return {
          department: d.nameEn,
          departmentAr: d.nameAr,
          code:
            d.department === "General"
              ? "GEN"
              : d.department === "ACCOUNTING"
                ? "ACC"
                : "BIS",
          enrolled: d.enrolled,
          capacity: Math.max(d.enrolled, capacity),
        };
      });
    }
    return defaultDepartmentData;
  }, [studentsStatsQuery.data?.departments]);

  const cohortChartData = React.useMemo(() => {
    if (
      studentsStatsQuery.data?.cohortRetention &&
      studentsStatsQuery.data.cohortRetention.length > 0
    ) {
      return studentsStatsQuery.data.cohortRetention.map((c) => ({
        semester: `Level ${c.level}`,
        semesterAr:
          c.level === "1"
            ? "المستوى الأول (عام)"
            : c.level === "2"
              ? "المستوى الثاني (عام)"
              : c.level === "3"
                ? "المستوى الثالث (تخصص)"
                : "المستوى الرابع (تخرج)",
        active: c.active,
        probation: c.probation,
        attrition: c.attrition,
      }));
    }
    return defaultCohortData;
  }, [studentsStatsQuery.data?.cohortRetention]);

  const gpaChartData = React.useMemo(() => {
    if (
      studentsStatsQuery.data?.gpaDistribution &&
      studentsStatsQuery.data.gpaDistribution.length > 0
    ) {
      const colors = ["#ef4444", "#f59e0b", "#0d9488", "#0284c7", "#10b981"];
      return studentsStatsQuery.data.gpaDistribution.map((g, idx) => ({
        range: g.range,
        label: g.label,
        labelAr: g.labelAr,
        count: g.count,
        color: colors[idx % colors.length],
      }));
    }
    return defaultGpaData;
  }, [studentsStatsQuery.data?.gpaDistribution]);

  return (
    <div
      className="animate-fade-in space-y-6 p-2 md:p-6"
      dir={isAr ? "rtl" : "ltr"}
    >
      <PageTitleBanner
        title={t("title")}
        eyebrow={tNav("dashboard")}
        icon={<TrendingUp className="h-5 w-5" />}
        subtitle={
          isAr
            ? "لوحة المتابعة التشغيلية والإحصاءات الأكاديمية للمعهد."
            : "Quick operational view for portal activity."
        }
      >
        <div
          data-no-export="true"
          className="flex flex-wrap items-center gap-2"
        >
          {hasPerm("analytics.export") && (
            <button
              type="button"
              onClick={() => setIsAnalyticsExportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-squircle text-xs sm:text-sm font-semibold transition-all cursor-pointer bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/30 hover:bg-teal-500/20 shadow-sm"
            >
              <FileSpreadsheet className="h-4 w-4 text-teal-500" />
              <span>
                {isAr
                  ? "تصدير التحليلات الشاملة (Excel)"
                  : "Export Full Analytics (Excel)"}
              </span>
            </button>
          )}
        </div>
      </PageTitleBanner>

      <div
        ref={dashboardContainerRef}
        id="analytics-dashboard-export"
        className="space-y-6"
      >
        {/* STAFF / DOCTOR ASSIGNED COURSES WORKSPACE */}
        {isStaff && (
          <div className="space-y-4 rounded-2xl border border-primary/20 bg-card/90 p-5 shadow-(--shadow-glow) backdrop-blur">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-squircle border border-primary/30 bg-primary/10 text-primary">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    {isAr
                      ? "المقررات الدراسية المسندة إليك"
                      : "Your Assigned Courses"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? `مرحباً ${formatStaffDisplayName(user, locale)} · الدور الأكاديمي: ${getStaffRoleLabel(user?.staffType, user?.role, locale, user?.titlePrefix)}`
                      : `Welcome ${formatStaffDisplayName(user, locale)} · Role: ${getStaffRoleLabel(user?.staffType, user?.role, locale, user?.titlePrefix)}`}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-600 dark:text-teal-400 sm:self-auto">
                <BookOpen className="h-3.5 w-3.5" />
                <span>
                  {isAr
                    ? `${assignedCourses.length} مقررات مسندة`
                    : `${assignedCourses.length} Assigned Courses`}
                </span>
              </span>
            </div>

            {assignedCoursesQuery.isLoading ? (
              <div className="flex min-h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : assignedCoursesQuery.isError ? (
              <div
                role="alert"
                className="rounded-xl border border-danger/30 p-4 text-sm"
              >
                <p>
                  {isAr
                    ? "تعذر تحميل المقررات المسندة. أعد المحاولة."
                    : "Could not load assigned courses. Please retry."}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void assignedCoursesQuery.refetch();
                  }}
                >
                  {isAr ? "إعادة المحاولة" : "Retry"}
                </Button>
              </div>
            ) : assignedCourses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                {isAr
                  ? "لا توجد مقررات دراسية مسندة إلى حسابك حالياً. يمكنك استخدام الخيارات والصلاحيات المتاحة لك من القائمة الجانبية."
                  : "No courses are currently assigned to your account. You can use your permitted tools from the sidebar."}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {assignedCourses.map((c) => {
                  const displayName = isAr
                    ? c.nameAr || c.name
                    : c.nameEn || c.name;
                  return (
                    <div
                      key={c._id}
                      className="flex flex-col justify-between rounded-xl border border-border/70 bg-card/90 p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-md"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-primary">
                            {c.code}
                          </span>
                          <span className="rounded-md border border-border/60 bg-secondary/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {isAr
                              ? `${formatCourseLevel(c.level, true)} · ${formatCourseSemester(c.semester, true)}`
                              : `${formatCourseLevel(c.level, false)} · ${formatCourseSemester(c.semester, false)}`}
                          </span>
                        </div>

                        <h4 className="font-bold text-foreground leading-snug">
                          {displayName}
                        </h4>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {c.department || (isAr ? "عام" : "General")}
                          </span>
                          {c.credits ? (
                            <>
                              <span>·</span>
                              <span>
                                {c.credits} {isAr ? "ساعات" : "Credits"}
                              </span>
                            </>
                          ) : null}
                        </div>

                        {/* Prominent Enrolled Students Count */}
                        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
                          <span className="flex items-center gap-1.5">
                            <Users className="h-4 w-4 shrink-0 text-primary" />
                            <span>
                              {isAr ? "الطلاب المسجلون:" : "Enrolled Students:"}
                            </span>
                          </span>
                          <span className="font-mono text-sm font-bold text-primary">
                            {c.enrolledStudentsCount ?? 0}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
                        {c.syllabusUrl && (
                          <a
                            href={c.syllabusUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded-lg border border-border/70 bg-secondary/40 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary/70 transition-colors"
                          >
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            <span>
                              {isAr ? "المحتوى (PDF)" : "Syllabus (PDF)"}
                            </span>
                          </a>
                        )}
                        {hasPerm("quizzes.read") && (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/${locale}/admin/quizzes?courseId=${c._id}`,
                              )
                            }
                            className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                          >
                            <Award className="h-3.5 w-3.5" />
                            <span>{isAr ? "الاختبارات" : "Quizzes"}</span>
                          </button>
                        )}
                        {hasPerm("attendance.read") && (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/${locale}/admin/attendance?courseId=${c._id}`,
                              )
                            }
                            className="flex items-center gap-1 rounded-lg border border-border/70 bg-secondary/40 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary/70 transition-colors cursor-pointer"
                          >
                            <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" />
                            <span>{isAr ? "الحضور" : "Attendance"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* DOCTOR / STAFF WEEKLY SCHEDULE & ROOM TIMETABLE */}
            <div className="mt-6 space-y-4 rounded-2xl border border-primary/20 bg-card/90 p-5 shadow-(--shadow-glow) backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-squircle border border-teal-500/30 bg-teal-500/10 text-teal-400">
                    <CalendarDays className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">
                      {isAr
                        ? "جدول المحاضرات والسكاشن والقاعات الخاصة بك"
                        : "Your Lecture, Section & Hall Timetable"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "مواعيد المحاضرات الأسبوعية وأماكن القاعات والمدرجات المسندة إليك"
                        : "Weekly lecture and section timings with allocated hall/room numbers"}
                    </p>
                  </div>
                </div>

                {/* Day Filter */}
                <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setDoctorScheduleDayFilter("all")}
                    className={`rounded-squircle px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                      doctorScheduleDayFilter === "all"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isAr ? "جميع الأيام" : "All Days"}
                  </button>
                  {(
                    [
                      "saturday",
                      "sunday",
                      "monday",
                      "tuesday",
                      "wednesday",
                      "thursday",
                    ] as const
                  ).map((day) => {
                    const dayNamesAr: Record<string, string> = {
                      saturday: "السبت",
                      sunday: "الأحد",
                      monday: "الاثنين",
                      tuesday: "الثلاثاء",
                      wednesday: "الأربعاء",
                      thursday: "الخميس",
                    };
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setDoctorScheduleDayFilter(day)}
                        className={`rounded-squircle px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                          doctorScheduleDayFilter === day
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {isAr ? dayNamesAr[day] : day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {myScheduleQuery.isLoading ? (
                <div className="flex min-h-32 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : filteredDoctorSchedules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                  {isAr
                    ? "لا توجد محاضرات أو سكاشن مسجلة لك في هذا اليوم."
                    : "No lectures or sections scheduled for your account on this day."}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border/70">
                  <table className="w-full text-start text-xs">
                    <thead className="bg-secondary/40 text-muted-foreground font-semibold">
                      <tr className="border-b border-border/70">
                        <th className="px-4 py-3 text-start">
                          {isAr ? "المقرر الدراسي" : "Course"}
                        </th>
                        <th className="px-4 py-3 text-center">
                          {isAr ? "النوع" : "Type"}
                        </th>
                        <th className="px-4 py-3 text-start">
                          {isAr ? "اليوم والتوقيت" : "Day & Time"}
                        </th>
                        <th className="px-4 py-3 text-start">
                          {isAr ? "المكان / القاعة" : "Hall / Location"}
                        </th>
                        <th className="px-4 py-3 text-start">
                          {isAr ? "المستوى / المجموعة" : "Level & Group"}
                        </th>
                        <th className="px-4 py-3 text-start">
                          {isAr ? "ملاحظات" : "Notes"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 bg-card/60">
                      {filteredDoctorSchedules.map((slot) => {
                        const dayArMap: Record<string, string> = {
                          saturday: "السبت",
                          sunday: "الأحد",
                          monday: "الاثنين",
                          tuesday: "الثلاثاء",
                          wednesday: "الأربعاء",
                          thursday: "الخميس",
                        };
                        return (
                          <tr
                            key={slot._id}
                            className="hover:bg-secondary/20 transition-colors"
                          >
                            <td className="px-4 py-3 font-medium text-foreground">
                              <div className="font-mono text-[11px] text-primary font-bold">
                                {slot.courseCode}
                              </div>
                              <div className="text-sm">
                                {isAr
                                  ? slot.courseNameAr || slot.courseName
                                  : slot.courseName}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`inline-block rounded-squircle border px-2 py-0.5 text-[11px] font-bold ${
                                  slot.type === "lecture"
                                    ? "border-teal-500/30 bg-teal-500/10 text-teal-300"
                                    : slot.type === "lab"
                                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                      : "border-purple-500/30 bg-purple-500/10 text-purple-300"
                                }`}
                              >
                                {slot.type === "lecture"
                                  ? isAr
                                    ? "محاضرة"
                                    : "Lecture"
                                  : slot.type === "lab"
                                    ? isAr
                                      ? "معمل"
                                      : "Lab"
                                    : isAr
                                      ? "سكشن"
                                      : "Section"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-foreground">
                              <div className="font-semibold">
                                {isAr
                                  ? dayArMap[slot.dayOfWeek] || slot.dayOfWeek
                                  : slot.dayOfWeek}
                              </div>
                              <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                                <Clock className="h-3 w-3 text-primary/70" />
                                <span>
                                  {slot.startTime} - {slot.endTime}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1.5 rounded-squircle border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                                <MapPin className="h-3.5 w-3.5" />
                                <span>{slot.location}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-foreground">
                              <div>
                                {isAr
                                  ? `المستوى ${slot.level}`
                                  : `Level ${slot.level}`}
                                {slot.department && ` · ${slot.department}`}
                              </div>
                              {(slot.group || slot.section) && (
                                <div className="text-[11px] text-muted-foreground">
                                  {slot.group && `${slot.group} `}
                                  {slot.section && `(${slot.section})`}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-[11px]">
                              {slot.notes || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* QUICK ACTIONS SECTION (TRIGGER MODALS DIRECTLY) - ONLY FOR ADMIN */}
        {isAdmin && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">
              {t("quickActions")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {hasPerm("students.write") && (
                <QuickAction
                  title={tStudents("addStudent")}
                  icon={<UserPlus className="w-5 h-5" />}
                  onClick={() => setIsAddStudentOpen(true)}
                />
              )}
              {hasPerm("uploads.import") && (
                <QuickAction
                  title={tNav("uploads")}
                  icon={<Upload className="w-5 h-5" />}
                  onClick={() => setIsUploadOpen(true)}
                />
              )}
              {(hasPerm("exam_schedules.manage") ||
                hasPerm("exam_schedules.read")) && (
                <QuickAction
                  title={tNav("examSchedules")}
                  icon={<Calendar className="w-5 h-5" />}
                  onClick={() => setIsAddScheduleOpen(true)}
                />
              )}
              <QuickAction
                title={
                  isAr
                    ? "جدول المحاضرات والسكاشن والقاعات"
                    : "Lecture & Section Schedules"
                }
                icon={<CalendarDays className="w-5 h-5" />}
                onClick={() => router.push(`/${locale}/admin/schedules`)}
              />
              {hasPerm("complaints.read") && (
                <QuickAction
                  title={tNav("complaints")}
                  icon={<MessageSquareWarning className="w-5 h-5" />}
                  onClick={() => setIsComplaintLookupOpen(true)}
                />
              )}
              {(hasPerm("grades.write") || hasPerm("grades.read")) && (
                <QuickAction
                  title={tNav("grades")}
                  icon={<Users className="w-5 h-5" />}
                  onClick={() => setIsAddGradeOpen(true)}
                />
              )}
              {(hasPerm("courses.write") || hasPerm("courses.read")) && (
                <QuickAction
                  title={tNav("courses")}
                  icon={<BookOpen className="w-5 h-5" />}
                  onClick={() => setIsAddCourseOpen(true)}
                />
              )}
              {(hasPerm("quizzes.read") || hasPerm("quizzes.create")) && (
                <QuickAction
                  title={isAr ? "بنك الاختبارات والكويزات" : "Course Quizzes"}
                  icon={<Award className="w-5 h-5" />}
                  onClick={() => router.push(`/${locale}/admin/quizzes`)}
                />
              )}
              {(hasPerm("attendance.read") || hasPerm("attendance.manage")) && (
                <QuickAction
                  title={isAr ? "جلسات الحضور والغياب" : "Attendance Sessions"}
                  icon={<ClipboardCheck className="w-5 h-5" />}
                  onClick={() => router.push(`/${locale}/admin/attendance`)}
                />
              )}
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────── */}
        {/* 1. DOCTOR DASHBOARD VIEW (STAFF TYPE = DOCTOR)              */}
        {/* ──────────────────────────────────────────────────────────── */}
        {isDoctor && (
          <div className="space-y-6">
            <StatCardRow>
              <StatCard
                title={isAr ? "المقررات المسندة" : "Assigned Courses"}
                value={String(assignedCourses.length)}
                icon={<BookOpen className="w-6 h-6" />}
                color="#0d9488"
              />
              <StatCard
                title={
                  isAr ? "إجمالي الطلاب المسجلين" : "Total Enrolled Students"
                }
                value={String(staffTotalEnrolledStudents)}
                icon={<Users className="w-6 h-6" />}
                color="#22d3ee"
              />
              <StatCard
                title={
                  isAr ? "الساعات المعتمدة التدريسية" : "Teaching Credit Hours"
                }
                value={String(staffTotalCredits)}
                icon={<Award className="w-6 h-6" />}
                color="#8b5cf6"
              />
              <StatCard
                title={isAr ? "الدور الأكاديمي" : "Academic Standing"}
                value={isAr ? "أستاذ مقرر" : "Course Lecturer"}
                icon={<GraduationCap className="w-6 h-6" />}
                color="#f59e0b"
              />
            </StatCardRow>

            {/* DOCTOR RECHARTS: COURSE ENROLLMENT + LEVEL DISTRIBUTION */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-card/90 p-5 shadow-(--shadow-glow) backdrop-blur">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      {isAr
                        ? "أعداد الطلاب المسجلين بكل مقرر"
                        : "Enrolled Students per Course"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "مقارنة حجم الطلاب المسجلين في مقرراتك الدراسية"
                        : "Comparison of enrolled student volume per course"}
                    </p>
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-squircle border border-teal-500/30 bg-teal-500/10 text-teal-500">
                    <BarChart3 className="h-4 w-4" />
                  </span>
                </div>
                {doctorCourseEnrollmentData.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    {isAr
                      ? "لا توجد مقررات دراسية مسندة حالياً"
                      : "No assigned courses available"}
                  </div>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={doctorCourseEnrollmentData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.08)"
                        />
                        <XAxis
                          dataKey="code"
                          stroke="#94a3b8"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgba(15, 23, 42, 0.95)",
                            borderColor: "rgba(51, 65, 85, 0.6)",
                            borderRadius: "12px",
                            color: "#f8fafc",
                          }}
                          formatter={(val: unknown) => [
                            String(val),
                            isAr ? "طالب مسجل" : "Enrolled Students",
                          ]}
                          labelFormatter={(lbl: unknown) => {
                            const item = doctorCourseEnrollmentData.find(
                              (d) => d.code === String(lbl),
                            );
                            return `${lbl} - ${item?.name || ""}`;
                          }}
                        />
                        <Bar
                          dataKey="students"
                          fill="#0d9488"
                          radius={[6, 6, 0, 0]}
                          name={isAr ? "الطلاب" : "Students"}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-card/90 p-5 shadow-(--shadow-glow) backdrop-blur">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      {isAr
                        ? "توزيع الطلاب حسب المستويات الدراسية"
                        : "Student Distribution by Level"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "إجمالي أعداد الطلاب المقيدين بمقرراتك مقسمين على الفرق"
                        : "Total enrolled students distributed by academic level"}
                    </p>
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-squircle border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                    <Users className="h-4 w-4" />
                  </span>
                </div>
                {doctorLevelDistributionData.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    {isAr
                      ? "لا توجد بيانات فرق دراسية"
                      : "No cohort data available"}
                  </div>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={doctorLevelDistributionData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                      >
                        <defs>
                          <linearGradient
                            id="doctorAreaGrad"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#06b6d4"
                              stopOpacity={0.8}
                            />
                            <stop
                              offset="95%"
                              stopColor="#06b6d4"
                              stopOpacity={0.05}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.08)"
                        />
                        <XAxis
                          dataKey="level"
                          stroke="#94a3b8"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgba(15, 23, 42, 0.95)",
                            borderColor: "rgba(51, 65, 85, 0.6)",
                            borderRadius: "12px",
                            color: "#f8fafc",
                          }}
                          formatter={(val: unknown) => [
                            String(val),
                            isAr ? "طالب" : "Students",
                          ]}
                        />
                        <Area
                          type="monotone"
                          dataKey="students"
                          stroke="#06b6d4"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#doctorAreaGrad)"
                          name={isAr ? "الطلاب" : "Students"}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* DOCTOR EXAM SCHEDULES THUMBNAILS (INLINE VIEW - NO REDIRECT BUTTON) */}
            <div className="space-y-4 rounded-2xl border border-primary/25 bg-card/90 p-5 shadow-(--shadow-glow) backdrop-blur">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-squircle border border-teal-500/30 bg-teal-500/10 text-teal-400">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-foreground">
                      {isAr
                        ? "جداول الامتحانات المعتمدة (الميدترم والنهائي)"
                        : "Official Exam Timetables (Midterm & Final)"}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "استعراض مصغر وتحميل جدول الامتحانات الرسمي المعتمد للفصل الدراسي"
                        : "Preview and download official examination schedules for the current academic semester"}
                    </p>
                  </div>
                </div>
              </div>

              {doctorExamSchedulesQuery.isLoading ? (
                <div className="flex min-h-32 items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : doctorExamSchedules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                  <FileImage className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                  <span>
                    {isAr
                      ? "لم يتم اعتماد أو نشر جداول الامتحانات الرسمية لهذا الفصل حتى الآن."
                      : "No approved examination schedules published for this term yet."}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {doctorExamSchedules.map((schedule) => {
                    const isFinal = schedule.examType === "final";
                    const isPdf = schedule.fileUrl
                      ?.toLowerCase()
                      .endsWith(".pdf");
                    return (
                      <div
                        key={schedule._id}
                        className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border/70 bg-surface/50 p-3 transition-all duration-200 hover:border-primary/50 hover:shadow-lg"
                      >
                        {/* Thumbnail Header */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-squircle px-2.5 py-0.5 text-[11px] font-bold border ${
                              isFinal
                                ? "border-teal-500/30 bg-teal-500/10 text-teal-300"
                                : "border-purple-500/30 bg-purple-500/10 text-purple-300"
                            }`}
                          >
                            {isFinal
                              ? isAr
                                ? "امتحان نهائي (Final)"
                                : "Final Exam"
                              : isAr
                                ? "امتحان ميدترم (Midterm)"
                                : "Midterm Exam"}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {schedule.academicYear || "2026-2027"}
                          </span>
                        </div>

                        {/* Visual Thumbnail */}
                        <div
                          onClick={() => setPreviewExamSchedule(schedule)}
                          className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-black/40 cursor-pointer group-hover:border-primary/60 transition-all"
                        >
                          {isPdf ? (
                            <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-center">
                              <FileText className="h-10 w-10 text-rose-400" />
                              <span className="text-xs font-semibold text-foreground">
                                {schedule.title ||
                                  (isAr ? "مستند PDF" : "PDF Document")}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {isAr
                                  ? "اضغط للمعاينة والتحميل"
                                  : "Click to preview and download"}
                              </span>
                            </div>
                          ) : (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={schedule.fileUrl}
                                alt={schedule.title || "Exam Schedule"}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                                <span className="flex items-center gap-1.5 rounded-squircle bg-primary/90 px-3 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur">
                                  <Maximize2 className="h-3.5 w-3.5" />
                                  <span>
                                    {isAr ? "معاينة كاملة" : "Full Preview"}
                                  </span>
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Caption & Actions */}
                        <div className="mt-2.5 flex items-center justify-between gap-2 pt-1 border-t border-border/40 text-xs">
                          <span className="font-semibold text-foreground truncate max-w-[200px]">
                            {schedule.title ||
                              (isFinal
                                ? isAr
                                  ? "جدول النهائي"
                                  : "Final Schedule"
                                : isAr
                                  ? "جدول الميدترم"
                                  : "Midterm Schedule")}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPreviewExamSchedule(schedule)}
                              className="flex items-center gap-1 rounded-squircle border border-border/70 bg-secondary/50 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-secondary cursor-pointer"
                            >
                              <Eye className="h-3 w-3 text-primary" />
                              <span>{isAr ? "معاينة" : "View"}</span>
                            </button>
                            {schedule.fileUrl && (
                              <a
                                href={schedule.fileUrl}
                                download
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 rounded-squircle border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-[11px] font-medium text-teal-300 hover:bg-teal-500/20 cursor-pointer"
                              >
                                <Download className="h-3 w-3" />
                                <span>{isAr ? "تحميل" : "Download"}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────── */}
        {/* 2. TEACHING ASSISTANT VIEW (STAFF TYPE = TEACHING ASSISTANT) */}
        {/* ──────────────────────────────────────────────────────────── */}
        {isTeachingAssistant && (
          <div className="space-y-6">
            <StatCardRow>
              <StatCard
                title={
                  isAr ? "السكاشن والمواد العملية" : "Lab / Practical Sections"
                }
                value={String(assignedCourses.length)}
                icon={<BookOpen className="w-6 h-6" />}
                color="#0d9488"
              />
              <StatCard
                title={isAr ? "الطلاب في السكاشن" : "Supervised Students"}
                value={String(staffTotalEnrolledStudents)}
                icon={<Users className="w-6 h-6" />}
                color="#22d3ee"
              />
              <StatCard
                title={isAr ? "ساعات التدريب العملي" : "Practical Hours"}
                value={String(staffTotalCredits)}
                icon={<ClipboardCheck className="w-6 h-6" />}
                color="#10b981"
              />
              <StatCard
                title={isAr ? "الدور الأكاديمي" : "Academic Role"}
                value={isAr ? "هيئة تدريس معاونة" : "Teaching Assistant"}
                icon={<GraduationCap className="w-6 h-6" />}
                color="#f59e0b"
              />
            </StatCardRow>

            {/* TA RECHARTS: SECTION LOAD + LEVEL SPREAD */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-card/90 p-5 shadow-(--shadow-glow) backdrop-blur">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      {isAr
                        ? "كثافة الطلاب بالسكاشن العملية"
                        : "Students per Practical Section"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "حجم المجموعات الطلابية في المواد التي تقوم بمعاونة تدريسها"
                        : "Supervised student volume across your assigned labs"}
                    </p>
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-squircle border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                    <BarChart3 className="h-4 w-4" />
                  </span>
                </div>
                {doctorCourseEnrollmentData.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    {isAr
                      ? "لا توجد سكاشن مسندة حالياً"
                      : "No assigned sections available"}
                  </div>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={doctorCourseEnrollmentData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.08)"
                        />
                        <XAxis
                          dataKey="code"
                          stroke="#94a3b8"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgba(15, 23, 42, 0.95)",
                            borderColor: "rgba(51, 65, 85, 0.6)",
                            borderRadius: "12px",
                            color: "#f8fafc",
                          }}
                          formatter={(val: unknown) => [
                            String(val),
                            isAr ? "طالب بالسكشن" : "Lab Students",
                          ]}
                          labelFormatter={(lbl: unknown) => {
                            const item = doctorCourseEnrollmentData.find(
                              (d) => d.code === String(lbl),
                            );
                            return `${lbl} - ${item?.name || ""}`;
                          }}
                        />
                        <Bar
                          dataKey="students"
                          fill="#10b981"
                          radius={[6, 6, 0, 0]}
                          name={isAr ? "الطلاب" : "Students"}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-card/90 p-5 shadow-(--shadow-glow) backdrop-blur">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      {isAr
                        ? "توزيع المواد العملية على الفرق"
                        : "Practical Sections by Level"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "توزيع السكاشن المعاونة حسب الفرق الأكاديمية بالمعهد"
                        : "Practical courses spread across academic levels"}
                    </p>
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-squircle border border-violet-500/30 bg-violet-500/10 text-violet-400">
                    <ClipboardCheck className="h-4 w-4" />
                  </span>
                </div>
                {doctorLevelDistributionData.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    {isAr ? "لا توجد بيانات" : "No data available"}
                  </div>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={doctorLevelDistributionData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.08)"
                        />
                        <XAxis
                          dataKey="level"
                          stroke="#94a3b8"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgba(15, 23, 42, 0.95)",
                            borderColor: "rgba(51, 65, 85, 0.6)",
                            borderRadius: "12px",
                            color: "#f8fafc",
                          }}
                          formatter={(val: unknown, name: unknown) => [
                            String(val),
                            String(name) === "courses"
                              ? isAr
                                ? "المواد العملية"
                                : "Practical Courses"
                              : isAr
                                ? "الطلاب"
                                : "Students",
                          ]}
                        />
                        <Bar
                          dataKey="courses"
                          fill="#8b5cf6"
                          radius={[6, 6, 0, 0]}
                          name={isAr ? "المواد العملية" : "Practical Courses"}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────── */}
        {/* 3. ADMINISTRATIVE STAFF VIEW (STAFF TYPE = ADMINISTRATIVE)  */}
        {/* ──────────────────────────────────────────────────────────── */}
        {isAdministrative && (
          <div className="space-y-6">
            <StatCardRow>
              {hasPerm("complaints.read") && (
                <StatCard
                  title={t("activeComplaints")}
                  value={activeComplaints}
                  icon={<MessageSquareWarning className="w-6 h-6" />}
                  color="#f59e0b"
                />
              )}
              {hasPerm("students.read") && (
                <StatCard
                  title={t("totalStudents")}
                  value={totalStudents}
                  icon={<Users className="w-6 h-6" />}
                  color="#0d9488"
                />
              )}
              {hasPerm("courses.read") && (
                <StatCard
                  title={t("totalCourses")}
                  value={totalCourses}
                  icon={<BookOpen className="w-6 h-6" />}
                  color="#22d3ee"
                />
              )}
              <StatCard
                title={isAr ? "حالة الحساب الإداري" : "Administrative Status"}
                value={isAr ? "موظف مصرح" : "Staff Online"}
                icon={<TrendingUp className="w-6 h-6" />}
                color="#8b5cf6"
              />
            </StatCardRow>

            {/* Charts based on staff permissions */}
            {hasPerm("complaints.read") && (
              <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ComplaintsWeeklyTrendChart
                  data={weeklyTrendData}
                  isAr={isAr}
                  isLoading={complaintsAnalyticsQuery.isLoading}
                />
                <ComplaintsStatusChart
                  data={complaintStatusData}
                  isAr={isAr}
                  isLoading={complaintsAnalyticsQuery.isLoading}
                />
              </section>
            )}

            {(hasPerm("students.read") || hasPerm("courses.read")) && (
              <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {hasPerm("students.read") && (
                  <EnrollmentStatusChart
                    data={enrollmentStatusData}
                    isAr={isAr}
                    isLoading={studentsStatsQuery.isLoading}
                    totalStudents={totalStudentsCountNum}
                    liveOnline={studentsStatsQuery.data?.liveOnline}
                    liveOnlineStaff={studentsStatsQuery.data?.liveOnlineStaff}
                  />
                )}
                {hasPerm("courses.read") && (
                  <CoursesByLevelChart
                    data={courseLevelData}
                    isAr={isAr}
                    isLoading={coursesAnalyticsQuery.isLoading}
                  />
                )}
              </section>
            )}
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────── */}
        {/* 4. ADMIN DASHBOARD VIEW (ROLE = ADMIN)                       */}
        {/* ──────────────────────────────────────────────────────────── */}
        {isAdmin && (
          <div className="space-y-6">
            <StatCardRow>
              <StatCard
                title={t("totalStudents")}
                value={totalStudents}
                icon={<Users className="w-6 h-6" />}
                color="#0d9488"
              />
              <StatCard
                title={t("totalCourses")}
                value={totalCourses}
                icon={<BookOpen className="w-6 h-6" />}
                color="#22d3ee"
              />
              <StatCard
                title={t("activeComplaints")}
                value={activeComplaints}
                icon={<MessageSquareWarning className="w-6 h-6" />}
                color="#f59e0b"
              />
              <StatCard
                title={t("recentActivity")}
                value="Online"
                icon={<TrendingUp className="w-6 h-6" />}
                color="#8b5cf6"
              />
            </StatCardRow>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InsightCard
                label={isAr ? "معدل إنجاز الشكاوى" : "Resolution Rate"}
                value={`${resolutionRate}%`}
                helper={
                  isAr
                    ? "الشكاوى المحلولة والمغلقة من إجمالي التذاكر."
                    : "Resolved and closed complaints out of all tickets."
                }
                icon={<CheckCircle2 className="h-4 w-4" />}
                tone={
                  resolutionRate >= 70
                    ? "success"
                    : resolutionRate >= 40
                      ? "warning"
                      : "danger"
                }
              />
              <InsightCard
                label={isAr ? "شكاوى حرجة وعاجلة" : "High Priority"}
                value={String(urgentComplaints)}
                helper={
                  isAr
                    ? "تذاكر تتطلب متابعة تشغيلية عاجلة."
                    : "Tickets that require faster operational follow-up."
                }
                icon={<AlertTriangle className="h-4 w-4" />}
                tone={urgentComplaints > 0 ? "warning" : "success"}
              />
              <InsightCard
                label={isAr ? "نسبة الطلاب النشطين" : "Active Student Ratio"}
                value={`${activeStudentRate}%`}
                helper={
                  isAr
                    ? "الطلاب المقيدون بحالة دراسية نشطة."
                    : "Students with active enrollment status."
                }
                icon={<UserCheck className="h-4 w-4" />}
                tone={activeStudentRate >= 80 ? "success" : "warning"}
              />
              <InsightCard
                label={isAr ? "المقررات المطروحة" : "Course Offerings"}
                value={totalCourses}
                helper={
                  isAr
                    ? "دليل المواد المتاحة بجميع المستويات."
                    : "Available course catalog across all levels."
                }
                icon={<BookOpen className="h-4 w-4" />}
                tone="primary"
              />
            </div>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ComplaintsWeeklyTrendChart
                data={weeklyTrendData}
                isAr={isAr}
                isLoading={complaintsAnalyticsQuery.isLoading}
              />
              <ComplaintsStatusChart
                data={complaintStatusData}
                isAr={isAr}
                isLoading={complaintsAnalyticsQuery.isLoading}
              />
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <EnrollmentStatusChart
                data={enrollmentStatusData}
                isAr={isAr}
                isLoading={studentsStatsQuery.isLoading}
                totalStudents={totalStudentsCountNum}
                liveOnline={studentsStatsQuery.data?.liveOnline}
                liveOnlineStaff={studentsStatsQuery.data?.liveOnlineStaff}
                isAdmin={isAdmin}
                onLiveOnlineClick={() => setIsActiveSessionsOpen(true)}
              />
              <CoursesByLevelChart
                data={courseLevelData}
                isAr={isAr}
                isLoading={coursesAnalyticsQuery.isLoading}
              />
            </section>

            {/* ADVANCED ACADEMIC & INSTITUTIONAL ANALYTICS */}
            <section className="space-y-6 pt-2">
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-primary" />
                    {isAr
                      ? "تحليلات الأداء الأكاديمي واستبقاء الطلاب"
                      : "Academic Performance & Retention Analytics"}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr
                      ? "توزيع المعدلات التراكمية، ومعدلات استبقاء المستويات الدراسية، وطاقة الأقسام العلمية (الشعبة العامة، BIS، المحاسبة)"
                      : "GPA standing distributions, cohort retention rates, and academic department capacity (General Track, BIS, Accounting)"}
                  </p>
                </div>
              </div>

              {/* Row 1: GPA Distribution & Cohort Retention */}
              <DeferredDashboardSection>
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <GpaDistributionChart data={gpaChartData} isAr={isAr} />
                  <CohortRetentionChart data={cohortChartData} isAr={isAr} />
                </div>
              </DeferredDashboardSection>

              {/* Row 2: Department Seat Capacity & Utilization */}
              <DeferredDashboardSection>
                {" "}
                <DepartmentCapacityChart
                  data={departmentChartData}
                  isAr={isAr}
                />
              </DeferredDashboardSection>
              <DeferredAnalyticsSummary
                isAr={isAr}
                canExport={hasPerm("analytics.export")}
                onOpenExportModal={
                  hasPerm("analytics.export")
                    ? () => setIsAnalyticsExportModalOpen(true)
                    : undefined
                }
              />
            </section>
          </div>
        )}
      </div>

      {/* ─── ACTION MODALS MOUNTED ON DASHBOARD ─────────────────── */}

      {/* 1. Add Student Modal */}
      {isAddStudentOpen && (
        <StudentFormDialog
          open={isAddStudentOpen}
          onOpenChange={setIsAddStudentOpen}
          isEditing={false}
          isSubmitting={isSubmittingStudent}
          onSubmit={async (values) => {
            setIsSubmittingStudent(true);
            try {
              await createStudent(
                values as unknown as Parameters<typeof createStudent>[0],
              );
              setIsAddStudentOpen(false);
              toast.success(
                isAr ? "تمت إضافة الطالب بنجاح" : "Student added successfully",
              );
              void queryClient.invalidateQueries();
            } catch (err: unknown) {
              toast.error(
                getApiErrorMessage(
                  err,
                  isAr ? "فشل إضافة الطالب" : "Failed to add student",
                ),
              );
            } finally {
              setIsSubmittingStudent(false);
            }
          }}
        />
      )}

      {/* 2. Upload Data Modal */}
      {isUploadOpen && (
        <DataUploadDialog
          open={isUploadOpen}
          onOpenChange={setIsUploadOpen}
          title={isAr ? "رفع واستيراد البيانات" : "Upload Data"}
          description={
            isAr
              ? "قم برفع ملف بصيغة xlsx أو xls أو csv لاستيراد أو تحديث قواعد البيانات مباشرة."
              : "Upload an xlsx, xls, or csv file to import or update databases."
          }
          uploadType="students"
          expectedColumns={[
            "studentCode",
            "fullName",
            "nationalId",
            "level",
            "department",
          ]}
          onSuccess={() => {
            toast.success(
              isAr ? "تم استيراد البيانات بنجاح" : "Data imported successfully",
            );
            void queryClient.invalidateQueries();
          }}
        />
      )}

      {/* 3. Record Grade Modal */}
      {isAddGradeOpen && (
        <GradeFormDialog
          open={isAddGradeOpen}
          onOpenChange={setIsAddGradeOpen}
          isEditing={false}
          courses={coursesListForGrades}
          isSubmitting={isSubmittingGrade}
          onSubmit={async (values) => {
            setIsSubmittingGrade(true);
            try {
              await saveGrade(values as Record<string, unknown>);
              setIsAddGradeOpen(false);
              toast.success(
                isAr ? "تم رصد الدرجة بنجاح" : "Grade recorded successfully",
              );
              void queryClient.invalidateQueries();
            } catch (err: unknown) {
              toast.error(
                getApiErrorMessage(
                  err,
                  isAr ? "فشل رصد الدرجة" : "Failed to save grade",
                ),
              );
            } finally {
              setIsSubmittingGrade(false);
            }
          }}
        />
      )}

      {/* 4. Add Course Modal */}
      <Dialog open={isAddCourseOpen} onOpenChange={setIsAddCourseOpen}>
        <DialogContent className="max-w-lg" dir={isAr ? "rtl" : "ltr"}>
          <DialogHeader className="text-start">
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              {isAr ? "إضافة مادة دراسية جديدة" : "Add New Course"}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? "أدخل تفاصيل المقرر الجديد لإضافته للائحة الأكاديمية."
                : "Enter new course catalog details."}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setIsSubmittingCourse(true);
              try {
                await api.post("/admin/courses", courseForm);
                setIsAddCourseOpen(false);
                toast.success(
                  isAr ? "تمت إضافة المادة بنجاح" : "Course added successfully",
                );
                void queryClient.invalidateQueries();
              } catch (err: unknown) {
                toast.error(
                  getApiErrorMessage(
                    err,
                    isAr ? "فشل إضافة المادة" : "Failed to add course",
                  ),
                );
              } finally {
                setIsSubmittingCourse(false);
              }
            }}
            className="space-y-4 pt-2"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isAr ? "كود المادة" : "Course Code"}
                </label>
                <Input
                  required
                  placeholder="CS101"
                  value={courseForm.code}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, code: e.target.value })
                  }
                  className="mt-1 font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isAr ? "الساعات المعتمدة" : "Credit Hours"}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={6}
                  required
                  value={courseForm.creditHours}
                  onChange={(e) =>
                    setCourseForm({
                      ...courseForm,
                      creditHours: Number(e.target.value),
                    })
                  }
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {isAr ? "اسم المادة (بالعربية)" : "Course Name (Arabic)"}
              </label>
              <Input
                required
                placeholder={
                  isAr ? "مقدمة في تكنولوجيا المعلومات" : "Course Name Ar"
                }
                value={courseForm.nameAr}
                onChange={(e) =>
                  setCourseForm({
                    ...courseForm,
                    nameAr: e.target.value,
                    name: e.target.value,
                  })
                }
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {isAr ? "اسم المادة (بالإنجليزية)" : "Course Name (English)"}
              </label>
              <Input
                placeholder="Intro to IT"
                value={courseForm.nameEn}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, nameEn: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isAr ? "المستوى" : "Level"}
                </label>
                <Select
                  value={courseForm.level}
                  onValueChange={(val) =>
                    setCourseForm({ ...courseForm, level: val })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">
                      {isAr ? "المستوى الأول" : "Level 1"}
                    </SelectItem>
                    <SelectItem value="2">
                      {isAr ? "المستوى الثاني" : "Level 2"}
                    </SelectItem>
                    <SelectItem value="3">
                      {isAr ? "المستوى الثالث" : "Level 3"}
                    </SelectItem>
                    <SelectItem value="4">
                      {isAr ? "المستوى الرابع" : "Level 4"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isAr ? "الفصل الدراسي" : "Semester"}
                </label>
                <Select
                  value={courseForm.semester}
                  onValueChange={(val) =>
                    setCourseForm({ ...courseForm, semester: val })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">
                      {isAr ? "الفصل الأول" : "First Term"}
                    </SelectItem>
                    <SelectItem value="second">
                      {isAr ? "الفصل الثاني" : "Second Term"}
                    </SelectItem>
                    <SelectItem value="summer">
                      {isAr ? "الفصل الصيفي" : "Summer"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddCourseOpen(false)}
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="submit"
                disabled={isSubmittingCourse}
                className="gap-2"
              >
                {isSubmittingCourse && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {isAr ? "حفظ المقرر" : "Save Course"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. Quick Complaint Lookup Modal */}
      <Dialog
        open={isComplaintLookupOpen}
        onOpenChange={setIsComplaintLookupOpen}
      >
        <DialogContent className="max-w-lg" dir={isAr ? "rtl" : "ltr"}>
          <DialogHeader className="text-start">
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareWarning className="h-5 w-5 text-primary" />
              {isAr ? "الاستعلام السريع عن شكوى" : "Quick Complaint Lookup"}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? "أدخل رقم التذكرة أو كود الطالب للوصول الفوري للمحادثة والتفاصيل."
                : "Search by ticket number or student code."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex gap-2">
              <Input
                placeholder={
                  isAr
                    ? "أدخل رقم التذكرة (مثل TIK-1234)..."
                    : "Ticket number (e.g. TIK-1234)..."
                }
                value={complaintSearch}
                onChange={(e) => setComplaintSearch(e.target.value)}
                className="font-mono text-sm"
              />
              <Button
                onClick={() => {
                  if (complaintSearch.trim()) {
                    setIsComplaintLookupOpen(false);
                    router.push(
                      `/${locale}/admin/complaints?ticket=${complaintSearch.trim()}`,
                    );
                  }
                }}
                className="shrink-0"
              >
                {isAr ? "انتقال" : "Go"}
              </Button>
            </div>

            <div className="border-t border-border/50 pt-3">
              <p className="text-xs text-muted-foreground mb-2">
                {isAr ? "آخر الشكاوى النشطة:" : "Recent active tickets:"}
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {complaints.slice(0, 4).map((c) => (
                  <div
                    key={c._id}
                    onClick={() => {
                      setIsComplaintLookupOpen(false);
                      router.push(
                        `/${locale}/admin/complaints?ticket=${c._id}`,
                      );
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-surface/30 hover:bg-surface/60 cursor-pointer text-xs transition-colors"
                  >
                    <div>
                      <span className="font-mono font-bold text-primary">
                        {c._id.slice(-6).toUpperCase()}
                      </span>
                      <span className="ms-2 text-muted-foreground">
                        {c.status}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-primary">
                      {isAr ? "فتح" : "Open"} →
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 6. Upload Exam Schedule Modal */}
      {isAddScheduleOpen && (
        <DataUploadDialog
          open={isAddScheduleOpen}
          onOpenChange={setIsAddScheduleOpen}
          title={isAr ? "رفع جداول الامتحانات" : "Upload Exam Schedules"}
          description={
            isAr
              ? "قم برفع ملف Excel الخاص بمواعيد ولجان الامتحانات لتحديث جداول الطلاب."
              : "Upload exam schedules Excel workbook."
          }
          uploadType="exam-schedules"
          expectedColumns={[
            "courseCode",
            "examDate",
            "startTime",
            "endTime",
            "building",
            "room",
          ]}
          onSuccess={() => {
            toast.success(
              isAr
                ? "تم استيراد جداول الامتحانات بنجاح"
                : "Exam schedules imported successfully",
            );
            void queryClient.invalidateQueries();
          }}
        />
      )}

      {/* Exam Schedule Preview Lightbox Dialog */}
      <Dialog
        open={Boolean(previewExamSchedule)}
        onOpenChange={(open) => !open && setPreviewExamSchedule(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-4 rounded-2xl border-border bg-card">
          <DialogHeader className="border-b border-border/70 pb-3 text-start">
            <DialogTitle className="flex items-center justify-between gap-2 text-base font-bold text-foreground">
              <span>
                {previewExamSchedule?.title ||
                  (isAr ? "معاينة جدول الامتحانات" : "Exam Schedule Preview")}
              </span>
              {previewExamSchedule?.fileUrl && (
                <a
                  href={previewExamSchedule.fileUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{isAr ? "تحميل الملف الأصلي" : "Download File"}</span>
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[72vh] items-center justify-center overflow-auto p-2 bg-black/40 rounded-xl">
            {previewExamSchedule?.fileUrl?.toLowerCase().endsWith(".pdf") ? (
              <iframe
                src={previewExamSchedule.fileUrl}
                title="Exam Schedule PDF"
                className="h-[70vh] w-full rounded-lg border-0"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewExamSchedule?.fileUrl}
                alt="Exam Schedule Full"
                className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {hasPerm("analytics.export") && isAnalyticsExportModalOpen && (
        <AnalyticsExportModal
          open={isAnalyticsExportModalOpen}
          onOpenChange={setIsAnalyticsExportModalOpen}
          locale={locale}
        />
      )}

      {isAdmin && isActiveSessionsOpen && (
        <ActiveSessionsDialog
          open={isActiveSessionsOpen}
          onOpenChange={setIsActiveSessionsOpen}
          isAr={isAr}
        />
      )}
    </div>
  );
}
