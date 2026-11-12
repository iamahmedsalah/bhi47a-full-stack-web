'use client';

import React, { useState, useMemo } from 'react';
import { useLocale } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ArrowLeftRight,
  Laptop,
  Calculator,
  BookOpen,
  Loader2,
  CheckCircle2,
  Users,
  X,
  AlertCircle,
  GraduationCap,
} from 'lucide-react';
import { toast } from 'sonner';
import { transferDepartment, type Student } from '../api';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/cn';

interface DepartmentTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: Student | null;
  selectedStudents?: Student[];
  selectedKeys?: string[];
  onSuccess?: () => void;
  locale?: string;
}

const DEPARTMENTS = [
  {
    id: 'BIS',
    shortLabel: (isAr: boolean) => (isAr ? 'نظم معلومات الأعمال (BIS)' : 'Business Info Systems (BIS)'),
    levelHint: (isAr: boolean) => (isAr ? 'المستوى 3 و 4 • شعبة تخصصية' : 'Levels 3 & 4 • Specialized'),
    icon: Laptop,
    badgeColor: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
    selectedBorder: 'border-cyan-500 ring-2 ring-cyan-500/30 bg-cyan-500/10 shadow-sm',
  },
  {
    id: 'ACCOUNTING',
    shortLabel: (isAr: boolean) => (isAr ? 'المحاسبة والمراجعة' : 'Accounting & Auditing'),
    levelHint: (isAr: boolean) => (isAr ? 'المستوى 3 و 4 • شعبة تخصصية' : 'Levels 3 & 4 • Specialized'),
    icon: Calculator,
    badgeColor: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    selectedBorder: 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-500/10 shadow-sm',
  },
  {
    id: 'GENERAL',
    shortLabel: (isAr: boolean) => (isAr ? 'الشعبة العامة' : 'General Track'),
    levelHint: (isAr: boolean) => (isAr ? 'المستوى 1 و 2 • شعبة مشتركة' : 'Levels 1 & 2 • Common Track'),
    icon: BookOpen,
    badgeColor: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
    selectedBorder: 'border-primary ring-2 ring-primary/30 bg-primary/10 shadow-sm',
  },
];

