'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { queryKeys } from '@/lib/query-keys';
import api from '@/lib/api';
import {
  Users,
  RefreshCw,
  Search,
  Clock,
  Laptop,
  Smartphone,
  Compass,
  BookOpen,
  GraduationCap,
  Calendar,
  MessageSquare,
  HelpCircle,
  UserCheck,
  Flame,
  Copy,
  Check,
  ShieldCheck,
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActiveSessionItem {
  _id: string;
  name: string;
  nameAr?: string;
  role: string;
  staffType?: string;
  studentCode: string;
  roleLabelAr?: string;
  roleLabelEn?: string;
  level?: string;
  department?: string;
  academicEmail?: string;
  seatNumber?: string;
  loginTime: string;
  lastActiveTime: string;
  sessionDurationMinutes: number;
  isOnline: boolean;
  lastAction: string;
  lastActionAr: string;
  lastActionRoute: string;
  sessionDevice: string;
}

interface ActiveSessionsResponse {
  windowMinutes: number;
  totalActive: number;
  onlineNow: number;
  onlineStudents?: number;
  totalStudents?: number;
  onlineStaff?: number;
  totalStaff?: number;
  items: ActiveSessionItem[];
}

interface ActiveSessionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAr?: boolean;
}

function getActionIcon(route: string) {
  const r = (route || '').toLowerCase();
  if (r.includes('quiz')) return <GraduationCap className="h-3.5 w-3.5 text-purple-400" />;
  if (r.includes('course') || r.includes('material')) return <BookOpen className="h-3.5 w-3.5 text-teal-400" />;
  if (r.includes('grade') || r.includes('result')) return <Flame className="h-3.5 w-3.5 text-amber-400" />;
  if (r.includes('exam') || r.includes('schedule')) return <Calendar className="h-3.5 w-3.5 text-blue-400" />;
  if (r.includes('attendance') || r.includes('check-in')) return <UserCheck className="h-3.5 w-3.5 text-emerald-400" />;
  if (r.includes('complaint')) return <MessageSquare className="h-3.5 w-3.5 text-rose-400" />;
  if (r.includes('faq') || r.includes('chat')) return <HelpCircle className="h-3.5 w-3.5 text-cyan-400" />;
  if (r.includes('admin')) return <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />;
  return <Compass className="h-3.5 w-3.5 text-muted-foreground" />;
}

function formatDuration(minutes: number, isAr: boolean): string {
  if (minutes < 1) return isAr ? 'أقل من دقيقة' : '< 1 min';
  if (minutes < 60) return isAr ? `${minutes} دقيقة` : `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return isAr ? `${hrs} ساعة` : `${hrs}h`;
  return isAr ? `${hrs} س ${rem} د` : `${hrs}h ${rem}m`;
}

function formatRelativeTime(dateStr: string, isAr: boolean): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return isAr ? 'الآن' : 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return isAr ? `منذ ${diffMin} د` : `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    return isAr ? `منذ ${diffHrs} س` : `${diffHrs}h ago`;
  } catch {
    return isAr ? 'مؤخراً' : 'Recently';
  }
}

function formatTimeOnly(dateStr: string, isAr: boolean): string {
  try {
    return new Date(dateStr).toLocaleTimeString(isAr ? 'ar-EG' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Africa/Cairo',
    });
  } catch {
    return '—';
  }
}

