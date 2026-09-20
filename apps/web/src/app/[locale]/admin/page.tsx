'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Activity,
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
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api, { getApiErrorMessage, PaginatedResponse } from '@/lib/api';
import { ChartCard } from '@/components/ui/chart-card';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { StatCard, StatCardRow } from '@/components/ui/stat-card';
import { StudentFormDialog } from '@/features/students/components/student-form-dialog';
import { createStudent } from '@/features/students/api';
import { DataUploadDialog } from '@/components/ui/data-upload-dialog';
import { GradeFormDialog } from '@/features/grades/components/grade-form-dialog';
import { saveGrade } from '@/features/grades/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface DashboardStudent {
  _id: string;
  enrollmentStatus?: string;
  level?: string;
}

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

interface DashboardComplaint {
  _id: string;
  status: 'open' | 'in_review' | 'in_progress' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  type?: string;
  createdAt?: string;
}

interface ChartDatum {
  name: string;
  value: number;
}

const chartColors = ['#22d3ee', '#16a34a', '#eab308', '#8b5cf6', '#ef4444'];

function formatStatusLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function countBy<T>(items: T[], getKey: (item: T) => string | undefined): ChartDatum[] {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = getKey(item) || 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Array.from(counts.entries()).map(([name, value]) => ({
    name: formatStatusLabel(name),
    value,
  }));
}

function getLastSevenDayTrend(complaints: DashboardComplaint[], locale: string) {
  const formatter = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
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
      <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </button>
  );
}