export function DepartmentTransferDialog({
  open,
  onOpenChange,
  student,
  selectedStudents = [],
  selectedKeys = [],
  onSuccess,
  locale: propLocale,
}: DepartmentTransferDialogProps) {
  const currentLocale = useLocale();
  const locale = propLocale || currentLocale || 'ar';
  const isAr = locale.startsWith('ar');
  const queryClient = useQueryClient();

  const isBulk = !student && (selectedStudents.length > 0 || selectedKeys.length > 0);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  const baseStudents = useMemo(() => {
    if (student) return [student];
    const map = new Map<string, Student>();
    for (const s of selectedStudents) {
      if (s && s._id) {
        map.set(s._id, s);
      }
    }
    if (selectedKeys && selectedKeys.length > 0) {
      for (const id of selectedKeys) {
        if (!map.has(id)) {
          map.set(id, {
            _id: id,
            studentCode: id,
            fullName: isAr ? 'طالب محدد' : 'Selected Student',
            level: '3',
            enrollmentStatus: 'active',
          } as Student);
        }
      }
    }
    return Array.from(map.values());
  }, [student, selectedStudents, selectedKeys, isAr]);

  const activeStudents = useMemo(
    () => baseStudents.filter((s) => !excludedIds.includes(s._id)),
    [baseStudents, excludedIds],
  );

  const removeStudentFromList = (id: string) => {
    setExcludedIds((prev) => [...prev, id]);
  };

  const [targetDepartment, setTargetDepartment] = useState<string>(() => {
    if (student) {
      const raw = (student.department || '').toUpperCase();
      return raw.includes('BIS') ? 'ACCOUNTING' : 'BIS';
    }
    return 'BIS';
  });

  const [updateLevelTo3, setUpdateLevelTo3] = useState<boolean>(() => {
    if (student) {
      return student.level === '1' || student.level === '2';
    }
    return true;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTransfer = async () => {
    if (!activeStudents.length) {
      toast.error(
        isAr
          ? 'لم يتم تحديد أي طالب للتحويل. يرجى اختيار الطلاب من الجدول أولاً.'
          : 'No students selected for transfer. Please select students from the table first.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const studentIds = activeStudents.map((s) => s._id);
      const res = await transferDepartment({
        studentIds,
        targetDepartment,
        targetLevel: updateLevelTo3 ? '3' : undefined,
      });

      toast.success(
        res.message ||
          (isAr
            ? `تم تحويل ${activeStudents.length} طالب بنجاح إلى التخصص المختار`
            : `Successfully transferred ${activeStudents.length} student(s)`),
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['students'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-stats-students-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-stats-students'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-students-stats'] }),
      ]);

      onSuccess?.();
      onOpenChange(false);
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (isAr ? 'حدث خطأ أثناء تنفيذ التحويل' : 'Failed to transfer department');
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDepartmentLabel = (code?: string) => {
    if (!code) return isAr ? 'الشعبة العامة' : 'General Track';
    const upper = code.toUpperCase();
    if (upper.includes('BIS') || upper.includes('نظم'))
      return isAr ? 'BIS' : 'BIS';
    if (upper.includes('ACCOUNT') || upper.includes('محاسب'))
      return isAr ? 'محاسبة' : 'Accounting';
    return code;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setExcludedIds([]);
        if (!isSubmitting) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-xl sm:max-w-2xl rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-2xl overflow-hidden" dir={isAr ? 'rtl' : 'ltr'}>
        {/* Header */}
        <DialogHeader className="text-start space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 shrink-0">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                {isAr ? 'تحويل الشعبة والتخصص الأكاديمي' : 'Transfer Academic Track'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? 'تسكين وتحويل الطلاب بين الشعب الدراسية (الشعبة العامة، نظم المعلومات BIS، المحاسبة والمراجعة)'
                  : 'Place and transfer students between academic tracks (General, BIS, Accounting & Auditing)'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Student Context & Selected Cards */}
          <div className="rounded-xl border border-border/70 bg-secondary/25 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 text-cyan-500" />
                <span>
                  {isBulk
                    ? (isAr ? `الطلاب المحددين للتحويل (${activeStudents.length})` : `Selected Students (${activeStudents.length})`)
                    : (isAr ? 'بيانات الطالب المراد تحويله' : 'Target Student')}
                </span>
                {activeStudents.length > 0 && (
                  <span className="rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold">
                    {activeStudents.length} {isAr ? 'طالب' : 'students'}
                  </span>
                )}
              </span>

              {isBulk && activeStudents.length > 1 && (
                <button
                  type="button"
                  onClick={() => setExcludedIds(baseStudents.map((s) => s._id))}
                  className="text-[11px] text-muted-foreground hover:text-rose-400 cursor-pointer transition-colors"
                >
                  {isAr ? 'إلغاء تحديد الكل' : 'Clear all'}
                </button>
              )}
            </div>

            {activeStudents.length === 0 ? (
              <div className="flex items-center gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  {isAr
                    ? 'لم يتم تحديد أي طالب من الجدول. يرجى إغلاق النافذة واختيار الطلاب المطلوب تحويلهم عبر خانات الاختيار أولاً.'
                    : 'No students selected. Please close this dialog and select students from the table first.'}
                </span>
              </div>
            ) : (
              <div className="max-h-52 overflow-y-auto pe-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeStudents.map((st) => {
                  const displayName = isAr
                    ? (st.fullNameAr || st.fullName || st.studentCode)
                    : (st.fullName || st.fullNameAr || st.studentCode);
                  return (
                    <div
                      key={st._id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-card border border-border/70 text-xs hover:border-border transition-colors shadow-xs"
                    >
                      <div className="min-w-0 flex items-center gap-2 flex-1">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary/80 text-muted-foreground border border-border/50">
                          <GraduationCap className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground truncate leading-tight">
                            <bdi>{displayName}</bdi>
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                            <span className="font-mono">{st.studentCode}</span>
                            <span>·</span>
                            <span>{isAr ? `المستوى ${st.level || '1'}` : `L${st.level || '1'}`}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium border border-border/70 bg-secondary/50 text-muted-foreground">
                          {getDepartmentLabel(st.department)}
                        </span>
                        {isBulk && activeStudents.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeStudentFromList(st._id)}
                            className="p-1 rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                            title={isAr ? 'إزالة من التحويل' : 'Remove from selection'}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Department Selection Grid */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground block">
              {isAr ? 'الشعبة / التخصص المستهدف للتحويل:' : 'Target Track / Department:'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {DEPARTMENTS.map((dept) => {
                const IconComponent = dept.icon;
                const isSelected = targetDepartment === dept.id;
                return (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => setTargetDepartment(dept.id)}
                    className={cn(
                      'flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all cursor-pointer relative gap-2 min-h-[95px]',
                      isSelected
                        ? dept.selectedBorder
                        : 'border-border/70 bg-card hover:bg-secondary/40 hover:border-border',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
                        dept.badgeColor,
                      )}
                    >
                      <IconComponent className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 w-full px-1">
                      <div className="text-xs font-bold text-foreground truncate leading-tight">
                        {dept.shortLabel(isAr)}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                        {dept.levelHint(isAr)}
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-cyan-400 absolute top-2.5 end-2.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Level 3 Promotion Toggle Switch */}
          <div className="rounded-xl border border-border/70 bg-secondary/20 p-3.5 flex items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5 flex-1 min-w-0">
              <div className="font-semibold text-foreground truncate">
                {isAr
                  ? 'تثبيت / ترقية المستوى الدراسي إلى "المستوى الثالث"'
                  : 'Promote Student Level to "Level 3" (Specialization)'}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {isAr
                  ? 'تحديث خطة المقررات والجداول تلقائياً وفقاً للائحة التخصص الجديد للفرقة الثالثة'
                  : 'Automatically enroll in target specialization curriculum and courses'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={updateLevelTo3}
              onClick={() => setUpdateLevelTo3(!updateLevelTo3)}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2',
                updateLevelTo3 ? 'bg-cyan-500' : 'bg-muted-foreground/30',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
                  updateLevelTo3
                    ? 'translate-x-5 rtl:-translate-x-5'
                    : 'translate-x-0',
                )}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="rtl:sm:justify-start gap-2 pt-3 border-t border-border/60">
          <Button
            type="button"
            onClick={handleTransfer}
            disabled={isSubmitting || !targetDepartment || activeStudents.length === 0}
            className="rounded-squircle px-6 font-bold shadow-sm h-9 text-xs bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin rtl:ml-1.5 rtl:mr-0 mr-1.5" />
            ) : (
              <ArrowLeftRight className="h-3.5 w-3.5 rtl:ml-1.5 rtl:mr-0 mr-1.5" />
            )}
            {isAr
              ? `تأكيد التحويل ${activeStudents.length > 0 ? `(${activeStudents.length})` : ''}`
              : `Confirm Transfer ${activeStudents.length > 0 ? `(${activeStudents.length})` : ''}`}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="rounded-squircle h-9 text-xs cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