export function ActiveSessionsDialog({
  open,
  onOpenChange,
  isAr = false,
}: ActiveSessionsDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryTab, setCategoryTab] = useState<'all' | 'students' | 'staff'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'recent'>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<ActiveSessionsResponse>({
    queryKey: queryKeys.students.activeSessions({ windowMinutes: 60 }),
    queryFn: async () => {
      const res = await api.get<ActiveSessionsResponse>('/admin/students/active-sessions', {
        params: { windowMinutes: 60 },
      });
      return res.data;
    },
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });

  const items = useMemo(() => data?.items || [], [data?.items]);

  const studentsList = useMemo(() => items.filter((i) => i.role === 'student'), [items]);
  const staffList = useMemo(() => items.filter((i) => i.role !== 'student'), [items]);

  const onlineStudentsCount = useMemo(
    () => data?.onlineStudents ?? studentsList.filter((i) => i.isOnline).length,
    [data?.onlineStudents, studentsList],
  );

  const onlineStaffCount = useMemo(
    () => data?.onlineStaff ?? staffList.filter((i) => i.isOnline).length,
    [data?.onlineStaff, staffList],
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Category filter (Students vs Staff vs All)
      if (categoryTab === 'students' && item.role !== 'student') return false;
      if (categoryTab === 'staff' && item.role === 'student') return false;

      // Status filter (Online now vs Recent)
      if (statusFilter === 'online' && !item.isOnline) return false;
      if (statusFilter === 'recent' && item.isOnline) return false;

      // Search term
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      const matchName = (item.name || '').toLowerCase().includes(q);
      const matchNameAr = (item.nameAr || '').toLowerCase().includes(q);
      const matchCode = (item.studentCode || '').toLowerCase().includes(q);
      const matchEmail = (item.academicEmail || '').toLowerCase().includes(q);
      const matchDept = (item.department || '').toLowerCase().includes(q);
      const matchRole = (item.roleLabelAr || item.roleLabelEn || '').toLowerCase().includes(q);
      return matchName || matchNameAr || matchCode || matchEmail || matchDept || matchRole;
    });
  }, [items, categoryTab, statusFilter, searchTerm]);

  const handleCopyCode = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const totalActive = data?.totalActive ?? items.length;
  const onlineNow = data?.onlineNow ?? (onlineStudentsCount + onlineStaffCount);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[88vh] rounded-2xl border-border/80 bg-background/95 p-0 shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-border/60 bg-surface/30">
          <DialogHeader className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-squircle bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-foreground flex flex-wrap items-center gap-2">
                    <span>{isAr ? 'المتواجدون بالبوابة الآن (مباشر)' : 'Live Connected Portal Users'}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                      </span>
                      <span>{onlineNow} {isAr ? 'متصل الآن' : 'online now'}</span>
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    {isAr
                      ? 'متابعة حية للطلاب وأعضاء هيئة التدريس والإداريين المتصلين بالبوابة ومدد الجلسات'
                      : 'Real-time monitoring of students, faculty, and administrative staff active on the portal'}
                  </DialogDescription>
                </div>
              </div>

              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex items-center gap-1.5 rounded-squircle border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface/80 hover:text-foreground transition-all cursor-pointer disabled:opacity-50"
                title={isAr ? 'تحديث البيانات' : 'Refresh data'}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin text-primary')} />
                <span className="hidden sm:inline">{isAr ? 'تحديث' : 'Refresh'}</span>
              </button>
            </div>
          </DialogHeader>

          {/* Quick Metrics Bar: Separating Students and Staff */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div
              onClick={() => {
                setCategoryTab('students');
                setStatusFilter('online');
              }}
              className={cn(
                'rounded-xl border p-2.5 text-center transition-all cursor-pointer select-none',
                categoryTab === 'students' && statusFilter === 'online'
                  ? 'border-emerald-500/60 bg-emerald-500/15 ring-1 ring-emerald-500/40'
                  : 'border-border/60 bg-card/60 hover:bg-card hover:border-emerald-500/30',
              )}
            >
              <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                </span>
                <span>{isAr ? 'الطلاب المتصلون الآن' : 'Online Students'}</span>
              </div>
              <p className="font-mono text-xl font-bold text-emerald-400 mt-0.5">
                {onlineStudentsCount}
              </p>
            </div>

            <div
              onClick={() => {
                setCategoryTab('staff');
                setStatusFilter('online');
              }}
              className={cn(
                'rounded-xl border p-2.5 text-center transition-all cursor-pointer select-none',
                categoryTab === 'staff' && statusFilter === 'online'
                  ? 'border-cyan-500/60 bg-cyan-500/15 ring-1 ring-cyan-500/40'
                  : 'border-border/60 bg-card/60 hover:bg-card hover:border-cyan-500/30',
              )}
            >
              <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500"></span>
                </span>
                <span>{isAr ? 'الكادر الأكاديمي والإداري' : 'Online Faculty & Staff'}</span>
              </div>
              <p className="font-mono text-xl font-bold text-cyan-400 mt-0.5">
                {onlineStaffCount}
              </p>
            </div>

            <div
              onClick={() => {
                setCategoryTab('all');
                setStatusFilter('all');
              }}
              className={cn(
                'rounded-xl border p-2.5 text-center transition-all cursor-pointer select-none',
                categoryTab === 'all' && statusFilter === 'all'
                  ? 'border-primary/60 bg-primary/15 ring-1 ring-primary/40'
                  : 'border-border/60 bg-card/60 hover:bg-card hover:border-primary/30',
              )}
            >
              <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span>{isAr ? 'إجمالي الجلسات النشطة' : 'Total Active Sessions'}</span>
              </div>
              <p className="font-mono text-xl font-bold text-foreground mt-0.5">
                {totalActive}
              </p>
            </div>
          </div>

          {/* Category Tabs: All vs Students vs Staff */}
          <div className="flex items-center justify-between flex-wrap gap-2.5 mt-4">
            <div className="flex items-center gap-1 rounded-squircle border border-border/70 bg-surface/60 p-1 text-xs">
              <button
                type="button"
                onClick={() => setCategoryTab('all')}
                className={cn(
                  'rounded-squircle px-3 py-1 text-xs font-medium transition-all cursor-pointer',
                  categoryTab === 'all'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {isAr ? 'الكل' : 'All'} ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setCategoryTab('students')}
                className={cn(
                  'rounded-squircle px-3 py-1 text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5',
                  categoryTab === 'students'
                    ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <GraduationCap className="h-3.5 w-3.5" />
                <span>{isAr ? 'الطلاب' : 'Students'}</span> ({studentsList.length})
              </button>
              <button
                type="button"
                onClick={() => setCategoryTab('staff')}
                className={cn(
                  'rounded-squircle px-3 py-1 text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5',
                  categoryTab === 'staff'
                    ? 'bg-cyan-600 text-white font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Briefcase className="h-3.5 w-3.5" />
                <span>{isAr ? 'هيئة التدريس والإدارة' : 'Faculty & Staff'}</span> ({staffList.length})
              </button>
            </div>

            {/* Status Filter: All / Online Now / Recent */}
            <div className="flex items-center gap-1 rounded-squircle border border-border/70 bg-surface/50 p-1 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={cn(
                  'rounded-squircle px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                  statusFilter === 'all'
                    ? 'bg-secondary text-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {isAr ? 'الجميع' : 'Any'}
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('online')}
                className={cn(
                  'rounded-squircle px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1',
                  statusFilter === 'online'
                    ? 'bg-emerald-600/90 text-white font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>{isAr ? 'متصل الآن' : 'Online'}</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('recent')}
                className={cn(
                  'rounded-squircle px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                  statusFilter === 'recent'
                    ? 'bg-amber-600/90 text-white font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {isAr ? 'مؤخراً' : 'Recent'}
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative mt-3">
            <Search
              className={cn(
                'absolute top-2.5 h-4 w-4 text-muted-foreground',
                isAr ? 'right-3' : 'left-3',
              )}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                categoryTab === 'students'
                  ? isAr
                    ? 'بحث باسم الطالب أو الكود أو القسم...'
                    : 'Search by student name, code, department...'
                  : categoryTab === 'staff'
                    ? isAr
                      ? 'بحث باسم عضو هيئة التدريس، الدكتور، أو الدور...'
                      : 'Search by doctor/staff name, role, department...'
                    : isAr
                      ? 'بحث بالاسم، الكود، القسم أو الدور...'
                      : 'Search by name, student code, department, or role...'
              }
              className={cn(
                'w-full rounded-squircle border border-border/80 bg-background/80 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                isAr ? 'pr-9 pl-3' : 'pl-9 pr-3',
              )}
            />
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 min-h-[300px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <RefreshCw className="h-7 w-7 animate-spin text-primary" />
              <p className="text-xs">{isAr ? 'جاري فحص وتحديث جلسات المستخدمين...' : 'Loading active sessions...'}</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-dashed border-border/70 p-6 text-center text-muted-foreground gap-2">
              <Users className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-semibold text-foreground/80">
                {searchTerm
                  ? isAr
                    ? 'لا توجد نتائج مطابقة لبحثك'
                    : 'No matching sessions found'
                  : isAr
                    ? 'لا توجد جلسات نشطة حالياً في هذه الفئة'
                    : 'No active sessions in this category'}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {isAr
                  ? 'يتم تحديث النشاط فور تسجيل الدخول أو إرسال النبضات الدورية.'
                  : 'Active status is updated automatically upon login and ongoing heartbeats.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredItems.map((item) => {
                const displayName = isAr ? item.nameAr || item.name : item.name;
                const isStudent = item.role === 'student';
                const isCopied = copiedCode === item.studentCode;

                return (
                  <div
                    key={item._id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-3.5 transition-all hover:border-primary/40 hover:bg-card/90"
                  >
                    {/* User Info & Status */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* Avatar with live online dot */}
                      <div className="relative shrink-0">
                        <div
                          className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-squircle font-bold text-sm border',
                            isStudent
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                              : item.role === 'admin'
                                ? 'bg-purple-500/15 text-purple-400 border-purple-500/25'
                                : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
                          )}
                        >
                          {displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
                            item.isOnline ? 'bg-emerald-500' : 'bg-amber-500',
                          )}
                          title={item.isOnline ? (isAr ? 'متصل الآن' : 'Online now') : (isAr ? 'نشط مؤخراً' : 'Active recently')}
                        />
                      </div>

                      {/* Text Data */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-foreground truncate">
                            {displayName}
                          </span>

                          {/* Student Code (Shown ONLY for students, NEVER for staff/admin) */}
                          {isStudent && item.studentCode ? (
                            <button
                              type="button"
                              onClick={() => handleCopyCode(item.studentCode)}
                              className="inline-flex items-center gap-1 rounded-squircle border border-border/80 bg-surface/60 px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-surface cursor-pointer"
                              title={isAr ? 'نسخ كود الطالب' : 'Copy Student Code'}
                            >
                              <bdi dir="ltr">{item.studentCode}</bdi>
                              {isCopied ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3 opacity-60" />
                              )}
                            </button>
                          ) : null}

                          {/* Role Badge for Staff & Admin (NO userCode like STF-008!) */}
                          {!isStudent && (
                            <span
                              className={cn(
                                'rounded-squircle px-2.5 py-0.5 text-[11px] font-semibold border',
                                item.role === 'admin'
                                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                  : item.staffType === 'doctor'
                                    ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                    : item.staffType === 'teaching_assistant'
                                      ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
                                      : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
                              )}
                            >
                              {isAr ? item.roleLabelAr || 'كادر أكاديمي' : item.roleLabelEn || 'Staff'}
                            </span>
                          )}

                          {item.department && (
                            <span className="rounded-squircle bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                              {item.department}
                            </span>
                          )}

                          {isStudent && item.level && (
                            <span className="rounded-squircle bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground font-mono">
                              {isAr ? `مستوى ${item.level}` : `L${item.level}`}
                            </span>
                          )}
                        </div>

                        {/* Current Activity Badge */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <div className="inline-flex items-center gap-1.5 rounded-squircle bg-surface/80 border border-border/80 px-2.5 py-1 text-foreground/90">
                            {getActionIcon(item.lastActionRoute)}
                            <span className="font-medium text-[11px]">
                              {isAr ? item.lastActionAr : item.lastAction}
                            </span>
                          </div>

                          {item.lastActionRoute && (
                            <span className="font-mono text-[10px] text-muted-foreground/80" dir="ltr">
                              {item.lastActionRoute}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Session Metrics & Timing */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40 shrink-0 text-xs">
                      <div className="flex items-center gap-1 text-emerald-400 font-semibold text-xs">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatDuration(item.sessionDurationMinutes, isAr)}</span>
                        <span className="text-[10px] text-muted-foreground font-normal">
                          ({isAr ? 'مدة الجلسة' : 'in session'})
                        </span>
                      </div>

                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <span>{isAr ? 'دخول:' : 'Login:'}</span>
                        <span className="font-mono text-foreground/80">{formatTimeOnly(item.loginTime, isAr)}</span>
                        <span>•</span>
                        <span>{formatRelativeTime(item.lastActiveTime, isAr)}</span>
                      </div>

                      {/* Device Chip */}
                      <div className="hidden sm:flex items-center gap-1 rounded-squircle bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground font-mono">
                        {item.sessionDevice.toLowerCase().includes('mobile') ? (
                          <Smartphone className="h-3 w-3" />
                        ) : (
                          <Laptop className="h-3 w-3" />
                        )}
                        <span>{item.sessionDevice}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/60 bg-surface/20 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {isAr
                ? 'يتم تحديث الجلسات تلقائياً كل 15 ثانية فور حدوث أي نشاط أو خروج'
                : 'Sessions auto-refresh every 15 seconds in real time'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-squircle border border-border bg-surface px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-surface/80 transition-colors cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
