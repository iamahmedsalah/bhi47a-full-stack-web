'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
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
  Sparkles,
  MessageCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

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
}

interface AttendanceRecord {
  totalLectures: number;
  attendedLectures: number;
  absenceLectures: number;
  attendancePercentage: number;
}

interface Eligibility {
  canRegisterDirectly: boolean;
  maxCreditHours: number;
  requiresAdvisor: boolean;
  gpa: number;
}

export default function StudentDashboard() {
  const t = useTranslations('studentPortal');
  const tCommon = useTranslations('common');
  const params = useParams();
  const locale = params.locale as string;

  // 1. Profile Query
  const profileQuery = useQuery({
    queryKey: ['student-profile'],
    queryFn: async () => {
      const res = await api.get<StudentProfile>('/students/me/profile');
      return res.data;
    },
  });

  // 2. Attendance Query
  const attendanceQuery = useQuery({
    queryKey: ['student-attendance'],
    queryFn: async () => {
      const res = await api.get<AttendanceRecord[]>('/students/me/attendance');
      return res.data;
    },
  });

  // 3. Eligibility/GPA Query
  const eligibilityQuery = useQuery({
    queryKey: ['registration-eligibility'],
    queryFn: async () => {
      const res = await api.get<Eligibility>('/registration/eligibility');
      return res.data;
    },
  });

  const profile = profileQuery.data ?? null;
  const attendance = attendanceQuery.data?.[0] ?? null;
  const eligibility = eligibilityQuery.data ?? null;

  const quickLinks = [
    {
      key: 'quizzes',
      icon: <FileText className="w-5 h-5" />,
      color: '#f59e0b',
      href: `/${locale}/dashboard/quizzes`,
    },
    {
      key: 'results',
      icon: <Award className="w-5 h-5" />,
      color: '#8b5cf6',
      href: `/${locale}/dashboard/results`,
    },
    {
      key: 'academicEmail',
      icon: <Mail className="w-5 h-5" />,
      color: '#ec4899',
      href: `/${locale}/dashboard/academic-email`,
    },
    {
      key: 'examSchedule',
      icon: <Calendar className="w-5 h-5" />,
      color: '#10b981',
      href: `/${locale}/dashboard/exam-schedule`,
    },
    {
      key: 'complaints',
      icon: <MessageCircle className="w-5 h-5" />,
      color: '#6366f1',
      href: `/${locale}/dashboard/complaints`,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-8" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {/* Welcome Widget */}
      <div className="relative overflow-hidden bg-gradient-to-r from-teal-950/40 via-teal-900/20 to-transparent rounded-2xl p-6 md:p-8 border border-primary/20 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-lg">
        <div className="space-y-2 z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            {locale === 'ar' ? 'البوابة الأكاديمية الموحدة' : 'Unified Academic Portal'}
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">
            {tCommon('welcome')}, {profile?.fullName || '...'} 👋
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-xl">
            {locale === 'ar'
              ? 'مرحباً بك في لوحة التحكم الخاصة بك. يمكنك متابعة أدائك الأكاديمي، جدول امتحاناتك، والتقديم على طلبات الإرشاد والتسجيل.'
              : 'Welcome back to your workspace. Monitor your grades, track lectures, request advising, and view exam committees.'}
          </p>
        </div>
        <div className="flex gap-3 z-10 shrink-0">
          <Link href={`/${locale}/dashboard/profile`}>
            <button className="h-11 px-5 text-sm font-semibold rounded-xl bg-primary hover:bg-primary/80 text-primary-foreground transition-all cursor-pointer">
              {locale === 'ar' ? 'الملف الشخصي' : 'View Profile'}
            </button>
          </Link>
        </div>
        <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* GPA & Advising Widget */}
        <Card className="col-span-12 lg:col-span-4 p-5 bg-card/45 backdrop-blur-sm border-border flex flex-col justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-primary" />
                {locale === 'ar' ? 'المعدل والجيل الأكاديمي' : 'GPA & Advising'}
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
                    strokeDashoffset={251.2 - (251.2 * (eligibility?.gpa ?? 0)) / 4.0}
                    className="text-primary transition-all duration-1000"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-xl font-bold font-mono text-foreground">
                    {eligibility?.gpa !== undefined ? eligibility.gpa.toFixed(2) : '...'}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">GPA</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-muted-foreground">
                  {locale === 'ar' ? 'الحد الأقصى للساعات المعتمدة:' : 'Max Credit Hours:'}
                </p>
                <p className="text-2xl font-black text-foreground font-mono">
                  {eligibility?.maxCreditHours ?? '...'}
                </p>
              </div>
            </div>
          </div>
          <div>
            {eligibility?.requiresAdvisor ? (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">{locale === 'ar' ? 'إرشاد أكاديمي مطلوب' : 'Advising Required'}</p>
                  <p className="mt-0.5 text-muted-foreground leading-normal">
                    {locale === 'ar'
                      ? 'معدلك الأكاديمي يتطلب مراجعة المرشد الأكاديمي لتسجيل المواد.'
                      : 'Your current GPA requires academic advisor approval to complete registration.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-semibold">
                  {locale === 'ar' ? 'حالة أكاديمية مستقرة - تسجيل مباشر' : 'Clear Academic Standing - Direct Registration'}
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Academic Profile Widget */}
        <Card className="col-span-12 lg:col-span-4 p-5 bg-card/45 backdrop-blur-sm border-border flex flex-col justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                {locale === 'ar' ? 'الملخص الدراسي' : 'Academic Profile'}
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm border-b border-border/50 pb-2">
                <span className="text-muted-foreground">{locale === 'ar' ? 'الكود الأكاديمي' : 'Student Code'}</span>
                <span className="font-mono font-bold text-foreground">{profile?.studentCode || '...'}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-border/50 pb-2">
                <span className="text-muted-foreground">{locale === 'ar' ? 'المستوى' : 'Level'}</span>
                <span className="font-semibold text-foreground">
                  {profile?.level ? (locale === 'ar' ? `المستوى ${profile.level}` : `Level ${profile.level}`) : '...'}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-border/50 pb-2">
                <span className="text-muted-foreground">{locale === 'ar' ? 'التخصص' : 'Department'}</span>
                <span className="font-semibold text-foreground">{profile?.department || '...'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{locale === 'ar' ? 'المجموعة / الفصل الدراسي' : 'Group & Semester'}</span>
                <span className="font-semibold text-foreground">
                  {profile ? `${profile.group || '-'} / ${profile.semester || '-'}` : '...'}
                </span>
              </div>
            </div>
          </div>
          <Link href={`/${locale}/dashboard/profile`} className="w-full">
            <button className="w-full h-10 text-xs font-semibold rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1">
              {locale === 'ar' ? 'تعديل بيانات التواصل' : 'Edit Contact Info'}
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </Link>
        </Card>

        {/* Attendance Widget */}
        <Card className="col-span-12 lg:col-span-4 p-5 bg-card/45 backdrop-blur-sm border-border flex flex-col justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                {locale === 'ar' ? 'نسبة الحضور الإجمالية' : 'Attendance Summary'}
              </h3>
            </div>
            <div className="space-y-4 my-2">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-black font-mono text-foreground">
                  {attendance ? `${attendance.attendancePercentage.toFixed(1)}%` : '...'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {locale === 'ar' ? 'مطلوب 75% لتجنب الحظر' : '75% minimum required'}
                </span>
              </div>
              <Progress
                value={attendance?.attendancePercentage ?? 0}
                className={`h-2.5 ${(attendance?.attendancePercentage ?? 0) < 75 ? 'bg-red-500/20 text-red-500' : 'text-primary'}`}
              />
              <div className="grid grid-cols-2 gap-4 text-center mt-2">
                <div className="bg-secondary/40 p-2.5 rounded-xl border border-border/50">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">{locale === 'ar' ? 'المحاضرات المقبولة' : 'Attended'}</p>
                  <p className="text-lg font-bold font-mono text-foreground mt-0.5">{attendance?.attendedLectures ?? 0}</p>
                </div>
                <div className="bg-secondary/40 p-2.5 rounded-xl border border-border/50">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">{locale === 'ar' ? 'الغياب' : 'Absent'}</p>
                  <p className="text-lg font-bold font-mono text-red-500 mt-0.5">{attendance?.absenceLectures ?? 0}</p>
                </div>
              </div>
            </div>
          </div>
          <Link href={`/${locale}/dashboard/attendance`} className="w-full">
            <button className="w-full h-10 text-xs font-semibold rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1">
              {locale === 'ar' ? 'سجل المحاضرات التفصيلي' : 'Detailed Attendance Logs'}
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </Link>
        </Card>

        {/* Exam Seat / Place Widget */}
        <Card className="col-span-12 lg:col-span-6 p-5 bg-card/45 backdrop-blur-sm border-border flex flex-col justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                {locale === 'ar' ? 'مكان ورقم لجنة الامتحان' : 'Exam Seating & Placement'}
              </h3>
            </div>
            {profile?.seatNumber ? (
              <div className="grid grid-cols-2 gap-4 my-2">
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <span className="font-mono font-black text-sm">#</span>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase">{locale === 'ar' ? 'رقم الجلوس' : 'Seat Number'}</p>
                    <p className="text-xl font-bold font-mono text-foreground mt-0.5">{profile.seatNumber}</p>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase">{locale === 'ar' ? 'اللجنة والمبنى' : 'Building / Room'}</p>
                    <p className="text-base font-bold text-foreground mt-0.5 truncate">
                      {profile.examBuilding ? `${profile.examBuilding} · ` : ''}
                      {profile.examRoom ? `${locale === 'ar' ? 'مدرج' : 'Room'} ${profile.examRoom}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                <AlertTriangle className="w-8 h-8 text-muted mb-2" />
                <p className="text-sm font-semibold">{locale === 'ar' ? 'أماكن اللجان لم تحدد بعد' : 'Exam Seating Not Allocated'}</p>
                <p className="text-xs text-muted/70 mt-1 max-w-sm">
                  {locale === 'ar'
                    ? 'سيتم نشر تفاصيل اللجان وأرقام الجلوس فور صدور جدول الامتحانات.'
                    : 'Committees and seat numbers will be visible once exam timetables are published.'}
                </p>
              </div>
            )}
          </div>
          <Link href={`/${locale}/dashboard/exam-place`} className="w-full">
            <button className="w-full h-10 text-xs font-semibold rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1">
              {locale === 'ar' ? 'تفاصيل مكان اللجنة' : 'Detailed Location Details'}
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </Link>
        </Card>

        {/* Quick Actions Grid */}
        <Card className="col-span-12 lg:col-span-6 p-5 bg-card/45 backdrop-blur-sm border-border shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
              <BookOpenCheck className="w-5 h-5 text-primary" />
              {locale === 'ar' ? 'الخدمات السريعة' : 'Quick Services'}
            </h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {quickLinks.map((link) => (
              <Link key={link.key} href={link.href}>
                <div className="flex flex-col items-center gap-3 p-4 rounded-xl border border-border/70 bg-card hover:bg-secondary/40 hover:border-primary/40 transition-all cursor-pointer text-center group">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundColor: `${link.color}15`, color: link.color }}
                  >
                    {link.icon}
                  </div>
                  <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    {t(link.key)}
                  </span>
                </div>
              </Link>
            ))}
            {/* Registration Direct Access */}
            <Link href={`/${locale}/dashboard/registration`}>
              <div className="flex flex-col items-center gap-3 p-4 rounded-xl border border-border/70 bg-card hover:bg-secondary/40 hover:border-primary/40 transition-all cursor-pointer text-center group">
                <div className="w-10 h-10 rounded-lg bg-teal-500/15 text-teal-500 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                  <BookOpenCheck className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                  {locale === 'ar' ? 'تسجيل المواد' : 'Registration'}
                </span>
              </div>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
