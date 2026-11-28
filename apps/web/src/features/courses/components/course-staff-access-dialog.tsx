'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileSpreadsheet, Lock, ShieldCheck, Unlock, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  formatStaffDisplayName,
  getStaffRoleLabel,
  isFacultyMember,
  isSupportingAcademicStaff,
} from '@student-portal/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import api, { getApiErrorMessage } from '@/lib/api';

interface CourseStaffAccessMember {
  _id: string;
  name: string;
  nameAr?: string;
  staffType?: string;
  titlePrefix?: string;
  canSupervise: boolean;
  isAutoAuthorizedDoctor?: boolean;
}

interface CourseStaffAccess {
  members: CourseStaffAccessMember[];
  supervisorId: string | null;
  canEditSupervisor?: boolean;
  gradeEntryStaffIds: string[];
  revision: string | null;
}

export function CourseStaffAccessDialog({
  courseId,
  courseCode,
  courseTitle,
  isAr,
  onClose,
}: {
  courseId: string;
  courseCode?: string;
  courseTitle?: string;
  isAr: boolean;
  onClose: () => void;
}) {
  const locale = isAr ? 'ar' : 'en';
  const queryClient = useQueryClient();
  const endpoint = `/admin/courses/${courseId}/staff-access`;
  const access = useQuery({
    queryKey: ['course-staff-access', courseId],
    queryFn: async () => (await api.get<CourseStaffAccess>(endpoint)).data,
  });

  const [draft, setDraft] = useState<
    Pick<CourseStaffAccess, 'supervisorId' | 'gradeEntryStaffIds' | 'revision'> | null
  >(null);
  const current = draft ?? access.data;
  const canEditSupervisor = access.data?.canEditSupervisor !== false;

  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('No changes');
      return api.patch(endpoint, {
        ...(canEditSupervisor ? { supervisorId: draft.supervisorId } : {}),
        gradeEntryStaffIds: draft.gradeEntryStaffIds,
        revision: draft.revision,
      });
    },
    onSuccess: () => {
      toast.success(
        isAr
          ? 'تم حفظ صلاحيات رصد ومحتوى المقرر بنجاح'
          : 'Course access and grade-entry permissions saved',
      );
      for (const queryKey of [
        ['course-staff-access'],
        ['staff-grade-entry-courses'],
        ['admin-staff'],
        ['course-book-capabilities'],
        ['course-materials'],
        ['admin-quizzes'],
        ['control'],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onClose();
    },
  });

  const displayMemberName = (member: CourseStaffAccessMember) =>
    formatStaffDisplayName(
      {
        name: member.name,
        nameAr: member.nameAr,
        staffType: member.staffType,
        titlePrefix: member.titlePrefix,
      },
      locale,
    ) || (isAr ? member.nameAr || member.name : member.name);

  const doctors = (access.data?.members ?? []).filter(
    (m) => m.isAutoAuthorizedDoctor || isFacultyMember(m.staffType),
  );
  const supportingStaff = (access.data?.members ?? []).filter(
    (m) =>
      !m.isAutoAuthorizedDoctor &&
      !isFacultyMember(m.staffType) &&
      (isSupportingAcademicStaff(m.staffType) || !m.staffType),
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent flush dir={isAr ? 'rtl' : 'ltr'} className="max-w-xl">
        <DialogHeader className="sm:text-start rtl:sm:text-right">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-squircle border border-primary/30 bg-primary/15 text-primary">
              <UserCheck className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-base font-bold">
                {isAr
                  ? 'صلاحيات المقرر والتحكم في الرصد'
                  : 'Course Permissions & Grade Entry Control'}
              </DialogTitle>
              <DialogDescription className="text-xs leading-relaxed">
                {courseCode || courseTitle ? (
                  <span className="font-semibold text-foreground">
                    <bdi dir="ltr">{courseCode}</bdi>
                    {courseCode && courseTitle ? ' — ' : ''}
                    {courseTitle}
                  </span>
                ) : isAr ? (
                  'إدارة مشرف المحتوى وفتح/قفل رصد الدرجات استثنائياً لأعضاء الهيئة المعاونة'
                ) : (
                  'Manage content supervision and toggle per-course grade entry for supporting staff'
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {access.isPending && (
            <p role="status" className="text-sm text-muted-foreground py-4 text-center">
              {isAr ? 'جارٍ تحميل صلاحيات المقرر…' : 'Loading course permissions…'}
            </p>
          )}
          {access.isError && (
            <p
              role="alert"
              className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger"
            >
              {getApiErrorMessage(access.error)}
            </p>
          )}
          {save.isError && (
            <p
              role="alert"
              className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger"
            >
              {getApiErrorMessage(save.error)}
            </p>
          )}

          {access.data && current && (
            <>
              {/* Content Supervisor (Admin Only) */}
              {canEditSupervisor && (
                <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-2">
                  <label
                    htmlFor="course-content-supervisor"
                    className="flex items-center gap-1.5 text-xs font-bold text-foreground"
                  >
                    <ShieldCheck className="size-3.5 text-primary" />
                    <span>{isAr ? 'مشرف المحتوى العلمي للمقرر' : 'Course Content Supervisor'}</span>
                  </label>
                  <Select
                    value={current.supervisorId ?? 'none'}
                    disabled={save.isPending}
                    onValueChange={(value) =>
                      setDraft({
                        supervisorId: value === 'none' ? null : value,
                        gradeEntryStaffIds: current.gradeEntryStaffIds,
                        revision: access.data.revision,
                      })
                    }
                  >
                    <SelectTrigger id="course-content-supervisor" className="rounded-squircle text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
                      <SelectItem value="none">
                        {isAr ? 'بدون مشرف إضافي' : 'No supervisor'}
                      </SelectItem>
                      {access.data.members
                        .filter((member) => member.canSupervise)
                        .map((member) => (
                          <SelectItem key={member._id} value={member._id}>
                            {displayMemberName(member)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Section 1: Faculty Members (Doctors) — Always Authorized */}
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground">
                    {isAr
                      ? 'أعضاء هيئة التدريس (الدكاترة)'
                      : 'Faculty Members (Course Doctors)'}
                  </span>
                  <Badge
                    variant="outline"
                    className="rounded-squircle border-emerald-500/30 bg-emerald-500/10 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                  >
                    {isAr ? 'رصد تلقائي إلزامي' : 'Mandatory Auto-Entry'}
                  </Badge>
                </div>

                {doctors.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? 'لا يوجد دكتور مسند لهذا المقرر حالياً.'
                      : 'No faculty doctor is currently assigned to this course.'}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {doctors.map((doc) => (
                      <div
                        key={doc._id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card/85 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                          <span className="font-semibold text-foreground truncate">
                            {displayMemberName(doc)}
                          </span>
                        </div>
                        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                          {isAr ? 'مخوّل تلقائياً' : 'Auto-authorized'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Supporting Academic Staff (TA / Assistant Lecturer) — Selective Per-Course Toggle */}
              <fieldset
                disabled={save.isPending}
                className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <legend className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <FileSpreadsheet className="size-3.5 text-primary" />
                    <span>
                      {isAr
                        ? 'الهيئة المعاونة المسموح لهم برصد درجات هذا المقرر'
                        : 'Supporting Staff Authorized for Grade Entry'}
                    </span>
                  </legend>

                  {supportingStaff.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={save.isPending}
                        onClick={() =>
                          setDraft({
                            supervisorId: current.supervisorId,
                            revision: access.data.revision,
                            gradeEntryStaffIds: supportingStaff.map((m) => m._id),
                          })
                        }
                        className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                      >
                        {isAr ? 'فتح للكل' : 'Enable all'}
                      </button>
                      <span className="text-muted-foreground text-xs">·</span>
                      <button
                        type="button"
                        disabled={save.isPending}
                        onClick={() =>
                          setDraft({
                            supervisorId: current.supervisorId,
                            revision: access.data.revision,
                            gradeEntryStaffIds: [],
                          })
                        }
                        className="text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                      >
                        {isAr ? 'قفل الكل' : 'Disable all'}
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {isAr
                    ? 'الأصل أن المعيد والمدرس المساعد لا يرصدون الدرجات؛ عند تفعيل عضو هنا يظهر له هذا المقرر فقط في الكنترول دون باقي مقرراته.'
                    : 'By default, TAs and assistant lecturers do not enter grades. Enabling a member here exposes only this course to them in Control.'}
                </p>

                {supportingStaff.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/70 bg-card/50 p-3 text-center text-xs text-muted-foreground">
                    {isAr
                      ? 'لا يوجد معيدون أو مدرسون مساعدون مسندون لهذا المقرر.'
                      : 'No teaching assistants or assistant lecturers are assigned to this course.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {supportingStaff.map((member) => {
                      const enabled = current.gradeEntryStaffIds.includes(member._id);
                      return (
                        <label
                          key={member._id}
                          className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs transition-all select-none ${
                            enabled
                              ? 'border-primary/35 bg-primary/[0.09] text-foreground shadow-2xs'
                              : 'border-border/60 bg-card/85 hover:border-border text-muted-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Checkbox
                              checked={enabled}
                              onCheckedChange={(checked) =>
                                setDraft({
                                  supervisorId: current.supervisorId,
                                  revision: access.data.revision,
                                  gradeEntryStaffIds: checked
                                    ? [...current.gradeEntryStaffIds, member._id]
                                    : current.gradeEntryStaffIds.filter(
                                        (id) => id !== member._id,
                                      ),
                                })
                              }
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground truncate">
                                {displayMemberName(member)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {getStaffRoleLabel(member.staffType, 'staff', locale)}
                              </div>
                            </div>
                          </div>

                          <span
                            className={`inline-flex items-center gap-1 rounded-squircle border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${
                              enabled
                                ? 'border-primary/35 bg-primary/15 text-primary'
                                : 'border-border/70 bg-secondary/40 text-muted-foreground'
                            }`}
                          >
                            {enabled ? (
                              <>
                                <Unlock className="size-3" />
                                <span>{isAr ? 'مفتوح للرصد' : 'Entry Open'}</span>
                              </>
                            ) : (
                              <>
                                <Lock className="size-3" />
                                <span>{isAr ? 'مغلق' : 'Closed'}</span>
                              </>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            className="rounded-squircle"
            disabled={!draft || access.isError || save.isPending}
            onClick={() => save.mutate()}
          >
            {isAr ? 'حفظ الصلاحيات' : 'Save Permissions'}
          </Button>
          <Button
            variant="outline"
            className="rounded-squircle"
            disabled={save.isPending}
            onClick={onClose}
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
