'use client';

import React, { useState } from 'react';
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
  onSuccess?: () => void;
  locale?: string;
}

const DEPARTMENTS = [
  {
    id: 'BIS',
    shortLabel: (isAr: boolean) => (isAr ? 'نظم المعلومات (BIS)' : 'BIS Track'),
    levelHint: (isAr: boolean) => (isAr ? 'الفرقة 3 و 4' : 'Levels 3 & 4'),
    icon: Laptop,
    badgeColor: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
    selectedBorder: 'border-cyan-500 ring-cyan-500/40 bg-cyan-500/10',
  },
  {
    id: 'ACCOUNTING',
    shortLabel: (isAr: boolean) => (isAr ? 'المحاسبة والمراجعة' : 'Accounting'),
    levelHint: (isAr: boolean) => (isAr ? 'الفرقة 3 و 4' : 'Levels 3 & 4'),
    icon: Calculator,
    badgeColor: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    selectedBorder: 'border-emerald-500 ring-emerald-500/40 bg-emerald-500/10',
  },
  {
    id: 'GENERAL',
    shortLabel: (isAr: boolean) => (isAr ? 'الشعبة العامة' : 'General Track'),
    levelHint: (isAr: boolean) => (isAr ? 'الفرقة 1 و 2' : 'Levels 1 & 2'),
    icon: BookOpen,
    badgeColor: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
    selectedBorder: 'border-primary ring-primary/40 bg-primary/10',
  },
];

export function DepartmentTransferDialog({
  open,
  onOpenChange,
  student,
  selectedStudents = [],
  onSuccess,
  locale: propLocale,
}: DepartmentTransferDialogProps) {
  const currentLocale = useLocale();
  const locale = propLocale || currentLocale || 'ar';
  const isAr = locale.startsWith('ar');
  const queryClient = useQueryClient();

  const isBulk = !student && selectedStudents.length > 0;
  const targetStudentList = student ? [student] : selectedStudents;

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
    if (!targetStudentList.length) {
      toast.error(
        isAr
          ? 'لم يتم تحديد أي طالب للتحويل. يرجى اختيار الطلاب من الجدول أولاً.'
          : 'No students selected for transfer. Please select students from the table first.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const studentIds = targetStudentList.map((s) => s._id);
      const res = await transferDepartment({
        studentIds,
        targetDepartment,
        targetLevel: updateLevelTo3 ? '3' : undefined,
      });

      toast.success(
        res.message ||
          (isAr
            ? `تم تحويل ${targetStudentList.length} طالب بنجاح إلى التخصص المختار`
            : `Successfully transferred ${targetStudentList.length} student(s)`),
      );

      // Invalidate relevant student caches
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
      return isAr ? 'نظم معلومات الأعمال (BIS)' : 'BIS';
    if (upper.includes('ACCOUNT') || upper.includes('محاسب'))
      return isAr ? 'المحاسبة والمراجعة' : 'Accounting';
    return code;
  };

  return (
    <Dialog open={open} onOpenChange={isSubmitting ? undefined : onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl border border-border/80 bg-card p-5 shadow-2xl relative overflow-hidden">
        {/* Compact Header */}
        <DialogHeader className="text-start rtl:text-right space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 shrink-0">
              <ArrowLeftRight className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold text-foreground">
                {isAr ? 'تحويل الشعبة والتخصص (الفرقة 3)' : 'Transfer Specialization (Level 3)'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">
                {isAr
                  ? 'تسكين وتحويل الطلاب بين شعبتي BIS والمحاسبة بالفرقة الثالثة'
                  : 'Place and transfer students between BIS and Accounting tracks in Level 3'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 pt-1 pb-1">
          {/* Compact Student Context Strip - Fixed height, never overflows */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-secondary/30 px-3 py-2 text-xs">
            {isBulk ? (
              <div className="flex items-center gap-2 min-w-0">
                <Users className="h-4 w-4 text-primary shrink-0" />
                <span className="font-bold text-foreground truncate">
                  {isAr
                    ? `تحويل جماعي لـ ${targetStudentList.length} طالب محدد`
                    : `Bulk Transfer (${targetStudentList.length} Students)`}
                </span>
              </div>
            ) : student ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-foreground truncate">
                  {student.fullName || student.fullNameAr || student.studentCode}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                  ({student.studentCode})
                </span>
              </div>
            ) : (
              <span className="text-amber-400 font-semibold text-xs">
                {isAr ? 'لم يتم تحديد أي طالب من الجدول' : 'No students selected'}
              </span>
            )}

            {student ? (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold border border-border bg-card shrink-0">
                {getDepartmentLabel(student.department)}
              </span>
            ) : targetStudentList.length > 0 ? (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold border border-primary/30 bg-primary/10 text-primary shrink-0">
                {isAr ? 'جاهز للتنفيذ' : 'Ready'}
              </span>
            ) : null}
          </div>

          {/* 3-Column Horizontal Department Selection Grid */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              {isAr ? 'التخصص المستهدف للتحويل:' : 'Target Department / Track:'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {DEPARTMENTS.map((dept) => {
                const IconComponent = dept.icon;
                const isSelected = targetDepartment === dept.id;
                return (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => setTargetDepartment(dept.id)}
                    className={cn(
                      'flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all cursor-pointer relative gap-1.5 min-h-[78px]',
                      isSelected
                        ? cn('shadow-sm ring-1', dept.selectedBorder)
                        : 'border-border/70 bg-card hover:bg-secondary/40 hover:border-border',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
                        dept.badgeColor,
                      )}
                    >
                      <IconComponent className="h-4 w-4" />
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
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary absolute top-1.5 end-1.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Compact Level 3 Promotion Toggle */}
          <div className="rounded-xl border border-border/70 bg-secondary/20 px-3 py-2 flex items-center justify-between gap-3 text-xs">
            <label
              htmlFor="update-level-3-check"
              className="cursor-pointer select-none space-y-0.5 flex-1 min-w-0"
            >
              <div className="font-semibold text-foreground truncate">
                {isAr
                  ? 'ترقية / تثبيت الفرقة إلى "المستوى الثالث" (سنة التخصص)'
                  : 'Promote Level to "Level 3" (Specialization Year)'}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {isAr
                  ? 'تحديث المقررات والجداول تلقائياً وفق لائحة التخصص الجديد'
                  : 'Sync registered courses and schedules with target track'}
              </div>
            </label>
            <input
              type="checkbox"
              id="update-level-3-check"
              checked={updateLevelTo3}
              onChange={(e) => setUpdateLevelTo3(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary shrink-0"
            />
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="rtl:sm:justify-start gap-2 pt-2 border-t border-border/60">
          <Button
            type="button"
            onClick={handleTransfer}
            disabled={isSubmitting || !targetDepartment || targetStudentList.length === 0}
            className="rounded-squircle px-5 font-bold shadow-sm h-9 text-xs"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin rtl:ml-1.5 rtl:mr-0 mr-1.5" />
            ) : (
              <ArrowLeftRight className="h-3.5 w-3.5 rtl:ml-1.5 rtl:mr-0 mr-1.5" />
            )}
            {isAr
              ? `تأكيد التحويل ${targetStudentList.length > 0 ? `(${targetStudentList.length})` : ''}`
              : `Confirm Transfer ${targetStudentList.length > 0 ? `(${targetStudentList.length})` : ''}`}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="rounded-squircle h-9 text-xs"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