function InsightCard({
  label,
  value,
  helper,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: string;
  helper: string;
  icon?: React.ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    primary: 'border-primary/30 bg-primary/10 text-primary',
    success: 'border-success/30 bg-success/10 text-success',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    danger: 'border-danger/30 bg-danger/10 text-danger',
  }[tone];

  return (
    <div className="rounded-xl border border-border/70 bg-card/90 p-4 shadow-[var(--shadow-glow)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold leading-tight text-foreground">{value}</p>
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
  const t = useTranslations('dashboard');
  const tNav = useTranslations('nav');
  const tStudents = useTranslations('students');
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = (params?.locale as string) || 'ar';
  const isAr = locale === 'ar';

  // Modal State for Quick Actions
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAddGradeOpen, setIsAddGradeOpen] = useState(false);
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const [isComplaintLookupOpen, setIsComplaintLookupOpen] = useState(false);
  const [isAddScheduleOpen, setIsAddScheduleOpen] = useState(false);
  const [isSubmittingStudent, setIsSubmittingStudent] = useState(false);
  const [isSubmittingGrade, setIsSubmittingGrade] = useState(false);
  const [isSubmittingCourse, setIsSubmittingCourse] = useState(false);

  // New course form state
  const [courseForm, setCourseForm] = useState({
    code: '',
    name: '',
    nameAr: '',
    nameEn: '',
    level: '1',
    semester: 'first',
    creditHours: 3,
    department: 'نظم معلومات الأعمال',
    type: 'required',
  });

  // Complaint quick lookup
  const [complaintSearch, setComplaintSearch] = useState('');

  // Fetch counts
  const studentsCountQuery = useQuery({
    queryKey: ['admin-stats-students'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<unknown>>('/admin/students', { params: { limit: 1 } });
      return res.data?.total || 0;
    },
  });

  const studentsStatsQuery = useQuery({
    queryKey: ['admin-stats-students-overview'],
    queryFn: async () => {
      const res = await api.get<{
        total: number;
        active: number;
        suspended: number;
        graduated: number;
        withdrawn: number;
        byLevel: { level: string; count: number }[];
      }>('/admin/students-stats');
      return res.data;
    },
  });

  const coursesCountQuery = useQuery({
    queryKey: ['admin-stats-courses'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<unknown>>('/admin/courses', { params: { limit: 1 } });
      return res.data?.total || 0;
    },
  });

  const complaintsCountQuery = useQuery({
    queryKey: ['admin-stats-complaints'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<unknown>>('/admin/complaints', { params: { limit: 1 } });
      return res.data?.total || 0;
    },
  });

  const studentsAnalyticsQuery = useQuery({
    queryKey: ['admin-analytics-students'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<DashboardStudent>>('/admin/students', {
        params: { limit: 100 },
      });
      return res.data.items;
    },
  });

  const coursesAnalyticsQuery = useQuery({
    queryKey: ['admin-analytics-courses'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<DashboardCourse>>('/admin/courses', {
        params: { limit: 100 },
      });
      return res.data.items;
    },
  });

  const complaintsAnalyticsQuery = useQuery({
    queryKey: ['admin-analytics-complaints'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<DashboardComplaint>>('/admin/complaints', {
        params: { limit: 100 },
      });
      return res.data.items;
    },
  });

  const coursesListForGrades = React.useMemo(() => {
    return (coursesAnalyticsQuery.data ?? []).map((c) => ({
      _id: c._id,
      code: c.code || '',
      name: c.name || c.nameAr || c.nameEn || '',
      nameAr: c.nameAr,
      nameEn: c.nameEn,
    }));
  }, [coursesAnalyticsQuery.data]);

  const totalStudents = studentsStatsQuery.isLoading && studentsCountQuery.isLoading
    ? '...'
    : String(studentsStatsQuery.data?.total ?? studentsCountQuery.data ?? 0);
  const totalCourses = coursesCountQuery.isLoading ? '...' : String(coursesCountQuery.data ?? 0);
  const activeComplaints = complaintsCountQuery.isLoading ? '...' : String(complaintsCountQuery.data ?? 0);
  const students = React.useMemo(
    () => studentsAnalyticsQuery.data ?? [],
    [studentsAnalyticsQuery.data],
  );
  const courses = React.useMemo(
    () => coursesAnalyticsQuery.data ?? [],
    [coursesAnalyticsQuery.data],
  );
  const complaints = React.useMemo(
    () => complaintsAnalyticsQuery.data ?? [],
    [complaintsAnalyticsQuery.data],
  );

  const isAnalyticsLoading =
    studentsStatsQuery.isLoading ||
    coursesAnalyticsQuery.isLoading ||
    complaintsAnalyticsQuery.isLoading;

  const enrollmentStatusData = React.useMemo(() => {
    if (studentsStatsQuery.data) {
      const s = studentsStatsQuery.data;
      return [
        { name: formatStatusLabel('active'), value: s.active },
        { name: formatStatusLabel('suspended'), value: s.suspended },
        { name: formatStatusLabel('graduated'), value: s.graduated },
        { name: formatStatusLabel('withdrawn'), value: s.withdrawn },
      ].filter((d) => d.value > 0);
    }
    return countBy(students, (student) => student.enrollmentStatus);
  }, [studentsStatsQuery.data, students]);

  const courseLevelData = React.useMemo(
    () => countBy(courses, (course) => course.level ?? course.academicLevel),
    [courses],
  );
  const complaintStatusData = React.useMemo(
    () => countBy(complaints, (complaint) => complaint.status),
    [complaints],
  );
  const weeklyTrendData = React.useMemo(
    () => getLastSevenDayTrend(complaints, locale),
    [complaints, locale],
  );

  const urgentComplaints = complaints.filter(
    (item) => item.priority === 'urgent' || item.priority === 'high',
  ).length;
  const totalStudentsCountNum = Number(studentsStatsQuery.data?.total ?? studentsCountQuery.data ?? 0);
  const activeStudents = studentsStatsQuery.data?.active ?? students.filter(
    (item) => (item.enrollmentStatus ?? 'active') === 'active',
  ).length;
  const activeStudentRate = totalStudentsCountNum > 0
    ? Math.round((activeStudents / totalStudentsCountNum) * 100)
    : 0;
  const resolvedComplaints = complaints.filter(
    (item) => item.status === 'resolved' || item.status === 'closed',
  ).length;
  const resolutionRate = complaints.length
    ? Math.round((resolvedComplaints / complaints.length) * 100)
    : 0;

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>
      <PageTitleBanner
        title={t('title')}
        eyebrow={tNav('dashboard')}
        icon={<TrendingUp className="h-5 w-5" />}
        subtitle="Quick operational view for portal activity."
      />

      {/* QUICK ACTIONS SECTION (TRIGGER MODALS DIRECTLY) */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">
          {t('quickActions')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <QuickAction
            title={tStudents('addStudent')}
            icon={<UserPlus className="w-5 h-5" />}
            onClick={() => setIsAddStudentOpen(true)}
          />
          <QuickAction
            title={tNav('uploads')}
            icon={<Upload className="w-5 h-5" />}
            onClick={() => setIsUploadOpen(true)}
          />
          <QuickAction
            title={tNav('examSchedules')}
            icon={<Calendar className="w-5 h-5" />}
            onClick={() => setIsAddScheduleOpen(true)}
          />
          <QuickAction
            title={tNav('complaints')}
            icon={<MessageSquareWarning className="w-5 h-5" />}
            onClick={() => setIsComplaintLookupOpen(true)}
          />
          <QuickAction
            title={tNav('grades')}
            icon={<Users className="w-5 h-5" />}
            onClick={() => setIsAddGradeOpen(true)}
          />
          <QuickAction
            title={tNav('courses')}
            icon={<BookOpen className="w-5 h-5" />}
            onClick={() => setIsAddCourseOpen(true)}
          />
        </div>
      </div>

      <StatCardRow>
        <StatCard
          title={t('totalStudents')}
          value={totalStudents}
          icon={<Users className="w-6 h-6" />}
          color="#0d9488"
        />
        <StatCard
          title={t('totalCourses')}
          value={totalCourses}
          icon={<BookOpen className="w-6 h-6" />}
          color="#22d3ee"
        />
        <StatCard
          title={t('activeComplaints')}
          value={activeComplaints}
          icon={<MessageSquareWarning className="w-6 h-6" />}
          color="#f59e0b"
        />
        <StatCard
          title={t('recentActivity')}
          value="Online"
          icon={<TrendingUp className="w-6 h-6" />}
          color="#8b5cf6"
        />
      </StatCardRow>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InsightCard
          label={isAr ? 'معدل إنجاز الشكاوى' : 'Resolution Rate'}
          value={`${resolutionRate}%`}
          helper={isAr ? 'الشكاوى المحلولة والمغلقة من إجمالي التذاكر.' : 'Resolved and closed complaints out of all tickets.'}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone={resolutionRate >= 70 ? 'success' : resolutionRate >= 40 ? 'warning' : 'danger'}
        />
        <InsightCard
          label={isAr ? 'شكاوى حرجة وعاجلة' : 'High Priority'}
          value={String(urgentComplaints)}
          helper={isAr ? 'تذاكر تتطلب متابعة تشغيلية عاجلة.' : 'Tickets that require faster operational follow-up.'}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={urgentComplaints > 0 ? 'warning' : 'success'}
        />
        <InsightCard
          label={isAr ? 'نسبة الطلاب النشطين' : 'Active Student Ratio'}
          value={`${activeStudentRate}%`}
          helper={isAr ? 'الطلاب المقيدون بحالة دراسية نشطة.' : 'Students with active enrollment status.'}
          icon={<UserCheck className="h-4 w-4" />}
          tone={activeStudentRate >= 80 ? 'success' : 'warning'}
        />
        <InsightCard
          label={isAr ? 'المقررات المطروحة' : 'Course Offerings'}
          value={totalCourses}
          helper={isAr ? 'دليل المواد المتاحة بجميع المستويات.' : 'Available course catalog across all levels.'}
          icon={<BookOpen className="h-4 w-4" />}
          tone="primary"
        />
      </div>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title={isAr ? "نشاط الشكاوى خلال 7 أيام" : "7-Day Ticket Volume"}
          description={isAr ? "معدل تدفق البلاغات والشكاوى المسجلة يومياً." : "Daily incoming tickets trend over the last week."}
          icon={<Activity className="h-5 w-5" />}
          isLoading={isAnalyticsLoading}
          isEmpty={weeklyTrendData.every((item) => item.value === 0)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyTrendData} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ticketTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(168,184,191,0.14)" vertical={false} />
              <XAxis dataKey="name" stroke="#a8b8bf" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis allowDecimals={false} stroke="#a8b8bf" tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(31, 61, 71, 0.96)',
                  border: '1px solid rgba(168,184,191,0.22)',
                  borderRadius: 12,
                  color: '#fff',
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="Tickets"
                stroke="#22d3ee"
                strokeWidth={2}
                fill="url(#ticketTrend)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={isAr ? "حالات تذاكر الشكاوى" : "Tickets by Status"}
          description={isAr ? "توزيع البلاغات الحالية حسب مرحلة المتابعة." : "Distribution of current support tickets by status."}
          icon={<MessageSquareWarning className="h-5 w-5" />}
          isLoading={isAnalyticsLoading}
          isEmpty={complaintStatusData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={complaintStatusData} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="rgba(168,184,191,0.14)" vertical={false} />
              <XAxis dataKey="name" stroke="#a8b8bf" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis allowDecimals={false} stroke="#a8b8bf" tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip
                cursor={{ fill: 'rgba(34,211,238,0.08)' }}
                contentStyle={{
                  background: 'rgba(31, 61, 71, 0.96)',
                  border: '1px solid rgba(168,184,191,0.22)',
                  borderRadius: 12,
                  color: '#fff',
                }}
              />
              <Bar dataKey="value" name="Tickets" radius={[8, 8, 0, 0]}>
                {complaintStatusData.map((_, index) => (
                  <Cell key={index} fill={chartColors[index % chartColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title={isAr ? "حالة قيد الطلاب" : "Students by Enrollment Status"}
          description={isAr ? "نسبة الطلاب النشطين والموقوفين في النظام." : "Active vs inactive distribution across the student body."}
          icon={<Users className="h-5 w-5" />}
          isLoading={isAnalyticsLoading}
          isEmpty={enrollmentStatusData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={enrollmentStatusData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={95}
                paddingAngle={4}
              >
                {enrollmentStatusData.map((_, index) => (
                  <Cell key={index} fill={chartColors[index % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'rgba(31, 61, 71, 0.96)',
                  border: '1px solid rgba(168,184,191,0.22)',
                  borderRadius: 12,
                  color: '#fff',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={isAr ? "المقررات حسب المستوى" : "Courses by Level"}
          description={isAr ? "توزيع المقررات المتاحة على المستويات الدراسية." : "Academic catalog coverage across study levels."}
          icon={<BarChart3 className="h-5 w-5" />}
          isLoading={isAnalyticsLoading}
          isEmpty={courseLevelData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={courseLevelData} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="rgba(168,184,191,0.14)" vertical={false} />
              <XAxis dataKey="name" stroke="#a8b8bf" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis allowDecimals={false} stroke="#a8b8bf" tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip
                cursor={{ fill: 'rgba(139,92,246,0.08)' }}
                contentStyle={{
                  background: 'rgba(31, 61, 71, 0.96)',
                  border: '1px solid rgba(168,184,191,0.22)',
                  borderRadius: 12,
                  color: '#fff',
                }}
              />
              <Bar dataKey="value" name="Courses" radius={[8, 8, 0, 0]} fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      {/* ─── ACTION MODALS MOUNTED ON DASHBOARD ─────────────────── */}

      {/* 1. Add Student Modal */}
      <StudentFormDialog
        open={isAddStudentOpen}
        onOpenChange={setIsAddStudentOpen}
        isEditing={false}
        isSubmitting={isSubmittingStudent}
        onSubmit={async (values) => {
          setIsSubmittingStudent(true);
          try {
            await createStudent(values as unknown as Parameters<typeof createStudent>[0]);
            setIsAddStudentOpen(false);
            toast.success(isAr ? 'تمت إضافة الطالب بنجاح' : 'Student added successfully');
            void queryClient.invalidateQueries();
          } catch (err: unknown) {
            toast.error(getApiErrorMessage(err, isAr ? 'فشل إضافة الطالب' : 'Failed to add student'));
          } finally {
            setIsSubmittingStudent(false);
          }
        }}
      />

      {/* 2. Upload Data Modal */}
      <DataUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        title={isAr ? 'رفع واستيراد البيانات' : 'Upload Data'}
        description={
          isAr
            ? 'قم برفع ملف بصيغة xlsx أو xls أو csv لاستيراد أو تحديث قواعد البيانات مباشرة.'
            : 'Upload an xlsx, xls, or csv file to import or update databases.'
        }
        uploadType="students"
        expectedColumns={['studentCode', 'fullName', 'nationalId', 'level', 'department']}
        onSuccess={() => {
          toast.success(isAr ? 'تم استيراد البيانات بنجاح' : 'Data imported successfully');
          void queryClient.invalidateQueries();
        }}
      />

      {/* 3. Record Grade Modal */}
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
            toast.success(isAr ? 'تم رصد الدرجة بنجاح' : 'Grade recorded successfully');
            void queryClient.invalidateQueries();
          } catch (err: unknown) {
            toast.error(getApiErrorMessage(err, isAr ? 'فشل رصد الدرجة' : 'Failed to save grade'));
          } finally {
            setIsSubmittingGrade(false);
          }
        }}
      />

      {/* 4. Add Course Modal */}
      <Dialog open={isAddCourseOpen} onOpenChange={setIsAddCourseOpen}>
        <DialogContent className="max-w-lg" dir={isAr ? 'rtl' : 'ltr'}>
          <DialogHeader className="text-start">
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              {isAr ? 'إضافة مادة دراسية جديدة' : 'Add New Course'}
            </DialogTitle>
            <DialogDescription>
              {isAr ? 'أدخل تفاصيل المقرر الجديد لإضافته للائحة الأكاديمية.' : 'Enter new course catalog details.'}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setIsSubmittingCourse(true);
              try {
                await api.post('/admin/courses', courseForm);
                setIsAddCourseOpen(false);
                toast.success(isAr ? 'تمت إضافة المادة بنجاح' : 'Course added successfully');
                void queryClient.invalidateQueries();
              } catch (err: unknown) {
                toast.error(getApiErrorMessage(err, isAr ? 'فشل إضافة المادة' : 'Failed to add course'));
              } finally {
                setIsSubmittingCourse(false);
              }
            }}
            className="space-y-4 pt-2"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">{isAr ? 'كود المادة' : 'Course Code'}</label>
                <Input
                  required
                  placeholder="CS101"
                  value={courseForm.code}
                  onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })}
                  className="mt-1 font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">{isAr ? 'الساعات المعتمدة' : 'Credit Hours'}</label>
                <Input
                  type="number"
                  min={1}
                  max={6}
                  required
                  value={courseForm.creditHours}
                  onChange={(e) => setCourseForm({ ...courseForm, creditHours: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">{isAr ? 'اسم المادة (بالعربية)' : 'Course Name (Arabic)'}</label>
              <Input
                required
                placeholder={isAr ? 'مقدمة في تكنولوجيا المعلومات' : 'Course Name Ar'}
                value={courseForm.nameAr}
                onChange={(e) => setCourseForm({ ...courseForm, nameAr: e.target.value, name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">{isAr ? 'اسم المادة (بالإنجليزية)' : 'Course Name (English)'}</label>
              <Input
                placeholder="Intro to IT"
                value={courseForm.nameEn}
                onChange={(e) => setCourseForm({ ...courseForm, nameEn: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">{isAr ? 'المستوى' : 'Level'}</label>
                <Select value={courseForm.level} onValueChange={(val) => setCourseForm({ ...courseForm, level: val })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{isAr ? 'المستوى الأول' : 'Level 1'}</SelectItem>
                    <SelectItem value="2">{isAr ? 'المستوى الثاني' : 'Level 2'}</SelectItem>
                    <SelectItem value="3">{isAr ? 'المستوى الثالث' : 'Level 3'}</SelectItem>
                    <SelectItem value="4">{isAr ? 'المستوى الرابع' : 'Level 4'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">{isAr ? 'الفصل الدراسي' : 'Semester'}</label>
                <Select value={courseForm.semester} onValueChange={(val) => setCourseForm({ ...courseForm, semester: val })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">{isAr ? 'الفصل الأول' : 'First Term'}</SelectItem>
                    <SelectItem value="second">{isAr ? 'الفصل الثاني' : 'Second Term'}</SelectItem>
                    <SelectItem value="summer">{isAr ? 'الفصل الصيفي' : 'Summer'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddCourseOpen(false)}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button type="submit" disabled={isSubmittingCourse} className="gap-2">
                {isSubmittingCourse && <Loader2 className="h-4 w-4 animate-spin" />}
                {isAr ? 'حفظ المقرر' : 'Save Course'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. Quick Complaint Lookup Modal */}
      <Dialog open={isComplaintLookupOpen} onOpenChange={setIsComplaintLookupOpen}>
        <DialogContent className="max-w-lg" dir={isAr ? 'rtl' : 'ltr'}>
          <DialogHeader className="text-start">
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareWarning className="h-5 w-5 text-primary" />
              {isAr ? 'الاستعلام السريع عن شكوى' : 'Quick Complaint Lookup'}
            </DialogTitle>
            <DialogDescription>
              {isAr ? 'أدخل رقم التذكرة أو كود الطالب للوصول الفوري للمحادثة والتفاصيل.' : 'Search by ticket number or student code.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex gap-2">
              <Input
                placeholder={isAr ? 'أدخل رقم التذكرة (مثل TIK-1234)...' : 'Ticket number (e.g. TIK-1234)...'}
                value={complaintSearch}
                onChange={(e) => setComplaintSearch(e.target.value)}
                className="font-mono text-sm"
              />
              <Button
                onClick={() => {
                  if (complaintSearch.trim()) {
                    setIsComplaintLookupOpen(false);
                    router.push(`/${locale}/admin/complaints?ticket=${complaintSearch.trim()}`);
                  }
                }}
                className="shrink-0"
              >
                {isAr ? 'انتقال' : 'Go'}
              </Button>
            </div>

            <div className="border-t border-border/50 pt-3">
              <p className="text-xs text-muted-foreground mb-2">{isAr ? 'آخر الشكاوى النشطة:' : 'Recent active tickets:'}</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {complaints.slice(0, 4).map((c) => (
                  <div
                    key={c._id}
                    onClick={() => {
                      setIsComplaintLookupOpen(false);
                      router.push(`/${locale}/admin/complaints?ticket=${c._id}`);
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-surface/30 hover:bg-surface/60 cursor-pointer text-xs transition-colors"
                  >
                    <div>
                      <span className="font-mono font-bold text-primary">{c._id.slice(-6).toUpperCase()}</span>
                      <span className="ms-2 text-muted-foreground">{c.status}</span>
                    </div>
                    <span className="text-xs font-semibold text-primary">{isAr ? 'فتح' : 'Open'} →</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 6. Upload Exam Schedule Modal */}
      <DataUploadDialog
        open={isAddScheduleOpen}
        onOpenChange={setIsAddScheduleOpen}
        title={isAr ? 'رفع جداول الامتحانات' : 'Upload Exam Schedules'}
        description={
          isAr
            ? 'قم برفع ملف Excel الخاص بمواعيد ولجان الامتحانات لتحديث جداول الطلاب.'
            : 'Upload exam schedules Excel workbook.'
        }
        uploadType="exam-schedules"
        expectedColumns={['courseCode', 'examDate', 'startTime', 'endTime', 'building', 'room']}
        onSuccess={() => {
          toast.success(isAr ? 'تم استيراد جداول الامتحانات بنجاح' : 'Exam schedules imported successfully');
          void queryClient.invalidateQueries();
        }}
      />
    </div>
  );
}
