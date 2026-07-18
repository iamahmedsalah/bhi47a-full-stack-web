'use client';

import React from 'react';
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
} from 'lucide-react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
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
import api, { PaginatedResponse } from '@/lib/api';
import { ChartCard } from '@/components/ui/chart-card';
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { StatCard, StatCardRow } from '@/components/ui/stat-card';

interface DashboardStudent {
  _id: string;
  enrollmentStatus?: string;
  level?: string;
}

interface DashboardCourse {
  _id: string;
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
  href: string;
  icon: React.ReactNode;
}

function QuickAction({ title, href, icon }: QuickActionProps) {
  return (
    <Link
      href={href}
      className="group flex min-h-16 items-center gap-3 rounded-xl border border-border/70 bg-card/90 p-4 shadow-[var(--shadow-glow)] backdrop-blur transition-all duration-300 hover:border-primary/40 hover:bg-card-hover/70"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-squircle border border-primary/30 bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-white">
        {icon}
      </div>
      <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </Link>
  );
}

function InsightCard({
  label,
  value,
  helper,
  tone = 'primary',
}: {
  label: string;
  value: string;
  helper: string;
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
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</p>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-squircle border ${toneClass}`}>
          <Activity className="h-4 w-4" />
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
  const locale = params.locale as string;
  const isAr = locale === 'ar';

  // Fetch counts
  const studentsCountQuery = useQuery({
    queryKey: ['admin-stats-students'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<unknown>>('/admin/students', { params: { limit: 1 } });
      return res.data?.total || 0;
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
        params: { limit: 1000 },
      });
      return res.data.items;
    },
  });

  const coursesAnalyticsQuery = useQuery({
    queryKey: ['admin-analytics-courses'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<DashboardCourse>>('/admin/courses', {
        params: { limit: 1000 },
      });
      return res.data.items;
    },
  });

  const complaintsAnalyticsQuery = useQuery({
    queryKey: ['admin-analytics-complaints'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<DashboardComplaint>>('/admin/complaints', {
        params: { limit: 1000 },
      });
      return res.data.items;
    },
  });

  const totalStudents = studentsCountQuery.isLoading ? '...' : String(studentsCountQuery.data ?? 0);
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
    studentsAnalyticsQuery.isLoading ||
    coursesAnalyticsQuery.isLoading ||
    complaintsAnalyticsQuery.isLoading;

  const enrollmentStatusData = React.useMemo(
    () => countBy(students, (student) => student.enrollmentStatus),
    [students],
  );
  const courseLevelData = React.useMemo(
    () => countBy(courses, (course) => course.level ?? course.academicLevel),
    [courses],
  );
  const complaintStatusData = React.useMemo(
    () => countBy(complaints, (complaint) => complaint.status),
    [complaints],
  );
  const complaintTrendData = React.useMemo(
    () => getLastSevenDayTrend(complaints, locale),
    [complaints, locale],
  );

  const resolvedComplaints = complaints.filter((complaint) => (
    complaint.status === 'resolved' || complaint.status === 'closed'
  )).length;
  const urgentComplaints = complaints.filter((complaint) => (
    complaint.priority === 'urgent' || complaint.priority === 'high'
  )).length;
  const activeStudents = students.filter((student) => student.enrollmentStatus === 'active').length;
  const activeCourses = courses.filter((course) => course.isActive !== false).length;
  const resolutionRate = complaints.length
    ? Math.round((resolvedComplaints / complaints.length) * 100)
    : 0;

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      <PageTitleBanner
        title={t('title')}
        eyebrow={tNav('dashboard')}
        icon={<TrendingUp className="h-5 w-5" />}
        subtitle="Quick operational view for portal activity."
      />

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
          label="Resolution Rate"
          value={`${resolutionRate}%`}
          helper="Resolved and closed complaints out of all tickets."
          tone={resolutionRate >= 70 ? 'success' : resolutionRate >= 40 ? 'warning' : 'danger'}
        />
        <InsightCard
          label="High Priority"
          value={String(urgentComplaints)}
          helper="Tickets that require faster operational follow-up."
          tone={urgentComplaints > 0 ? 'warning' : 'success'}
        />
        <InsightCard
          label={isAr ? "الطلاب النشطون" : "Active Students"}
          value={String(activeStudents)}
          helper={isAr ? "الطلاب المسجلون كنشطين في النظام حالياً." : "Students currently marked active in enrollment records."}
          tone="primary"
        />
        <InsightCard
          label={isAr ? "المقررات النشطة" : "Active Courses"}
          value={String(activeCourses)}
          helper={isAr ? "المقررات المتاحة في الدليل الأكاديمي." : "Courses available or not explicitly disabled."}
          tone="success"
        />
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title={isAr ? "اتجاه الشكاوى" : "Complaint Trend"}
          description={isAr ? "التذاكر والشكاوى التي تم إنشاؤها خلال آخر 7 أيام." : "Tickets created over the last 7 days."}
          icon={<TrendingUp className="h-5 w-5" />}
          isLoading={isAnalyticsLoading}
          isEmpty={complaintTrendData.every((day) => day.value === 0)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={complaintTrendData} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="complaintTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(168,184,191,0.14)" vertical={false} />
              <XAxis dataKey="name" stroke="#a8b8bf" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis allowDecimals={false} stroke="#a8b8bf" tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip
                cursor={{ stroke: '#22d3ee', strokeOpacity: 0.35 }}
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
                name={isAr ? "الشكاوى" : "Tickets"}
                stroke="#22d3ee"
                strokeWidth={3}
                fill="url(#complaintTrendFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={isAr ? "حالات القيد" : "Enrollment Status"}
          description={isAr ? "توزيع حالات حسابات الطلاب المسجلة بالنظام." : "Distribution of student account states."}
          icon={<Users className="h-5 w-5" />}
          isLoading={isAnalyticsLoading}
          isEmpty={enrollmentStatusData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={enrollmentStatusData} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
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
              <Bar dataKey="value" name={isAr ? "عدد الطلاب" : "Students"} radius={[8, 8, 0, 0]} fill="#16a34a" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={isAr ? "توزيع حالات الشكاوى" : "Complaint Status Mix"}
          description={isAr ? "الحالة التشغيلية لجميع تذاكر الشكاوى الظاهرة." : "Operational state of all visible tickets."}
          icon={<CircleAlert className="h-5 w-5" />}
          isLoading={isAnalyticsLoading}
          isEmpty={complaintStatusData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={complaintStatusData}
                dataKey="value"
                nameKey="name"
                innerRadius={62}
                outerRadius={92}
                paddingAngle={4}
              >
                {complaintStatusData.map((entry, index) => (
                  <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
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

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">
          {t('quickActions')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <QuickAction
            title={tStudents('addStudent')}
            href={`/${locale}/admin/students`}
            icon={<UserPlus className="w-5 h-5" />}
          />
          <QuickAction
            title={tNav('uploads')}
            href={`/${locale}/admin/uploads`}
            icon={<Upload className="w-5 h-5" />}
          />
          <QuickAction
            title={tNav('examSchedules')}
            href={`/${locale}/admin/exam-schedules`}
            icon={<Calendar className="w-5 h-5" />}
          />
          <QuickAction
            title={tNav('complaints')}
            href={`/${locale}/admin/complaints`}
            icon={<MessageSquareWarning className="w-5 h-5" />}
          />
          <QuickAction
            title={tNav('grades')}
            href={`/${locale}/admin/grades`}
            icon={<Users className="w-5 h-5" />}
          />
          <QuickAction
            title={tNav('courses')}
            href={`/${locale}/admin/courses`}
            icon={<BookOpen className="w-5 h-5" />}
          />
        </div>
      </div>
    </div>
  );
}
