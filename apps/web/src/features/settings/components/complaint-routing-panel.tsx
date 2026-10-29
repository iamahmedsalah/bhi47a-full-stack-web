'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitPullRequest,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Building2,
  Users,
  CheckCircle2,
  Save,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Gauge,
  HelpCircle,
  CircleOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/providers/auth-provider';
import { getApiErrorMessage } from '@/lib/api';
import {
  complaintKeys,
  getComplaintSettings,
  updateComplaintSettings,
  listAssignableStaff,
  type DepartmentStaffAssignment,
} from '@/features/complaints/api';

const DEPARTMENTS = [
  {
    key: 'student_affairs',
    labelAr: 'شؤون الطلاب',
    labelEn: 'Student Affairs',
    descAr: 'استفسارات القيد، سحب الملفات، والشهادات القيدية والوثائق الرسمية',
    descEn: 'Registration inquiries, withdrawal, certificates, and student records',
    iconColor: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  },
  {
    key: 'technical_support',
    labelAr: 'الدعم الفني',
    labelEn: 'Technical Support',
    descAr: 'مشاكل تسجيل الدخول، كلمة المرور، واستخدام المنصة الإلكترونية',
    descEn: 'Login issues, password resets, and portal platform support',
    iconColor: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  },
  {
    key: 'finance',
    labelAr: 'المالية',
    labelEn: 'Finance Department',
    descAr: 'المصروفات الدراسية، أذونات الدفع، والرسوم الإدارية',
    descEn: 'Tuition fees, payment vouchers, and administrative dues',
    iconColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  {
    key: 'control',
    labelAr: 'الكنترول',
    labelEn: 'Control & Exams',
    descAr: 'نتائج الامتحانات، التظلمات، ومراجعة رصد الدرجات',
    descEn: 'Exam results, grade appeals, and transcript auditing',
    iconColor: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  },
  {
    key: 'academic_advising',
    labelAr: 'الإرشاد الأكاديمي',
    labelEn: 'Academic Advising',
    descAr: 'تسجيل المقررات، العبء الدراسي، والتحذيرات الأكاديمية والمعدل',
    descEn: 'Course registration, study load, academic standing & GPA',
    iconColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  },
];

export function ComplaintRoutingPanel({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const canManage =
    user?.role === 'admin' ||
    Boolean(user?.permissions?.includes('complaints.manage_settings'));

  const settingsQuery = useQuery({
    queryKey: complaintKeys.settings(),
    queryFn: getComplaintSettings,
  });

  const assigneesQuery = useQuery({
    queryKey: complaintKeys.assignees(),
    queryFn: listAssignableStaff,
  });

  // Local draft states
  const [draftAssignments, setDraftAssignments] = useState<
    Record<string, DepartmentStaffAssignment> | null
  >(null);
  const [draftDailyLimit, setDraftDailyLimit] = useState<number | null>(null);

  const serverAssignments = settingsQuery.data?.departmentStaffAssignments ?? {};
  const currentAssignments = draftAssignments ?? serverAssignments;

  const serverDailyLimit = settingsQuery.data?.complaintDailyLimit ?? 3;
  const currentDailyLimit = draftDailyLimit ?? serverDailyLimit;

  const hasAssignmentChanges = draftAssignments !== null;
  const hasDailyLimitChanges = draftDailyLimit !== null && draftDailyLimit !== serverDailyLimit;
  const hasChanges = hasAssignmentChanges || hasDailyLimitChanges;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!settingsQuery.data) throw new Error('Settings not loaded');
      const payload = {
        ...settingsQuery.data,
        complaintDailyLimit: currentDailyLimit,
        departmentStaffAssignments: currentAssignments,
      };
      return updateComplaintSettings(payload);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(complaintKeys.settings(), updated);
      setDraftAssignments(null);
      setDraftDailyLimit(null);
      toast.success(
        isAr
          ? 'تم حفظ إعدادات توزيع الأقسام والحد الأقصى للشكاوى بنجاح'
          : 'Complaint routing & rate limit settings saved successfully',
      );
    },
    onError: (err) => {
      toast.error(
        getApiErrorMessage(
          err,
          isAr
            ? 'تعذر حفظ إعدادات الشكاوى والتوزيع'
            : 'Failed to save complaint settings',
        ),
      );
    },
  });

  const assignees = assigneesQuery.data ?? [];

  const handleStaffSelect = (deptKey: string, staffId: string) => {
    if (!canManage) return;

    const nextAssignments = { ...currentAssignments };
    if (!staffId || staffId === 'none') {
      delete nextAssignments[deptKey];
    } else {
      const selected = assignees.find((s) => s._id === staffId);
      if (selected) {
        nextAssignments[deptKey] = {
          staffId: selected._id,
          staffName: selected.name,
        };
      }
    }
    setDraftAssignments(nextAssignments);
  };

  const handleLimitChange = (val: number) => {
    if (!canManage) return;
    if (val >= 1 && val <= 10) {
      setDraftDailyLimit(val);
    }
  };

  const handleReset = () => {
    setDraftAssignments(null);
    setDraftDailyLimit(null);
  };

  const handleSave = () => {
    if (!canManage) return;
    saveMutation.mutate();
  };

  if (settingsQuery.isLoading || assigneesQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
        <AlertTriangle className="h-7 w-7 text-amber-400" />
        <p>
          {isAr
            ? 'تعذر تحميل إعدادات استقبال الشكاوى والتوزيع'
            : 'Failed to load complaint settings'}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            void settingsQuery.refetch();
            void assigneesQuery.refetch();
          }}
        >
          {isAr ? 'إعادة المحاولة' : 'Retry'}
        </Button>
      </div>
    );
  }

  const assignedCount = Object.keys(currentAssignments).filter(
    (k) => currentAssignments[k]?.staffId,
  ).length;

  return (
    <div className="space-y-6">
      {/* Header and Permission Notice */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-squircle bg-primary/10 border border-primary/20 text-primary">
              <GitPullRequest className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {isAr
                  ? 'إعدادات توزيع الشكاوى وسقف التقديم (Rate Limit)'
                  : 'Complaint Routing & Rate Limit Settings'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? 'التوزيع التلقائي للبلاغات حسب الأقسام، وتحديد الحد الأقصى للبلاغات لكل طالب خلال 24 ساعة'
                  : 'Automated ticket routing by department and rolling 24-hour rate limit per student'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <div className="inline-flex items-center gap-1.5 rounded-squircle border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />
              <span>
                {isAr ? 'صلاحية التعديل مفعلة (Admin / Manage Settings)' : 'Manage Permission Granted'}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-squircle border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
              <span>
                {isAr
                  ? 'للعرض فقط (يتطلب صلاحية إدارة الإعدادات)'
                  : 'View Only (Requires manage_settings)'}
              </span>
            </div>
          )}

          <Badge variant="outline" className="rounded-squircle px-3 py-1 text-xs">
            {isAr
              ? `${assignedCount} من ${DEPARTMENTS.length} أقسام معينة`
              : `${assignedCount} of ${DEPARTMENTS.length} departments routed`}
          </Badge>
        </div>
      </div>

      {/* Permission Warning for non-managers */}
      {!canManage && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-300">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <p className="leading-relaxed">
            {isAr
              ? 'تنبيه: أنت في وضع العرض فقط. لتعديل التوزيع التلقائي للأقسام أو تغيير سقف الشكاوى لكل طالب، يجب توفر صلاحية "إدارة إعدادات الشكاوى" (complaints.manage_settings) أو دور مدير النظام.'
              : 'Notice: You are in view-only mode. Modifying automated routing or student complaint rate limits requires the "complaints.manage_settings" permission or Administrator role.'}
          </p>
        </div>
      )}

      {/* Rate Limiting Card (24h Rolling Cooldown) */}
      <Card className="border-border/70 bg-card/90 p-5 shadow-[var(--shadow-glow)] space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-squircle bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <Gauge className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm">
                {isAr
                  ? 'الحد الأقصى للشكاوى لكل طالب (Rate Limiting)'
                  : 'Student Complaint Rate Limit (24h Window)'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? 'الحد المسموح به لكل طالب في نافذة 24 ساعة متعاقبة مع عد تنازلي حتى انتهاء مدة الحظر المؤقت.'
                  : 'Max allowable complaints per student in rolling 24 hours with exact countdown timer.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-squircle">
              {currentDailyLimit} {isAr ? 'شكاوى / 24 ساعة' : 'complaints / 24h'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Label className="text-xs font-semibold text-foreground">
            {isAr ? 'تحديد السقف:' : 'Select Limit:'}
          </Label>

          <Input
            type="number"
            min={1}
            max={10}
            value={currentDailyLimit}
            disabled={!canManage || saveMutation.isPending}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) handleLimitChange(val);
            }}
            className="w-20 font-mono text-center font-bold text-sm h-8 rounded-squircle"
            dir="ltr"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            {[1, 2, 3, 5].map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={currentDailyLimit === preset ? 'default' : 'outline'}
                size="sm"
                disabled={!canManage || saveMutation.isPending}
                className="h-8 px-3 text-xs rounded-squircle cursor-pointer"
                onClick={() => handleLimitChange(preset)}
              >
                {preset} {isAr ? 'شكاوى' : 'tickets'}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground ms-auto">
            <HelpCircle className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>
              {isAr
                ? 'يمنع النظام الطالب فور وصوله لهذا الرقم، ويعرض وقتاً متبقياً بالساعات والدقائق.'
                : 'System blocks students upon reaching limit and displays precise time remaining.'}
            </span>
          </div>
        </div>
      </Card>

      {/* Department Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <span>{isAr ? 'الموظف المسؤول التلقائي لكل قسم' : 'Designated Staff by Department'}</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? 'يتم إسناد التذاكر الجديدة تلقائياً للموظف المختار فور تقديمها، مع بقاء إمكانية المساعدة من بقية الفريق.'
                : 'Incoming tickets are routed to the selected head immediately, while remaining accessible to other authorized staff.'}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEPARTMENTS.map((dept) => {
            const currentAssignment = currentAssignments[dept.key];
            const hasAssigned = Boolean(currentAssignment?.staffId);

            return (
              <Card
                key={dept.key}
                className={`relative overflow-hidden border p-4 transition-all duration-200 ${hasAssigned
                    ? 'border-primary/40 bg-card/90 shadow-sm'
                    : 'border-white/10 bg-card/50 opacity-90'
                  }`}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-bold ${dept.iconColor}`}
                    >
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground text-sm">
                        {isAr ? dept.labelAr : dept.labelEn}
                      </h4>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {dept.key}
                      </span>
                    </div>
                  </div>

                  {hasAssigned ? (
                    <span className="inline-flex items-center gap-1 rounded-squircle bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 text-[10px] font-semibold text-teal-300">
                      <CheckCircle2 className="h-3 w-3" />
                      {isAr ? 'مُعيّن' : 'Routed'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-squircle bg-secondary/50 border border-white/10 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {isAr ? 'غير معين' : 'Unassigned'}
                    </span>
                  )}
                </div>

                <p className="mb-4 min-h-[32px] text-xs text-muted-foreground leading-relaxed">
                  {isAr ? dept.descAr : dept.descEn}
                </p>

                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  <label className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                    <span>{isAr ? 'الموظف المسؤول للقسم' : 'Assigned Staff'}</span>
                    {hasAssigned && (
                      <span className="text-teal-400 font-normal text-[10px]">
                        {currentAssignment?.staffName}
                      </span>
                    )}
                  </label>

                  <Select
                    value={currentAssignment?.staffId || 'none'}
                    onValueChange={(val) => handleStaffSelect(dept.key, val)}
                    disabled={!canManage || saveMutation.isPending}
                  >
                    <SelectTrigger className="w-full h-9 rounded-squircle border-white/15 bg-background/60 text-xs">
                      <SelectValue
                        placeholder={
                          isAr
                            ? '— اختر الموظف المسؤول —'
                            : '— Select Designated Staff —'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-card ">
                      <SelectItem value="none" className="text-xs text-muted-foreground cursor-pointer">
                        <div className="flex items-center gap-2">
                          <CircleOff className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          <span>{isAr ? 'بدون تعيين (غير معين)' : 'No Staff (Unassigned)'}</span>
                        </div>
                      </SelectItem>
                      {assignees.map((staff) => (
                        <SelectItem
                          key={staff._id}
                          value={staff._id}
                          className="text-xs cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-3.5 w-3.5 text-primary" />
                            <span className="font-medium">{staff.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {staff.role === 'admin'
                                ? isAr
                                  ? '(مسؤول)'
                                  : '(Admin)'
                                : isAr
                                  ? '(موظف)'
                                  : '(Staff)'}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Action Footer */}
      {canManage && (
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-white/10 bg-card/60 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-4 w-4 text-primary shrink-0" />
            <span>
              {isAr
                ? 'سيتم تطبيق التعديلات فوراً على التذاكر الجديدة وقيود الـ 24 ساعة للطلاب.'
                : 'Changes will apply immediately to incoming tickets and 24-hour student rate limits.'}
            </span>
          </div>

          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            {hasChanges && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={saveMutation.isPending}
                className="h-auto min-h-11 whitespace-normal px-3 py-2 gap-1.5 rounded-squircle text-xs cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{isAr ? 'تراجع' : 'Discard'}</span>
              </Button>
            )}

            <Button
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
              size="sm"
              className="h-auto min-h-11 whitespace-normal px-3 py-2 gap-2 rounded-squircle text-xs cursor-pointer"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span>{isAr ? 'حفظ إعدادات التوزيع والحد اليومي' : 'Save Routing & Limit'}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
