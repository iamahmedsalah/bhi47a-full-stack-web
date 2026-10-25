'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  BookOpenCheck,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  GraduationCap,
  SlidersHorizontal,
  Flame,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getApiErrorMessage } from '@/lib/api';
import {
  getPortalSettings,
  updatePortalSettings,
  resetAcademicRecords,
  settingsKeys,
  type PortalSettingsItem,
} from '../api';

interface PortalControlsPanelProps {
  locale: string;
}

export function PortalControlsPanel({ locale }: PortalControlsPanelProps) {
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();

  // Reset Confirmation Dialog State
  const [resetModalType, setResetModalType] = useState<
    'warnings' | 'gpa' | 'all' | null
  >(null);

  // Queries
  const portalSettingsQuery = useQuery({
    queryKey: settingsKeys.portalSettings,
    queryFn: getPortalSettings,
  });

  const settings: PortalSettingsItem = portalSettingsQuery.data ?? {
    registrationVisible: true,
    syllabiVisible: true,
  };

  // Mutations
  const updateSettingsMutation = useMutation({
    mutationFn: (dto: Partial<PortalSettingsItem>) => updatePortalSettings(dto),
    onSuccess: (updated) => {
      queryClient.setQueryData(settingsKeys.portalSettings, updated);
      void queryClient.invalidateQueries({
        queryKey: settingsKeys.publicPortalSettings,
      });
      toast.success(
        isAr ? 'تم تحديث إعدادات البوابة بنجاح' : 'Portal settings updated successfully',
      );
    },
    onError: (err) => {
      toast.error(
        getApiErrorMessage(
          err,
          isAr
            ? 'فشل تحديث إعدادات البوابة'
            : 'Failed to update portal settings',
        ),
      );
    },
  });

  const resetRecordsMutation = useMutation({
    mutationFn: (options: { resetWarnings?: boolean; resetGpa?: boolean }) =>
      resetAcademicRecords(options),
    onSuccess: (res) => {
      setResetModalType(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-students-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['student-profile'] });
      void queryClient.invalidateQueries({ queryKey: ['registration-eligibility'] });

      const details: string[] = [];
      if (res.warningsResetCount > 0) {
        details.push(
          isAr
            ? `تصفير الإنذارات لـ ${res.warningsResetCount} سجل`
            : `Reset warnings for ${res.warningsResetCount} records`,
        );
      }
      if (res.gpaResetCount > 0) {
        details.push(
          isAr
            ? `تصفير المعدل لـ ${res.gpaResetCount} طالب`
            : `Reset GPA for ${res.gpaResetCount} students`,
        );
      }

      toast.success(
        res.message ||
          (isAr
            ? 'تم تصفير السجلات الأكاديمية بنجاح'
            : 'Academic records reset successfully'),
        {
          description: details.join(' · '),
        },
      );
    },
    onError: (err) => {
      toast.error(
        getApiErrorMessage(
          err,
          isAr
            ? 'فشل تنفيذ عملية التصفير الأكاديمي'
            : 'Failed to execute academic reset',
        ),
      );
    },
  });

  const handleToggleRegistration = () => {
    updateSettingsMutation.mutate({
      registrationVisible: !settings.registrationVisible,
    });
  };

  const handleToggleSyllabi = () => {
    updateSettingsMutation.mutate({
      syllabiVisible: !settings.syllabiVisible,
    });
  };

  const handleExecuteReset = () => {
    if (resetModalType === 'warnings') {
      resetRecordsMutation.mutate({ resetWarnings: true, resetGpa: false });
    } else if (resetModalType === 'gpa') {
      resetRecordsMutation.mutate({ resetWarnings: false, resetGpa: true });
    } else if (resetModalType === 'all') {
      resetRecordsMutation.mutate({ resetWarnings: true, resetGpa: true });
    }
  };

  return (
    <div className="space-y-8 animate-fade-in text-start">
      {/* Introduction Card */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-card/90 via-card/60 to-primary/5 p-6 backdrop-blur-sm shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-1 text-xs font-semibold text-primary border border-primary/20">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>{isAr ? 'التحكم الإداري المباشر' : 'Live Portal Controls'}</span>
            </div>
            <h2 className="text-lg font-bold text-foreground">
              {isAr
                ? 'إعدادات ظهور خدمات بوابة الطلاب والعمليات الأكاديمية'
                : 'Student Portal Feature Visibility & Academic Operations'}
            </h2>
            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
              {isAr
                ? 'تحكم في ظهور أو إخفاء صفحات وخدمات الطلاب (مثل تسجيل المقررات وكارت المناهج PDF)، ونفذ إجراءات التصفير الشامل للسجلات والإنذارات والمعدلات الأكاديمية.'
                : 'Toggle student feature visibility (such as Course Registration & Syllabi PDF card), and execute administrative resets for academic warnings and GPAs.'}
            </p>
          </div>
        </div>
      </div>

      {/* Feature Toggles Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <span>
              {isAr
                ? 'مفاتيح ظهور وإتاحة خدمات بوابة الطلاب'
                : 'Student Portal Feature Visibility Switches'}
            </span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? 'تفعيل أو إخفاء الأقسام من واجهة ولوحة تحكم الطالب بشكل فوري.'
              : 'Instantly show or hide specific sections on the student portal and dashboard.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Toggle 1: Course Registration Page */}
          <Card className="rounded-2xl border border-white/10 bg-card/70 p-5 backdrop-blur-sm shadow-sm flex flex-col justify-between gap-5 transition-all duration-300 hover:border-primary/30">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shrink-0">
                    <BookOpenCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      {isAr
                        ? 'صفحة تسجيل المقررات الأكاديمية'
                        : 'Course Registration Page'}
                    </h4>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      /dashboard/registration
                    </span>
                  </div>
                </div>

                <StatusBadge
                  label={
                    settings.registrationVisible
                      ? isAr
                        ? 'مفعلة وظاهرة'
                        : 'Visible'
                      : isAr
                        ? 'معطلة ومخفية'
                        : 'Hidden'
                  }
                  variant={settings.registrationVisible ? 'success' : 'neutral'}
                />
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {isAr
                  ? 'عند إخفاء الصفحة، يُزال رابط التسجيل من القائمة الجانبية والأزرار السريعة في لوحة تحكم الطالب، ويتم منع الدخول المباشر إليها.'
                  : 'When hidden, the registration navigation link and quick access buttons are removed from student dashboard, blocking direct access.'}
              </p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/5">
              <div className="flex items-center gap-2 text-xs">
                {settings.registrationVisible ? (
                  <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                    <Eye className="h-3.5 w-3.5" />
                    {isAr ? 'الخدمة ظاهرة ومتاحة للطلاب' : 'Visible & accessible to students'}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-medium text-amber-400">
                    <EyeOff className="h-3.5 w-3.5" />
                    {isAr ? 'الخدمة مخفية ومغلقة للطلاب' : 'Hidden & closed for students'}
                  </span>
                )}
              </div>

              <Button
                type="button"
                variant={settings.registrationVisible ? 'destructive' : 'default'}
                size="sm"
                className="rounded-squircle text-xs font-semibold cursor-pointer h-9 px-4 gap-2 transition-all shadow-xs"
                disabled={updateSettingsMutation.isPending}
                onClick={handleToggleRegistration}
              >
                {updateSettingsMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : settings.registrationVisible ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إخفاء الصفحة للطلاب' : 'Hide from Students'}</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إظهار الصفحة للطلاب' : 'Show to Students'}</span>
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Toggle 2: Syllabi & Curriculum Card (PDF) */}
          <Card className="rounded-2xl border border-white/10 bg-card/70 p-5 backdrop-blur-sm shadow-sm flex flex-col justify-between gap-5 transition-all duration-300 hover:border-primary/30">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/25 shrink-0">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      {isAr
                        ? 'المناهج ومحتوى المقررات الدراسية (PDF)'
                        : 'Course Curriculum & Syllabi (PDF)'}
                    </h4>
                    <span className="text-[11px] text-muted-foreground">
                      {isAr
                        ? 'كارت استعراض وتحميل المنهج بلوحة الطالب'
                        : 'Official syllabus card on student dashboard'}
                    </span>
                  </div>
                </div>

                <StatusBadge
                  label={
                    settings.syllabiVisible
                      ? isAr
                        ? 'مفعل وظاهر'
                        : 'Visible'
                      : isAr
                        ? 'معطل ومخفي'
                        : 'Hidden'
                  }
                  variant={settings.syllabiVisible ? 'success' : 'neutral'}
                />
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {isAr
                  ? 'عند إخفاء هذا الكارت، لن يظهر كارت المناهج وتحميل المقررات الدراسية (PDF) للطلاب على الصفحة الرئيسية وتتسع بطاقة لجان الامتحانات تلقائياً.'
                  : 'When hidden, the official syllabi download card is hidden from student dashboard, expanding the seating card automatically.'}
              </p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/5">
              <div className="flex items-center gap-2 text-xs">
                {settings.syllabiVisible ? (
                  <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                    <Eye className="h-3.5 w-3.5" />
                    {isAr ? 'الكارت ظاهر في لوحة تحكم الطالب' : 'Card visible on dashboard'}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-medium text-amber-400">
                    <EyeOff className="h-3.5 w-3.5" />
                    {isAr ? 'الكارت مخفي من لوحة تحكم الطالب' : 'Card hidden from dashboard'}
                  </span>
                )}
              </div>

              <Button
                type="button"
                variant={settings.syllabiVisible ? 'destructive' : 'default'}
                size="sm"
                className="rounded-squircle text-xs font-semibold cursor-pointer h-9 px-4 gap-2 transition-all shadow-xs"
                disabled={updateSettingsMutation.isPending}
                onClick={handleToggleSyllabi}
              >
                {updateSettingsMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : settings.syllabiVisible ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إخفاء كارت المناهج' : 'Hide Syllabi Card'}</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إظهار كارت المناهج' : 'Show Syllabi Card'}</span>
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Bulk Academic Reset / Danger Zone Section */}
      <div className="space-y-4 pt-4 border-t border-white/10">
        <div>
          <h3 className="text-sm font-bold text-destructive flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            <span>
              {isAr
                ? 'منطقة العمليات الحرجة: تصفير السجلات والإنذارات والمعدلات الأكاديمية'
                : 'Danger Zone: Bulk Academic Warning & GPA Resets'}
            </span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? 'تتيح هذه العمليات تصفير الإنذارات أو المعدل التراكمي لجميع الطلاب دفعة واحدة وبشكل نهائي.'
              : 'Bulk administrative actions to reset academic warnings and cumulative GPA across all students.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Action 1: Reset Warnings to 0 */}
          <Card className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 backdrop-blur-sm shadow-sm flex flex-col justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    {isAr
                      ? 'تصفير الإنذارات الأكاديمية (0)'
                      : 'Reset Academic Warnings (0)'}
                  </h4>
                  <span className="text-[10px] text-muted-foreground">
                    {isAr ? 'لكافة الطلاب المسجلين' : 'For all enrolled students'}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isAr
                  ? 'يقوم بتعيين عدد الإنذارات الأكاديمية لجميع الطلاب في ملف الطالب والملف الأكاديمي إلى 0.'
                  : 'Resets the recorded academic warnings to 0 across both student profiles and academic profiles.'}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              className="rounded-squircle border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 text-xs font-semibold cursor-pointer h-9 px-3 gap-2 w-full shadow-xs"
              onClick={() => setResetModalType('warnings')}
              disabled={resetRecordsMutation.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{isAr ? 'تصفير الإنذارات للجميع (0)' : 'Reset Warnings to 0'}</span>
            </Button>
          </Card>

          {/* Action 2: Reset GPA to 0.00 */}
          <Card className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 backdrop-blur-sm shadow-sm flex flex-col justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/15 text-destructive border border-destructive/25 shrink-0">
                  <GraduationCap className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    {isAr
                      ? 'تصفير المعدل التراكمي (GPA)'
                      : 'Reset Cumulative GPA (0.00)'}
                  </h4>
                  <span className="text-[10px] text-muted-foreground">
                    {isAr ? 'لكافة الطلاب المسجلين' : 'For all enrolled students'}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isAr
                  ? 'يقوم بإعادة تعيين المعدل التراكمي (GPA) لجميع الطلاب في السجلات الأكاديمية ليصبح 0.00.'
                  : 'Resets cumulative GPA to 0.00 across all student academic profile records in the system.'}
              </p>
            </div>

            <Button
              type="button"
              variant="destructive"
              className="rounded-squircle text-xs font-semibold cursor-pointer h-9 px-3 gap-2 w-full shadow-xs"
              onClick={() => setResetModalType('gpa')}
              disabled={resetRecordsMutation.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{isAr ? 'تصفير المعدل للجميع (0.00)' : 'Reset GPA to 0.00'}</span>
            </Button>
          </Card>

          {/* Action 3: Reset Both Warnings & GPA */}
          <Card className="rounded-2xl border border-rose-500/40 bg-gradient-to-b from-rose-950/20 to-card/60 p-5 backdrop-blur-sm shadow-sm flex flex-col justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                  <Flame className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-rose-300">
                    {isAr
                      ? 'تصفير شامل (GPA والإنذارات)'
                      : 'Reset Both GPA & Warnings'}
                  </h4>
                  <span className="text-[10px] text-muted-foreground">
                    {isAr ? 'تصفير مزدوج شامل' : 'Comprehensive dual reset'}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isAr
                  ? 'تصفير شامل وفوري لكلاً من المعدل التراكمي وجميع الإنذارات الأكاديمية لكافة الطلاب في عملية واحدة.'
                  : 'Simultaneously zeroes both the GPA and all academic warning counters for all students in one step.'}
              </p>
            </div>

            <Button
              type="button"
              variant="destructive"
              className="rounded-squircle bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer h-9 px-3 gap-2 w-full shadow-md"
              onClick={() => setResetModalType('all')}
              disabled={resetRecordsMutation.isPending}
            >
              <Flame className="h-3.5 w-3.5" />
              <span>{isAr ? 'تصفير شامل (GPA والإنذارات)' : 'Reset All GPA & Warnings'}</span>
            </Button>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog for Danger Zone Actions */}
      <ConfirmDialog
        open={Boolean(resetModalType)}
        onOpenChange={(open) => {
          if (!open) setResetModalType(null);
        }}
        title={
          resetModalType === 'warnings'
            ? isAr
              ? 'تأكيد تصفير الإنذارات الأكاديمية لجميع الطلاب'
              : 'Confirm Reset Academic Warnings for All Students'
            : resetModalType === 'gpa'
              ? isAr
                ? 'تأكيد تصفير المعدل التراكمي لجميع الطلاب (0.00)'
                : 'Confirm Reset GPA to 0.00 for All Students'
              : isAr
                ? 'تأكيد التصفير الشامل للمعدل والإنذارات للجميع'
                : 'Confirm Comprehensive Reset of GPA & Warnings'
        }
        description={
          resetModalType === 'warnings'
            ? isAr
              ? 'هل أنت متأكد من تصفير الإنذارات الأكاديمية لكافة الطلاب المسجلين؟ سيتم تعيين عداد الإنذارات إلى (0) في جميع السجلات.'
              : 'Are you sure you want to reset academic warnings for all students? Warning counters will be permanently set to 0.'
            : resetModalType === 'gpa'
              ? isAr
                ? 'هل أنت متأكد من تصفير المعدل التراكمي (GPA) لجميع الطلاب؟ سيتم تعيين المعدل إلى (0.00) في الملفات الأكاديمية.'
                : 'Are you sure you want to reset GPA to 0.00 for all students across the entire institution database?'
              : isAr
                ? 'تحذير شديد: سيتم تصفير كلاً من المعدل التراكمي وجميع الإنذارات الأكاديمية لكل الطلاب ليصبح المعدل 0.00 والإنذارات 0. هذا الإجراء لا يمكن التراجع عنه.'
                : 'Critical Warning: This will reset both cumulative GPA (0.00) and all academic warnings (0) for all students. This action cannot be undone.'
        }
        destructive
        confirmLabel={
          resetRecordsMutation.isPending
            ? isAr
              ? 'جاري التنفيذ...'
              : 'Executing...'
            : resetModalType === 'warnings'
              ? isAr
                ? 'نعم، صفر جميع الإنذارات (0)'
                : 'Yes, Reset Warnings to 0'
              : resetModalType === 'gpa'
                ? isAr
                  ? 'نعم، صفر المعدل التراكمي (0.00)'
                  : 'Yes, Reset GPA to 0.00'
                : isAr
                  ? 'نعم، نفذ التصفير الشامل الآن'
                  : 'Yes, Reset GPA & Warnings Now'
        }
        cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
        onConfirm={handleExecuteReset}
      />
    </div>
  );
}
