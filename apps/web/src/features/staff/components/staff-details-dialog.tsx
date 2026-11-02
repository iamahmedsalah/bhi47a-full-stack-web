'use client';

import { useState } from 'react';
import { getCourseStaffIds } from '@/features/courses/assignment-utils';
import {
  courseCurriculumSummary,
  curriculumDepartmentLabel,
  formatStaffDisplayName,
  getCleanStaffName,
  getStaffRoleLabel,
} from '@student-portal/shared';
import {
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit2,
  GraduationCap,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Shield,
  ShieldCheck,
  User,
  UserX,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { STAFF_ASSIGNABLE_PERMISSIONS } from '@student-portal/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useStaffCourses, useStaffSchedules } from '../queries';
import type { StaffMember } from '../types';

interface Props {
  staff: StaffMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (staff: StaffMember) => void;
  onPermissions?: (staff: StaffMember) => void;
  onResetPassword?: (staff: StaffMember) => void;
}

export function StaffDetailsDialog({
  staff,
  open,
  onOpenChange,
  onEdit,
  onPermissions,
  onResetPassword,
}: Props) {
  const t = useTranslations('staff');
  const locale = useLocale();
  const isAr = locale === 'ar';
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'courses' | 'permissions'>('overview');

  const coursesQuery = useStaffCourses(staff?._id);
  const schedulesQuery = useStaffSchedules(staff?._id);

  if (!staff) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(t('details.copied'));
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return t('never');
    try {
      return new Intl.DateTimeFormat(isAr ? 'ar-EG' : 'en-US', {
        timeZone: 'Africa/Cairo',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'ST';
    return name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const getRoleBadgeClasses = (type?: string, role?: string) => {
    if (role === 'admin') {
      return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
    }
    switch (type) {
      case 'doctor':
        return 'border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400';
      case 'teaching_assistant':
        return 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400';
      case 'assistant_lecturer':
        return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400';
      case 'accountant':
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      default:
        return 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400';
    }
  };

  const courses = coursesQuery.data ?? [];
  const schedules = schedulesQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-2xl border border-white/10 bg-card/95 p-6 shadow-2xl backdrop-blur-xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="border-b border-border/70 pb-4 text-start">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500/20 to-teal-700/30 font-bold text-teal-600 dark:text-teal-400 text-lg border border-teal-500/30 shadow-inner">
                {getInitials(getCleanStaffName(staff, locale))}
              </div>
              <div className="space-y-1 text-start">
                <DialogTitle className="flex flex-wrap items-center gap-2 text-xl font-bold text-foreground">
                  <span>{formatStaffDisplayName(staff, locale)}</span>
                  {isAr && staff.nameAr && staff.name !== staff.nameAr && (
                    <span className="text-xs font-normal text-muted-foreground/80 font-sans" dir="ltr">
                      ({formatStaffDisplayName({ ...staff, nameAr: undefined }, 'en')})
                    </span>
                  )}
                  {!isAr && staff.nameAr && (
                    <span className="text-xs font-normal text-muted-foreground/80 font-sans" dir="rtl">
                      ({formatStaffDisplayName(staff, 'ar')})
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getRoleBadgeClasses(
                      staff.staffType,
                      staff.role,
                    )}`}
                  >
                    {staff.role === 'admin'
                      ? isAr
                        ? 'مدير نظام'
                        : 'Administrator'
                      : getStaffRoleLabel(
                          staff.staffType,
                          staff.role,
                          locale,
                          staff.titlePrefix,
                        )}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      staff.isActive
                        ? 'border-success/30 bg-success/10 text-success'
                        : 'border-danger/30 bg-danger/10 text-danger'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        staff.isActive ? 'bg-success animate-pulse' : 'bg-danger'
                      }`}
                    />
                    {staff.isActive ? t('active') : t('inactive')}
                  </span>
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono">
                  {staff.userCode && (
                    <span className="rounded bg-muted/60 px-2 py-0.5 font-medium text-foreground">
                      <bdi>{staff.userCode}</bdi>
                    </span>
                  )}
                  {staff.username && (
                    <span className="rounded bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                      <bdi>@{staff.username}</bdi>
                    </span>
                  )}
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Navigation tabs */}
          <div className="mt-4 flex border-b border-border/50 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`pb-2.5 px-3 transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                activeTab === 'overview'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>{t('details.overview')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('courses')}
              className={`pb-2.5 px-3 transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                activeTab === 'courses'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>{t('details.courses')}</span>
              {courses.length > 0 && (
                <span className="rounded-full bg-primary/15 text-primary px-1.5 py-0.2 text-[10px] font-bold">
                  {courses.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('permissions')}
              className={`pb-2.5 px-3 transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                activeTab === 'permissions'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>{t('details.permissions')}</span>
              <span className="rounded-full bg-muted text-muted-foreground px-1.5 py-0.2 text-[10px]">
                {staff.permissions?.length ?? 0}
              </span>
            </button>
          </div>
        </DialogHeader>

        {/* Tab contents */}
        <div className="flex-1 overflow-y-auto custom-scroll py-4 space-y-4 pr-1">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Account Deactivated Notice */}
              {!staff.isActive && (
                <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger flex items-start gap-2.5">
                  <UserX className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">{t('details.accountDeactivated')}</span>
                    {staff.deactivationReason && (
                      <p className="mt-1 text-muted-foreground font-normal">
                        {staff.deactivationReason}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Contact Information */}
              <div className="rounded-xl border border-white/10 bg-secondary/20 p-4 space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-primary" />
                  <span>{t('details.contact')}</span>
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  {/* Email */}
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 p-2.5">
                    <div className="min-w-0 pr-2">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span>{t('details.email')}</span>
                      </span>
                      <a
                        href={`mailto:${staff.email}`}
                        className="font-medium text-foreground hover:text-primary transition-colors truncate block"
                        dir="ltr"
                      >
                        {staff.email ?? t('details.notProvided')}
                      </a>
                    </div>
                    {staff.email && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-squircle shrink-0"
                        onClick={() => handleCopy(staff.email!, 'email')}
                        title={t('details.copy')}
                      >
                        {copiedKey === 'email' ? (
                          <Check className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Phone */}
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 p-2.5">
                    <div className="min-w-0 pr-2">
                      <span className="block text-[11px] text-muted-foreground">{t('details.phone')}</span>
                      <a
                        href={staff.phone ? `tel:${staff.phone}` : undefined}
                        className="font-medium text-foreground hover:text-primary transition-colors truncate block"
                        dir="ltr"
                      >
                        {staff.phone ?? t('details.notProvided')}
                      </a>
                    </div>
                    {staff.phone && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-squircle shrink-0"
                        onClick={() => handleCopy(staff.phone!, 'phone')}
                        title={t('details.copy')}
                      >
                        {copiedKey === 'phone' ? (
                          <Check className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Account Timeline & Activity */}
              <div className="rounded-xl border border-white/10 bg-secondary/20 p-4 space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span>{t('details.overview')}</span>
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 text-xs">
                  <div className="rounded-lg border border-border/60 bg-background/50 p-3 space-y-1">
                    <span className="text-muted-foreground">{t('details.lastLogin')}</span>
                    <p className="font-medium text-foreground">{formatDate(staff.lastLoginAt)}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/50 p-3 space-y-1">
                    <span className="text-muted-foreground">{t('details.createdAt')}</span>
                    <p className="font-medium text-foreground">{formatDate(staff.createdAt)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'courses' && (
            <div className="space-y-4">
              {/* Doctor assigned courses */}
              <div>
                <div className="mb-2">
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    <span>{t('details.assignedCoursesTitle')}</span>
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {t('details.assignedCoursesDescription')}
                  </p>
                </div>

                {coursesQuery.isLoading ? (
                  <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
                    <Clock className="h-4 w-4 animate-spin mr-2" />
                    <span>{t('loading')}</span>
                  </div>
                ) : coursesQuery.isError ? (
            <div role="alert" className="rounded-xl border border-danger/30 p-4 text-sm">
              <p>{isAr ? 'تعذر تحميل المقررات المسندة. أعد المحاولة.' : 'Could not load assigned courses. Please retry.'}</p>
              <Button type="button" variant="outline" onClick={() => { void coursesQuery.refetch(); }}>{isAr ? 'إعادة المحاولة' : 'Retry'}</Button>
            </div>
          ) : courses.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground bg-background/30">
                    <BookOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                    <p>{t('details.noCourses')}</p>
                  </div>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {courses.map((course) => {
                      const courseName = isAr
                        ? course.nameAr || course.name
                        : course.nameEn || course.name;
                      return (
                        <div
                          key={course._id}
                          className="rounded-xl border border-border/70 bg-secondary/30 p-3 hover:border-primary/40 hover:bg-secondary/50 transition-all text-start space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-mono font-bold text-primary">
                              <bdi>{course.code}</bdi>
                            </span>
                            {course.creditHours && (
                              <span className="text-[11px] text-muted-foreground">
                                {t('details.creditHours', { hours: course.creditHours })}
                              </span>
                            )}
                          </div>
                          {(() => {
                        const assignments = getCourseStaffIds(course);
                        const isDoctor = assignments.doctorIds.includes(staff._id);
                        const isTA = assignments.teachingAssistantIds.includes(staff._id);
                        const roleBadge = isDoctor
                          ? (isAr ? 'أستاذ مقرر' : 'Instructor')
                          : isTA
                            ? (staff.staffType === 'assistant_lecturer' ? (isAr ? 'مدرس مساعد' : 'Assistant Lecturer') : (isAr ? 'معيد' : 'TA'))
                            : null;
                        return roleBadge ? (
                          <span className="rounded bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-600 dark:text-teal-400 border border-teal-500/20">
                            {roleBadge}
                          </span>
                        ) : null;
                      })()}
                      <p className="font-semibold text-xs text-foreground line-clamp-1" title={courseName}>
                            {courseName}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                            {course.level && (
                              <span>{t('details.level', { level: course.level })}</span>
                            )}
                            {course.semester && (
                              <>
                                <span>·</span>
                                <span>{courseCurriculumSummary(course, locale)}</span>
                              </>
                            )}
                            {course.department && (
                              <>
                                <span>·</span>
                                <span>{curriculumDepartmentLabel(course.department, locale)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Teaching Schedules (Lectures & Sections) */}
              {schedules.length > 0 && (
                <div className="pt-2 border-t border-border/60">
                  <div className="mb-2">
                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span>{t('details.teachingSchedule')}</span>
                    </h4>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {schedules.map((schedule) => (
                      <div
                        key={schedule._id}
                        className="rounded-xl border border-border/70 bg-secondary/20 p-3 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-foreground truncate">
                            {isAr
                              ? schedule.courseNameAr || schedule.courseName
                              : schedule.courseName}
                          </span>
                          <span className="rounded bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-600 dark:text-teal-400 capitalize">
                            {t(`details.${schedule.type}`)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                          <span>{t(`days.${schedule.dayOfWeek}`)}</span>
                          <span>·</span>
                          <span dir="ltr">
                            {schedule.startTime} - {schedule.endTime}
                          </span>
                        </div>
                        {(schedule.room || schedule.building) && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-0.5">
                            <MapPin className="h-3 w-3 text-primary" />
                            <span>
                              {schedule.building ? `${t('details.building')} ${schedule.building} ` : ''}
                              {schedule.room ? `${t('details.room')} ${schedule.room}` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="space-y-3">
              {staff.role === 'admin' ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-start space-y-3">
                  <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400 font-bold text-sm sm:text-base">
                    <ShieldCheck className="h-5 w-5 shrink-0" />
                    <span>
                      {isAr
                        ? 'مدير نظام — صلاحيات كاملة وشاملة وغير مقيدة'
                        : 'System Administrator — Full Unrestricted Root Access'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {isAr
                      ? 'يمتلك هذا الحساب صلاحيات root إدارية وفنية شاملة لكافة خدمات ولوحات التحكم في البوابة الأكاديمية (الطلاب، المقررات، الدرجات، الجداول، الموظفين، الإعدادات، والمنظومة بالكامل) تلقائياً دون الحاجة لتعيين أذونات وظيفية منفردة.'
                      : 'This account possesses root administrative and technical privileges across all academic portal modules (students, courses, grades, schedules, staff, settings, and platform operations) automatically without requiring individual functional permissions.'}
                  </p>
                  <div className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-300">
                    <span>✓ {isAr ? 'كافة الصلاحيات مفعّلة افتراضياً' : 'All Platform Permissions Active by Default'}</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {t('details.permissions')}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                      {t('details.activePermissions', {
                        count: staff.permissions?.length ?? 0,
                        total: STAFF_ASSIGNABLE_PERMISSIONS.length,
                      })}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {STAFF_ASSIGNABLE_PERMISSIONS.map((perm) => {
                      const isEnabled = staff.permissions?.includes(perm);
                      const keySuffix = perm.replaceAll('.', '_');
                      const labelKey = `permissions.labels.${keySuffix}` as Parameters<typeof t>[0];
                      let localizedLabel: string = perm;
                      try {
                        localizedLabel = t(labelKey);
                      } catch {
                        localizedLabel = perm;
                      }

                      return (
                        <div
                          key={perm}
                          onClick={() => {
                            if (onPermissions && staff.role !== 'admin') {
                              onPermissions(staff);
                            }
                          }}
                          className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-xs transition-all ${
                            onPermissions && staff.role !== 'admin'
                              ? 'cursor-pointer hover:border-primary/60 hover:bg-primary/5'
                              : ''
                          } ${
                            isEnabled
                              ? 'border-primary/40 bg-primary/10 text-foreground'
                              : 'border-border/40 bg-background/30 text-muted-foreground opacity-50'
                          }`}
                          title={onPermissions && staff.role !== 'admin' ? (isAr ? 'اضغط لتعديل الصلاحيات' : 'Click to manage permissions') : undefined}
                        >
                          {isEnabled ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0 mt-0.5" />
                          )}
                          <div className="space-y-0.5 flex-1 min-w-0">
                            <span className="font-semibold block truncate">{localizedLabel}</span>
                            <span className="font-mono text-[10px] text-muted-foreground block truncate" dir="ltr">
                              {perm}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 gap-2 border-t border-border/70 pt-4 rtl:sm:justify-start">
          {onEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onEdit(staff);
              }}
              className="rounded-squircle gap-1.5"
            >
              <Edit2 className="h-3.5 w-3.5" />
              <span>{t('details.editStaff')}</span>
            </Button>
          )}

          {onPermissions && staff.role !== 'admin' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onPermissions(staff);
              }}
              className="rounded-squircle gap-1.5"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{t('details.managePermissions')}</span>
            </Button>
          )}

          {onResetPassword && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onResetPassword(staff);
              }}
              className="rounded-squircle gap-1.5"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>{t('details.resetPassword')}</span>
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-squircle ms-auto"
          >
            {t('details.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
